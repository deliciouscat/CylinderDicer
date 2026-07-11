import type {
  LadderRuntimeEvent,
  LadderRuntimeState,
  LadderStats,
  RosterPlayer,
} from './ladder.types'

export const MAX_FIDGET_CHIPS = 99

export function applyFidgetOutcome(chips: number, face: number): number {
  const safeChips = Math.max(0, Math.min(MAX_FIDGET_CHIPS, Math.floor(chips)))
  if (face === 1) {
    return Math.floor(safeChips / 2)
  }
  if (face >= 2 && face <= 6) {
    return Math.min(MAX_FIDGET_CHIPS, safeChips + 1)
  }
  return safeChips
}

export function formatPlacement(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—'
}

export function formatMmr(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toLocaleString() : '—'
}

export function safeStats(stats: Partial<LadderStats> | null | undefined): LadderStats {
  return {
    mmr: typeof stats?.mmr === 'number' && Number.isFinite(stats.mmr) ? stats.mmr : null,
    recent20AvgPlace: typeof stats?.recent20AvgPlace === 'number' && Number.isFinite(stats.recent20AvgPlace)
      ? stats.recent20AvgPlace
      : null,
    recent20Count: Math.max(0, Math.min(20, Math.floor(stats?.recent20Count ?? 0))),
    allTimeAvgPlace: typeof stats?.allTimeAvgPlace === 'number' && Number.isFinite(stats.allTimeAvgPlace)
      ? stats.allTimeAvgPlace
      : null,
    allTimeCount: Math.max(0, Math.floor(stats?.allTimeCount ?? 0)),
  }
}

export function normalizeRoster(players: readonly RosterPlayer[]): RosterPlayer[] {
  return players
    .slice(0, 6)
    .map((player) => ({ ...player, stats: safeStats(player.stats) }))
    .sort((left, right) => left.seatIndex - right.seatIndex)
}

export function rosterDensity(playerCount: number): 'large' | 'medium' | 'compact' {
  if (playerCount <= 3) return 'large'
  if (playerCount <= 5) return 'medium'
  return 'compact'
}

export const initialLadderRuntimeState: LadderRuntimeState = {
  phase: 'searching',
  cancelPending: false,
  handoffStarted: false,
  matchId: null,
  roster: [],
}

export function reduceLadderRuntime(
  state: LadderRuntimeState,
  event: LadderRuntimeEvent,
): LadderRuntimeState {
  switch (event.type) {
    case 'queue_update': {
      if (event.queue.status !== 'matched') {
        return state
      }
      const roster = normalizeRoster(event.queue.roster)
      if (!event.queue.matchId || roster.length < 2 || roster.length > 6) {
        return state
      }
      return {
        phase: 'roster',
        cancelPending: false,
        handoffStarted: false,
        matchId: event.queue.matchId,
        roster,
      }
    }
    case 'cancel_requested':
      return state.phase === 'searching' ? { ...state, cancelPending: true } : state
    case 'cancel_completed':
      return state.phase === 'searching' ? { ...state, cancelPending: false } : state
    case 'handoff_started':
      return state.phase === 'roster' && !state.handoffStarted
        ? { ...state, phase: 'handing_off', handoffStarted: true }
        : state
    case 'handoff_failed':
      return state.phase === 'handing_off'
        ? { ...state, phase: 'roster', handoffStarted: false }
        : state
  }
}
