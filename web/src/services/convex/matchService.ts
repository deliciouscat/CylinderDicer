/**
 * # 개요
 * Vue shell에서 match 생성, command 제출, snapshot 구독을 담당하는 service wrapper다.
 * DefoldCanvas는 Convex를 직접 import하지 않고, GameBridge message를 이 서비스로 전달한다.
 *
 * # 의존성
 * - `convex/matches.ts`: create/list/snapshot queries.
 * - `convex/commands.ts`: submitMatchCommand mutation.
 * - `convex/protocol/commands.ts`: command result shape.
 * - `shared/protocol/game-bridge.ts`: PLAYER_COMMAND, SERVER_SNAPSHOT, COMMAND_REJECTED.
 *
 * # I/O
 * - 입력:
 *   - match creation options.
 *   - player command from Defold/QA.
 *   - match id for subscription.
 * - 출력:
 *   - created match info.
 *   - command accepted/rejected result.
 *   - latest public view/private delta.
 *
 * # 의사코드
 * ```text
 * createDevMatch:
 *   call Convex mutation/query wrapper
 *   return match id and initial snapshot
 *
 * submitCommand:
 *   normalize GameBridge payload
 *   call submitMatchCommand
 *   on reject, emit COMMAND_REJECTED to Defold
 *
 * subscribeSnapshot:
 *   use Convex query subscription
 *   forward SERVER_SNAPSHOT to Defold
 * ```
 */
import type { ConvexClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

export interface CreateDevMatchOptions {
  localPlayerName?: string
  firstPlayerId?: string
  requiresSetupLoad?: boolean
}

export interface CreatedMatch {
  matchId: string
  revision: number
  publicSnapshot?: unknown
  privateDelta?: unknown
}

export interface SubmitMatchCommandInput {
  matchId: string
  commandId: string
  revision: number
  type: string
  payload?: unknown
}

export interface MatchSubscriptionHandlers {
  onSnapshot(snapshot: unknown): void
  onError?(error: Error): void
  private?: boolean
}

export type SnapshotUnsubscribe = (() => void) & {
  unsubscribe(): void
  getCurrentValue(): unknown | undefined
}

const createDevMatchMutation = makeFunctionReference<'mutation'>('matches:createDevMatch')
const submitMatchCommandMutation = makeFunctionReference<'mutation'>('commands:submitMatchCommand')
const publicSnapshotQuery = makeFunctionReference<'query'>('snapshots:getLatestPublicSnapshot')
const privateDeltaQuery = makeFunctionReference<'query'>('snapshots:getLatestPrivateDelta')

export function createMatchService(client: ConvexClient) {
  return {
    async createDevMatch(options: CreateDevMatchOptions = {}): Promise<CreatedMatch> {
      return await client.mutation(createDevMatchMutation, options)
    },
    async submitCommand(command: SubmitMatchCommandInput): Promise<unknown> {
      return await client.mutation(submitMatchCommandMutation, command as Record<string, any>)
    },
    subscribeSnapshot(
      matchId: string,
      handlers: MatchSubscriptionHandlers,
    ): SnapshotUnsubscribe {
      const query = handlers.private ? privateDeltaQuery : publicSnapshotQuery
      return client.onUpdate(
        query,
        { matchId },
        (snapshot) => handlers.onSnapshot(snapshot),
        handlers.onError,
      ) as SnapshotUnsubscribe
    },
  }
}
