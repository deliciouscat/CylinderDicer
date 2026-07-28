import assert from 'node:assert/strict'
import test from 'node:test'

import {
	MAX_CUSTOM_GAME_PARTICIPANTS,
	planCustomGameBotAddition,
	planCustomGameBotRemoval,
	planCustomGameDeparture,
} from '../../../../.tmp/custom-game-test/composition.js'
import {
	customGameBackAction,
} from '../../../../.tmp/custom-game-test/navigation.js'

test('back leaves an open room for the room browser, then exits the browser to lobby', () => {
	assert.equal(customGameBackAction(true), 'leave_to_room_browser')
	assert.equal(customGameBackAction(false), 'lobby')
})

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

test('bot removal accepts only the selected virtual participant', () => {
	const participants = [
		{ playerId: 'local-player', seatIndex: 0 },
		{ playerId: 'guest-1', seatIndex: 1 },
		{ playerId: 'opponent-2', seatIndex: 2, virtualOpponentKey: 'opponent-1' },
	]
	assert.deepEqual(planCustomGameBotRemoval(participants, 'opponent-2'), {
		playerId: 'opponent-2',
		seatIndex: 2,
	})
	assert.equal(planCustomGameBotRemoval(participants, 'local-player'), null)
	assert.equal(planCustomGameBotRemoval(participants, 'guest-1'), null)
	assert.equal(planCustomGameBotRemoval(participants, 'missing'), null)
})

test('departing host transfers ownership to the earliest remaining human, never a bot', () => {
	const participants = [
		{ playerId: 'local-player', seatIndex: 0, userId: 'host', participantKind: 'human' },
		{ playerId: 'opponent-1', seatIndex: 1, participantKind: 'virtual' },
		{ playerId: 'guest-2', seatIndex: 4, userId: 'later', participantKind: 'human' },
		{ playerId: 'guest-1', seatIndex: 2, userId: 'first', participantKind: 'human' },
	]
	assert.deepEqual(planCustomGameDeparture(participants, 'host', 'host'), {
		kind: 'transfer',
		departingPlayerId: 'local-player',
		nextHostPlayerId: 'guest-1',
		nextHostUserId: 'first',
	})
})

test('departing host closes a bot-only room and guest departure does not transfer ownership', () => {
	const botOnly = [
		{ playerId: 'local-player', seatIndex: 0, userId: 'host', participantKind: 'human' },
		{ playerId: 'opponent-1', seatIndex: 1, participantKind: 'virtual' },
	]
	assert.deepEqual(planCustomGameDeparture(botOnly, 'host', 'host'), {
		kind: 'close',
		departingPlayerId: 'local-player',
	})

	const withGuest = [
		...botOnly,
		{ playerId: 'guest-1', seatIndex: 2, userId: 'guest', participantKind: 'human' },
	]
	assert.deepEqual(planCustomGameDeparture(withGuest, 'host', 'guest'), {
		kind: 'leave',
		departingPlayerId: 'guest-1',
	})
	assert.equal(planCustomGameDeparture(withGuest, 'host', 'missing'), null)
})
