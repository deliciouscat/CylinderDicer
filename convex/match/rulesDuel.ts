/**
 * # 개요
 * 결투 판정과 damage resolution 규칙을 담당한다.
 * `beginDuel`은 공개용 판정 context를 만들고, `resolveDuel`은 HP/실린더 변화를 한 번만 계산한다.
 *
 * # 의존성
 * - `convex/match/rulesDice.ts`: actual face count.
 * - `convex/match/rulesCylinder.ts`: russian roulette trigger.
 * - `convex/match/state.ts`: bid/player/cylinder state.
 * - `play/game/model/rules/duel.lua`: 기존 Lua 규칙 포팅 기준.
 *
 * # I/O
 * - 입력:
 *   - current bid.
 *   - challenger id.
 *   - previous bidder id.
 *   - players state.
 * - 출력:
 *   - verdict: SHORT, OVER, EXACT.
 *   - resolution steps.
 *   - HP/cylinder changes.
 *
 * # 의사코드
 * ```text
 * judgeDuel:
 *   actual = count dice matching bid.face
 *   if actual < bid.count then SHORT
 *   if actual > bid.count then OVER
 *   else EXACT
 *
 * resolveDuel:
 *   SHORT -> challenger roulette delta times
 *   OVER -> previous bidder roulette delta times
 *   EXACT -> previous bidder executes perfect duel sequence
 *   return ordered steps and next state patch
 * ```
 */
import type {
	BidState,
	DuelResolutionState,
	DuelState,
	MatchState,
	PlayerState,
} from './state'
import { isAlive } from './state'
import { countFace } from './rulesDice'
import { spinCylinder, triggerCylinder } from './rulesCylinder'

export type DuelVerdict = 'SHORT' | 'OVER' | 'EXACT'

export interface DuelJudge {
	verdict: DuelVerdict
	actual: number
	delta: number
	rawDelta: number
}

export function judgeDuel(bid: BidState, players: PlayerState[]): DuelJudge {
	const actual = countFace(players, bid.face)
	const rawDelta = actual - bid.count

	if (rawDelta < 0) {
		return { verdict: 'SHORT', actual, delta: Math.abs(rawDelta), rawDelta }
	}

	if (rawDelta > 0) {
		return { verdict: 'OVER', actual, delta: rawDelta, rawDelta }
	}

	return { verdict: 'EXACT', actual, delta: 0, rawDelta }
}

function publicPlayerSnapshot(player: PlayerState): Omit<PlayerState, 'cylinder'> {
	const { cylinder: _cylinder, ...snapshot } = player
	return {
		...snapshot,
		dice: [...player.dice],
	}
}

function targetOrderFromChallenger(
	state: MatchState,
	challengerId: string,
	actorId: string,
): string[] {
	const order = state.players.order
	const startIndex = Math.max(0, order.indexOf(challengerId))
	const targets: string[] = []

	for (let offset = 0; offset < order.length; offset += 1) {
		const playerId = order[(startIndex + offset) % order.length]
		const player = state.players.byId[playerId]
		if (playerId !== actorId && isAlive(player)) {
			targets.push(playerId)
		}
	}

	return targets
}

function applyHpChanges(state: MatchState, hpChanges: Record<string, number>): void {
	for (const [playerId, delta] of Object.entries(hpChanges)) {
		const player = state.players.byId[playerId]
		if (player) {
			player.hp = Math.max(0, player.hp + delta)
			player.eliminated = player.hp <= 0
		}
	}
}

export function beginDuel(
	state: MatchState,
	challengerId: string,
	previousBidderId: string,
): DuelState | undefined {
	const bid = state.bidding.currentBid
	if (!bid) {
		return undefined
	}

	const players = state.players.order.map((playerId) =>
		publicPlayerSnapshot(state.players.byId[playerId]),
	)

	return {
		phase: 'ready',
		bid: {
			playerId: bid.playerId,
			count: bid.count,
			face: bid.face,
		},
		challengerId,
		previousBidderId: previousBidderId || bid.playerId,
		players,
		judge: judgeDuel(bid, Object.values(state.players.byId)),
	}
}

