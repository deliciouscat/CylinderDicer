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
	requireCurrentUser,
	requireExistingCurrentUser,
	type GenericCtx,
} from './users'
import { ensureDefaultVirtualOpponents, getVirtualOpponentByKey } from './virtualOpponents'
import { scheduleNextBotAction } from './bots/scheduling'
import { ensureGameplayBotCatalog } from './bots/catalog'
import { requireQaToolsEnabled } from './qa/guards'
import { GAME_RULESET } from '../shared/game/ruleset'
import { DEFAULT_CHARACTER_KEY } from '../shared/game/characters'

const DEFAULT_COMPACTION_KEEP_REVISIONS = 12
const DEFAULT_COMPACTION_MAX_DELETE = 200
const MAX_CUSTOM_OPPONENTS = GAME_RULESET.players.max - 1

export interface CreateDevMatchOptions {
	localPlayerName?: string
	firstPlayerId?: string
	requiresSetupLoad?: boolean
	reuseActive?: boolean
}

export interface CreateCustomMatchOptions {
	localPlayerName?: string
	virtualOpponentKeys?: string[]
	firstPlayerId?: string
	requiresSetupLoad?: boolean
}

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

export async function getMatchParticipantByPlayerId(
	ctx: GenericCtx,
	matchId: string,
	playerId: string,
) {
	return await ctx.db
		.query('matchParticipants')
		.withIndex('by_match_player', (q: any) => q.eq('matchId', matchId).eq('playerId', playerId))
		.first()
}

export async function insertMatchParticipants(
	ctx: GenericCtx,
	matchId: string,
	players: CreateInitialStateInput['players'],
	now: number,
) {
	for (const [index, player] of players.entries()) {
		await ctx.db.insert(
			'matchParticipants',
			toConvexValue({
				matchId,
				userId: player.userId,
				virtualOpponentId: player.virtualOpponentId,
				participantKind: player.participantKind ?? (player.virtualOpponentId ? 'virtual' : 'human'),
				controlMode: player.controlMode ?? (player.virtualOpponentId ? 'qa_manual' : 'human'),
				botProfileId: player.botProfileId,
				botStrategyKey: player.botStrategyKey,
				botStrategyVersion: player.botStrategyVersion,
				botParameters: player.botParameters,
				characterKey: player.characterKey,
				playerId: player.id,
				seatIndex: index,
				status: 'active',
				startingMmr: player.startingMmr,
				updatedAt: now,
			}),
		)
	}
}

