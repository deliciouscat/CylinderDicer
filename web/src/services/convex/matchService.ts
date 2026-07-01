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
import { convexFunctions } from './functionReferences'

export interface MatchPrivateDelta {
  kind: 'private_delta'
  matchId: string
  revision: number
  hud?: string
  viewerPlayerId: string
  dice?: number[]
  cylinder?: unknown
  availableActions?: unknown[]
}

export interface MatchPublicSnapshot {
  kind: 'public'
  matchId: string
  revision: number
  hud?: string
  players?: unknown[]
}

export type MergedMatchSnapshot = MatchPublicSnapshot & {
  private?: MatchPrivateDelta
  viewerPlayerId?: string
  dice?: number[]
  cylinder?: unknown
  availableActions?: unknown[]
}

export interface CreateDevMatchOptions {
  localPlayerName?: string
  firstPlayerId?: string
  requiresSetupLoad?: boolean
}

export interface CreateCustomMatchOptions {
  localPlayerName?: string
  virtualOpponentKeys?: string[]
  firstPlayerId?: string
  requiresSetupLoad?: boolean
}

export interface CreatedMatch {
  matchId: string
  revision: number
  reused?: boolean
  custom?: boolean
  publicSnapshot?: MatchPublicSnapshot
  privateDelta?: MatchPrivateDelta
}

export interface SubmitMatchCommandInput {
  matchId: string
  commandId: string
  revision: number
  type: string
  payload?: unknown
}

export interface CompactMatchLogsInput {
  matchId: string
  keepLastRevisions?: number
  maxDelete?: number
}

export interface MatchSubscriptionHandlers {
  onSnapshot(snapshot: MatchPublicSnapshot | MatchPrivateDelta | null): void
  onError?(error: Error): void
  private?: boolean
}

export type SnapshotUnsubscribe = (() => void) & {
  unsubscribe(): void
  getCurrentValue(): unknown | undefined
}

export function mergeMatchSnapshots(
  publicSnapshot: MatchPublicSnapshot | null | undefined,
  privateDelta: MatchPrivateDelta | null | undefined,
): MergedMatchSnapshot | null {
  if (!publicSnapshot) {
    return null
  }

  if (!privateDelta || privateDelta.matchId !== publicSnapshot.matchId) {
    return publicSnapshot
  }

  return {
    ...publicSnapshot,
    hud: privateDelta.hud ?? publicSnapshot.hud,
    private: privateDelta,
    viewerPlayerId: privateDelta.viewerPlayerId,
    dice: privateDelta.dice,
    cylinder: privateDelta.cylinder,
    availableActions: privateDelta.availableActions,
  }
}

export function createMatchService(client: ConvexClient) {
  return {
    async createDevMatch(options: CreateDevMatchOptions = {}): Promise<CreatedMatch> {
      return await client.mutation(convexFunctions.matches.createDevMatch, options)
    },
    async createCustomMatchWithOpponents(options: CreateCustomMatchOptions = {}): Promise<CreatedMatch | Record<string, any>> {
      return await client.mutation(convexFunctions.matches.createCustomMatchWithOpponents, options)
    },
    async submitCommand(command: SubmitMatchCommandInput): Promise<unknown> {
      return await client.mutation(convexFunctions.commands.submitMatchCommand, command as Record<string, any>)
    },
    async getPublicSnapshot(matchId: string): Promise<MatchPublicSnapshot | null> {
      return await client.query(convexFunctions.snapshots.getLatestPublicSnapshot, { matchId } as any)
    },
    async getPrivateDelta(matchId: string): Promise<MatchPrivateDelta | null> {
      return await client.query(convexFunctions.snapshots.getLatestPrivateDelta, { matchId } as any)
    },
    async compactMatchLogs(input: CompactMatchLogsInput): Promise<unknown> {
      return await client.mutation(convexFunctions.matches.compactMatchLogs, input as any)
    },
    subscribeSnapshot(
      matchId: string,
      handlers: MatchSubscriptionHandlers,
    ): SnapshotUnsubscribe {
      const query = handlers.private
        ? convexFunctions.snapshots.getLatestPrivateDelta
        : convexFunctions.snapshots.getLatestPublicSnapshot
      return client.onUpdate(
        query,
        { matchId },
        (snapshot) => handlers.onSnapshot(snapshot),
        handlers.onError,
      ) as SnapshotUnsubscribe
    },
    subscribePublicView(
      matchId: string,
      handlers: Omit<MatchSubscriptionHandlers, 'private'>,
    ): SnapshotUnsubscribe {
      return this.subscribeSnapshot(matchId, handlers)
    },
  }
}
