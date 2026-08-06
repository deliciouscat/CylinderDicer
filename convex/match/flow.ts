import type { AutomaticMatchCommandType } from '../protocol/commands'
import type { MatchState } from './state'
import { GAME_RULESET } from '../../shared/game/ruleset'
import { activeLoad } from './reloadMachine'

export const BIDDING_OPEN_DELAY_MS = GAME_RULESET.timingsMs.biddingOpen
export const SHAKE_TIMEOUT_MS = GAME_RULESET.timingsMs.shakeTimeout
export const DICE_CHECK_TIMEOUT_MS = GAME_RULESET.timingsMs.diceCheckTimeout
export const BIDDING_TIMEOUT_MS = GAME_RULESET.timingsMs.biddingTimeout
export const BID_RELOAD_TIMEOUT_MS = GAME_RULESET.timingsMs.bidReloadTimeout
export const DUEL_REVEAL_INTERVAL_MS = GAME_RULESET.timingsMs.duelRevealInterval
export const DUEL_REVEAL_DURATION_MS = GAME_RULESET.timingsMs.duelRevealDuration
export const DUEL_REVEAL_HOLD_MS = GAME_RULESET.timingsMs.duelRevealHold
export const DUEL_EXECUTE_INTRO_MS = GAME_RULESET.timingsMs.duelExecuteIntro
export const DUEL_ROULETTE_STEP_MS = GAME_RULESET.timingsMs.duelRouletteStep
export const DUEL_PERFECT_STEP_MS = GAME_RULESET.timingsMs.duelPerfectStep
export const DUEL_COMPLETE_HOLD_MS = GAME_RULESET.timingsMs.duelCompleteHold

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
		activeLoad(state)?.source === 'bid' &&
		state.reload.gate
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