async function matchHasVirtualOpponents(ctx: GenericCtx, matchId: string, state: MatchState) {
	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.take(8)
	const participantsHaveVirtualOpponent = participants.some((participant: any) => {
		return participant.participantKind === 'virtual' || Boolean(participant.virtualOpponentId)
	})
	const stateHasVirtualOpponent = state.players.order.some((playerId) => {
		const player = state.players.byId[playerId]
		return player?.participantKind === 'virtual' || Boolean(player?.virtualOpponentId)
	})
	return participantsHaveVirtualOpponent && stateHasVirtualOpponent
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
			if (state && (await matchHasVirtualOpponents(ctx, participant.matchId, state))) {
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

export async function buildDevPlayers(ctx: GenericCtx, currentUser: any, localPlayerName?: string) {
	const opponents = await ensureDefaultVirtualOpponents(ctx)

	return [
		{
			id: 'local-player',
			userId: currentUser._id,
			participantKind: 'human',
			name: localPlayerName ?? currentUser.displayName ?? 'You',
			characterKey: currentUser.characterKey ?? DEFAULT_CHARACTER_KEY,
		},
		...opponents.map((opponent, index) => ({
			id: `opponent-${index + 1}`,
			virtualOpponentId: opponent._id,
			participantKind: 'virtual' as const,
			name: opponent.displayName,
			characterKey: opponent.characterKey,
			initialLoadedSlots: [...GAME_RULESET.cylinder.initialLoadedSlots],
		})),
	] satisfies CreateInitialStateInput['players']
}

async function buildCustomPlayers(
	ctx: GenericCtx,
	currentUser: any,
	options: CreateCustomMatchOptions,
) {
	await ensureDefaultVirtualOpponents(ctx)
	const gameplayCatalog = await ensureGameplayBotCatalog(ctx)
	const profileByOpponentId = new Map(gameplayCatalog.map(({ opponent, profile }) => [
		opponent._id,
		profile,
	]))
	const requestedKeys = Array.from(new Set(options.virtualOpponentKeys ?? []))
	const keys = requestedKeys.length > 0
		? requestedKeys.slice(0, MAX_CUSTOM_OPPONENTS)
		: ['opponent-1', 'opponent-2', 'opponent-3']
	const opponents = []
	for (const key of keys) {
		const opponent = await getVirtualOpponentByKey(ctx, key)
		if (!opponent) {
			return {
				ok: false as const,
				code: 'VIRTUAL_OPPONENT_NOT_FOUND',
				message: 'virtual_opponent_not_found',
				key,
			}
		}
		opponents.push(opponent)
	}

	return {
		ok: true as const,
		players: [
			{
				id: 'local-player',
				userId: currentUser._id,
				participantKind: 'human' as const,
				name: options.localPlayerName ?? currentUser.displayName ?? 'You',
				characterKey: currentUser.characterKey ?? DEFAULT_CHARACTER_KEY,
			},
			...opponents.map((opponent, index) => {
				const profile = profileByOpponentId.get(opponent._id)
				return {
					id: `opponent-${index + 1}`,
					virtualOpponentId: opponent._id,
					participantKind: 'virtual' as const,
					controlMode: 'server_bot' as const,
					botProfileId: profile?._id,
					botStrategyKey: profile?.strategyKey,
					botStrategyVersion: profile?.strategyVersion,
					botParameters: profile?.parameters,
					name: opponent.displayName,
					characterKey: opponent.characterKey,
					initialLoadedSlots: [...GAME_RULESET.cylinder.initialLoadedSlots],
				}
			}),
		] satisfies CreateInitialStateInput['players'],
	}
}

export async function createDevMatchForUser(
	ctx: GenericCtx,
	currentUser: any,
	options: CreateDevMatchOptions = {},
) {
	const now = Date.now()
	if (options.reuseActive !== false) {
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
	}

	const players = await buildDevPlayers(ctx, currentUser, options.localPlayerName)
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
		firstPlayerId: options.firstPlayerId,
		requiresSetupLoad: options.requiresSetupLoad,
		rngSeed: now % 2147483647,
		players,
	})
	await writeStateAndPublicView(ctx, state)
	await scheduleNextBotAction(ctx, state)

	return {
		matchId,
		revision: state.revision,
		publicSnapshot: buildPublicSnapshot(state),
		privateDelta: buildPrivateDelta(state, 'local-player'),
	}
}

export async function createCustomMatchForUser(
	ctx: GenericCtx,
	currentUser: any,
	options: CreateCustomMatchOptions = {},
) {
	const now = Date.now()
	const built = await buildCustomPlayers(ctx, currentUser, options)
	if (!built.ok) {
		return built
	}

	const matchId = await ctx.db.insert('matches', {
		mode: 'casual' satisfies MatchMode,
		status: 'ready',
		revision: 0,
		hostUserId: currentUser._id,
		createdAt: now,
		updatedAt: now,
	})
	await insertMatchParticipants(ctx, matchId, built.players, now)

	const state = createInitialMatchState({
		matchId,
		mode: 'casual',
		localPlayerId: 'local-player',
		firstPlayerId: options.firstPlayerId,
		requiresSetupLoad: options.requiresSetupLoad,
		rngSeed: now % 2147483647,
		players: built.players,
	})
	await writeStateAndPublicView(ctx, state)
	await scheduleNextBotAction(ctx, state)

	return {
		matchId,
		revision: state.revision,
		custom: true,
		publicSnapshot: buildPublicSnapshot(state),
		privateDelta: buildPrivateDelta(state, 'local-player'),
	}
}

