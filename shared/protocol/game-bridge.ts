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
  | 'SET_COSMETICS'
  | 'COSMETICS_APPLIED'
  | 'SUBMIT_MATCH_RESULT'
  | 'INPUT_POINTER'
  | 'INPUT_SHAKE'
  | 'PING'
  | 'PONG'
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

export interface PlayerCommandPayload<TPayload = unknown> {
  commandId?: string
  matchId?: string
  revision?: number
  type: string
  payload?: TPayload
}

export interface ServerSnapshotPayload {
  matchId: string
  revision: number
  snapshot: unknown
  publicSnapshot?: unknown
  privateDelta?: unknown
}

export interface CommandRejectedPayload {
  matchId?: string
  commandId?: string
  code: string
  message: string
  details?: unknown
  revision?: number
  snapshot?: unknown
}

export interface CosmeticsPayload {
  diceSkin?: string
  cupSkin?: string
}

export interface SubmitMatchResultPayload {
  matchId: string
  winnerId: string
  turnCount: number
  eventsHash: string
}
