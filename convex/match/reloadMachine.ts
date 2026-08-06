/**
 * Orthogonal reload-state transitions.
 *
 * The lifecycle phase and decision owner deliberately live elsewhere. In
 * particular, a bid reload does not move the lifecycle out of `bidding`.
 */
import { consumePending } from './rulesCylinder'
import {
	BID_RELOAD_COUNTDOWN_SECONDS,
	type MatchState,
	type PendingLoadState,
} from './state'

export type ReloadLane = 'clear' | 'loading' | 'gated'

export function activeLoad(state: MatchState): PendingLoadState | undefined {
	return state.reload.pending
}

export function reloadLane(state: MatchState): ReloadLane {
	if (state.reload.gate) {
		return 'gated'
	}
	return state.reload.pending ? 'loading' : 'clear'
}

export function beginLoad(state: MatchState, pending: PendingLoadState): void {
	state.reload.pending = pending
}

export function clearActiveLoad(state: MatchState): void {
	state.reload.pending = undefined
}

export function consumeActiveLoad(state: MatchState): PendingLoadState | undefined {
	state.reload.pending = consumePending(state.reload.pending)
	return state.reload.pending
}

export function queueBidLoad(state: MatchState, pending?: PendingLoadState): void {
	if (state.reload.pending?.source === 'bid') {
		state.reload.deferred = pending
		state.reload.gate = {
			countdownSeconds: BID_RELOAD_COUNTDOWN_SECONDS,
			epoch: (state.reload.gate?.epoch ?? 0) + 1,
		}
		return
	}
	if (!pending) {
		return
	}

	state.reload.pending = pending
	state.reload.deferred = undefined
	state.reload.gate = undefined
}

export function promoteDeferredBidLoad(state: MatchState): PendingLoadState | undefined {
	state.reload.pending = state.reload.deferred
	state.reload.deferred = undefined
	state.reload.gate = undefined
	return state.reload.pending
}

export function resetBidReload(state: MatchState): void {
	state.reload.deferred = undefined
	state.reload.gate = undefined
}
