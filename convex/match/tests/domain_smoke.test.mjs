import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { CURRENT_MATCH_STATE_VERSION, createInitialMatchState } = require('../../../.tmp/convex-domain/convex/match/state.js')
const { reduceMatchState } = require('../../../.tmp/convex-domain/convex/match/reducer.js')
const { buildPrivateDelta, buildPublicSnapshot, hudKind } = require('../../../.tmp/convex-domain/convex/match/snapshots.js')
const { automaticTransitionFor, automaticTransitionScheduleArgs, matchesAutomaticTransition } = require('../../../.tmp/convex-domain/convex/match/flow.js')
const { deriveAvailableActions } = require('../../../.tmp/convex-domain/convex/match/capabilities.js')
const { buildPlacementResult, finalizeMatchResult } = require('../../../.tmp/convex-domain/convex/match/results.js')
const { duelRequiredCount, judgeDuel } = require('../../../.tmp/convex-domain/convex/match/rulesDuel.js')
const { reloadLane } = require('../../../.tmp/convex-domain/convex/match/reloadMachine.js')
const { normalizeMatchState } = require('../../../.tmp/convex-domain/convex/match/stateCompatibility.js')
const { deriveTurnKind } = require('../../../.tmp/convex-domain/convex/match/turnMachine.js')

function action(type, actorPlayerId, payload) {
	return {
		type,
		actorUserId: `user:${actorPlayerId}`,
		actorPlayerId,
		payload,
	}
}

function dispatch(state, type, actorPlayerId, payload) {
	const result = reduceMatchState(state, action(type, actorPlayerId, payload))
	assert.equal(result.ok, true, `${type} should be accepted`)
	return result.state
}

function dispatchDiceChecks(state, playerIds = state.players.order) {
	let next = state
	for (const playerId of playerIds) {
		const player = next.players.byId[playerId]
		if (player && !player.eliminated && player.hp > 0 && next.shake.checked[playerId] !== true) {
			next = dispatch(next, 'dice.check', playerId)
		}
	}
	return next
}

function dispatchShakes(state, playerIds = state.players.order) {
	let next = state
	for (const playerId of playerIds) {
		const player = next.players.byId[playerId]
		if (player && !player.eliminated && player.hp > 0) {
			const required = next.shake.requiredCount || 1
			if ((next.shake.counts[playerId] ?? 0) < required) {
				next = dispatch(next, 'shake.complete', playerId)
			}
		}
	}
	return next
}

function dispatchAutomaticTransition(state, expectedType) {
	const transition = automaticTransitionFor(state)
	assert.ok(transition, `${expectedType} should be scheduled`)
	assert.equal(transition.type, expectedType)
	assert.equal(matchesAutomaticTransition(state, transition), true)
	return dispatch(state, transition.type, state.turn.activePlayerId ?? state.players.order[0])
}

function createDevState(overrides = {}) {
	return createInitialMatchState({
		matchId: 'dev-match',
		mode: 'dev',
		localPlayerId: 'local-player',
		firstPlayerId: 'local-player',
		rngSeed: 12345,
		players: [
			{ id: 'local-player', userId: 'user-local', name: 'You' },
			{
				id: 'opponent-1',
				userId: 'user-opponent-1',
				name: 'Hush Feather',
				initialLoadedSlots: [1, 3, 5],
			},
			{
				id: 'opponent-2',
				userId: 'user-opponent-2',
				name: 'Samuel Saber',
				initialLoadedSlots: [1, 3, 5],
			},
		],
		...overrides,
	})
}

test('authoritative v2 state stores lifecycle and reload as orthogonal axes', () => {
	const state = createDevState({ requiresSetupLoad: false })

	assert.equal(state.stateVersion, CURRENT_MATCH_STATE_VERSION)
	assert.equal(state.flow.phase, 'cup_shake')
	assert.equal(reloadLane(state), 'clear')
	assert.equal('kind' in state.turn, false)
	assert.equal('pendingLoad' in state, false)
	assert.equal('deferredLoad' in state.bidding, false)
	assert.equal('reloadGate' in state.bidding, false)
	assert.equal(deriveTurnKind(state), 'shaking')
})

