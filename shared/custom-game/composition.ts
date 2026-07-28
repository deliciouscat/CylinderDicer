export const MAX_CUSTOM_GAME_PARTICIPANTS = 6

export interface CustomGameCompositionParticipant {
	playerId: string
	seatIndex: number
	userId?: string
	participantKind?: 'human' | 'virtual'
	virtualOpponentKey?: string
}

export interface CustomGameBotAddition {
	key: string
	playerId: string
	seatIndex: number
}

export interface CustomGameBotRemoval {
	playerId: string
	seatIndex: number
}

export type CustomGameDeparturePlan =
	| {
			kind: 'leave'
			departingPlayerId: string
	  }
	| {
			kind: 'transfer'
			departingPlayerId: string
			nextHostPlayerId: string
			nextHostUserId: string
	  }
	| {
			kind: 'close'
			departingPlayerId: string
	  }

export function planCustomGameBotAddition(
	participants: CustomGameCompositionParticipant[],
	availableBotKeys: string[],
): CustomGameBotAddition | null {
	if (participants.length >= MAX_CUSTOM_GAME_PARTICIPANTS) {
		return null
	}

	const activeBotKeys = new Set(
		participants
			.map((participant) => participant.virtualOpponentKey)
			.filter((key): key is string => Boolean(key)),
	)
	const key = availableBotKeys.find((candidate) => !activeBotKeys.has(candidate))
	if (!key) {
		return null
	}

	const usedPlayerIds = new Set(participants.map((participant) => participant.playerId))
	const usedSeatIndices = new Set(participants.map((participant) => participant.seatIndex))
	for (let index = 1; index < MAX_CUSTOM_GAME_PARTICIPANTS; index += 1) {
		const playerId = `opponent-${index}`
		if (!usedPlayerIds.has(playerId) && !usedSeatIndices.has(index)) {
			return {
				key,
				playerId,
				seatIndex: index,
			}
		}
	}

	return null
}

export function planCustomGameBotRemoval(
	participants: CustomGameCompositionParticipant[],
	playerId: string,
): CustomGameBotRemoval | null {
	const participant = participants.find((candidate) => {
		return candidate.playerId === playerId && Boolean(candidate.virtualOpponentKey)
	})
	return participant
		? {
				playerId: participant.playerId,
				seatIndex: participant.seatIndex,
			}
		: null
}

export function planCustomGameDeparture(
	participants: CustomGameCompositionParticipant[],
	hostUserId: string,
	departingUserId: string,
): CustomGameDeparturePlan | null {
	const departing = participants.find((participant) => {
		return participant.participantKind === 'human' && participant.userId === departingUserId
	})
	if (!departing) {
		return null
	}
	if (departingUserId !== hostUserId) {
		return {
			kind: 'leave',
			departingPlayerId: departing.playerId,
		}
	}

	const nextHost = participants
		.filter((participant) => {
			return participant.participantKind === 'human'
				&& Boolean(participant.userId)
				&& participant.userId !== departingUserId
		})
		.sort((left, right) => left.seatIndex - right.seatIndex)[0]
	if (!nextHost?.userId) {
		return {
			kind: 'close',
			departingPlayerId: departing.playerId,
		}
	}
	return {
		kind: 'transfer',
		departingPlayerId: departing.playerId,
		nextHostPlayerId: nextHost.playerId,
		nextHostUserId: nextHost.userId,
	}
}
