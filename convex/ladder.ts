import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { env } from './_generated/server'
import {
	averageNormalizedPlacement,
	type LadderPlacement,
} from '../shared/ladder/placement'
import { buildPrivateDelta, buildPublicSnapshot } from './match/snapshots'
import {
	createInitialMatchState,
	type CreateInitialStateInput,
	type MatchMode,
} from './match/state'
import { insertMatchParticipants, writeStateAndPublicView } from './matches'
import {
	requireCurrentUser,
	requireExistingCurrentUser,
	type GenericCtx,
} from './users'
import { ensureVirtualOpponent } from './virtualOpponents'

const DEFAULT_MMR = 1000
const MAX_ROSTER_SIZE = 6
const CHARACTER_KEYS = [
	'calamity-kate',
	'hush-feather',
	'samuel-saber',
	'zippo-jay',
	'rosemund',
	'the-kid',
] as const

type LadderStatsRow = {
	mmr: number
	recentPlacements: LadderPlacement[]
	totalNormalizedPlacementSum: number
	totalPlacements: number
}

function emptyStats() {
	return {
		mmr: DEFAULT_MMR,
		recent20AvgPlace: null,
		recent20Count: 0,
		allTimeAvgPlace: null,
		allTimeCount: 0,
	}
}

function statsView(row: LadderStatsRow | null | undefined) {
	if (!row) {
		return emptyStats()
	}
	return {
		mmr: row.mmr,
		recent20AvgPlace: averageNormalizedPlacement(row.recentPlacements.slice(-20)),
		recent20Count: Math.min(20, row.recentPlacements.length),
		allTimeAvgPlace: row.totalPlacements > 0
			? row.totalNormalizedPlacementSum / row.totalPlacements
			: null,
		allTimeCount: row.totalPlacements,
	}
}

async function getStatsRow(ctx: GenericCtx, userId: string) {
	return await ctx.db
		.query('ladderStats')
		.withIndex('by_user', (q: any) => q.eq('userId', userId))
		.unique()
}

async function ensureStatsRow(ctx: GenericCtx, userId: string) {
	const existing = await getStatsRow(ctx, userId)
	if (existing) {
		return existing
	}
	const now = Date.now()
	const id = await ctx.db.insert('ladderStats', {
		userId,
		mmr: DEFAULT_MMR,
		recentPlacements: [],
		totalNormalizedPlacementSum: 0,
		totalPlacements: 0,
		updatedAt: now,
	})
	return await ctx.db.get(id)
}

async function getQueueEntry(ctx: GenericCtx, userId: string) {
	return await ctx.db
		.query('ladderQueueEntries')
		.withIndex('by_user', (q: any) => q.eq('userId', userId))
		.unique()
}

async function createAuthoritativeMatch(
	ctx: GenericCtx,
	players: CreateInitialStateInput['players'],
	mode: MatchMode,
) {
	const now = Date.now()
	const matchId = await ctx.db.insert('matches', {
		mode,
		status: 'ready',
		revision: 0,
		hostUserId: players[0]?.userId,
		createdAt: now,
		updatedAt: now,
	})
	await insertMatchParticipants(ctx, matchId, players, now)
	const state = createInitialMatchState({
		matchId,
		mode,
		localPlayerId: players[0]?.id,
		requiresSetupLoad: true,
		rngSeed: now % 2147483647,
		players,
	})
	await writeStateAndPublicView(ctx, state)
	return { matchId, state }
}

async function buildRoster(ctx: GenericCtx, matchId: string, viewerUserId: string) {
	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.take(MAX_ROSTER_SIZE)
	participants.sort((left: any, right: any) => left.seatIndex - right.seatIndex)

	const roster = []
	for (const participant of participants) {
		const user = participant.userId ? await ctx.db.get(participant.userId) : null
		const virtualOpponent = participant.virtualOpponentId
			? await ctx.db.get(participant.virtualOpponentId)
			: null
		const row = participant.userId ? await getStatsRow(ctx, participant.userId) : null
		roster.push({
			playerId: participant.playerId,
			displayName: user?.displayName ?? virtualOpponent?.displayName ?? `Player ${participant.seatIndex + 1}`,
			seatIndex: participant.seatIndex,
			isSelf: participant.userId === viewerUserId,
			characterKey: CHARACTER_KEYS[participant.seatIndex % CHARACTER_KEYS.length],
			stats: statsView(row),
		})
	}
	return roster
}

async function queueStateForUser(ctx: GenericCtx, currentUser: any) {
	const [entry, row] = await Promise.all([
		getQueueEntry(ctx, currentUser._id),
		getStatsRow(ctx, currentUser._id),
	])
	if (!entry) {
		return { status: 'idle', selfStats: statsView(row), matchId: null, roster: [] }
	}
	if (entry.status === 'matched' && entry.matchId) {
		const match = await ctx.db.get(entry.matchId)
		if (match?.status === 'ready') {
			return {
				status: 'matched',
				selfStats: statsView(row),
				matchId: entry.matchId,
				roster: await buildRoster(ctx, entry.matchId, currentUser._id),
			}
		}
	}
	return {
		status: entry.status === 'waiting' ? 'waiting' : 'cancelled',
		selfStats: statsView(row),
		matchId: null,
		roster: [],
	}
}