test('legacy match state normalizes lazily without losing reload work', () => {
	const current = createDevState({ requiresSetupLoad: false })
	const legacy = JSON.parse(JSON.stringify(current))
	delete legacy.stateVersion
	delete legacy.reload
	legacy.turn.kind = 'bidding'
	legacy.pendingLoad = { playerId: 'local-player', count: 1, source: 'bid' }
	legacy.bidding.deferredLoad = { playerId: 'opponent-1', count: 1, source: 'bid' }
	legacy.bidding.reloadGate = { countdownSeconds: 3, epoch: 7 }
	legacy.flow.phase = 'bidding'

	const normalized = normalizeMatchState(legacy)

	assert.equal(normalized.stateVersion, CURRENT_MATCH_STATE_VERSION)
	assert.deepEqual(normalized.reload, {
		pending: { playerId: 'local-player', count: 1, source: 'bid' },
		deferred: { playerId: 'opponent-1', count: 1, source: 'bid' },
		gate: { countdownSeconds: 3, epoch: 7 },
	})
	assert.equal(reloadLane(normalized), 'gated')
	assert.equal(deriveTurnKind(normalized), 'bidding')
	assert.equal('kind' in normalized.turn, false)
	assert.equal('pendingLoad' in normalized, false)
	assert.equal('deferredLoad' in normalized.bidding, false)
	assert.equal('reloadGate' in normalized.bidding, false)
})

test('player character identity survives initial state and public snapshot projection', () => {
	const state = createDevState()
	const snapshot = buildPublicSnapshot(state)

	assert.deepEqual(
		snapshot.players.map((player) => [player.id, player.skin, player.portraitState]),
		[
			['local-player', 'rosemund', 'front'],
			['opponent-1', 'hush-feather', 'front'],
			['opponent-2', 'samuel-saber', 'front'],
		],
	)
})

test('legacy default skins project to deterministic seat characters', () => {
	const state = createDevState()
	for (const playerId of state.players.order) {
		state.players.byId[playerId].skin = 'default'
	}
	const snapshot = buildPublicSnapshot(state)

	assert.deepEqual(
		snapshot.players.map((player) => player.skin),
		['rosemund', 'hush-feather', 'samuel-saber'],
	)
})

test('explicit character identity survives a noncanonical bot seat', () => {
	const state = createInitialMatchState({
		matchId: 'character-identity-match',
		mode: 'casual',
		localPlayerId: 'human-1',
		players: [
			{ id: 'human-1', name: 'Human One' },
			{ id: 'human-2', name: 'Human Two' },
			{
				id: 'player-3',
				virtualOpponentId: 'virtual-hush',
				participantKind: 'virtual',
				name: 'Hush Feather',
				characterKey: 'hush-feather',
			},
		],
	})
	const player = buildPublicSnapshot(state).players.find(
		(candidate) => candidate.id === 'player-3',
	)

	assert.equal(player.name, 'Hush Feather')
	assert.equal(player.characterKey, 'hush-feather')
	assert.equal(player.skin, 'hush-feather')
})

test('challenge pairs the active Samuel seat with previous bidder Hush', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'opponent-2'
	state.turn.previousPlayerId = 'opponent-1'
	state.bidding.currentBid = { playerId: 'opponent-1', count: 10, face: 1 }

	state = dispatch(state, 'bid.challenge', 'opponent-2')
	const snapshot = buildPublicSnapshot(state)

	assert.equal(snapshot.duel.challengerId, 'opponent-2')
	assert.equal(snapshot.duel.previousBidderId, 'opponent-1')
	assert.equal(snapshot.duel.players.find((player) => player.id === 'opponent-2').skin, 'samuel-saber')
	assert.equal(snapshot.duel.players.find((player) => player.id === 'opponent-1').skin, 'hush-feather')
})

test('Skull duel adjudication halves the rail count and floors odd values', () => {
	const players = [
		{ eliminated: false, dice: [1, 1, 1, 2, 3] },
		{ eliminated: false, dice: [2, 3, 4, 5, 6] },
	]

	assert.equal(duelRequiredCount({ count: 7, face: 1 }), 3)
	assert.equal(duelRequiredCount({ count: 8, face: 1 }), 4)
	assert.equal(duelRequiredCount({ count: 1, face: 1 }), 0)
	assert.equal(duelRequiredCount({ count: 7, face: 4 }), 7)

	assert.deepEqual(judgeDuel({ playerId: 'bidder', count: 7, face: 1 }, players), {
		verdict: 'EXACT',
		actual: 3,
		requiredCount: 3,
		delta: 0,
		rawDelta: 0,
	})
})

