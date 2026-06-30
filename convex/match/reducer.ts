/**
 * # 개요
 * authoritative match state와 domain action을 받아 다음 state와 event 목록을 생성하는 순수 reducer다.
 * 실제 DB write는 `convex/commands.ts`가 담당하고, 이 파일은 규칙 계산만 담당한다.
 *
 * # 의존성
 * - `convex/match/state.ts`: state shape.
 * - `convex/match/actions.ts`: reducer action.
 * - `convex/match/rulesBidding.ts`
 * - `convex/match/rulesCylinder.ts`
 * - `convex/match/rulesDice.ts`
 * - `convex/match/rulesDuel.ts`
 * - `convex/match/turnMachine.ts`
 *
 * # I/O
 * - 입력:
 *   - current `MatchState`.
 *   - `MatchAction`.
 * - 출력:
 *   - accepted next state and emitted events.
 *   - rejected domain error.
 *
 * # 의사코드
 * ```text
 * switch action.type
 * validate current phase and active player
 * delegate detailed rule checks to rules modules
 * clone and mutate next state
 * increment revision
 * emit domain events
 * return reduce result
 * ```
 */
import type { MatchAction } from './actions'
import {
	aliveCount,
	cloneState,
	DICE_CHECK_DELAY_SECONDS,
	isAlive,
	pendingForPlayer,
	resetMyBid,
	resetShake,
	setHint,
	SHAKE_REQUIRED_COUNT,
	updateAllBullets,
	updateBullets,
	type BidState,
	type MatchState,
	type PendingLoadState,
} from './state'
import type { CommandError } from '../protocol/errors'
import { consumePending, tryLoadBullet } from './rulesCylinder'
import { rollDiceWithSeed, nextSeedInt } from './rulesDice'
import { DEFAULT_BID_LIMITS, validateBidRaise } from './rulesBidding'
import {
	beginDuel,
	duelReloadPlayerId,
	resolveDuel,
	spinDuelRevolver,
} from './rulesDuel'
import { kindForPhase, nextAliveAfter, transitionPhase } from './turnMachine'

export interface MatchEvent<TPayload = unknown> {
  type: string
  actorUserId?: string
  payload?: TPayload
}

export interface ReduceAccepted {
  ok: true
  state: MatchState
  events: MatchEvent[]
}

export interface ReduceRejected {
  ok: false
  error: CommandError
}

export type ReduceResult = ReduceAccepted | ReduceRejected

function error(code: CommandError['code'], message: string, details?: unknown): ReduceRejected {
	return {
		ok: false,
		error: { code, message, details },
	}
}

function domainError(message: string, details?: unknown): ReduceRejected {
	return error('INVALID_PAYLOAD', message, details)
}

function event(action: MatchAction, payload?: unknown): MatchEvent {
	return {
		type: action.type,
		actorUserId: action.actorUserId,
		payload: payload ?? action.payload,
	}
}

