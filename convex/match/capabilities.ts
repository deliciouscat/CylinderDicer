import type { AvailableAction } from '../protocol/snapshots'
import { suggestedBid } from './rulesBidding'
import type { MatchState, PlayerState } from './state'

function emptySlots(player: PlayerState | undefined): number[] {
	if (!player) {
		return []
	}
	const slots: number[] = []
	player.cylinder.slots.forEach((loaded, index) => {
		if (!loaded) {
			slots.push(index + 1)
		}
	})
	return slots
}

function shakeStatus(state: MatchState, playerId: string) {
	const required = Math.max(1, state.shake.requiredCount || 1)
	const count = Math.max(0, state.shake.counts[playerId] ?? 0)
	return {
		count,
		required,
		complete: count >= required,
	}
}

export function deriveAvailableActions(state: MatchState, playerId: string): AvailableAction[] {
	const pending = state.pendingLoad
	if (pending?.playerId === playerId) {
		return [
			{
				type: 'load',
				slots: emptySlots(state.players.byId[playerId]),
				remaining: pending.count,
			},
			{
				type: 'load_all',
				remaining: pending.count,
			},
		]
	}

	if (state.flow.phase === 'cup_shake') {
		const player = state.players.byId[playerId]
		const shake = shakeStatus(state, playerId)
		if (player && !player.eliminated && player.hp > 0 && !shake.complete) {
			return [{
				type: 'shake_complete',
				command: 'shake.complete',
				remaining: Math.max(0, shake.required - shake.count),
			}]
		}
	}

	if (state.flow.phase === 'dice_check') {
		const player = state.players.byId[playerId]
		if (player && !player.eliminated && player.hp > 0 && !state.shake.checked[playerId]) {
			return [{ type: 'check' }]
		}
	}

	if (state.flow.phase === 'bidding' && playerId === state.turn.activePlayerId) {
		const actions: AvailableAction[] = [{
			type: 'bid',
			min_count: 1,
			max_count: 36,
			min_face: 1,
			max_face: 6,
			suggested: suggestedBid(state.bidding.currentBid, state.bidding.myBid),
		}]
		if (state.bidding.currentBid) {
			actions.push({ type: 'challenge' })
		}
		return actions
	}

	return []
}
