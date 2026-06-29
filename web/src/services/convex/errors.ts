/**
 * # 개요
 * Convex command/query error를 Vue UX가 사용할 수 있는 사용자 메시지/상태로 변환한다.
 * 서버 error code는 안정적으로 유지하고, locale 문구는 web layer에서 결정한다.
 *
 * # 의존성
 * - `convex/protocol/errors.ts`: server error code source.
 * - Vue UI components: toast, banner, disconnected state.
 * - Defold GameBridge: COMMAND_REJECTED forwarding.
 *
 * # I/O
 * - 입력:
 *   - unknown thrown error.
 *   - server command reject payload.
 * - 출력:
 *   - normalized client error.
 *   - user-facing fallback message key.
 *
 * # 의사코드
 * ```text
 * inspect thrown value or reject payload
 * preserve stable server code if present
 * map network/auth/setup errors to client categories
 * return normalized error for UI and GameBridge forwarding
 * ```
 */
export interface ClientConvexError {
  code: string
  message: string
  cause?: unknown
}

export function normalizeConvexError(error: unknown): ClientConvexError {
  if (error instanceof Error) {
    return {
      code: 'CLIENT_ERROR',
      message: error.message,
      cause: error,
    }
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Unknown Convex error',
    cause: error,
  }
}
