export type QaActionType =
  | 'load'
  | 'load_all'
  | 'shake'
  | 'check'
  | 'open'
  | 'bid'
  | 'challenge'
  | 'resolve'
  | 'advance'

export interface QaCommand {
  id: string
  actor_id: string
  action: QaActionType
  payload?: {
    slot_index?: number
    count?: number
    face?: number
  }
}

export interface QaAvailableAction {
  type: QaActionType
  slots?: number[]
  remaining?: number
  min_count?: number
  max_count?: number
  min_face?: number
  max_face?: number
  suggested?: {
    count: number
    face: number
  }
}

export interface QaPlayer {
  id: string
  name: string
  is_local: boolean
  is_active: boolean
  hp: number
  eliminated: boolean
  bullets: number
  dice: number[]
  cylinder: {
    slots: boolean[]
    chamber_index: number
  }
  available_actions: QaAvailableAction[]
}

export interface QaStatus {
  protocol_version: 1
  revision: number
  generated_at: number
  phase: string
  hud: string
  match: {
    id?: string
    status: string
    mode: string
    local_player_id: string
    turn_count: number
    events_hash: string
    winner_id?: string
  }
  turn: {
    active_player_id: string
    previous_player_id?: string
    round_index: number
    is_first_shake: boolean
  }
  bidding: {
    current_bid?: {
      player_id: string
      count: number
      face: number
    }
    suggested_bid: {
      count: number
      face: number
    }
  }
  pending_load?: {
    player_id: string
    source: string
    count: number
  }
  shake: {
    required_count: number
    counts: Record<string, number>
    checked: Record<string, boolean>
  }
  duel?: {
    phase: string
    judge?: {
      verdict: string
      actual: number
      delta: number
    }
    challenger_id?: string
    previous_bidder_id?: string
  }
  players: QaPlayer[]
  last_command?: {
    id: string
    actor_id?: string
    action?: string
    ok: boolean
    error?: string
  }
}
