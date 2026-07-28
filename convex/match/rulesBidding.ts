/**
 * # 개요
 * bidding phase의 bid raise/challenge 합법성을 판정한다.
 * 클라이언트의 availableActions는 UX 힌트일 뿐이고, 최종 bid 검증은 이 모듈에서 수행한다.
 *
 * # 의존성
 * - `convex/match/state.ts`: current bid와 player order.
 * - `convex/protocol/errors.ts`: illegal bid reject code.
 * - `play/game/model/rules/bidding.lua`: 기존 Lua 규칙을 포팅할 기준.
 *
 * # I/O
 * - 입력:
 *   - current bid.
 *   - requested next bid.
 *   - count/face limits.
 * - 출력:
 *   - valid/invalid result.
 *   - invalid reason.
 *
 * # 의사코드
 * ```text
 * if no current bid, allow any in range
 * reject count or face outside limits
 * reject non-raising bid
 * allow higher count
 * allow same count with higher face according to selected rule
 * return validation result
 * ```
 */
import type { BidState } from './state'
import { GAME_RULESET } from '../../shared/game/ruleset'

export interface BidLimits {
	minCount: number
	maxCount: number
  minFace: number
  maxFace: number
}

export interface BidValidationResult {
  ok: boolean
	reason?: string
}

export const DEFAULT_BID_LIMITS: BidLimits = {
	minCount: GAME_RULESET.bidding.countMin,
	maxCount: GAME_RULESET.bidding.countMax,
	minFace: GAME_RULESET.dice.faceMin,
	maxFace: GAME_RULESET.dice.faceMax,
}

function rank(bid: BidState): number {
	return bid.count * 10 + bid.face
}

export function validateBidRaise(
	currentBid: BidState | undefined,
	nextBid: BidState,
	limits: BidLimits = DEFAULT_BID_LIMITS,
): BidValidationResult {
	if (!nextBid || !Number.isFinite(nextBid.count) || !Number.isSafeInteger(nextBid.count)) {
		return { ok: false, reason: 'count_range' }
	}

	if (!Number.isFinite(nextBid.face) || !Number.isSafeInteger(nextBid.face)) {
		return { ok: false, reason: 'face_range' }
	}

	if (nextBid.count < limits.minCount || nextBid.count > limits.maxCount) {
		return { ok: false, reason: 'count_range' }
	}

	if (nextBid.face < limits.minFace || nextBid.face > limits.maxFace) {
		return { ok: false, reason: 'face_range' }
	}

	if (!currentBid) {
		return { ok: true }
	}

	if (rank(nextBid) <= rank(currentBid)) {
		return { ok: false, reason: 'too_low' }
	}

	return { ok: true }
}

export function clampCount(count: number, limits: BidLimits = DEFAULT_BID_LIMITS): number {
	if (count < limits.minCount) {
		return limits.minCount
	}
	if (count > limits.maxCount) {
		return limits.maxCount
	}
	return count
}

export function clampFace(face: number, limits: BidLimits = DEFAULT_BID_LIMITS): number {
	if (face < limits.minFace) {
		return limits.minFace
	}
	if (face > limits.maxFace) {
		return limits.maxFace
	}
	return face
}

export function suggestedBid(currentBid: BidState | undefined, fallback = { count: 1, face: 2 }) {
	if (!currentBid) {
		return {
			count: Math.max(1, fallback.count),
			face: Math.max(1, fallback.face),
		}
	}
	if (currentBid.face < GAME_RULESET.dice.faceMax) {
		return {
			count: currentBid.count,
			face: currentBid.face + 1,
		}
	}
	return {
		count: Math.min(DEFAULT_BID_LIMITS.maxCount, currentBid.count + 1),
		face: 1,
	}
}
