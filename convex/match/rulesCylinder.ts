/**
 * # 개요
 * 실린더 장전, 회전, 방아쇠 판정을 담당하는 순수 규칙 모듈이다.
 * 서버가 bullet consume과 hit 여부의 최종 권위를 가진다.
 *
 * # 의존성
 * - `convex/match/state.ts`: `CylinderState`.
 * - `play/game/model/rules/cylinder.lua`: 기존 Lua 규칙 포팅 기준.
 *
 * # I/O
 * - 입력:
 *   - cylinder state.
 *   - slot index or RNG value.
 * - 출력:
 *   - loaded cylinder.
 *   - trigger result: consumed, hit, next chamber.
 *
 * # 의사코드
 * ```text
 * loadBullet:
 *   reject occupied or out-of-range slot
 *   set slot true
 *
 * triggerCylinder:
 *   inspect current chamber slot
 *   consume bullet if present
 *   advance chamber index
 *   return hit/consumed result and next cylinder
 * ```
 */
import type { CylinderState } from './state'
import { GAME_RULESET } from '../../shared/game/ruleset'

export interface TriggerResult {
	cylinder: CylinderState
	shots: Array<{
		hit: boolean
		slotIndex: number
		consumed: boolean
	}>
}

function cloneCylinder(cylinder: CylinderState): CylinderState {
	return {
		chamberIndex: cylinder.chamberIndex || 1,
		slots: [...(cylinder.slots ?? [])],
	}
}

function wrapNext(index: number, size: number): number {
	const next = index + 1
	return next > size ? 1 : next
}

export function newCylinder(size = GAME_RULESET.cylinder.slots): CylinderState {
	return {
		chamberIndex: 1,
		slots: Array.from({ length: size }, () => false),
	}
}

export function loadedCount(cylinder: CylinderState): number {
	return cylinder.slots.filter(Boolean).length
}

export function loadBullet(cylinder: CylinderState, slotIndex: number): CylinderState {
	const next = cloneCylinder(cylinder)
	if (!Number.isSafeInteger(slotIndex)) {
		return cylinder
	}
	const zeroIndex = slotIndex - 1
	if (zeroIndex < 0 || zeroIndex >= next.slots.length || next.slots[zeroIndex]) {
		return cylinder
	}

	next.slots[zeroIndex] = true
	return next
}

export function tryLoadBullet(
	cylinder: CylinderState,
	slotIndex: number,
): { cylinder: CylinderState; ok: boolean; error?: string } {
	if (
		!Number.isFinite(slotIndex)
		|| !Number.isSafeInteger(slotIndex)
		|| slotIndex < 1
		|| slotIndex > cylinder.slots.length
	) {
		return { cylinder, ok: false, error: 'invalid_slot' }
	}
	if (!cylinder.slots[slotIndex - 1]) {
		return { cylinder: loadBullet(cylinder, slotIndex), ok: true }
	}
	return { cylinder, ok: false, error: 'slot_loaded' }
}

export function loadMany(
	cylinder: CylinderState,
	slotIndexes: number[],
): { cylinder: CylinderState; ok: boolean; error?: string } {
	let next = cloneCylinder(cylinder)
	for (const slotIndex of slotIndexes) {
		const result = tryLoadBullet(next, slotIndex)
		if (!result.ok) {
			return { cylinder, ok: false, error: 'invalid_initial_slots' }
		}
		next = result.cylinder
	}
	return { cylinder: next, ok: true }
}

export function spinCylinder(cylinder: CylinderState, steps: number): CylinderState {
	const next = cloneCylinder(cylinder)
	const size = next.slots.length
	if (size === 0) {
		return next
	}

	const offset = Math.floor(steps || 0) % size
	if (offset === 0) {
		next.chamberIndex = 1
		return next
	}

	const slots = Array.from({ length: size }, (_, index) => {
		const sourceIndex = (index + offset) % size
		return next.slots[sourceIndex]
	})

	return {
		chamberIndex: 1,
		slots,
	}
}

export function consumePending<TPending extends { count: number }>(
	pending: TPending | undefined,
): TPending | undefined {
	if (!pending) {
		return undefined
	}

	const left = pending.count - 1
	if (left <= 0) {
		return undefined
	}

	return {
		...pending,
		count: left,
	}
}

export function triggerCylinder(cylinder: CylinderState, count = 1): TriggerResult {
	const next = cloneCylinder(cylinder)
	const shots: TriggerResult['shots'] = []
	const size = next.slots.length

	for (let index = 0; index < count; index += 1) {
		const chamberIndex = next.chamberIndex || 1
		const zeroIndex = chamberIndex - 1
		const hit = next.slots[zeroIndex] === true
		shots.push({
			hit,
			slotIndex: chamberIndex,
			consumed: hit,
		})
		next.slots[zeroIndex] = false
		next.chamberIndex = wrapNext(chamberIndex, size)
	}

	return { cylinder: next, shots }
}