async function matchOldestWaitingPair(ctx: GenericCtx) {
	const waiting = await ctx.db
		.query('ladderQueueEntries')
		.withIndex('by_status_and_joined_at', (q: any) => q.eq('status', 'waiting'))
		.order('asc')
		.take(2)
	if (waiting.length < 2) {
		return null
	}

	const players = []
	for (const [seatIndex, entry] of waiting.entries()) {
		const user = await ctx.db.get(entry.userId)
		if (!user) {
			return null
		}
		players.push({
			id: `player-${seatIndex + 1}`,
			userId: user._id,
			participantKind: 'human' as const,
			name: user.displayName ?? `Player ${seatIndex + 1}`,
			initialLoadedSlots: seatIndex === 0 ? undefined : [1, 3, 5],
		})
	}

	const created = await createAuthoritativeMatch(ctx, players, 'ranked')
	const now = Date.now()
	for (const entry of waiting) {
		await ctx.db.patch(entry._id, {
			status: 'matched',
			matchId: created.matchId,
			updatedAt: now,
		})
	}
	return created.matchId
}

export const observeOwnQueue = queryGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const currentUser = await requireExistingCurrentUser(ctx)
		return await queueStateForUser(ctx, currentUser)
	},
})

export const enterQueue = mutationGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const currentUser = await requireCurrentUser(ctx)
		await ensureStatsRow(ctx, currentUser._id)
		const existing = await getQueueEntry(ctx, currentUser._id)
		if (existing?.status === 'matched' && existing.matchId) {
			const match = await ctx.db.get(existing.matchId)
			if (match?.status === 'ready') {
				return await queueStateForUser(ctx, currentUser)
			}
		}

		const now = Date.now()
		if (existing) {
			await ctx.db.patch(existing._id, {
				status: 'waiting',
				matchId: undefined,
				joinedAt: existing.status === 'waiting' ? existing.joinedAt : now,
				updatedAt: now,
			})
		} else {
			await ctx.db.insert('ladderQueueEntries', {
				userId: currentUser._id,
				status: 'waiting',
				joinedAt: now,
				updatedAt: now,
			})
		}
		await matchOldestWaitingPair(ctx)
		return await queueStateForUser(ctx, currentUser)
	},
})

export const leaveQueue = mutationGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const currentUser = await requireCurrentUser(ctx)
		const existing = await getQueueEntry(ctx, currentUser._id)
		if (existing?.status === 'waiting') {
			await ctx.db.patch(existing._id, {
				status: 'cancelled',
				matchId: undefined,
				updatedAt: Date.now(),
			})
		}
		return await queueStateForUser(ctx, currentUser)
	},
})

export const createDevFixture = mutationGeneric({
	args: { playerCount: v.number() },
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: { playerCount: number }) => {
		if (env.LADDER_DEV_FIXTURES !== 'true') {
			throw new Error('LADDER_DEV_FIXTURES_DISABLED')
		}
		const currentUser = await requireCurrentUser(ctx)
		const playerCount = Math.max(2, Math.min(MAX_ROSTER_SIZE, Math.floor(args.playerCount)))
		const players: CreateInitialStateInput['players'] = [{
			id: 'fixture-player-1',
			userId: currentUser._id,
			participantKind: 'human',
			name: currentUser.displayName ?? 'You',
		}]
		for (let index = 1; index < playerCount; index += 1) {
			const opponent = await ensureVirtualOpponent(
				ctx,
				`ladder-fixture-${index}`,
				['Hush Feather', 'Samuel Saber', 'Zippo Jay', 'Rosemund', 'The Kid'][index - 1],
				'ladder-fixture',
			)
			players.push({
				id: `fixture-player-${index + 1}`,
				virtualOpponentId: opponent._id,
				participantKind: 'virtual',
				name: opponent.displayName,
				initialLoadedSlots: [1, 3, 5],
			})
		}

		await ensureStatsRow(ctx, currentUser._id)
		const created = await createAuthoritativeMatch(ctx, players, 'dev')
		const roster = await buildRoster(ctx, created.matchId, currentUser._id)
		for (const player of roster) {
			if (!player.isSelf) {
				player.stats = {
					mmr: 1120 - player.seatIndex * 37,
					recent20AvgPlace: 2.2 + player.seatIndex * 0.3,
					recent20Count: 20,
					allTimeAvgPlace: 2.5 + player.seatIndex * 0.2,
					allTimeCount: 64 + player.seatIndex * 11,
				}
			}
		}
		return {
			status: 'matched',
			selfStats: statsView(await getStatsRow(ctx, currentUser._id)),
			matchId: created.matchId,
			roster,
			publicSnapshot: buildPublicSnapshot(created.state),
			privateDelta: buildPrivateDelta(created.state, players[0].id),
		}
	},
})
