import type { AutomaticMatchCommandType } from '../protocol/commands'
import type { MatchState } from './state'

export const BIDDING_OPEN_DELAY_MS = 3_000
export const SHAKE_TIMEOUT_MS = 6_000
export const DICE_CHECK_TIMEOUT_MS = 6_000
export const BIDDING_TIMEOUT_MS = 40_000
export const BID_RELOAD_TIMEOUT_MS = 3_000
export const DUEL_REVEAL_INTERVAL_MS = 160
export const DUEL_REVEAL_DURATION_MS = 340
export const DUEL_REVEAL_HOLD_MS = 3_000
export const DUEL_EXECUTE_INTRO_MS = 450
export const DUEL_ROULETTE_STEP_MS = 660
export const DUEL_PERFECT_STEP_MS = 1_180
export const DUEL_COMPLETE_HOLD_MS = 1_000

export interface AutomaticTransition {
	type: AutomaticMatchCommandType
	delayMs: number
	expectedPhase: MatchState['flow']['phase']
	expectedEpoch: number
	expectedRevision: number
}

export function automaticTransitionScheduleArgs(matchId: string, transition: AutomaticTransition) {
	return {
		matchId,
		type: transition.type,
		expectedPhase: transition.expectedPhase,
		expectedEpoch: transition.expectedEpoch,
		expectedRevision: transition.expectedRevision,
	}
}

function alivePlayerCount(state: MatchState): number {
	return state.players.order.filter((playerId) => {
		const player = state.players.byId[playerId]
		return player && !player.eliminated && player.hp > 0
	}).length
}

function duelRevealDelayMs(state: MatchState): number {
	return Math.max(0, alivePlayerCount(state) - 1) * DUEL_REVEAL_INTERVAL_MS
		+ DUEL_REVEAL_DURATION_MS
		+ DUEL_REVEAL_HOLD_MS
}

function duelCombatDelayMs(state: MatchState): number {
	const resolution = state.duel?.resolution
	const stepCount = resolution?.steps.length ?? 0
	const stepMs = resolution?.kind === 'perfect_duel'
		? DUEL_PERFECT_STEP_MS
		: DUEL_ROULETTE_STEP_MS
	return DUEL_EXECUTE_INTRO_MS + stepCount * stepMs + DUEL_COMPLETE_HOLD_MS
}

export function automaticTransitionFor(state: MatchState): AutomaticTransition | undefined {
	let type: AutomaticMatchCommandType | undefined
	let delayMs = 0

	if (state.flow.phase === 'cup_shake') {
		type = 'shake.timeout'
		delayMs = SHAKE_TIMEOUT_MS
	} else if (state.flow.phase === 'dice_check') {
		type = 'dice.check.timeout'
		delayMs = DICE_CHECK_TIMEOUT_MS
	} else if (state.flow.phase === 'bidding_gap') {
		type = 'bidding.open'
		delayMs = BIDDING_OPEN_DELAY_MS
	} else if (
		state.flow.phase === 'bidding' &&
		state.pendingLoad?.source === 'bid' &&
		state.bidding.reloadGate
	) {
		type = 'bid.reload_timeout'
		delayMs = BID_RELOAD_TIMEOUT_MS
	} else if (state.flow.phase === 'bidding') {
		type = 'bidding.timeout'
		delayMs = BIDDING_TIMEOUT_MS
	} else if (state.flow.phase === 'duel' && state.duel?.phase === 'ready' && !state.duel.resolution) {
		type = 'duel.execute'
		delayMs = duelRevealDelayMs(state)
	} else if (state.flow.phase === 'duel' && state.duel?.phase === 'executing' && state.duel.resolution) {
		type = 'round.advance'
		delayMs = duelCombatDelayMs(state)
	}

	if (!type) {
		return undefined
	}

	return {
		type,
		delayMs,
		expectedPhase: state.flow.phase,
		expectedEpoch: state.flow.epoch ?? 0,
		expectedRevision: state.revision,
	}
}

export function matchesAutomaticTransition(
	state: MatchState,
	expected: Pick<AutomaticTransition, 'type' | 'expectedPhase' | 'expectedEpoch' | 'expectedRevision'>,
): boolean {
	const current = automaticTransitionFor(state)
	return current?.type === expected.type
		&& current.expectedPhase === expected.expectedPhase
		&& current.expectedEpoch === expected.expectedEpoch
		&& (
			 expected.type === 'shake.timeout'
			|| expected.type === 'dice.check.timeout'
			|| current.expectedRevision === expected.expectedRevision
		)
}
