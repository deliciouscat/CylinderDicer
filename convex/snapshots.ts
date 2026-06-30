/**
 * # 개요
 * Convex query가 읽을 최신 public view와 private delta를 제공하는 함수 모듈이다.
 * `convex/match/snapshots.ts`는 view/delta를 만드는 순수 로직이고, 이 파일은 DB read 경계다.
 *
 * # 의존성
 * - `convex/schema.ts`: matchSnapshots 테이블.
 * - `convex/users.ts`: 접근자 확인.
 * - `convex/matches.ts`: participant/state 조회.
 * - `convex/protocol/snapshots.ts`: 반환 payload shape.
 *
 * # I/O
 * - 입력:
 *   - matchId.
 *   - authenticated user.
 * - 출력:
 *   - latest public view.
 *   - current user private delta.
 *
 * # 의사코드
 * ```text
 * getPublicSnapshot:
 *   verify match can be observed
 *   read latest public view by matchId
 *   return view
 *
 * getPrivateDelta:
 *   resolve current user
 *   verify user is participant
 *   derive private delta from authoritative state
 *   return delta
 * ```
 */
import { queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { requireExistingCurrentUser, type GenericCtx } from './users'
import { getLatestMatchState, getMatchParticipant } from './matches'
import { buildPrivateDelta } from './match/snapshots'

export const getLatestPublicSnapshot = queryGeneric({
	args: {
		matchId: v.id('matches'),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireExistingCurrentUser(ctx)
		const participant = await getMatchParticipant(ctx, args.matchId, currentUser._id)
		if (!participant) {
			return null
		}

		const row = await ctx.db
			.query('matchSnapshots')
			.withIndex('by_match_kind', (q: any) => q.eq('matchId', args.matchId).eq('kind', 'public'))
			.first()
		return row?.snapshot ?? null
	},
})

export const getLatestPrivateDelta = queryGeneric({
	args: {
		matchId: v.id('matches'),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireExistingCurrentUser(ctx)
		const participant = await getMatchParticipant(ctx, args.matchId, currentUser._id)
		if (!participant) {
			return null
		}

		const state = await getLatestMatchState(ctx, args.matchId)
		if (!state) {
			return null
		}

		return buildPrivateDelta(state, participant.playerId)
	},
})