export async function createCustomMatchFromRoomParticipants(
	ctx: GenericCtx,
	hostUser: any,
	roomParticipants: Array<{
		participantKind: 'human' | 'virtual'
		playerId: string
		userId?: string
		virtualOpponentId?: string
		displayName: string
		characterKey?: string
		seatIndex: number
	}>,
	options: { requiresSetupLoad?: boolean; firstPlayerId?: string } = {},
) {
	const now = Date.now()
	const gameplayCatalog = await ensureGameplayBotCatalog(ctx)
	const profileByOpponentId = new Map(gameplayCatalog.map(({ opponent, profile }) => [
		opponent._id,
		profile,
	]))
	const characterByOpponentId = new Map(gameplayCatalog.map(({ opponent }) => [
		opponent._id,
		opponent.characterKey,
	]))
	const ordered = roomParticipants
		.slice()
		.sort((left, right) => left.seatIndex - right.seatIndex)
	const humanUsersById = new Map<string, any>()
	for (const participant of ordered) {
		if (participant.participantKind !== 'human' || !participant.userId) {
			continue
		}
		const user = participant.userId === hostUser._id
			? hostUser
			: await ctx.db.get(participant.userId)
		if (user) {
			humanUsersById.set(String(participant.userId), user)
		}
	}
	const hostParticipant = ordered.find(
		(participant) => participant.participantKind === 'human' && participant.userId === hostUser._id,
	)
	const localPlayerId = hostParticipant?.playerId ?? 'local-player'
	const players = ordered.map((participant) => {
		if (participant.participantKind === 'virtual') {
			const profile = participant.virtualOpponentId
				? profileByOpponentId.get(participant.virtualOpponentId)
				: undefined
			return {
				id: participant.playerId,
				virtualOpponentId: participant.virtualOpponentId,
				participantKind: 'virtual' as const,
				controlMode: 'server_bot' as const,
				botProfileId: profile?._id,
				botStrategyKey: profile?.strategyKey,
				botStrategyVersion: profile?.strategyVersion,
				botParameters: profile?.parameters,
				name: participant.displayName,
				characterKey: participant.characterKey
					?? (participant.virtualOpponentId
						? characterByOpponentId.get(participant.virtualOpponentId)
						: undefined),
				initialLoadedSlots: [...GAME_RULESET.cylinder.initialLoadedSlots],
			}
		}
		return {
			id: participant.playerId,
			userId: participant.userId,
			participantKind: 'human' as const,
			name: participant.displayName,
			characterKey: (participant.userId
				? humanUsersById.get(String(participant.userId))?.characterKey
				: undefined)
				?? participant.characterKey
				?? DEFAULT_CHARACTER_KEY,
			initialLoadedSlots: participant.userId && participant.userId !== hostUser._id
				? [...GAME_RULESET.cylinder.initialLoadedSlots]
				: undefined,
		}
	})

	const matchId = await ctx.db.insert('matches', {
		mode: 'casual' satisfies MatchMode,
		status: 'ready',
		revision: 0,
		hostUserId: hostUser._id,
		createdAt: now,
		updatedAt: now,
	})
	await insertMatchParticipants(ctx, matchId, players, now)

	const state = createInitialMatchState({
		matchId,
		mode: 'casual',
		localPlayerId,
		firstPlayerId: options.firstPlayerId,
		requiresSetupLoad: options.requiresSetupLoad,
		rngSeed: now % 2147483647,
		players,
	})
	await writeStateAndPublicView(ctx, state)
	await scheduleNextBotAction(ctx, state)

	return {
		matchId,
		revision: state.revision,
		custom: true,
		publicSnapshot: buildPublicSnapshot(state),
		privateDelta: buildPrivateDelta(state, localPlayerId),
	}
}

