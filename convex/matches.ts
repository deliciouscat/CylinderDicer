/**
 * # 개요
 * 매치 생성, 매치 목록 조회, public view/private delta 조회 query를 제공하는 Convex 함수 모듈이다.
 * Dev match부터 연결하고, casual/ranked matchmaking은 이후 확장한다.
 *
 * # 의존성
 * - `convex/users.ts`: 현재 사용자 확인.
 * - `convex/match/state.ts`: 초기 authoritative match state 생성.
 * - `convex/match/snapshots.ts`: public view/private delta 생성.
 * - `convex/schema.ts`: matches, matchEvents, matchSnapshots 테이블.
 *
 * # I/O
 * - 입력:
 *   - authenticated user.
 *   - create match options: mode, seats, bots/dev opponents.
 *   - snapshot query args: matchId.
 * - 출력:
 *   - created match id.
 *   - public match view.
 *   - current user private delta.
 *   - 사용자가 참여 중인 match list.
 *
 * # 의사코드
 * ```text
 * createDevMatch:
 *   resolve current user
 *   create match document with revision 0
 *   create initial domain state
 *   write match.created event
 *   write compact state + public view
 *   write matchParticipants index rows
 *   return match id, public view, private delta
 *
 * getPublicSnapshot/getPrivateDelta:
 *   validate user can observe match
 *   read latest public view or derive private delta from match state
 *   return view/delta
 * ```
 */
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import {
	createInitialMatchState,
	type CreateInitialStateInput,
	type MatchMode,
	type MatchState,
} from './match/state'
import { buildPrivateDelta, buildPublicSnapshot } from './match/snapshots'
import {
	ensureBotUser,
	requireCurrentUser,
	requireExistingCurrentUser,
	type GenericCtx,
} from './users'

function toConvexValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

async function upsertByMatch(ctx: GenericCtx, table: string, matchId: string, value: Record<string, unknown>) {
	const existing = await ctx.db
		.query(table)
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.first()
	if (existing) {
		await ctx.db.patch(existing._id, toConvexValue(value))
		return existing._id
	}
	return await ctx.db.insert(table, toConvexValue({ matchId, ...value }))
}

async function upsertPublicSnapshot(ctx: GenericCtx, state: MatchState, now: number) {
	const matchId = state.matchId
	const existing = await ctx.db
		.query('matchSnapshots')
		.withIndex('by_match_kind', (q: any) => q.eq('matchId', matchId).eq('kind', 'public'))
		.first()
	const snapshot = buildPublicSnapshot(state)
	const viewHash = JSON.stringify({
		...snapshot,
		revision: 0,
		match: {
			...snapshot.match,
			eventsHash: '0',
			turnCount: 0,
		},
	})
	if (existing?.viewHash === viewHash) {
		return existing._id
	}

	const value = toConvexValue({
		matchId,
		kind: 'public',
		revision: state.revision,
		viewHash,
		snapshot,
		updatedAt: now,
	})
	if (existing) {
		await ctx.db.patch(existing._id, value)
		return existing._id
	}
	return await ctx.db.insert('matchSnapshots', value)
}

export async function writeStateAndPublicView(ctx: GenericCtx, state: MatchState) {
	const now = Date.now()
	await upsertByMatch(ctx, 'matchStates', state.matchId, {
		revision: state.revision,
		state,
		updatedAt: now,
	})
	await upsertPublicSnapshot(ctx, state, now)
}

export async function getLatestMatchState(
	ctx: GenericCtx,
	matchId: string,
): Promise<MatchState | null> {
	const row = await ctx.db
		.query('matchStates')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.first()
	return (row?.state as MatchState | undefined) ?? null
}

export async function getMatchParticipant(ctx: GenericCtx, matchId: string, userId: string) {
	return await ctx.db
		.query('matchParticipants')
		.withIndex('by_match_user', (q: any) => q.eq('matchId', matchId).eq('userId', userId))
		.first()
}