test('Skull duel shot count uses the difference from the halved requirement', () => {
	const short = judgeDuel(
		{ playerId: 'bidder', count: 8, face: 1 },
		[{ eliminated: false, dice: [1, 1, 2, 3, 4] }],
	)
	const over = judgeDuel(
		{ playerId: 'bidder', count: 4, face: 1 },
		[{ eliminated: false, dice: [1, 1, 1, 2, 3] }],
	)

	assert.equal(short.verdict, 'SHORT')
	assert.equal(short.requiredCount, 4)
	assert.equal(short.delta, 2)
	assert.equal(over.verdict, 'OVER')
	assert.equal(over.requiredCount, 2)
	assert.equal(over.delta, 1)
})

test('SHORT gives the challenger attack chances against the previous bidder', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.turn.previousPlayerId = 'opponent-1'
	state.bidding.currentBid = { playerId: 'opponent-1', count: 10, face: 4 }
	for (const player of Object.values(state.players.byId)) {
		player.dice = [6, 6, 6, 6, 6]
	}
	state.players.byId['local-player'].cylinder.slots = [true, true, true, false, false, false]
	state.players.byId['local-player'].bullets = 3

	state = dispatch(state, 'bid.challenge', 'local-player')
	assert.equal(state.duel.judge.verdict, 'SHORT')
	assert.equal(state.duel.revolverSpin.playerId, 'local-player')
	const cylinderSlotsBefore = [...state.players.byId['local-player'].cylinder.slots]
	state = dispatchAutomaticTransition(state, 'duel.execute')

	assert.equal(state.duel.resolution.shooterId, 'local-player')
	assert.equal(state.duel.resolution.rouletteSubjectId, 'local-player')
	assert.equal(state.duel.resolution.targetId, 'opponent-1')
	assert.deepEqual(state.duel.resolution.cylinderSlotsBefore, cylinderSlotsBefore)
	assert.equal(state.players.byId['local-player'].hp, 6)
	assert.equal(state.players.byId['opponent-1'].hp, 3)
})

test('OVER gives the previous bidder attack chances against the challenger', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.turn.previousPlayerId = 'opponent-1'
	state.bidding.currentBid = { playerId: 'opponent-1', count: 1, face: 6 }
	for (const player of Object.values(state.players.byId)) {
		player.dice = [6, 6, 6, 6, 6]
	}

	state = dispatch(state, 'bid.challenge', 'local-player')
	assert.equal(state.duel.judge.verdict, 'OVER')
	assert.equal(state.duel.revolverSpin.playerId, 'opponent-1')
	state = dispatchAutomaticTransition(state, 'duel.execute')

	assert.equal(state.duel.resolution.shooterId, 'opponent-1')
	assert.equal(state.duel.resolution.rouletteSubjectId, 'opponent-1')
	assert.equal(state.duel.resolution.targetId, 'local-player')
	assert.equal(state.players.byId['opponent-1'].hp, 6)
	assert.equal(state.players.byId['local-player'].hp, 3)
})

test('every human chooses initial chambers in seat order while virtual players stay preloaded', () => {
	let state = createInitialMatchState({
		matchId: 'sequential-human-setup-match',
		mode: 'casual',
		localPlayerId: 'human-1',
		players: [
			{ id: 'human-1', userId: 'user-1', participantKind: 'human', name: 'Human One' },
			{ id: 'human-2', userId: 'user-2', participantKind: 'human', name: 'Human Two' },
			{
				id: 'bot-1',
				virtualOpponentId: 'virtual-1',
				participantKind: 'virtual',
				name: 'Bot One',
				initialLoadedSlots: [1, 3, 5],
			},
		],
	})

	assert.equal(state.reload.pending.playerId, 'human-1')
	assert.equal(deriveAvailableActions(state, 'human-1').some((item) => item.type === 'load'), true)
	assert.equal(deriveAvailableActions(state, 'human-2').some((item) => item.type === 'load'), false)

	for (const slotIndex of [1, 3, 6]) {
		state = dispatch(state, 'setup.load_initial', 'human-1', { slotIndex })
	}

	assert.equal(state.flow.phase, 'revolver_reload')
	assert.equal(state.reload.pending.playerId, 'human-2')
	assert.equal(deriveAvailableActions(state, 'human-1').some((item) => item.type === 'load'), false)
	assert.equal(deriveAvailableActions(state, 'human-2').some((item) => item.type === 'load'), true)

	for (const slotIndex of [2, 4, 5]) {
		state = dispatch(state, 'setup.load_initial', 'human-2', { slotIndex })
	}

	assert.equal(state.flow.phase, 'cup_shake')
	assert.deepEqual(state.players.byId['human-1'].cylinder.slots, [true, false, true, false, false, true])
	assert.deepEqual(state.players.byId['human-2'].cylinder.slots, [false, true, false, true, true, false])
	assert.deepEqual(state.players.byId['bot-1'].cylinder.slots, [true, false, true, false, true, false])
})

