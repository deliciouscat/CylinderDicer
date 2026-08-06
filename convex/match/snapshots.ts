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
import { type MatchState, type PlayerState } from './state'
import { deriveAvailableActions } from './capabilities'
import { suggestedBid } from './rulesBidding'
import { activeLoad } from './reloadMachine'
import {
	isCharacterKey,
	legacySeatCharacterKey,
} from '../../shared/game/characters'

const HUD_BY_PHASE: Record<string, string> = {
	revolver_reload: 'revolver_reload',
	cup_shake: 'cup_shake',
	dice_check: 'cup_shake',
	bidding_gap: 'cup_shake',
	bidding: 'bidding',
	duel: 'duel',
	complete: 'complete',
}

function displayCharacterKey(
	state: MatchState,
	player: Pick<PlayerState, 'id' | 'characterKey' | 'skin'>,
): string {
	if (player.characterKey) {
		return player.characterKey
	}
	if (isCharacterKey(player.skin)) {
		return player.skin
	}
	const playerIndex = Math.max(0, state.players.order.indexOf(player.id))
	return legacySeatCharacterKey(playerIndex)
}

function displaySkin(
	state: MatchState,
	player: Pick<PlayerState, 'id' | 'characterKey' | 'skin'>,
): string {
	if (player.skin && player.skin !== 'default') {
		return player.skin
	}
	return displayCharacterKey(state, player)
}

function publicDuelPlayers(state: MatchState) {
	if (state.duel?.players && state.duel.players.length > 0) {
		return state.duel.players.map((player) => ({
			...player,
			characterKey: displayCharacterKey(state, player),
			skin: displaySkin(state, player),
		}))
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
	const pending = activeLoad(state)
	if (
		state.flow.phase === 'bidding' &&
		pending?.source === 'bid'
	) {
		if (viewerPlayerId && pending.playerId === viewerPlayerId) {
			return 'revolver_reload'
		}
		return state.reload.gate ? 'loading' : 'bidding'
	}
	if (
		state.flow.phase === 'revolver_reload' &&
		pending &&
		viewerPlayerId &&
		pending.playerId !== viewerPlayerId
	) {
		return 'loading'
	}
	return HUD_BY_PHASE[state.flow.phase] ?? 'waiting'
}

export function buildPublicSnapshot(state: MatchState): MatchPublicSnapshot {
	const pending = activeLoad(state)
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
			result: state.match.result,
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
				characterKey: displayCharacterKey(state, player),
				skin: displaySkin(state, player),
				portraitState: player.portraitState,
				isActive: state.turn.activePlayerId === id,
				isLocal: player.isLocal,
			}
		}),
		bidding: {
			currentBid: state.bidding.currentBid,
			suggestedBid: suggestedBid(state.bidding.currentBid, state.bidding.myBid),
			skullRoulette: state.bidding.skullRoulette,
			reloadGate: state.reload.gate,
		},
		pendingLoad: pending
			? {
					playerId: pending.playerId,
					source: pending.source,
					count: pending.count,
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
