import assert from 'node:assert/strict'
import test from 'node:test'

import {
	MAX_CUSTOM_GAME_PARTICIPANTS,
	planCustomGameBotAddition,
} from '../../../../.tmp/custom-game-test/composition.js'

test('an empty host room adds the first gameplay bot to seat one', () => {
	const addition = planCustomGameBotAddition(
		[{ playerId: 'local-player', seatIndex: 0 }],
		['opponent-1', 'opponent-2', 'opponent-3'],
	)
	assert.deepEqual(addition, {
		key: 'opponent-1',
		playerId: 'opponent-1',
		seatIndex: 1,
	})
})

test('each click chooses a distinct bot and skips occupied human seats', () => {
	const addition = planCustomGameBotAddition(
		[
			{ playerId: 'local-player', seatIndex: 0 },
			{ playerId: 'opponent-1', seatIndex: 1, virtualOpponentKey: 'opponent-1' },
			{ playerId: 'guest-1', seatIndex: 2 },
		],
		['opponent-1', 'opponent-2', 'opponent-3'],
	)
	assert.deepEqual(addition, {
		key: 'opponent-2',
		playerId: 'opponent-3',
		seatIndex: 3,
	})
})

test('a full room or exhausted catalog cannot add another bot', () => {
	const full = Array.from({ length: MAX_CUSTOM_GAME_PARTICIPANTS }, (_, seatIndex) => ({
		playerId: seatIndex === 0 ? 'local-player' : `opponent-${seatIndex}`,
		seatIndex,
		virtualOpponentKey: seatIndex === 0 ? undefined : `opponent-${seatIndex}`,
	}))
	assert.equal(planCustomGameBotAddition(full, ['opponent-1']), null)
	assert.equal(
		planCustomGameBotAddition(
			[
				{ playerId: 'local-player', seatIndex: 0 },
				{ playerId: 'opponent-1', seatIndex: 1, virtualOpponentKey: 'opponent-1' },
			],
			['opponent-1'],
		),
		null,
	)
})
