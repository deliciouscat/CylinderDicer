export type GameBridgeMessageType =
  | 'DEFOLD_READY'
  | 'START_MATCH'
  | 'MATCH_READY'
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
  mode: 'casual' | 'ranked'
  cosmetics?: CosmeticsPayload
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