async function insertMatchParticipants(
	ctx: GenericCtx,
	matchId: string,
	players: CreateInitialStateInput['players'],
	now: number,
) {
	for (const [index, player] of players.entries()) {
		await ctx.db.insert('matchParticipants', {
			matchId,
			userId: player.userId,
			playerId: player.id,
			seatIndex: index,
			status: 'active',
			updatedAt: now,
		})
	}
}

async function findReusableDevMatch(ctx: GenericCtx, currentUserId: string) {
	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_user_status', (q: any) => q.eq('userId', currentUserId).eq('status', 'active'))
		.collect()

	for (const participant of participants) {
		const match = await ctx.db.get(participant.matchId)
		if (match?.mode === 'dev' && match.status === 'ready' && match.hostUserId === currentUserId) {
			const state = await getLatestMatchState(ctx, participant.matchId)
			if (state) {
				return {
					match,
					state,
					participant,
				}
			}
		}
	}

	return null
}

async function buildDevPlayers(ctx: GenericCtx, currentUser: any, localPlayerName?: string) {
	const bots = [
		await ensureBotUser(ctx, 'opponent-1', 'Hush Feather'),
		await ensureBotUser(ctx, 'opponent-2', 'Samuel Saber'),
		await ensureBotUser(ctx, 'opponent-3', 'Zippo Jay'),
	]

	return [
		{
			id: 'local-player',
			userId: currentUser._id,
			name: localPlayerName ?? currentUser.displayName ?? 'You',
		},
		...bots.map((bot, index) => ({
			id: `opponent-${index + 1}`,
			userId: bot._id,
			name: bot.displayName,
			initialLoadedSlots: [1, 3, 5],
		})),
	] satisfies CreateInitialStateInput['players']
}

export const createDevMatch = mutationGeneric({
	args: {
		localPlayerName: v.optional(v.string()),
		firstPlayerId: v.optional(v.string()),
		requiresSetupLoad: v.optional(v.boolean()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)
		const now = Date.now()
		const reusable = await findReusableDevMatch(ctx, currentUser._id)
		if (reusable) {
			return {
				matchId: reusable.match._id,
				revision: reusable.state.revision,
				reused: true,
				publicSnapshot: buildPublicSnapshot(reusable.state),
				privateDelta: buildPrivateDelta(reusable.state, reusable.participant.playerId),
			}
		}

		const players = await buildDevPlayers(ctx, currentUser, args.localPlayerName)
		const matchId = await ctx.db.insert('matches', {
			mode: 'dev' satisfies MatchMode,
			status: 'ready',
			revision: 0,
			hostUserId: currentUser._id,
			createdAt: now,
			updatedAt: now,
		})
		await insertMatchParticipants(ctx, matchId, players, now)

		const state = createInitialMatchState({
			matchId,
			mode: 'dev',
			localPlayerId: 'local-player',
			firstPlayerId: args.firstPlayerId,
			requiresSetupLoad: args.requiresSetupLoad,
			rngSeed: now % 2147483647,
			players,
		})
		await writeStateAndPublicView(ctx, state)

		return {
			matchId,
			revision: state.revision,
			publicSnapshot: buildPublicSnapshot(state),
			privateDelta: buildPrivateDelta(state, 'local-player'),
		}
	},
})

export const listMyMatches = queryGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const currentUser = await requireExistingCurrentUser(ctx)
		const participants = await ctx.db
			.query('matchParticipants')
			.withIndex('by_user_status', (q: any) => q.eq('userId', currentUser._id).eq('status', 'active'))
			.collect()

		const rows = []
		for (const participant of participants) {
			const match = await ctx.db.get(participant.matchId)
			if (match) {
				rows.push({
					match,
					participant,
				})
			}
		}
		return rows
	},
})

export const getPublicSnapshot = queryGeneric({
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

export const getPrivateDelta = queryGeneric({
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