test('minimum playable Convex round reaches next round after duel', () => {
	let state = createDevState()

	state = dispatch(state, 'setup.load_initial', 'local-player', { slotIndex: 1 })
	state = dispatch(state, 'setup.load_initial', 'local-player', { slotIndex: 2 })
	state = dispatch(state, 'setup.load_initial', 'local-player', { slotIndex: 3 })
	assert.equal(state.flow.phase, 'cup_shake')

	state = dispatchShakes(state)
	assert.equal(state.flow.phase, 'dice_check')

	state = dispatchDiceChecks(state)
	assert.equal(state.flow.phase, 'bidding_gap')

	state = dispatchAutomaticTransition(state, 'bidding.open')
	assert.equal(state.flow.phase, 'bidding')

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 1, face: 2 },
	})
	state = dispatch(state, 'bullet.load', 'local-player', { slotIndex: 4 })
	assert.equal(state.turn.activePlayerId, 'opponent-1')

	state = dispatch(state, 'bid.challenge', 'opponent-1')
	assert.equal(state.flow.phase, 'duel')
	assert.equal(state.duel.challengerId, 'opponent-1')

	state = dispatchAutomaticTransition(state, 'duel.execute')
	assert.equal(state.duel.phase, 'executing')

	state = dispatchAutomaticTransition(state, 'round.advance')
	assert.match(state.flow.phase, /^(cup_shake|revolver_reload|complete)$/)
	assert.equal(state.turn.activePlayerId, 'opponent-1')
})

test('duel public snapshot reveals every player dice for challenge adjudication', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.turn.previousPlayerId = 'opponent-2'
	state.bidding.currentBid = { playerId: 'opponent-2', count: 3, face: 4 }
	state.players.byId['local-player'].dice = [4, 1, 2, 3, 1]
	state.players.byId['opponent-1'].dice = [4, 4, 2, 5, 6]
	state.players.byId['opponent-2'].dice = [1, 3, 4, 6, 6]

	state = dispatch(state, 'bid.challenge', 'local-player')
	const snapshot = buildPublicSnapshot(state)

	assert.equal(snapshot.phase, 'duel')
	assert.equal(snapshot.duel.bid.face, 4)
	assert.equal(snapshot.duel.players.length, state.players.order.length)
	assert.deepEqual(
		snapshot.duel.players.map((player) => [player.id, player.dice]),
		[
			['local-player', [4, 1, 2, 3, 1]],
			['opponent-1', [4, 4, 2, 5, 6]],
			['opponent-2', [1, 3, 4, 6, 6]],
		],
	)
	assert.equal(snapshot.duel.judge.actual, 7)
	assert.equal(snapshot.duel.players[0].cylinder, undefined)
})

test('challenger starts the next bidding round after a non-lethal duel', () => {
	let state = createDevState({
		matchId: 'challenger-rule-match',
		requiresSetupLoad: false,
	})

	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.turn.previousPlayerId = 'opponent-1'
	state.bidding.currentBid = { playerId: 'opponent-1', count: 10, face: 4 }
	for (const player of Object.values(state.players.byId)) {
		player.dice = [1, 1, 1, 1, 1]
	}
	state.players.byId['opponent-1'].cylinder.slots = [false, false, false, false, false, false]
	state.players.byId['opponent-1'].bullets = 0

	state = dispatch(state, 'bid.challenge', 'local-player')
	state = dispatchAutomaticTransition(state, 'duel.execute')
	state = dispatchAutomaticTransition(state, 'round.advance')
	assert.equal(state.turn.activePlayerId, 'local-player')

	state = dispatchShakes(state)
	if (state.reload.pending) {
		state = dispatch(state, 'bullet.load', state.reload.pending.playerId, { slotIndex: 1 })
	}
	state = dispatchDiceChecks(state)
	state = dispatchAutomaticTransition(state, 'bidding.open')
	assert.equal(state.flow.phase, 'bidding')
	assert.equal(state.turn.activePlayerId, 'local-player')
})

