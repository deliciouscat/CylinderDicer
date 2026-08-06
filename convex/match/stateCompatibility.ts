/**
 * Read-time compatibility for authoritative match states persisted before the
 * orthogonal reload lane was introduced. No eager table scan is required:
 * legacy matches are normalized when read and are written as the current
 * shape after their next accepted command.
 */
import {
	CURRENT_MATCH_STATE_VERSION,
	cloneState,
	type MatchState,
	type PendingLoadState,
	type ReloadGateState,
} from './state'

interface LegacyMatchState extends Omit<MatchState, 'stateVersion' | 'reload' | 'turn' | 'bidding'> {
	stateVersion?: number
	pendingLoad?: PendingLoadState
	reload?: MatchState['reload']
	turn: MatchState['turn'] & { kind?: string }
	bidding: MatchState['bidding'] & {
		deferredLoad?: PendingLoadState
		reloadGate?: ReloadGateState
	}
}

export function normalizeMatchState(value: unknown): MatchState {
	const state = cloneState(value) as LegacyMatchState
	state.reload = {
		pending: state.reload?.pending ?? state.pendingLoad,
		deferred: state.reload?.deferred ?? state.bidding?.deferredLoad,
		gate: state.reload?.gate ?? state.bidding?.reloadGate,
	}
	state.stateVersion = CURRENT_MATCH_STATE_VERSION

	delete state.pendingLoad
	delete state.turn.kind
	delete state.bidding.deferredLoad
	delete state.bidding.reloadGate

	return state as MatchState
}
