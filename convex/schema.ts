/**
 * # 개요
 * Convex DB의 초기 테이블 구조를 정의한다.
 * 1차 스캐폴드에서는 match command/event/state/view payload를 넓게 받고, 서버 프로토콜이 안정되면 `v.any()`를 좁힌다.
 *
 * # 의존성
 * - `convex/server`: `defineSchema`, `defineTable`.
 * - `convex/values`: Convex validator DSL.
 * - `convex/protocol/*`: 추후 command/snapshot payload를 정교화할 때 기준으로 삼는다.
 *
 * # I/O
 * - 입력:
 *   - Convex schema compiler.
 * - 출력:
 *   - users, inventories, matches, matchParticipants, matchStates, matchEvents, matchCommands, matchSnapshots 테이블 정의.
 *
 * # 의사코드
 * ```text
 * define users table indexed by Clerk id
 * define inventory table indexed by user
 * define matches table with status/revision metadata
 * define matchParticipants table for indexed user-to-match lookup
 * define compact matchStates table for active authoritative state
 * define command/event log tables for authoritative replay and dedupe
 * define public/private_delta snapshot table for subscriptions
 * ```
 */
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_clerk_id', ['clerkId']),

  inventories: defineTable({
    userId: v.id('users'),
    currencies: v.object({
      coins: v.number(),
      gems: v.number(),
    }),
    equipped: v.object({
      diceSkin: v.string(),
      cupSkin: v.string(),
    }),
    revision: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  matches: defineTable({
    mode: v.union(v.literal('dev'), v.literal('casual'), v.literal('ranked')),
    status: v.union(v.literal('ready'), v.literal('complete')),
    revision: v.number(),
    hostUserId: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_status', ['status']),

  matchParticipants: defineTable({
    matchId: v.id('matches'),
    userId: v.id('users'),
    playerId: v.string(),
    seatIndex: v.number(),
    status: v.union(v.literal('active'), v.literal('left'), v.literal('complete')),
    updatedAt: v.number(),
  })
    .index('by_match', ['matchId'])
    .index('by_user_status', ['userId', 'status'])
    .index('by_match_user', ['matchId', 'userId']),

  matchEvents: defineTable({
    matchId: v.id('matches'),
    revision: v.number(),
    type: v.string(),
    actorUserId: v.optional(v.id('users')),
    payload: v.any(),
    createdAt: v.number(),
  }).index('by_match_revision', ['matchId', 'revision']),

  matchCommands: defineTable({
    matchId: v.id('matches'),
    commandId: v.string(),
    actorUserId: v.id('users'),
    actorPlayerId: v.optional(v.string()),
    type: v.string(),
    payload: v.any(),
    resultRevision: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index('by_match_command', ['matchId', 'commandId'])
    .index('by_match_actor', ['matchId', 'actorUserId']),

  matchStates: defineTable({
    matchId: v.id('matches'),
    revision: v.number(),
    state: v.any(),
    updatedAt: v.number(),
  }).index('by_match', ['matchId']),

  matchSnapshots: defineTable({
    matchId: v.id('matches'),
    userId: v.optional(v.id('users')),
    kind: v.union(v.literal('public'), v.literal('private_delta')),
    revision: v.number(),
    viewHash: v.optional(v.string()),
    snapshot: v.any(),
    updatedAt: v.number(),
  })
    .index('by_match_kind', ['matchId', 'kind'])
    .index('by_match_user', ['matchId', 'userId']),
})