function stableSerialize(value: unknown): string {
	if (value === null) {
		return 'nil'
	}
	if (typeof value !== 'object') {
		return String(value)
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableSerialize).join(',')}]`
	}

	const object = value as Record<string, unknown>
	const keys = Object.keys(object).sort()
	return `{${keys.map((key) => `${key}=${stableSerialize(object[key])}`).join(',')}}`
}

function appendEventHash(state: MatchState, action: MatchAction): void {
	const text = `${state.match.eventsHash || '0'}|${action.type}|${stableSerialize(action.payload ?? {})}`
	let hash = 5381
	for (let index = 0; index < text.length; index += 1) {
		hash = (hash * 33 + text.charCodeAt(index)) % 2147483647
	}
	state.match.eventsHash = String(hash)
}

function accept(state: MatchState, action: MatchAction, events?: MatchEvent[]): ReduceAccepted {
	state.revision += 1
	appendEventHash(state, action)
	setHint(state)
	return {
		ok: true,
		state,
		events: events ?? [event(action)],
	}
}

function enterPhase(state: MatchState, phase: MatchState['flow']['phase']): void {
	state.flow.phase = phase
	state.flow.diceCheckDelaySeconds = DICE_CHECK_DELAY_SECONDS
	state.turn.kind = kindForPhase(phase)
}

function applyTransition(state: MatchState, eventName: string): string | undefined {
	const result = transitionPhase(state.flow.phase, eventName)
	if (!result.ok || !result.to) {
		return result.reason ?? 'invalid_phase_transition'
	}
	enterPhase(state, result.to)
	return undefined
}

function enterRevolverReload(
	state: MatchState,
	pending: PendingLoadState,
	eventName?: string,
): string | undefined {
	state.pendingLoad = pending
	if (eventName) {
		const err = applyTransition(state, eventName)
		if (err) {
			return err
		}
	} else {
		enterPhase(state, 'revolver_reload')
	}

	if (pending.source === 'bid') {
		state.turn.kind = 'bidding'
	} else if (pending.source === 'shake' || pending.source === 'duel' || pending.source === 'exact_duel') {
		state.turn.kind = 'shaking'
	}

	return undefined
}

function enterCupShake(
	state: MatchState,
	eventName?: string,
	options: { reloadPlayerId?: string; reloadSource?: PendingLoadState['source'] } = {},
): string | undefined {
	state.pendingLoad = undefined
	if (eventName) {
		const err = applyTransition(state, eventName)
		if (err) {
			return err
		}
	} else {
		enterPhase(state, 'cup_shake')
	}
	resetShake(state, options)
	return undefined
}

function enterDiceCheck(state: MatchState, eventName?: string): string | undefined {
	state.pendingLoad = undefined
	if (eventName) {
		const err = applyTransition(state, eventName)
		if (err) {
			return err
		}
	} else {
		enterPhase(state, 'dice_check')
	}

	state.shake.checked = {}
	const localPlayerId = state.match.localPlayerId
	for (const playerId of state.players.order) {
		const player = state.players.byId[playerId]
		if (isAlive(player) && playerId !== localPlayerId) {
			state.shake.checked[playerId] = true
		}
	}
	return undefined
}

function enterBidding(state: MatchState, eventName?: string): string | undefined {
	state.pendingLoad = undefined
	if (eventName) {
		return applyTransition(state, eventName)
	}
	enterPhase(state, 'bidding')
	return undefined
}

function allAliveChecked(state: MatchState): boolean {
	return state.players.order.every((playerId) => {
		const player = state.players.byId[playerId]
		return !isAlive(player) || state.shake.checked[playerId] === true
	})
}

function rollAliveDice(state: MatchState): void {
	for (const playerId of state.players.order) {
		const player = state.players.byId[playerId]
		if (isAlive(player)) {
			const rolled = rollDiceWithSeed(player.diceCount || 5, state.rngSeed)
			player.dice = rolled.values
			state.rngSeed = rolled.seed
		}
	}
}

function completeSetupIfReady(state: MatchState): string | undefined {
	if (state.pendingLoad) {
		return undefined
	}
	return enterCupShake(state, 'reload_complete_setup')
}

function completeShakeLoadIfReady(state: MatchState): string | undefined {
	if (state.pendingLoad) {
		return undefined
	}
	return enterDiceCheck(state, 'reload_complete_shake')
}

function parseSlotIndex(payload: unknown): number {
	const record = (payload ?? {}) as Record<string, unknown>
	return Number(record.slotIndex ?? record.slot_index)
}

function parseBid(payload: unknown, fallback: BidState): BidState {
	const record = (payload ?? {}) as Record<string, unknown>
	const rawBid = (record.bid ?? record) as Record<string, unknown>
	return {
		playerId: String(rawBid.playerId ?? rawBid.player_id ?? fallback.playerId),
		count: Number(rawBid.count ?? fallback.count),
		face: Number(rawBid.face ?? fallback.face),
	}
}

function activeActorGuard(state: MatchState, action: MatchAction): ReduceRejected | undefined {
	if (action.actorPlayerId !== state.turn.activePlayerId) {
		return error('INVALID_TURN', 'wrong_active_player', {
			activePlayerId: state.turn.activePlayerId,
			actorPlayerId: action.actorPlayerId,
		})
	}
	return undefined
}

export function reduceMatchState(state: MatchState, action: MatchAction): ReduceResult {
	switch (action.type) {
		case 'setup.load_initial': {
			if (state.turn.kind !== 'setup') {
				return error('INVALID_PHASE', 'not_setup_turn')
			}
			const pending = state.pendingLoad
			if (!pending || pending.source !== 'setup') {
				return domainError('no_setup_load_pending')
			}
			if (pending.playerId !== action.actorPlayerId) {
				return error('INVALID_TURN', 'wrong_pending_player')
			}

			const next = cloneState(state)
			const player = next.players.byId[pending.playerId]
			if (!player) {
				return domainError('unknown_player')
			}

			const result = tryLoadBullet(player.cylinder, parseSlotIndex(action.payload))
			if (!result.ok) {
				return domainError(result.error ?? 'invalid_slot')
			}

			player.cylinder = result.cylinder
			updateBullets(player)
			next.pendingLoad = consumePending(next.pendingLoad)
			const transitionErr = completeSetupIfReady(next)
			if (transitionErr) {
				return domainError(transitionErr)
			}
			return accept(next, action)
		}

		case 'shake.complete': {
			if (state.turn.kind !== 'shaking' || state.flow.phase !== 'cup_shake') {
				return error('INVALID_PHASE', 'not_shaking_turn')
			}
			const guard = activeActorGuard(state, action)
			if (guard) {
				return guard
			}

			const next = cloneState(state)
			const playerId = action.actorPlayerId
			next.shake.counts[playerId] = next.shake.requiredCount || SHAKE_REQUIRED_COUNT

			rollAliveDice(next)
			next.turn.previousPlayerId = next.turn.activePlayerId

			if (next.turn.isFirstShake) {
				next.turn.isFirstShake = false
				const transitionErr = enterDiceCheck(next, 'shake_complete_first')
				if (transitionErr) {
					return domainError(transitionErr)
				}
			} else {
				next.turn.isFirstShake = false
				const reloadPlayerId = next.shake.reloadPlayerId
				const reloadSource = next.shake.reloadSource
				let pending: PendingLoadState | undefined
				if (reloadPlayerId) {
					pending = pendingForPlayer(next, reloadPlayerId, reloadSource ?? 'shake', 1)
				} else if (reloadSource !== 'duel') {
					pending = pendingForPlayer(next, next.turn.activePlayerId ?? playerId, 'shake', 1)
				}

				if (pending) {
					const transitionErr = enterRevolverReload(next, pending, 'shake_complete_reload')
					if (transitionErr) {
						return domainError(transitionErr)
					}
				} else {
					const transitionErr = enterDiceCheck(next, 'shake_complete_no_reload')
					if (transitionErr) {
						return domainError(transitionErr)
					}
				}
			}

			return accept(next, action)
		}

		case 'dice.check': {
			if (state.turn.kind !== 'shaking' || state.flow.phase !== 'dice_check') {
				return error('INVALID_PHASE', 'not_dice_check_turn')
			}
			if (!isAlive(state.players.byId[action.actorPlayerId])) {
				return domainError('unknown_player')
			}

			const next = cloneState(state)
			next.shake.checked[action.actorPlayerId] = true
			if (allAliveChecked(next)) {
				const transitionErr = applyTransition(next, 'all_checked')
				if (transitionErr) {
					return domainError(transitionErr)
				}
			}
			return accept(next, action)
		}

		case 'bidding.open': {
			if (state.turn.kind !== 'shaking' || state.flow.phase !== 'bidding_gap') {
				return error('INVALID_PHASE', 'not_bidding_gap')
			}
			const guard = activeActorGuard(state, action)
			if (guard) {
				return guard
			}

			const next = cloneState(state)
			const transitionErr = enterBidding(next, 'open_bidding')
			if (transitionErr) {
				return domainError(transitionErr)
			}
			return accept(next, action)
		}

		case 'bullet.load': {
			const pending = state.pendingLoad
			if (!pending) {
				return domainError('no_load_pending')
			}
			if (pending.playerId !== action.actorPlayerId) {
				return error('INVALID_TURN', 'wrong_pending_player')
			}

			const next = cloneState(state)
			const player = next.players.byId[pending.playerId]
			if (!player) {
				return domainError('unknown_player')
			}

			const result = tryLoadBullet(player.cylinder, parseSlotIndex(action.payload))
			if (!result.ok) {
				return domainError(result.error ?? 'invalid_slot')
			}

			player.cylinder = result.cylinder
			updateBullets(player)
			next.pendingLoad = consumePending(next.pendingLoad)

			let transitionErr: string | undefined
			if (next.pendingLoad) {
				transitionErr = enterRevolverReload(next, next.pendingLoad)
			} else if (pending.source === 'setup') {
				transitionErr = completeSetupIfReady(next)
			} else if (pending.source === 'shake' || pending.source === 'duel') {
				transitionErr = completeShakeLoadIfReady(next)
			} else if (pending.source === 'bid') {
				transitionErr = enterBidding(next, 'reload_complete_bid')
			} else if (pending.source === 'exact_duel') {
				transitionErr = enterCupShake(next, 'reload_complete_exact_duel', {
					reloadSource: 'duel',
				})
			}

			if (transitionErr) {
				return domainError(transitionErr)
			}
			return accept(next, action)
		}

		case 'bid.raise': {
			if (state.turn.kind !== 'bidding') {
				return error('INVALID_PHASE', 'not_bidding_turn')
			}
			if (state.pendingLoad) {
				return error('INVALID_PHASE', 'load_pending')
			}
			const guard = activeActorGuard(state, action)
			if (guard) {
				return guard
			}

			const bid = parseBid(action.payload, {
				playerId: action.actorPlayerId,
				count: state.bidding.myBid.count,
				face: state.bidding.myBid.face,
			})
			bid.playerId = bid.playerId || action.actorPlayerId

			if (bid.playerId !== action.actorPlayerId) {
				return error('INVALID_TURN', 'wrong_bid_player')
			}

			const check = validateBidRaise(state.bidding.currentBid, bid, DEFAULT_BID_LIMITS)
			if (!check.ok) {
				return error('ILLEGAL_BID', check.reason ?? 'illegal_bid')
			}

			const next = cloneState(state)
			next.bidding.currentBid = bid
			next.bidding.myBid = {
				count: bid.count,
				face: bid.face,
			}
			next.bidding.recentBids.push(bid)
			next.match.turnCount += 1

			const previousActive = next.turn.activePlayerId ?? action.actorPlayerId
			next.turn = {
				kind: 'bidding',
				activePlayerId: nextAliveAfter(next.players.order, next.players.byId, previousActive),
				previousPlayerId: previousActive,
				roundIndex: next.turn.roundIndex,
				isFirstShake: next.turn.isFirstShake,
			}

			const pending = pendingForPlayer(next, previousActive, 'bid', 1)
			let transitionErr: string | undefined
			if (pending) {
				transitionErr = enterRevolverReload(next, pending, 'bid_reload')
			} else {
				transitionErr = enterBidding(next, 'bid_no_reload')
			}
			if (transitionErr) {
				return domainError(transitionErr)
			}
			return accept(next, action, [event(action, { bid })])
		}

		case 'bid.challenge': {
			if (state.turn.kind !== 'bidding') {
				return error('INVALID_PHASE', 'not_bidding_turn')
			}
			if (state.pendingLoad) {
				return error('INVALID_PHASE', 'load_pending')
			}
			if (!state.bidding.currentBid) {
				return error('INVALID_PHASE', 'no_previous_bid')
			}
			const guard = activeActorGuard(state, action)
			if (guard) {
				return guard
			}

			const next = cloneState(state)
			const currentBid = next.bidding.currentBid
			if (!currentBid) {
				return error('INVALID_PHASE', 'no_previous_bid')
			}
			const previousId = currentBid.playerId
			const challengerId = next.turn.activePlayerId ?? action.actorPlayerId

			next.turn.kind = 'dualing'
			next.turn.previousPlayerId = previousId
			next.turn.activePlayerId = challengerId
			next.pendingLoad = undefined
			const transitionErr = applyTransition(next, 'challenge')
			if (transitionErr) {
				return domainError(transitionErr)
			}

			const duel = beginDuel(next, challengerId, previousId)
			if (!duel) {
				return domainError('duel_begin_failed')
			}
			const spin = nextSeedInt(next.rngSeed, 1, 6)
			next.rngSeed = spin.seed
			duel.revolverSpin = spinDuelRevolver(next, duel, spin.value)
			next.duel = duel
			next.match.turnCount += 1

			return accept(next, action, [event(action, { challengerId, previousId })])
		}

		case 'duel.execute': {
			if (state.turn.kind !== 'dualing' || !state.duel) {
				return error('INVALID_PHASE', 'not_dueling_turn')
			}
			if (state.duel.resolution) {
				return error('INVALID_PHASE', 'duel_already_executed')
			}
			const guard = activeActorGuard(state, action)
			if (guard) {
				return guard
			}

			const next = cloneState(state)
			if (!next.duel) {
				return domainError('missing_duel')
			}
			next.duel.resolution = resolveDuel(next, next.duel)
			next.duel.phase = 'executing'
			updateAllBullets(next)
			return accept(next, action, [event(action, { resolution: next.duel.resolution })])
		}

		case 'round.advance': {
			if (state.turn.kind !== 'dualing' || !state.duel) {
				return error('INVALID_PHASE', 'not_dueling_turn')
			}
			const guard = activeActorGuard(state, action)
			if (guard) {
				return guard
			}

			const next = cloneState(state)
			if (!next.duel) {
				return domainError('missing_duel')
			}

			let resolution = next.duel.resolution
			if (!resolution) {
				resolution = resolveDuel(next, next.duel)
				updateAllBullets(next)
			}

			const exactReloadPlayerId = next.duel.previousBidderId
			const reloadPlayerId = duelReloadPlayerId(next, resolution)
			next.duel.resolution = resolution
			next.duel.phase = 'complete'

			const alive = aliveCount(next)
			if (alive.count <= 1) {
				next.match.status = 'complete'
				next.match.winnerId = alive.lastPlayerId
				next.turn.kind = 'complete'
				next.pendingLoad = undefined
				const transitionErr = applyTransition(next, 'match_complete')
				if (transitionErr) {
					return domainError(transitionErr)
				}
				return accept(next, action)
			}

			const challengerId = next.duel.challengerId
			let nextRoundFirstPlayerId = challengerId
			if (!isAlive(next.players.byId[nextRoundFirstPlayerId])) {
				nextRoundFirstPlayerId =
					nextAliveAfter(next.players.order, next.players.byId, nextRoundFirstPlayerId) ??
					next.players.order[0]
			}

			next.turn.kind = 'shaking'
			next.turn.previousPlayerId = challengerId
			next.turn.activePlayerId = nextRoundFirstPlayerId
			next.turn.roundIndex += 1
			next.turn.isFirstShake = false
			next.bidding.currentBid = undefined
			next.bidding.recentBids = []
			next.duel = undefined
			resetMyBid(next)

			let transitionErr: string | undefined
			if (resolution?.kind === 'perfect_duel') {
				const pending = pendingForPlayer(next, exactReloadPlayerId, 'exact_duel', 3)
				if (pending) {
					transitionErr = enterRevolverReload(next, pending, 'exact_reload')
				} else {
					transitionErr = enterCupShake(next, 'round_shake', { reloadSource: 'duel' })
				}
			} else {
				transitionErr = enterCupShake(next, 'round_shake', {
					reloadPlayerId,
					reloadSource: 'duel',
				})
			}

			if (transitionErr) {
				return domainError(transitionErr)
			}
			return accept(next, action)
		}

		default:
			return {
				ok: true,
				state,
				events: [],
			}
	}
}
