import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { createInitialMatchState } = require('../../../.tmp/convex-domain/convex/match/state.js')
const { buildBotObservation } = require('../../../.tmp/convex-domain/convex/bots/observation.js')
const {
	botRaiseCountStep,
	botReactionDelayMs,
	decideBotIntent,
	normalizeBotParameters,
} = require('../../../.tmp/convex-domain/convex/bots/decision.js')

function createBotState() {
	return createInitialMatchState({
		matchId: 'bot-test-match',
		mode: 'casual',
		localPlayerId: 'human',
		firstPlayerId: 'human',
		requiresSetupLoad: false,
		rngSeed: 314159,
		players: [
			{ id: 'human', userId: 'user-human', participantKind: 'human', name: 'Human' },
			{
				id: 'bot',
				virtualOpponentId: 'virtual-bot',
				participantKind: 'virtual',
				controlMode: 'server_bot',
				name: 'Bot',
				initialLoadedSlots: [1, 3, 5],
			},
		],
	})
}

test('bot observation exposes only the bot private dice and cylinder', () => {
	const state = createBotState()
	state.players.byId.human.dice = [6, 6, 6, 6, 6]
	state.players.byId.bot.dice = [1, 2, 3, 4, 5]
	const observation = buildBotObservation(state, 'bot')

	assert.ok(observation)
	assert.deepEqual(observation.self.dice, [1, 2, 3, 4, 5])
	assert.deepEqual(observation.self.cylinder.slots, [true, false, true, false, true, false])
	for (const player of observation.players) {
		assert.equal(Object.hasOwn(player, 'dice'), false)
		assert.equal(Object.hasOwn(player, 'cylinder'), false)
	}
})

test('bot decision is deterministic for the same revision seed and returns a legal bid', () => {
	const observation = {
		matchId: 'bot-test-match',
		revision: 12,
		phase: 'bidding',
		roundIndex: 2,
		playerId: 'bot',
		self: {
			hp: 6,
			bullets: 2,
			diceCount: 5,
			dice: [2, 2, 3, 5, 6],
			cylinder: { chamberIndex: 1, slots: [true, false, true, false, false, false] },
		},
		players: [
			{ id: 'human', hp: 6, bullets: 3, diceCount: 5, eliminated: false },
			{ id: 'bot', hp: 6, bullets: 2, diceCount: 5, eliminated: false },
		],
		currentBid: { playerId: 'human', count: 2, face: 2 },
		availableActions: [
			{
				type: 'bid',
				min_count: 1,
				max_count: 36,
				min_face: 1,
				max_face: 6,
				suggested: { count: 3, face: 2 },
			},
			{ type: 'challenge' },
		],
	}
	const context = {
		strategyKey: 'weighted_baseline',
		strategyVersion: '1',
		parameters: { challengeThreshold: 1, randomness: 0.5 },
		seed: 'bot-test-match:12:bot:1',
	}
	const first = decideBotIntent(observation, context)
	const second = decideBotIntent(observation, context)

	assert.deepEqual(second, first)
	assert.equal(first.type, 'bid.raise')
	assert.ok(first.payload.count >= 3)
	assert.ok(first.payload.face >= 1 && first.payload.face <= 6)
})

test('bot count raises vary deterministically between one and three cells', () => {
	const parameters = normalizeBotParameters({
		aggression: 0.6,
		bluffRate: 0.35,
		randomness: 0.4,
	})
	const observedSteps = new Set()
	for (let index = 0; index < 128; index += 1) {
		const seed = `raise-step:${index}`
		const step = botRaiseCountStep(parameters, seed)
		assert.ok(step >= 1 && step <= 3)
		assert.equal(step, botRaiseCountStep(parameters, seed))
		observedSteps.add(step)
	}
	assert.deepEqual([...observedSteps].sort(), [1, 2, 3])
})

test('personality parameters and reaction delay remain bounded', () => {
	const normalized = normalizeBotParameters({
		aggression: 4,
		honesty: -2,
		reactionMinMs: -10,
		reactionMaxMs: 250,
	})
	assert.equal(normalized.aggression, 1)
	assert.equal(normalized.honesty, 0)
	assert.equal(normalized.reactionMinMs, 80)
	assert.equal(normalized.reactionMaxMs, 250)

	const delay = botReactionDelayMs(normalized, 'stable-seed')
	assert.ok(delay >= 80 && delay <= 250)
	assert.equal(delay, botReactionDelayMs(normalized, 'stable-seed'))
	assert.equal(botReactionDelayMs(normalized, 'stable-seed', 'checkpoint'), 0)
	const biddingDelay = botReactionDelayMs(normalized, 'stable-seed', 'bidding')
	assert.ok(biddingDelay >= 1_800 && biddingDelay <= 4_200)
	assert.ok(biddingDelay > delay)
	assert.equal(biddingDelay, botReactionDelayMs(normalized, 'stable-seed', 'bidding'))

	const nonFinite = normalizeBotParameters({
		reactionMinMs: Number.POSITIVE_INFINITY,
		reactionMaxMs: Number.NaN,
	})
	assert.equal(nonFinite.reactionMinMs, 450)
	assert.equal(nonFinite.reactionMaxMs, 1_100)
	assert.ok(Number.isFinite(botReactionDelayMs(nonFinite, 'non-finite-seed')))
})

test('automatic phase intents use only player command types', () => {
	const base = {
		matchId: 'bot-test-match',
		revision: 1,
		phase: 'cup_shake',
		roundIndex: 1,
		playerId: 'bot',
		self: {
			hp: 6,
			bullets: 3,
			diceCount: 5,
			dice: [1, 2, 3, 4, 5],
			cylinder: { chamberIndex: 1, slots: [true, false, true, false, true, false] },
		},
		players: [{ id: 'bot', hp: 6, bullets: 3, diceCount: 5, eliminated: false }],
	}
	const context = {
		strategyKey: 'weighted_baseline',
		strategyVersion: '1',
		seed: 'phase-intents',
	}

	assert.equal(decideBotIntent({
		...base,
		availableActions: [{ type: 'load', slots: [2, 4], remaining: 1 }],
	}, context).type, 'bullet.load')
	assert.equal(decideBotIntent({
		...base,
		availableActions: [{ type: 'shake_complete', command: 'shake.complete', remaining: 1 }],
	}, context).type, 'shake.complete')
	assert.equal(decideBotIntent({
		...base,
		availableActions: [{ type: 'check' }],
	}, context).type, 'dice.check')
})
