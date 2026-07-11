/**
 * # 개요
 * 서버 권위형 dice roll과 face count 계산을 담당한다.
 * 클라이언트는 주사위 결과를 제출하지 않고, 서버 snapshot으로 받은 결과만 렌더링한다.
 *
 * # 의존성
 * - `convex/match/state.ts`: player dice state.
 * - Convex runtime RNG policy: 추후 deterministic seed 또는 서버 RNG 적용.
 * - `play/game/model/rules/dice.lua`: 기존 Lua 규칙 포팅 기준.
 *
 * # I/O
 * - 입력:
 *   - player count.
 *   - dice per player.
 *   - target face.
 * - 출력:
 *   - rolled dice arrays.
 *   - total count for target face.
 *
 * # 의사코드
 * ```text
 * rollDice:
 *   for each die, generate integer 1..6
 *   store results in authoritative state
 *
 * countFace:
 *   iterate alive players
 *   count dice equal to requested face, with skulls as wilds for non-skull bids
 *   return total
 * ```
 */
import type { PlayerState } from './state'

export const SKULL_FACE = 1

export interface SeedStep {
	seed: number
	value: number
}

export function nextSeedInt(seed: number, min: number, max: number): SeedStep {
	const nextSeed = (seed * 1103515245 + 12345) % 2147483647
	return {
		seed: nextSeed,
		value: min + (nextSeed % (max - min + 1)),
	}
}

export function rollDiceWithSeed(count: number, seed: number): { seed: number; values: number[] } {
	let nextSeed = seed
	const values: number[] = []
	for (let index = 0; index < count; index += 1) {
		const step = nextSeedInt(nextSeed, 1, 6)
		nextSeed = step.seed
		values.push(step.value)
	}

	return { seed: nextSeed, values }
}

export function rollDice(count: number, random = Math.random): number[] {
	return Array.from({ length: count }, () => Math.floor(random() * 6) + 1)
}

export function countFace(players: PlayerState[], face: number): number {
	return players.reduce(
		(total, player) =>
			player.eliminated
				? total
				: total + player.dice.filter((value) => value === face || (face !== SKULL_FACE && value === SKULL_FACE)).length,
		0,
	)
}

export function displayKind(face: number): 'skull' | 'pip' {
	return face === SKULL_FACE ? 'skull' : 'pip'
}
