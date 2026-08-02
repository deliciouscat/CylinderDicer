export type GameBridgeMessageType =
  | 'DEFOLD_READY'
  | 'START_MATCH'
  | 'MATCH_READY'
  | 'PLAYER_COMMAND'
  | 'SERVER_SNAPSHOT'
  | 'SERVER_SNAPSHOT_RECEIVED'
  | 'SERVER_EVENT'
  | 'COMMAND_REJECTED'
  | 'COMMAND_REJECTED_RECEIVED'
  | 'SET_LOCALE'
  | 'LOCALE_APPLIED'
  | 'SET_COSMETICS'
  | 'COSMETICS_APPLIED'
  | 'SUBMIT_MATCH_RESULT'
  | 'INPUT_POINTER'
  | 'DOM_POINTER'
  | 'INPUT_SHAKE'
  | 'PING'
  | 'PONG'
  | 'QA_COMMAND'
  | 'QA_STATUS'
  | 'EXIT_TO_LOBBY'
  | 'UNKNOWN_MESSAGE'

export interface GameBridgeMessage<TPayload = unknown> {
  type: GameBridgeMessageType
  payload?: TPayload
}

export interface StartMatchPayload {
  sessionId: string
  matchId: string
  playerId: string
  mode: 'dev' | 'casual' | 'ranked'
  cosmetics?: CosmeticsPayload
  localSimulator?: boolean
}

export type GameLocale = 'en' | 'ko' | 'ja' | 'zh'

export interface SetLocalePayload {
  locale: GameLocale
}

export interface LocaleAppliedPayload {
  locale: GameLocale
  applied: boolean
}

export type PlayerCommandType =
  | 'setup.load_initial'
  | 'shake.complete'
  | 'dice.check'
  | 'bullet.load'
  | 'bid.raise'
  | 'bid.challenge'

export interface PlayerCommandPayload<TPayload = unknown> {
  commandId?: string
  matchId?: string
  revision?: number
  type: PlayerCommandType
  payload?: TPayload
}

export type AvailableAction =
  | { type: 'load'; slots: number[]; remaining: number }
  | { type: 'load_all'; remaining: number }
  | { type: 'shake_complete'; command: 'shake.complete'; remaining: number }
  | { type: 'check' }
  | {
      type: 'bid'
      min_count: number
      max_count: number
      min_face: number
      max_face: number
      suggested: { count: number; face: number }
    }
  | { type: 'challenge' }

export type MatchPhase =
  | 'waiting'
  | 'revolver_reload'
  | 'cup_shake'
  | 'dice_check'
  | 'bidding_gap'
  | 'bidding'
  | 'duel'
  | 'complete'

export interface MatchShakeView {
  requiredCount: number
  counts: Record<string, number>
  checked: Record<string, boolean>
  reloadPlayerId?: string
  reloadSource?: string
}

export interface MatchPublicView {
  kind: 'public'
  matchId: string
  revision: number
  phase: MatchPhase
  hud: string
  match?: {
    id: string
    status: 'idle' | 'ready' | 'complete'
    mode: 'dev' | 'casual' | 'ranked'
    localPlayerId?: string
    turnCount: number
    eventsHash: string
    winnerId?: string
    result?: {
      playerCount: number
      rated: boolean
      placements: Array<{
        playerId: string
        place: number
        playerCount: number
        rated: boolean
        mmrBefore?: number
        mmrAfter?: number
        mmrDelta?: number
      }>
    }
  }
  players: Array<{
    id: string
    name: string
    hp: number
    bullets: number
    eliminated: boolean
    characterKey?: string
    skin?: string
    portraitState?: string
    isActive: boolean
    isLocal?: boolean
  }>
	bidding?: {
		currentBid?: {
			playerId: string
			count: number
			face: number
		}
		suggestedBid: {
			count: number
			face: number
		}
		reloadGate?: {
			countdownSeconds: number
			epoch: number
		}
	}
  shake?: MatchShakeView
}

export interface MatchPrivateView {
  kind: 'private_delta'
  matchId: string
  revision: number
  hud: string
  viewerPlayerId: string
  dice?: number[]
  cylinder?: {
    chamberIndex: number
    slots: boolean[]
  }
  availableActions: AvailableAction[]
}

export type MergedMatchView = MatchPublicView & {
  private?: MatchPrivateView
  viewerPlayerId?: string
  dice?: number[]
  cylinder?: MatchPrivateView['cylinder']
  availableActions?: AvailableAction[]
}

export interface DomPointerPayload {
  x: number
  y: number
  pressed?: boolean
}

export interface ServerSnapshotPayload {
  matchId: string
  revision: number
  snapshot: MergedMatchView
  publicSnapshot?: MatchPublicView | null
  privateDelta?: MatchPrivateView | null
}

export interface CommandRejectedPayload {
  matchId?: string
  commandId?: string
  code: string
  message: string
  details?: unknown
  revision?: number
  snapshot?: MergedMatchView
}

export interface CosmeticsPayload {
  diceSkin?: string
  cupSkin?: string
}

/**
 * Dev-only QA harness for the standalone HTML5 bundle.
 * Defold accepts QA_COMMAND only when `match.mode === 'dev'` AND
 * `match.local_simulator === true` — it drives the local reducer directly and
 * never touches the Convex server-authority path.
 */
export interface QaCommandPayload {
  id?: string
  actor_id?: string
  action:
    | 'status'
    | 'load'
    | 'load_all'
    | 'shake'
    | 'check'
    | 'open'
    | 'bid'
    | 'challenge'
    | 'resolve'
    | 'advance'
    | 'result'
  payload?: {
    slot_index?: number
    count?: number
    face?: number
    place?: number
    player_count?: number
    mmr_before?: number
    mmr_after?: number
    rated?: boolean
    match_complete?: boolean
  }
}

/** QA_STATUS payload is qa_cli.status_snapshot (see play/game/dev/qa_cli.lua). */
export interface QaStatusPayload {
  protocol_version: number
  phase: string
  hud: string
  revision?: number
  generated_at?: number
  last_command?: {
    id: string
    actor_id?: string
    action?: string
    ok: boolean
    error?: string
  }
  [key: string]: unknown
}

export interface SubmitMatchResultPayload {
  matchId: string
  winnerId: string
  turnCount: number
  eventsHash: string
}
