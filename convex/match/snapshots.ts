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
import type { MatchState } from './state'
import { deriveAvailableActions } from './capabilities'
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

function publicDuelPlayers(state: MatchState) {
	if (state.duel?.players && state.duel.players.length > 0) {
		return state.duel.players
	}

	return state.players.order.map((id) => {
		const { cylinder: _cylinder, ...player } = state.players.byId[id]
		return {
			...player,
			dice: [...player.dice],
		}
	})
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
					bid: state.duel.bid,
					judge: state.duel.judge,
					challengerId: state.duel.challengerId,
					previousBidderId: state.duel.previousBidderId,
					players: publicDuelPlayers(state),
					revolverSpin: state.duel.revolverSpin,
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
			availableActions: deriveAvailableActions(state, viewerPlayerId),
	}
}
