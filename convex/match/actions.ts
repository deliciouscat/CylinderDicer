/**
 * # 개요
 * Convex command protocol을 reducer가 처리하기 쉬운 domain action으로 정규화한다.
 * 외부 command는 사용자 intent이고, domain action은 서버 내부 상태 전이를 위한 명령이다.
 *
 * # 의존성
 * - `convex/protocol/commands.ts`: 외부 command type.
 * - `convex/match/reducer.ts`: domain action consumer.
 * - `convex/protocol/errors.ts`: normalization failure.
 *
 * # I/O
 * - 입력:
 *   - `MatchCommand`.
 * - 출력:
 *   - `MatchAction`.
 *
 * # 의사코드
 * ```text
 * inspect command.type
 * validate minimal payload shape
 * copy actor/revision metadata
 * create reducer action with normalized payload
 * reducer performs phase/turn/rule validation
 * ```
 */
import type { MatchCommand, MatchCommandType } from '../protocol/commands'

export interface MatchAction<TPayload = unknown> {
	type: MatchCommandType
	actorUserId?: string
	actorPlayerId: string
	payload?: TPayload
}

export function commandToAction(command: MatchCommand, actorPlayerId: string): MatchAction {
	return {
		type: command.type,
		actorUserId: command.actorUserId ?? command.actorVirtualOpponentId,
		actorPlayerId,
		payload: command.payload,
	}
}