export function spinDuelRevolver(
	state: MatchState,
	duel: DuelState,
	steps: number,
): { playerId: string; steps: number } | undefined {
	const playerId = duel.judge.verdict === 'SHORT' ? duel.challengerId : duel.previousBidderId
	const player = state.players.byId[playerId]
	if (!player) {
		return undefined
	}

	player.cylinder = spinCylinder(player.cylinder, steps)
	return { playerId, steps }
}

function resolveDuelShots(state: MatchState, duel: DuelState): DuelResolutionState {
	const targetId = duel.judge.verdict === 'SHORT' ? duel.challengerId : duel.previousBidderId
	const target = state.players.byId[targetId]
	const steps: DuelResolutionState['steps'] = []
	const hpChanges: Record<string, number> = {}

	if (target) {
		const result = triggerCylinder(target.cylinder, duel.judge.delta)
		target.cylinder = result.cylinder

		for (const shot of result.shots) {
			steps.push({
				kind: 'roulette',
				targetId,
				rouletteSubjectId: targetId,
				hit: shot.hit,
				slotIndex: shot.slotIndex,
				consumed: shot.consumed,
			})

			if (shot.hit) {
				hpChanges[targetId] = (hpChanges[targetId] ?? 0) - 1
			}
		}
	}

	const resolution: DuelResolutionState = {
		kind: 'duel_shots',
		verdict: duel.judge.verdict,
		challengerId: duel.challengerId,
		previousBidderId: duel.previousBidderId,
		targetId,
		rouletteSubjectId: targetId,
		steps,
		hpChanges,
	}

	applyHpChanges(state, hpChanges)
	return resolution
}

function resolvePerfectDuel(state: MatchState, duel: DuelState): DuelResolutionState {
	const previousId = duel.previousBidderId
	const targets = targetOrderFromChallenger(state, duel.challengerId, previousId)
	const actor = state.players.byId[previousId]
	const steps: DuelResolutionState['steps'] = []
	const hpChanges: Record<string, number> = {}

	if (actor && targets.length > 0) {
		const result = triggerCylinder(actor.cylinder, 6)
		actor.cylinder = result.cylinder

		result.shots.forEach((shot, index) => {
			const targetId = targets[index % targets.length]
			steps.push({
				kind: 'perfect_duel',
				actorId: previousId,
				shooterId: previousId,
				targetId,
				actorChoice: 'trigger',
				targetChoice: 'take_hit',
				hit: shot.hit,
				slotIndex: shot.slotIndex,
				consumed: shot.consumed,
				needsChoice: true,
			})

			if (shot.hit) {
				hpChanges[targetId] = (hpChanges[targetId] ?? 0) - 1
			}
		})
	}

	const resolution: DuelResolutionState = {
		kind: 'perfect_duel',
		actorId: previousId,
		shooterId: previousId,
		targets,
		steps,
		hpChanges,
		reloadPlayerId: previousId,
	}

	applyHpChanges(state, hpChanges)
	return resolution
}

export function resolveDuel(state: MatchState, duel: DuelState | undefined): DuelResolutionState | undefined {
	if (!duel) {
		return undefined
	}

	if (duel.judge.verdict === 'EXACT') {
		return resolvePerfectDuel(state, duel)
	}

	return resolveDuelShots(state, duel)
}

export function duelReloadPlayerId(
	state: MatchState,
	resolution: DuelResolutionState | undefined,
): string | undefined {
	if (!resolution || resolution.kind !== 'duel_shots') {
		return undefined
	}

	for (const step of resolution.steps) {
		if (step.consumed) {
			const playerId = step.rouletteSubjectId ?? step.targetId
			if (isAlive(state.players.byId[playerId])) {
				return playerId
			}
		}
	}

	return undefined
}
