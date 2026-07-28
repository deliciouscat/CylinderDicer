import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { GAME_RULESET } = require('../../../.tmp/convex-domain/shared/game/ruleset.js')
const golden = JSON.parse(fs.readFileSync('shared/game/ruleset.golden.json', 'utf8'))

function luaNumber(source, name) {
	const match = source.match(new RegExp(`M\\.${name}\\s*=\\s*([0-9]+)`))
	assert.ok(match, `missing Lua ruleset constant ${name}`)
	return Number(match[1])
}

test('TypeScript ruleset matches the checked-in golden contract', () => {
	assert.deepEqual(GAME_RULESET, golden)
})

test('Defold ruleset matches cross-engine capacities and timings', () => {
	const lua = fs.readFileSync('play/game/ruleset.lua', 'utf8')
	const expected = {
		VERSION: golden.version,
		PLAYER_MIN: golden.players.min,
		PLAYER_MAX: golden.players.max,
		DICE_PER_PLAYER: golden.dice.perPlayer,
		DICE_FACE_MIN: golden.dice.faceMin,
		DICE_FACE_MAX: golden.dice.faceMax,
		SKULL_FACE: golden.dice.skullFace,
		CYLINDER_SLOTS: golden.cylinder.slots,
		INITIAL_HP: golden.cylinder.initialHp,
		BID_COUNT_MIN: golden.bidding.countMin,
		BID_COUNT_MAX: golden.bidding.countMax,
		DEFAULT_MMR: golden.rating.defaultMmr,
		SHAKE_REQUIRED_ACTIONS: golden.shake.requiredActions,
		BIDDING_OPEN_DELAY_MS: golden.timingsMs.biddingOpen,
		SHAKE_TIMEOUT_MS: golden.timingsMs.shakeTimeout,
		DICE_CHECK_TIMEOUT_MS: golden.timingsMs.diceCheckTimeout,
		BIDDING_TIMEOUT_MS: golden.timingsMs.biddingTimeout,
		BID_RELOAD_TIMEOUT_MS: golden.timingsMs.bidReloadTimeout,
		DUEL_REVEAL_INTERVAL_MS: golden.timingsMs.duelRevealInterval,
		DUEL_REVEAL_DURATION_MS: golden.timingsMs.duelRevealDuration,
		DUEL_REVEAL_HOLD_MS: golden.timingsMs.duelRevealHold,
		DUEL_EXECUTE_INTRO_MS: golden.timingsMs.duelExecuteIntro,
		DUEL_ROULETTE_STEP_MS: golden.timingsMs.duelRouletteStep,
		DUEL_PERFECT_STEP_MS: golden.timingsMs.duelPerfectStep,
		DUEL_COMPLETE_HOLD_MS: golden.timingsMs.duelCompleteHold,
	}
	for (const [name, value] of Object.entries(expected)) {
		assert.equal(luaNumber(lua, name), value, name)
	}
	assert.match(lua, /M\.INITIAL_LOADED_SLOTS\s*=\s*\{\s*1,\s*3,\s*5\s*\}/)
})

test('bot strategy registry rejects unknown keys and versions explicitly', () => {
	const {
		DEFAULT_BOT_STRATEGY_KEY,
		DEFAULT_BOT_STRATEGY_VERSION,
		resolveBotStrategy,
	} = require('../../../.tmp/convex-domain/convex/bots/strategies.js')

	assert.equal(
		typeof resolveBotStrategy(DEFAULT_BOT_STRATEGY_KEY, DEFAULT_BOT_STRATEGY_VERSION),
		'function',
	)
	assert.equal(resolveBotStrategy('unknown', '1'), undefined)
	assert.equal(resolveBotStrategy(DEFAULT_BOT_STRATEGY_KEY, '999'), undefined)
})
