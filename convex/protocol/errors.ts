/**
 * # 개요
 * 서버가 command를 거부할 때 사용하는 안정적인 error code를 정의한다.
 * UI 문구는 클라이언트 locale에서 처리하고, 서버는 기계가 읽기 쉬운 code를 반환한다.
 *
 * # 의존성
 * - `convex/commands.ts`: command validation failure.
 * - `convex/match/reducer.ts`: domain rule failure.
 * - `web/src/services/convex/errors.ts`: client-facing error mapping.
 *
 * # I/O
 * - 입력:
 *   - auth, turn, phase, payload validation 결과.
 * - 출력:
 *   - `CommandErrorCode`.
 *   - `CommandError`.
 *
 * # 의사코드
 * ```text
 * validate command
 * if invalid, choose stable CommandErrorCode
 * return { code, message, details? }
 * Vue maps code to localized UX
 * ```
 */
export type CommandErrorCode =
  | 'UNAUTHENTICATED'
  | 'MATCH_NOT_FOUND'
  | 'NOT_A_PARTICIPANT'
  | 'STALE_REVISION'
  | 'DUPLICATE_COMMAND'
  | 'INVALID_PHASE'
  | 'INVALID_TURN'
  | 'INVALID_PAYLOAD'
  | 'ILLEGAL_BID'
  | 'ILLEGAL_RELOAD'
  | 'MATCH_COMPLETE'
  | 'INTERNAL_ERROR'

export interface CommandError {
  code: CommandErrorCode
  message: string
  details?: unknown
}
