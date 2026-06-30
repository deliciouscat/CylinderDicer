/**
 * # 개요
 * phase 전이와 alive player order 계산을 담당한다.
 * 결투 이후 첫 bidding 플레이어, 사망자 skip, reload 대상 분리를 서버에서 일관되게 처리한다.
 *
 * # 의존성
 * - `convex/match/state.ts`: player order, eliminated flags, phase.
 * - `convex/protocol/snapshots.ts`: phase union.
 * - `play/game/model/turn_machine.lua`: 기존 Lua 전이 규칙 포팅 기준.
 *
 * # I/O
 * - 입력:
 *   - current phase.
 *   - transition event.
 *   - player order and eliminated state.
 * - 출력:
 *   - next phase.
 *   - next active/previous player id.
 *
 * # 의사코드
 * ```text
 * nextAliveAfter:
 *   find seat index for anchor player
 *   scan full player order circularly
 *   return first non-eliminated player
 *
 * transitionPhase:
 *   use explicit phase + event table
 *   never infer major game state from HUD names
 *   return next phase
 * ```
 */
import type { MatchPhase } from '../protocol/snapshots'
import type { PlayerState } from './state'

export const PHASE_TRANSITIONS: Record<string, Record<string, MatchPhase | 'waiting'>> = {
	waiting: {
		start_reload: 'revolver_reload',
		start_shake: 'cup_shake',
		preview_bidding: 'bidding',
	},
	revolver_reload: {
		reload_complete_setup: 'cup_shake',
		reload_complete_shake: 'dice_check',
		reload_complete_bid: 'bidding',
		reload_complete_exact_duel: 'cup_shake',
	},
	cup_shake: {
		shake_complete_first: 'dice_check',
		shake_complete_reload: 'revolver_reload',
		shake_complete_no_reload: 'dice_check',
	},
	dice_check: {
		all_checked: 'bidding_gap',
	},
	bidding_gap: {
		open_bidding: 'bidding',
	},
	bidding: {
		bid_reload: 'revolver_reload',
		bid_no_reload: 'bidding',
		challenge: 'duel',
	},
	duel: {
		match_complete: 'complete',
		round_shake: 'cup_shake',
		exact_reload: 'revolver_reload',
	},
	complete: {},
}

export const TURN_KIND_BY_PHASE = {
	waiting: 'setup',
	revolver_reload: 'setup',
	cup_shake: 'shaking',
	dice_check: 'shaking',
	bidding_gap: 'shaking',
	bidding: 'bidding',
	duel: 'dualing',
	complete: 'complete',
} as const

export function aliveOrder(
	playerOrder: string[],
	playersById: Record<string, PlayerState>,
): string[] {
	return playerOrder.filter((playerId) => {
		const player = playersById[playerId]
		return Boolean(player && !player.eliminated && player.hp > 0)
	})
}

export function nextAliveAfter(
	playerOrder: string[],
	playersById: Record<string, PlayerState>,
	anchorPlayerId: string,
): string | undefined {
	const alive = aliveOrder(playerOrder, playersById)
	if (alive.length === 0) {
		return undefined
	}

	const anchorIndex = playerOrder.indexOf(anchorPlayerId)

	if (anchorIndex >= 0) {
		for (let offset = 1; offset <= playerOrder.length; offset += 1) {
			const candidateId = playerOrder[(anchorIndex + offset) % playerOrder.length]
			const candidate = playersById[candidateId]
			if (candidate && !candidate.eliminated && candidate.hp > 0) {
				return candidateId
			}
		}
	}

	return alive[0]
}

export function kindForPhase(phase: MatchPhase | 'waiting') {
	return TURN_KIND_BY_PHASE[phase]
}

export interface PhaseTransitionResult {
	ok: boolean
	from: MatchPhase | 'waiting'
	to?: MatchPhase | 'waiting'
	event: string
	reason?: string
}

export function transitionPhase(
	current: MatchPhase | 'waiting',
	event: string,
): PhaseTransitionResult {
	const next = PHASE_TRANSITIONS[current]?.[event]
	if (!next) {
		return {
			ok: false,
			from: current,
			event,
			reason: 'invalid_phase_transition',
		}
	}

	return {
		ok: true,
		from: current,
		to: next,
		event,
	}
}
