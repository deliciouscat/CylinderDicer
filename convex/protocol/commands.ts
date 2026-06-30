/**
 * # 개요
 * Defold, Vue, QA 도구가 서버에 제출할 수 있는 match command protocol을 정의한다.
 * 이 타입은 “의도”만 표현하고, dice/duel/damage/winner 같은 결과 값은 클라이언트가 제출하지 않는다.
 *
 * # 의존성
 * - `shared/protocol/game-bridge.ts`: Defold ↔ Vue 메시지 transport.
 * - `convex/commands.ts`: command validation and mutation entry.
 * - `convex/match/actions.ts`: reducer 내부 action으로 변환될 서버 도메인 액션.
 *
 * # I/O
 * - 입력:
 *   - player intent command.
 * - 출력:
 *   - `MatchCommand` discriminated type.
 *   - command submission result shape.
 *
 * # 의사코드
 * ```text
 * receive PLAYER_COMMAND from GameBridge
 * normalize payload into MatchCommand
 * send command to submitMatchCommand mutation
 * mutation returns accepted or rejected result
 * Vue forwards snapshot or rejection to Defold
 * ```
 */
export type MatchCommandType =
  | 'setup.load_initial'
  | 'shake.complete'
  | 'dice.check'
  | 'bidding.open'
  | 'bullet.load'
  | 'bid.raise'
  | 'bid.challenge'
  | 'duel.execute'
  | 'round.advance'

export interface MatchCommand<TPayload = unknown> {
  commandId: string
  matchId: string
  actorUserId: string
  actorPlayerId?: string
  revision: number
  type: MatchCommandType
  payload?: TPayload
}

export interface ClientMatchCommand<TPayload = unknown> {
  commandId: string
  matchId: string
  revision: number
  type: MatchCommandType
  payload?: TPayload
}

export interface CommandAccepted {
  ok: true
  matchId: string
  revision: number
  events?: unknown[]
}

export interface CommandRejected {
  ok: false
  matchId?: string
  code: string
  message: string
  details?: unknown
  revision?: number
}

export type CommandResult = CommandAccepted | CommandRejected
