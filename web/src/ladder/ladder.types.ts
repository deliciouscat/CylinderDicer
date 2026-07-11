export type LadderPhase = 'searching' | 'roster' | 'handing_off'

export interface LadderStats {
  mmr: number | null
  recent20AvgPlace: number | null
  recent20Count: number
  allTimeAvgPlace: number | null
  allTimeCount: number
}

export interface RosterPlayer {
  playerId: string
  displayName: string
  seatIndex: number
  isSelf: boolean
  characterKey: string | null
  stats: LadderStats
}

export type LadderQueueStatus = 'idle' | 'waiting' | 'matched' | 'cancelled'

export interface LadderQueueState {
  status: LadderQueueStatus
  selfStats: LadderStats
  matchId: string | null
  roster: RosterPlayer[]
}

export interface LadderRuntimeState {
  phase: LadderPhase
  cancelPending: boolean
  handoffStarted: boolean
  matchId: string | null
  roster: RosterPlayer[]
}

export type LadderRuntimeEvent =
  | { type: 'queue_update'; queue: LadderQueueState }
  | { type: 'cancel_requested' }
  | { type: 'cancel_completed' }
  | { type: 'handoff_started' }
  | { type: 'handoff_failed' }
