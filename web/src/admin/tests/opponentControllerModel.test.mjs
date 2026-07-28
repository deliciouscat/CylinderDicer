import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
	buildQaSteps,
	preferredBotPlayerId,
	roomLabel,
} = require('../../../../.tmp/admin-model-test/admin/opponentControllerModel.js')

test('preferred bot prioritizes pending load, then active actionable bot', () => {
	const base = {
		ok: true,
		participants: [
			{ playerId: 'bot-a', isBot: true },
			{ playerId: 'bot-b', isBot: true },
		],
		playerDeltas: {
			'bot-a': { availableActions: [{ type: 'bid' }] },
			'bot-b': { availableActions: [{ type: 'load' }] },
		},
		state: {
			pendingLoad: { playerId: 'bot-b' },
			turn: { activePlayerId: 'bot-a' },
		},
	}
	assert.equal(preferredBotPlayerId(base), 'bot-b')
	assert.equal(
		preferredBotPlayerId({
			...base,
			state: { pendingLoad: null, turn: { activePlayerId: 'bot-a' } },
		}),
		'bot-a',
	)
})

test('QA step projection and room labels remain presentation-only', () => {
	const steps = buildQaSteps({
		roomReady: true,
		matchSelected: true,
		phase: 'bidding',
		matchComplete: false,
	})
	assert.equal(steps.find((step) => step.id === 'shake').done, true)
	assert.equal(steps.find((step) => step.id === 'complete').done, false)
	assert.equal(
		roomLabel({
			room: { _id: 'room-abcdef', status: 'composing' },
			allReady: true,
		}),
		'abcdef · composing · ready',
	)
})