export const createDevMatch = mutationGeneric({
	args: {
		localPlayerName: v.optional(v.string()),
		firstPlayerId: v.optional(v.string()),
		requiresSetupLoad: v.optional(v.boolean()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		requireQaToolsEnabled()
		const currentUser = await requireCurrentUser(ctx)
		return await createDevMatchForUser(ctx, currentUser, {
			localPlayerName: args.localPlayerName,
			firstPlayerId: args.firstPlayerId,
			requiresSetupLoad: args.requiresSetupLoad,
			reuseActive: true,
		})
	},
})

export const createCustomMatchWithOpponents = mutationGeneric({
	args: {
		localPlayerName: v.optional(v.string()),
		virtualOpponentKeys: v.optional(v.array(v.string())),
		firstPlayerId: v.optional(v.string()),
		requiresSetupLoad: v.optional(v.boolean()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)
		return await createCustomMatchForUser(ctx, currentUser, {
			localPlayerName: args.localPlayerName,
			virtualOpponentKeys: args.virtualOpponentKeys,
			firstPlayerId: args.firstPlayerId,
			requiresSetupLoad: args.requiresSetupLoad,
		})
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

export const compactMatchLogs = mutationGeneric({
	args: {
		matchId: v.id('matches'),
		keepLastRevisions: v.optional(v.number()),
		maxDelete: v.optional(v.number()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)
		const match = await ctx.db.get(args.matchId)
		if (!match) {
			return {
				ok: false,
				code: 'MATCH_NOT_FOUND',
				message: 'match_not_found',
			}
		}
		if (match.hostUserId !== currentUser._id) {
			return {
				ok: false,
				matchId: args.matchId,
				code: 'NOT_MATCH_HOST',
				message: 'not_match_host',
			}
		}

		const state = await getLatestMatchState(ctx, args.matchId)
		const latestRevision = state?.revision ?? match.revision ?? 0
		const keepLastRevisions = Math.max(1, args.keepLastRevisions ?? DEFAULT_COMPACTION_KEEP_REVISIONS)
		const maxDelete = Math.max(1, Math.min(args.maxDelete ?? DEFAULT_COMPACTION_MAX_DELETE, DEFAULT_COMPACTION_MAX_DELETE))
		const compactThroughRevision = Math.max(0, latestRevision - keepLastRevisions)
		const now = Date.now()

		const oldEvents = await ctx.db
			.query('matchEvents')
			.withIndex('by_match_revision', (q: any) => q.eq('matchId', args.matchId).lte('revision', compactThroughRevision))
			.take(maxDelete)
		for (const event of oldEvents) {
			await ctx.db.delete(event._id)
		}

		const expiredCommands = await ctx.db
			.query('matchCommands')
			.withIndex('by_match_expires', (q: any) => q.eq('matchId', args.matchId).lte('expiresAt', now))
			.take(maxDelete)
		for (const command of expiredCommands) {
			await ctx.db.delete(command._id)
		}

		if (oldEvents.length > 0 || expiredCommands.length > 0) {
			await ctx.db.insert(
				'matchEvents',
				toConvexValue({
					matchId: args.matchId,
					revision: latestRevision,
					type: 'log.compacted',
					actorUserId: currentUser._id,
					payload: {
						compactThroughRevision,
						deletedEvents: oldEvents.length,
						deletedCommands: expiredCommands.length,
					},
					createdAt: now,
				}),
			)
		}

		return {
			ok: true,
			matchId: args.matchId,
			latestRevision,
			compactThroughRevision,
			deletedEvents: oldEvents.length,
			deletedCommands: expiredCommands.length,
			mayHaveMore: oldEvents.length === maxDelete || expiredCommands.length === maxDelete,
		}
	},
})
