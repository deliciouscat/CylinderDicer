import { deriveAvailableActions } from '../match/capabilities'
import type { MatchState } from '../match/state'
import type { BotObservation } from './types'

/**
 * Projects the same information boundary as a player client: public opponent
 * state plus only the acting bot's private dice and cylinder.
 */
export function buildBotObservation(
	state: MatchState,
	playerId: string,
): BotObservation | undefined {
	const self = state.players.byId[playerId]
	if (!self) {
		return undefined
	}

	return {
		matchId: state.matchId,
		revision: state.revision,
		phase: state.flow.phase,
		roundIndex: state.turn.roundIndex,
		playerId,
		self: {
			hp: self.hp,
			bullets: self.bullets,
			diceCount: self.diceCount,
			dice: [...self.dice],
			cylinder: {
				chamberIndex: self.cylinder.chamberIndex,
				slots: [...self.cylinder.slots],
			},
		},
		players: state.players.order.map((id) => {
			const player = state.players.byId[id]
			return {
				id,
				hp: player.hp,
				bullets: player.bullets,
				diceCount: player.diceCount,
				eliminated: player.eliminated,
			}
		}),
		currentBid: state.bidding.currentBid
			? { ...state.bidding.currentBid }
			: undefined,
		availableActions: deriveAvailableActions(state, playerId),
	}
}