test('dice check waits for every alive player and exposes per-player check actions', () => {
	let state = createDevState({
		matchId: 'multi-check-match',
		requiresSetupLoad: false,
	})

	state = dispatchShakes(state)
	assert.equal(state.flow.phase, 'dice_check')
	assert.deepEqual(state.shake.checked, {})

	for (const playerId of state.players.order) {
		const delta = buildPrivateDelta(state, playerId)
		assert.equal(
			delta.availableActions.some((available) => available.type === 'check'),
			true,
			`${playerId} should be able to check own dice`,
		)
	}

	state = dispatch(state, 'dice.check', 'local-player')
	assert.equal(state.flow.phase, 'dice_check')

	state = dispatch(state, 'dice.check', 'opponent-1')
	assert.equal(state.flow.phase, 'dice_check')

	state = dispatch(state, 'dice.check', 'opponent-2')
	assert.equal(state.flow.phase, 'bidding_gap')
})

test('cup shake waits for every alive player and rolls only the completing player', () => {
	let state = createDevState({
		matchId: 'multi-shake-match',
		requiresSetupLoad: false,
	})

	for (const playerId of state.players.order) {
	assert.equal(
			deriveAvailableActions(state, playerId).some((available) => available.type === 'shake_complete'),
			true,
			`${playerId} should be able to shake own cup`,
		)
	}
	assert.equal(deriveAvailableActions(state, 'local-player')[0].remaining, 1)

	state = dispatch(state, 'shake.complete', 'local-player')
	assert.equal(state.flow.phase, 'cup_shake')
	const snapshotAfterLocalShake = buildPublicSnapshot(state)
	assert.equal(snapshotAfterLocalShake.shake.requiredCount, 6)
	assert.equal(snapshotAfterLocalShake.shake.counts['local-player'], 6)
	assert.equal(state.players.byId['local-player'].dice.length, 5)
	assert.equal(state.players.byId['opponent-1'].dice.length, 0)
	assert.deepEqual(deriveAvailableActions(state, 'local-player'), [])
	assert.equal(deriveAvailableActions(state, 'opponent-1')[0].type, 'shake_complete')

	state = dispatch(state, 'shake.complete', 'opponent-1')
	assert.equal(state.flow.phase, 'cup_shake')
	state = dispatch(state, 'shake.complete', 'opponent-2')
	assert.equal(state.flow.phase, 'dice_check')
})

test('phase-wide shake timeout completes only unfinished players after six seconds', () => {
	let state = createDevState({
		matchId: 'shake-timeout-match',
		requiresSetupLoad: false,
	})
	const scheduled = automaticTransitionFor(state)
	assert.equal(scheduled.type, 'shake.timeout')
	assert.equal(scheduled.delayMs, 6_000)

	state = dispatch(state, 'shake.complete', 'local-player')
	const localDice = [...state.players.byId['local-player'].dice]
	assert.equal(matchesAutomaticTransition(state, scheduled), true)
	assert.equal(automaticTransitionFor(state).expectedRevision, state.revision)

	state = dispatch(state, 'shake.timeout', state.turn.activePlayerId)
	assert.equal(state.flow.phase, 'dice_check')
	assert.deepEqual(state.players.byId['local-player'].dice, localDice)
	assert.equal(state.shake.counts['local-player'], 6)
	assert.equal(state.shake.counts['opponent-1'], 6)
	assert.equal(state.shake.counts['opponent-2'], 6)
	assert.equal(state.players.byId['opponent-1'].dice.length, 5)
	assert.equal(state.players.byId['opponent-2'].dice.length, 5)
	assert.equal(matchesAutomaticTransition(state, scheduled), false)
})

