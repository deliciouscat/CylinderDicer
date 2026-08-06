import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { parseCommandPayload } = require('../../../.tmp/convex-domain/convex/protocol/commandPayloads.js')
const { createInitialMatchState } = require('../../../.tmp/convex-domain/convex/match/state.js')
const { reduceMatchState } = require('../../../.tmp/convex-domain/convex/match/reducer.js')
const { tryLoadBullet } = require('../../../.tmp/convex-domain/convex/match/rulesCylinder.js')

function action(type, payload) {
	return {
		type,
		actorPlayerId: 'local-player',
		actorUserId: 'user-local',
		payload,
	}
}

test('command payload normalizer accepts canonical camel and Defold snake payloads', () => {
	assert.deepEqual(
		parseCommandPayload('bullet.load', { slotIndex: 3 }),
		{ ok: true, payload: { slotIndex: 3 } },
	)
	assert.deepEqual(
		parseCommandPayload('setup.load_initial', { slot_index: 4 }),
		{ ok: true, payload: { slotIndex: 4 } },
	)
	assert.deepEqual(
		parseCommandPayload('bid.raise', {
			bid: { player_id: 'local-player', count: 7, face: 3 },
		}),
		{
			ok: true,
			payload: {
				bid: { playerId: 'local-player', count: 7, face: 3 },
			},
		},
	)
})

test('non-finite, fractional, aliased, and unexpected command payloads are rejected', () => {
	for (const slotIndex of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0, 7, '2']) {
		assert.equal(parseCommandPayload('bullet.load', { slotIndex }).ok, false)
	}
	assert.equal(
		parseCommandPayload('bullet.load', { slotIndex: 2, slot_index: 2 }).ok,
		false,
	)
	assert.equal(
		parseCommandPayload('bid.raise', { count: Number.NaN, face: 3 }).ok,
		false,
	)
	assert.equal(
		parseCommandPayload('bid.raise', { count: 2, face: 3.5 }).ok,
		false,
	)
	assert.equal(
		parseCommandPayload('bid.challenge', { count: 2 }).ok,
		false,
	)
})

test('malformed slot cannot consume pending load or mutate a chamber', () => {
	const state = createInitialMatchState({
		matchId: 'payload-guard-match',
		mode: 'dev',
		localPlayerId: 'local-player',
		firstPlayerId: 'local-player',
		requiresSetupLoad: true,
		players: [
			{ id: 'local-player', userId: 'user-local', name: 'Local' },
			{ id: 'opponent-1', userId: 'user-opponent', name: 'Opponent' },
		],
	})
	const beforeSlots = [...state.players.byId['local-player'].cylinder.slots]
	const beforePending = state.reload.pending.count
	const result = reduceMatchState(
		state,
		action('setup.load_initial', { slotIndex: Number.NaN }),
	)

	assert.equal(result.ok, false)
	assert.equal(result.error.code, 'INVALID_PAYLOAD')
	assert.deepEqual(state.players.byId['local-player'].cylinder.slots, beforeSlots)
	assert.equal(state.reload.pending.count, beforePending)
})

test('cylinder rule independently rejects non-finite and fractional indexes', () => {
	const cylinder = {
		chamberIndex: 1,
		slots: [false, false, false, false, false, false],
	}
	for (const slotIndex of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
		const result = tryLoadBullet(cylinder, slotIndex)
		assert.equal(result.ok, false)
		assert.deepEqual(result.cylinder, cylinder)
	}
})
