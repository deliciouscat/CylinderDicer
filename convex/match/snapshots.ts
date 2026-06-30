/**
 * # 개요
 * authoritative `MatchState`를 public view와 private delta로 투영하는 순수 모듈이다.
 * private 정보는 viewer player에게만 포함하고, public view에는 숨김 정보를 제거한다.
 *
 * # 의존성
 * - `convex/match/state.ts`: authoritative state.
 * - `convex/protocol/snapshots.ts`: snapshot payload shape.
 * - `convex/snapshots.ts`: DB query boundary.
 *
 * # I/O
 * - 입력:
 *   - `MatchState`.
 *   - optional viewer player id.
 * - 출력:
 *   - `MatchPublicSnapshot`.
 *   - `MatchPrivateDelta`.
 *
 * # 의사코드
 * ```text
 * map players to public player cards
 * include phase, turn, current bid, revision
 * for private delta, copy only viewer dice/cylinder/availableActions
 * never leak other players' hidden dice/cylinder
 * ```
 */
import type { MatchPrivateDelta, MatchPublicSnapshot } from '../protocol/snapshots'
import type { MatchState, PlayerState } from './state'
import { suggestedBid } from './rulesBidding'

const HUD_BY_PHASE: Record<string, string> = {
	revolver_reload: 'revolver_reload',
	cup_shake: 'cup_shake',
	dice_check: 'cup_shake',
	bidding_gap: 'cup_shake',
	bidding: 'bidding',
	duel: 'duel',
	complete: 'complete',
}

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
		ratio: Math.min(1, count / required),
		complete: count >= required,
	}
}

function availableActions(state: MatchState, playerId: string) {
	const result: unknown[] = []
	const pending = state.pendingLoad

	if (pending && pending.playerId === playerId) {
		const player = state.players.byId[playerId]
		result.push({
			type: 'load',
			slots: emptySlots(player),
			remaining: pending.count,
		})
		result.push({
			type: 'load_all',
			remaining: pending.count,
		})
		return result
	}

	if (playerId !== state.turn.activePlayerId) {
		return result
	}

	if (state.flow.phase === 'cup_shake') {
		const shake = shakeStatus(state, playerId)
		if (!shake.complete) {
			result.push({
				type: 'shake_complete',
				command: 'shake.complete',
				remaining: Math.max(0, shake.required - shake.count),
			})
		}
	} else if (state.flow.phase === 'dice_check') {
		if (!state.shake.checked[playerId]) {
			result.push({ type: 'check' })
		}
	} else if (state.flow.phase === 'bidding_gap') {
		result.push({ type: 'open' })
	} else if (state.flow.phase === 'bidding') {
		result.push({
			type: 'bid',
			min_count: 1,
			max_count: 36,
			min_face: 1,
			max_face: 6,
			suggested: suggestedBid(state.bidding.currentBid, state.bidding.myBid),
		})
		if (state.bidding.currentBid) {
			result.push({ type: 'challenge' })
		}
	} else if (state.flow.phase === 'duel') {
		result.push({
			type: 'resolve',
			stage: state.duel?.resolution ? 'advance' : 'execute',
		})
	}

	return result
}

export function hudKind(state: MatchState, viewerPlayerId?: string): string {
	if (
		state.flow.phase === 'revolver_reload' &&
		state.pendingLoad &&
		viewerPlayerId &&
		state.pendingLoad.playerId !== viewerPlayerId
	) {
		return 'loading'
	}
	return HUD_BY_PHASE[state.flow.phase] ?? state.turn.kind
}

export function buildPublicSnapshot(state: MatchState): MatchPublicSnapshot {
	return {
		kind: 'public',
		matchId: state.matchId,
		revision: state.revision,
		phase: state.flow.phase,
		hud: hudKind(state),
		match: {
			id: state.match.matchId,
			status: state.match.status,
			mode: state.match.mode,
			localPlayerId: state.match.localPlayerId,
			turnCount: state.match.turnCount,
			eventsHash: state.match.eventsHash,
			winnerId: state.match.winnerId,
		},
		turn: {
			activePlayerId: state.turn.activePlayerId,
			previousPlayerId: state.turn.previousPlayerId,
			roundIndex: state.turn.roundIndex,
			isFirstShake: state.turn.isFirstShake,
		},
		activePlayerId: state.turn.activePlayerId,
		previousPlayerId: state.turn.previousPlayerId,
		players: state.players.order.map((id) => {
			const player = state.players.byId[id]
			return {
				id: player.id,
				name: player.name,
				hp: player.hp,
				bullets: player.bullets,
				eliminated: player.eliminated,
				isActive: state.turn.activePlayerId === id,
				isLocal: player.isLocal,
			}
		}),
		bidding: {
			currentBid: state.bidding.currentBid,
			suggestedBid: suggestedBid(state.bidding.currentBid, state.bidding.myBid),
		},
		pendingLoad: state.pendingLoad
			? {
					playerId: state.pendingLoad.playerId,
					source: state.pendingLoad.source,
					count: state.pendingLoad.count,
				}
			: undefined,
		shake: state.shake,
		duel: state.duel
			? {
					phase: state.duel.phase,
					judge: state.duel.judge,
					challengerId: state.duel.challengerId,
					previousBidderId: state.duel.previousBidderId,
					resolution: state.duel.resolution,
				}
			: undefined,
	}
}

export function buildPrivateDelta(
  state: MatchState,
  viewerPlayerId: string,
): MatchPrivateDelta {
	const viewer = state.players.byId[viewerPlayerId]

	return {
		kind: 'private_delta',
		matchId: state.matchId,
		revision: state.revision,
		hud: hudKind(state, viewerPlayerId),
		viewerPlayerId,
		dice: viewer?.dice,
		cylinder: viewer?.cylinder,
		availableActions: availableActions(state, viewerPlayerId),
	}
}