test('phase-wide dice check timeout completes only unchecked players after six seconds', () => {
	let state = createDevState({
		matchId: 'dice-check-timeout-match',
		requiresSetupLoad: false,
	})
	state = dispatchShakes(state)
	assert.equal(state.flow.phase, 'dice_check')

	const scheduled = automaticTransitionFor(state)
	assert.equal(scheduled.type, 'dice.check.timeout')
	assert.equal(scheduled.delayMs, 6_000)

	state = dispatch(state, 'dice.check', 'local-player')
	assert.equal(state.flow.phase, 'dice_check')
	assert.equal(state.shake.checked['local-player'], true)
	assert.equal(state.shake.checked['opponent-1'], undefined)
	assert.equal(matchesAutomaticTransition(state, scheduled), true)

	state = dispatch(state, 'dice.check.timeout', state.turn.activePlayerId)
	assert.equal(state.flow.phase, 'bidding_gap')
	assert.equal(state.shake.checked['local-player'], true)
	assert.equal(state.shake.checked['opponent-1'], true)
	assert.equal(state.shake.checked['opponent-2'], true)
	assert.equal(matchesAutomaticTransition(state, scheduled), false)
})

test('face one is a skull bid and raises after face six at the next count', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.bidding.currentBid = { playerId: 'opponent-2', count: 2, face: 6 }

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 3, face: 1 },
	})
	assert.equal(state.bidding.currentBid.face, 1)
	assert.equal(state.bidding.currentBid.count, 3)
	assert.equal(state.bidding.skullRoulette.playerId, 'local-player')
	assert.equal(state.bidding.skullRoulette.hit, false)
	assert.deepEqual(buildPublicSnapshot(state).bidding.skullRoulette, state.bidding.skullRoulette)
})

test('skull bid spins and triggers the bidders own cylinder before accepting the bid', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.players.byId['local-player'].cylinder.slots = [true, true, true, true, true, true]
	state.players.byId['local-player'].bullets = 6

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 1, face: 1 },
	})

	assert.equal(state.bidding.currentBid.playerId, 'local-player')
	assert.equal(state.bidding.skullRoulette.hit, true)
	assert.equal(state.bidding.skullRoulette.hpBefore, 6)
	assert.equal(state.bidding.skullRoulette.hpAfter, 5)
	assert.equal(state.players.byId['local-player'].hp, 5)
	assert.equal(state.players.byId['local-player'].bullets, 5)
	assert.equal(state.reload.pending.playerId, 'local-player')
})

test('lethal skull roulette rejects the attempted bid and skips the eliminated bidder', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.bidding.currentBid = { playerId: 'opponent-2', count: 2, face: 6 }
	state.players.byId['local-player'].hp = 1
	state.players.byId['local-player'].cylinder.slots = [true, true, true, true, true, true]
	state.players.byId['local-player'].bullets = 6

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 3, face: 1 },
	})

	assert.equal(state.players.byId['local-player'].hp, 0)
	assert.equal(state.players.byId['local-player'].eliminated, true)
	assert.deepEqual(state.bidding.currentBid, { playerId: 'opponent-2', count: 2, face: 6 })
	assert.equal(state.turn.activePlayerId, 'opponent-1')
	assert.equal(state.turn.previousPlayerId, 'opponent-2')
	assert.deepEqual(state.bidding.myBid, { count: 1, face: 2 })
	assert.equal(state.reload.pending, undefined)
	assert.deepEqual(state.eliminationOrder, ['local-player'])
	assert.deepEqual(state.match.result.placements, [
		{ playerId: 'local-player', place: 3, playerCount: 3, rated: false },
	])
})

test('result placements reverse authoritative elimination order and put winner first', () => {
	const state = createDevState({ requiresSetupLoad: false })
	state.players.byId['local-player'].hp = 0
	state.players.byId['local-player'].eliminated = true
	state.players.byId['opponent-1'].hp = 0
	state.players.byId['opponent-1'].eliminated = true
	state.eliminationOrder = ['local-player', 'opponent-1']
	state.match.winnerId = 'opponent-2'
	state.match.status = 'complete'

	assert.deepEqual(buildPlacementResult(state), [
		{ playerId: 'opponent-2', place: 1, playerCount: 3, rated: false },
		{ playerId: 'opponent-1', place: 2, playerCount: 3, rated: false },
		{ playerId: 'local-player', place: 3, playerCount: 3, rated: false },
	])
	finalizeMatchResult(state)
	assert.equal(state.match.result.playerCount, 3)
	assert.equal(state.match.result.rated, false)
})

