import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { createInitialMatchState } = require('../../../.tmp/convex-domain/match/state.js')
const { reduceMatchState } = require('../../../.tmp/convex-domain/match/reducer.js')
const { buildPrivateDelta, buildPublicSnapshot } = require('../../../.tmp/convex-domain/match/snapshots.js')
const { automaticTransitionFor, automaticTransitionScheduleArgs, matchesAutomaticTransition } = require('../../../.tmp/convex-domain/match/flow.js')
const { deriveAvailableActions } = require('../../../.tmp/convex-domain/match/capabilities.js')

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
	state.turn.kind = 'bidding'
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
	state.turn.kind = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.turn.previousPlayerId = 'opponent-1'
	state.bidding.currentBid = { playerId: 'opponent-1', count: 10, face: 4 }
	for (const player of Object.values(state.players.byId)) {
		player.dice = [1, 1, 1, 1, 1]
	}

	state = dispatch(state, 'bid.challenge', 'local-player')
	state = dispatchAutomaticTransition(state, 'duel.execute')
	state = dispatchAutomaticTransition(state, 'round.advance')
	assert.equal(state.turn.activePlayerId, 'local-player')

	state = dispatchShakes(state)
	if (state.pendingLoad) {
		state = dispatch(state, 'bullet.load', state.pendingLoad.playerId, { slotIndex: 1 })
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

test('face one is a skull bid and raises after face six at the next count', () => {
	let state = createDevState({ requiresSetupLoad: false })
	state.flow.phase = 'bidding'
	state.turn.kind = 'bidding'
	state.turn.activePlayerId = 'local-player'
	state.bidding.currentBid = { playerId: 'opponent-2', count: 2, face: 6 }

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 3, face: 1 },
	})
	assert.equal(state.bidding.currentBid.face, 1)
	assert.equal(state.bidding.currentBid.count, 3)
})

test('duel bullet spender reloads after the next shake', () => {
	let state = createDevState({
		matchId: 'spender-reload-match',
		requiresSetupLoad: false,
	})

	state.flow.phase = 'bidding'
	state.turn.kind = 'bidding'
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

	state = dispatchShakes(state)
	assert.deepEqual(state.pendingLoad, {
		playerId: 'opponent-1',
		source: 'duel',
		count: 1,
	})
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
	assert.equal(automaticTransitionFor(state), undefined)
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
