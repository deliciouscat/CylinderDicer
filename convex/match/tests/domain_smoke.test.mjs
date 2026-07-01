import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { createInitialMatchState } = require('../../../.tmp/convex-domain/match/state.js')
const { reduceMatchState } = require('../../../.tmp/convex-domain/match/reducer.js')

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

	state = dispatch(state, 'shake.complete', 'local-player')
	assert.equal(state.flow.phase, 'dice_check')

	state = dispatch(state, 'dice.check', 'local-player')
	assert.equal(state.flow.phase, 'bidding_gap')

	state = dispatch(state, 'bidding.open', 'local-player')
	assert.equal(state.flow.phase, 'bidding')

	state = dispatch(state, 'bid.raise', 'local-player', {
		bid: { count: 1, face: 2 },
	})
	state = dispatch(state, 'bullet.load', 'local-player', { slotIndex: 4 })
	assert.equal(state.turn.activePlayerId, 'opponent-1')

	state = dispatch(state, 'bid.challenge', 'opponent-1')
	assert.equal(state.flow.phase, 'duel')
	assert.equal(state.duel.challengerId, 'opponent-1')

	state = dispatch(state, 'duel.execute', 'opponent-1')
	assert.equal(state.duel.phase, 'executing')

	state = dispatch(state, 'round.advance', 'opponent-1')
	assert.match(state.flow.phase, /^(cup_shake|revolver_reload|complete)$/)
	assert.equal(state.turn.activePlayerId, 'opponent-1')
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
	state = dispatch(state, 'duel.execute', 'local-player')
	state = dispatch(state, 'round.advance', 'local-player')
	assert.equal(state.turn.activePlayerId, 'local-player')

	state = dispatch(state, 'shake.complete', 'local-player')
	if (state.pendingLoad) {
		state = dispatch(state, 'bullet.load', state.pendingLoad.playerId, { slotIndex: 1 })
	}
	state = dispatch(state, 'dice.check', 'local-player')
	state = dispatch(state, 'bidding.open', 'local-player')
	assert.equal(state.flow.phase, 'bidding')
	assert.equal(state.turn.activePlayerId, 'local-player')
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
	state.players.byId['local-player'].dice = [1, 1, 1, 1, 1]
	state.players.byId['opponent-1'].dice = [6, 1, 1, 1, 1]
	state.players.byId['opponent-2'].dice = [6, 1, 1, 1, 1]
	state.players.byId['opponent-1'].cylinder.slots = [true, true, true, true, true, true]
	state.players.byId['opponent-1'].bullets = 6

	state = dispatch(state, 'bid.challenge', 'opponent-2')
	state = dispatch(state, 'duel.execute', 'opponent-2')
	state = dispatch(state, 'round.advance', 'opponent-2')
	assert.equal(state.turn.activePlayerId, 'opponent-2')

	state = dispatch(state, 'shake.complete', 'opponent-2')
	assert.deepEqual(state.pendingLoad, {
		playerId: 'opponent-1',
		source: 'duel',
		count: 1,
	})
})