test('bid reload pipelines one next bid then gates until the previous reload completes', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 1, face: 2 },
	})
	assert.equal(state.flow.phase, 'bidding')
	assert.equal(state.reload.pending.playerId, 'local-player')
	assert.equal(state.turn.activePlayerId, 'opponent-1')
	assert.equal(reloadLane(state), 'loading')
	assert.equal(deriveTurnKind(state), 'bidding')
	assert.equal(hudKind(state, 'local-player'), 'revolver_reload')
	assert.equal(hudKind(state, 'opponent-1'), 'bidding')
	assert.equal(deriveAvailableActions(state, 'local-player')[0].type, 'load')
	assert.equal(deriveAvailableActions(state, 'opponent-1')[0].type, 'bid')
	assert.equal(
		deriveAvailableActions(state, 'opponent-1').some((available) => available.type === 'challenge'),
		false,
	)

	state = dispatch(state, 'bid.raise', 'opponent-1', {
		bid: { count: 2, face: 2 },
	})
	assert.equal(state.reload.pending.playerId, 'local-player')
	assert.equal(state.reload.deferred.playerId, 'opponent-1')
	assert.deepEqual(state.reload.gate, { countdownSeconds: 3, epoch: 1 })
	assert.equal(state.flow.phase, 'bidding')
	assert.equal(state.turn.activePlayerId, 'opponent-2')
	assert.equal(reloadLane(state), 'gated')
	assert.equal(hudKind(state, 'local-player'), 'revolver_reload')
	assert.equal(hudKind(state, 'opponent-1'), 'loading')
	assert.equal(hudKind(state, 'opponent-2'), 'loading')
	assert.deepEqual(deriveAvailableActions(state, 'opponent-2'), [])
	assert.deepEqual(buildPublicSnapshot(state).bidding.reloadGate, {
		countdownSeconds: 3,
		epoch: 1,
	})
	assert.equal(automaticTransitionFor(state).type, 'bid.reload_timeout')
	assert.equal(automaticTransitionFor(state).delayMs, 3_000)

	state = dispatchAutomaticTransition(state, 'bid.reload_timeout')
	assert.equal(state.reload.pending.playerId, 'opponent-1')
	assert.equal(state.players.byId['local-player'].cylinder.slots[0], true)
	assert.equal(state.reload.gate, undefined)
	assert.equal(hudKind(state, 'opponent-1'), 'revolver_reload')
	assert.equal(hudKind(state, 'opponent-2'), 'bidding')
	assert.equal(deriveAvailableActions(state, 'opponent-2')[0].type, 'bid')

	state = dispatch(state, 'bullet.load', 'opponent-1', { slotIndex: 2 })
	assert.equal(state.reload.pending, undefined)
	assert.equal(hudKind(state, 'opponent-1'), 'bidding')
})

test('second bid gates while the previous bidder loads even when its own cylinder is full', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.players.byId['opponent-1'].cylinder.slots = [true, true, true, true, true, true]
	state.players.byId['opponent-1'].bullets = 6

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 1, face: 2 },
	})
	state = dispatch(state, 'bid.raise', 'opponent-1', {
		bid: { count: 2, face: 2 },
	})

	assert.equal(state.reload.pending.playerId, 'local-player')
	assert.equal(state.reload.deferred, undefined)
	assert.deepEqual(state.reload.gate, { countdownSeconds: 3, epoch: 1 })
	assert.equal(reloadLane(state), 'gated')
	assert.deepEqual(deriveAvailableActions(state, 'opponent-2'), [])
	assert.equal(automaticTransitionFor(state).type, 'bid.reload_timeout')

	state = dispatchAutomaticTransition(state, 'bid.reload_timeout')
	assert.equal(state.reload.pending, undefined)
	assert.equal(state.reload.gate, undefined)
	assert.equal(reloadLane(state), 'clear')
	assert.equal(deriveAvailableActions(state, 'opponent-2')[0].type, 'bid')
})

test('bidding timeout raises the count by one with a skull or challenges at the cap', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'local-player'

	let scheduled = automaticTransitionFor(state)
	assert.equal(scheduled.type, 'bidding.timeout')
	assert.equal(scheduled.delayMs, 40_000)
	state = dispatchAutomaticTransition(state, 'bidding.timeout')
	assert.deepEqual(state.bidding.currentBid, {
		playerId: 'local-player',
		count: 1,
		face: 1,
	})
	assert.equal(state.turn.activePlayerId, 'opponent-1')
	assert.equal(state.bidding.skullRoulette.playerId, 'local-player')

	// A new bid resets the revision token, so an earlier 40 second timer cannot fire early.
	const stale = scheduled
	scheduled = automaticTransitionFor(state)
	assert.equal(matchesAutomaticTransition(state, stale), false)
	assert.equal(scheduled.type, 'bidding.timeout')
	assert.equal(scheduled.expectedRevision, state.revision)

	state.bidding.currentBid = { playerId: 'local-player', count: 7, face: 4 }
	state.turn.activePlayerId = 'opponent-1'
	state.reload.pending = undefined
	state = dispatchAutomaticTransition(state, 'bidding.timeout')
	assert.deepEqual(state.bidding.currentBid, {
		playerId: 'opponent-1',
		count: 8,
		face: 1,
	})

	state.bidding.currentBid = { playerId: 'local-player', count: 36, face: 6 }
	state.turn.activePlayerId = 'opponent-1'
	state.reload.pending = undefined
	state = dispatchAutomaticTransition(state, 'bidding.timeout')
	assert.equal(state.flow.phase, 'duel')
	assert.equal(state.duel.challengerId, 'opponent-1')
})

test('duel bullet spender reloads before the next shake', () => {
	let state = createDevState({
		matchId: 'spender-reload-match',
		requiresSetupLoad: false,
	})

	state.flow.phase = 'bidding'
	state.turn.activePlayerId = 'opponent-2'
	state.turn.previousPlayerId = 'opponent-1'
	state.bidding.currentBid = { playerId: 'opponent-1', count: 1, face: 6 }
	state.players.byId['local-player'].dice = [1, 2, 2, 2, 2]
	state.players.byId['opponent-1'].dice = [6, 2, 2, 2, 2]
	state.players.byId['opponent-2'].dice = [2, 2, 3, 4, 5]
	state.players.byId['opponent-1'].cylinder.slots = [true, true, true, true, true, true]
	state.players.byId['opponent-1'].bullets = 6

	state = dispatch(state, 'bid.challenge', 'opponent-2')
	state = dispatchAutomaticTransition(state, 'duel.execute')
	state = dispatchAutomaticTransition(state, 'round.advance')
	assert.equal(state.turn.activePlayerId, 'opponent-2')
	assert.deepEqual(state.reload.pending, {
		playerId: 'opponent-1',
		source: 'duel',
		count: 1,
	})
	assert.equal(state.flow.phase, 'revolver_reload')

	state = dispatch(state, 'bullet.load', 'opponent-1', { slotIndex: 1 })
	assert.equal(state.reload.pending, undefined)
	assert.equal(state.flow.phase, 'cup_shake')

	state = dispatchShakes(state)
	assert.equal(state.reload.pending, undefined)
	assert.equal(state.flow.phase, 'dice_check')
})

test('automatic transition tokens become stale after the flow advances', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state = dispatchShakes(state)
	state = dispatchDiceChecks(state)

	const scheduled = automaticTransitionFor(state)
	assert.equal(scheduled.type, 'bidding.open')
	const scheduleArgs = automaticTransitionScheduleArgs(state.matchId, scheduled)
	assert.equal('delayMs' in scheduleArgs, false)
	assert.deepEqual(Object.keys(scheduleArgs).sort(), [
		'expectedEpoch',
		'expectedPhase',
		'expectedRevision',
		'matchId',
		'type',
	])
	state = dispatchAutomaticTransition(state, 'bidding.open')

	assert.equal(matchesAutomaticTransition(state, scheduled), false)
	assert.equal(automaticTransitionFor(state).type, 'bidding.timeout')
})

test('capabilities expose player intents and keep automatic transitions server-owned', () => {
	let state = createDevState({ requiresSetupLoad: false })
	assert.equal(deriveAvailableActions(state, 'local-player')[0].type, 'shake_complete')

	state = dispatchShakes(state)
	state = dispatchDiceChecks(state)
	for (const playerId of state.players.order) {
		assert.deepEqual(deriveAvailableActions(state, playerId), [])
	}
	assert.equal(automaticTransitionFor(state).type, 'bidding.open')

	state = dispatchAutomaticTransition(state, 'bidding.open')
	state = dispatch(state, 'bid.raise', 'local-player', { bid: { count: 1, face: 2 } })
	state = dispatch(state, 'bullet.load', 'local-player', { slotIndex: 1 })
	state = dispatch(state, 'bid.challenge', 'opponent-1')
	for (const playerId of state.players.order) {
		assert.deepEqual(deriveAvailableActions(state, playerId), [])
	}
	assert.equal(automaticTransitionFor(state).type, 'duel.execute')
})
