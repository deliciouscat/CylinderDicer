import { internalMutationGeneric, mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { env } from './_generated/server'
import {
	averageNormalizedPlacement,
	type LadderPlacement,
} from '../shared/ladder/placement'
import {
	canFinalizeLadderQaRoster,
	LADDER_QA_FINALIZE_DELAY_MS,
	LADDER_QA_MAX_PLAYER_COUNT,
	nextLadderQaPlayerCount,
	nextLadderQaWaitingBotCount,
	shouldResumeReadyLadderMatch,
} from '../shared/ladder/qa'
import {
	decideLadderMatch,
	eligibleLadderCandidates,
	LADDER_MAX_WAIT_MS,
	LADDER_QUEUE_LEASE_MS,
} from '../shared/ladder/matchmaking'
import { buildPrivateDelta, buildPublicSnapshot } from './match/snapshots'
import {
	createInitialMatchState,
	DEFAULT_PLAYER_SKINS,
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
const MAX_ROSTER_SIZE = LADDER_QA_MAX_PLAYER_COUNT
const LADDER_QA_POOL_KEY = 'default'
const LADDER_QA_OPPONENT_NAMES = [
	'Hush Feather',
	'Samuel Saber',
	'Zippo Jay',
	'Calamity Kate',
	'The Kid',
] as const
const CHARACTER_KEYS = DEFAULT_PLAYER_SKINS

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

async function getQaOpponents(ctx: GenericCtx, queueEntryId: string) {
	return await ctx.db
		.query('ladderQaOpponents')
		.withIndex('by_queue_entry_and_seat_index', (q: any) => q.eq('queueEntryId', queueEntryId))
		.order('asc')
		.take(MAX_ROSTER_SIZE - 1)
}

async function deleteQaOpponents(ctx: GenericCtx, queueEntryId: string) {
	const rows = await getQaOpponents(ctx, queueEntryId)
	for (const row of rows) {
		await ctx.db.delete(row._id)
	}
}

async function getQaWaitingOpponents(ctx: GenericCtx) {
	return await ctx.db
		.query('ladderQaWaitingOpponents')
		.withIndex('by_pool_key_and_created_at', (q: any) => q.eq('poolKey', LADDER_QA_POOL_KEY))
		.order('asc')
		.take(MAX_ROSTER_SIZE - 1)
}

async function qaOpponentViews(ctx: GenericCtx, rows: any[]) {
	const opponents = []
	for (const row of rows) {
		const opponent = await ctx.db.get(row.virtualOpponentId)
		opponents.push({
			virtualOpponentId: row.virtualOpponentId,
			displayName: opponent?.displayName ?? `Opponent ${row.seatIndex}`,
			seatIndex: row.seatIndex,
		})
	}
	return opponents
}

export async function getLatestLadderQaSession(ctx: GenericCtx) {
	const active = await activeWaitingEntries(ctx, Date.now(), true)
	const entry = active[active.length - 1]
	if (!entry) {
		return null
	}
	const [user, opponents] = await Promise.all([
		ctx.db.get(entry.userId),
		getQaOpponents(ctx, entry._id),
	])
	if (!user) {
		return null
	}
	const pendingOpponents = await qaOpponentViews(ctx, opponents)
	return {
		queueEntryId: entry._id,
		userId: user._id,
		displayName: user.displayName ?? 'Ladder player',
		joinedAt: entry.joinedAt,
		pendingOpponents,
		playerCount: 1 + pendingOpponents.length,
		maxPlayerCount: MAX_ROSTER_SIZE,
	}
}

export async function getLadderQaAdminState(ctx: GenericCtx) {
	const session = await getLatestLadderQaSession(ctx)
	if (session) {
		return { ...session, status: 'player_joined' as const }
	}
	const waiting = await getQaWaitingOpponents(ctx)
	return {
		status: 'waiting_for_player' as const,
		queueEntryId: null,
		userId: null,
		displayName: null,
		joinedAt: null,
		pendingOpponents: await qaOpponentViews(ctx, waiting),
		playerCount: waiting.length,
		maxPlayerCount: MAX_ROSTER_SIZE,
	}
}

export async function stageLadderQaOpponent(ctx: GenericCtx, adminUserId: string) {
	const session = await getLatestLadderQaSession(ctx)
	if (!session) {
		const waiting = await getQaWaitingOpponents(ctx)
		const nextWaitingBotCount = nextLadderQaWaitingBotCount(waiting.length)
		if (nextWaitingBotCount === null) {
			return {
				ok: false as const,
				code: 'LADDER_QA_ROSTER_FULL',
				playerCount: waiting.length,
			}
		}
		const opponentIndex = waiting.length
		const opponent = await ensureVirtualOpponent(
			ctx,
			`ladder-fixture-${opponentIndex + 1}`,
			LADDER_QA_OPPONENT_NAMES[opponentIndex],
			'ladder-fixture',
		)
		await ctx.db.insert('ladderQaWaitingOpponents', {
			poolKey: LADDER_QA_POOL_KEY,
			virtualOpponentId: opponent._id,
			seatIndex: opponentIndex,
			addedByUserId: adminUserId,
			createdAt: Date.now(),
		})
		return {
			ok: true as const,
			waitingForPlayer: true,
			virtualOpponentId: opponent._id,
			opponentDisplayName: opponent.displayName,
			playerCount: nextWaitingBotCount,
			maxPlayerCount: MAX_ROSTER_SIZE,
		}
	}
	const nextPlayerCount = nextLadderQaPlayerCount(session.pendingOpponents.length)
	if (nextPlayerCount === null) {
		return {
			ok: false as const,
			code: 'LADDER_QA_ROSTER_FULL',
			queueEntryId: session.queueEntryId,
			playerCount: MAX_ROSTER_SIZE,
		}
	}

	const opponentIndex = session.pendingOpponents.length
	const opponent = await ensureVirtualOpponent(
		ctx,
		`ladder-fixture-${opponentIndex + 1}`,
		LADDER_QA_OPPONENT_NAMES[opponentIndex],
		'ladder-fixture',
	)
	const entry = await ctx.db.get(session.queueEntryId)
	if (!entry || entry.status !== 'waiting') {
		return { ok: false as const, code: 'LADDER_QA_SESSION_NOT_FOUND' }
	}
	const qaRevision = (entry.qaRevision ?? 0) + 1
	const now = Date.now()
	await ctx.db.insert('ladderQaOpponents', {
		queueEntryId: entry._id,
		virtualOpponentId: opponent._id,
		seatIndex: opponentIndex + 1,
		addedByUserId: adminUserId,
		createdAt: now,
	})
	await ctx.db.patch(entry._id, {
		qaRevision,
		qaPendingCount: opponentIndex + 1,
		updatedAt: now,
	})
	await ctx.scheduler!.runAfter(LADDER_QA_FINALIZE_DELAY_MS, internal.ladder.finalizeQaRoster, {
		queueEntryId: entry._id,
		expectedQaRevision: qaRevision,
	})
	return {
		ok: true as const,
		queueEntryId: entry._id,
		virtualOpponentId: opponent._id,
		opponentDisplayName: opponent.displayName,
		playerCount: nextPlayerCount,
		maxPlayerCount: MAX_ROSTER_SIZE,
		finalizeDelayMs: LADDER_QA_FINALIZE_DELAY_MS,
	}
}

async function claimQaWaitingOpponents(ctx: GenericCtx, entry: any, now: number) {
	const waiting = await getQaWaitingOpponents(ctx)
	if (waiting.length === 0) return 0
	for (const [index, row] of waiting.entries()) {
		await ctx.db.insert('ladderQaOpponents', {
			queueEntryId: entry._id,
			virtualOpponentId: row.virtualOpponentId,
			seatIndex: index + 1,
			addedByUserId: row.addedByUserId,
			createdAt: now,
		})
		await ctx.db.delete(row._id)
	}
	const qaRevision = (entry.qaRevision ?? 0) + 1
	await ctx.db.patch(entry._id, {
		qaRevision,
		qaPendingCount: waiting.length,
		updatedAt: now,
	})
	await ctx.scheduler!.runAfter(LADDER_QA_FINALIZE_DELAY_MS, internal.ladder.finalizeQaRoster, {
		queueEntryId: entry._id,
		expectedQaRevision: qaRevision,
	})
	return waiting.length
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

async function activeWaitingEntries(ctx: GenericCtx, now: number, includeQa = false) {
	const waiting = await ctx.db
		.query('ladderQueueEntries')
		.withIndex('by_status_and_last_seen_at', (q: any) => q
			.eq('status', 'waiting')
			.gte('lastSeenAt', now - LADDER_QUEUE_LEASE_MS))
		.order('desc')
		.take(24)
	const eligible = includeQa
		? waiting
		: waiting.filter((entry: any) => (entry.qaPendingCount ?? 0) === 0)
	eligible.sort((left: any, right: any) => left.joinedAt - right.joinedAt)
	return eligible
}

async function matchWaitingRoster(ctx: GenericCtx, now: number) {
	const waiting = await activeWaitingEntries(ctx, now)
	if (waiting.length < 2) {
		return null
	}
	const enriched = []
	for (const entry of waiting) {
		const stats = await getStatsRow(ctx, entry.userId)
		enriched.push({ entry, joinedAt: entry.joinedAt, mmr: stats?.mmr ?? DEFAULT_MMR })
	}
	const decision = decideLadderMatch(enriched, now)
	if (!decision.shouldStart) {
		return null
	}
	const eligible = eligibleLadderCandidates(enriched, now).slice(0, decision.playerCount)
	if (eligible.length < 2) {
		return null
	}

	const players = []
	for (const [seatIndex, candidate] of eligible.entries()) {
		const entry = candidate.entry
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
	const matchedAt = Date.now()
	for (const candidate of eligible) {
		const entry = candidate.entry
		await deleteQaOpponents(ctx, entry._id)
		await ctx.db.patch(entry._id, {
			status: 'matched',
			matchId: created.matchId,
			qaPendingCount: 0,
			updatedAt: matchedAt,
		})
	}
	return created.matchId
}

export const evaluateWaitingRoster = internalMutationGeneric({
	args: { queueEntryId: v.id('ladderQueueEntries') },
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: { queueEntryId: string }) => {
		const entry = await ctx.db.get(args.queueEntryId)
		if (!entry || entry.status !== 'waiting') {
			return { ok: true, matched: false }
		}
		const matchId = await matchWaitingRoster(ctx, Date.now())
		return { ok: true, matched: Boolean(matchId), matchId }
	},
})

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
		const now = Date.now()
		let queueEntryId: string
		if (existing?.status === 'matched' && existing.matchId) {
			const match = await ctx.db.get(existing.matchId)
			if (match?.status === 'ready' && shouldResumeReadyLadderMatch({
				mode: match.mode,
				ageMs: now - existing.updatedAt,
			})) {
				return await queueStateForUser(ctx, currentUser)
			}
		}

		if (existing) {
			queueEntryId = existing._id
			const shouldScheduleEvaluation = existing.status !== 'waiting'
			if (existing.status !== 'waiting') {
				await deleteQaOpponents(ctx, existing._id)
			}
			await ctx.db.patch(existing._id, {
				status: 'waiting',
				matchId: undefined,
				qaRevision: existing.status === 'waiting' ? existing.qaRevision : (existing.qaRevision ?? 0) + 1,
				qaPendingCount: existing.status === 'waiting' ? existing.qaPendingCount : 0,
				lastSeenAt: now,
				joinedAt: existing.status === 'waiting' ? existing.joinedAt : now,
				updatedAt: now,
			})
			if (shouldScheduleEvaluation) {
				await ctx.scheduler!.runAfter(LADDER_MAX_WAIT_MS, internal.ladder.evaluateWaitingRoster, {
					queueEntryId: existing._id,
				})
			}
		} else {
			queueEntryId = await ctx.db.insert('ladderQueueEntries', {
				userId: currentUser._id,
				status: 'waiting',
				qaRevision: 0,
				qaPendingCount: 0,
				lastSeenAt: now,
				joinedAt: now,
				updatedAt: now,
			})
			await ctx.scheduler!.runAfter(LADDER_MAX_WAIT_MS, internal.ladder.evaluateWaitingRoster, {
				queueEntryId,
			})
		}
		const activeEntry = await ctx.db.get(queueEntryId)
		const claimedQaOpponents = activeEntry
			? await claimQaWaitingOpponents(ctx, activeEntry, now)
			: 0
		if (claimedQaOpponents === 0) {
			await matchWaitingRoster(ctx, now)
		}
		return await queueStateForUser(ctx, currentUser)
	},
})

export const heartbeatQueue = mutationGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const currentUser = await requireCurrentUser(ctx)
		const existing = await getQueueEntry(ctx, currentUser._id)
		const now = Date.now()
		if (existing?.status === 'waiting') {
			await ctx.db.patch(existing._id, { lastSeenAt: now, updatedAt: now })
			await matchWaitingRoster(ctx, now)
		}
		return await queueStateForUser(ctx, currentUser)
	},
})

export const acknowledgeMatchHandoff = mutationGeneric({
	args: { matchId: v.id('matches') },
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: { matchId: string }) => {
		const currentUser = await requireCurrentUser(ctx)
		const existing = await getQueueEntry(ctx, currentUser._id)
		if (!existing || existing.status !== 'matched' || existing.matchId !== args.matchId) {
			return { ok: true, consumed: false }
		}
		await deleteQaOpponents(ctx, existing._id)
		await ctx.db.patch(existing._id, {
			status: 'cancelled',
			matchId: undefined,
			qaRevision: (existing.qaRevision ?? 0) + 1,
			qaPendingCount: 0,
			updatedAt: Date.now(),
		})
		return { ok: true, consumed: true }
	},
})

export const leaveQueue = mutationGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const currentUser = await requireCurrentUser(ctx)
		const existing = await getQueueEntry(ctx, currentUser._id)
		if (existing?.status === 'waiting') {
			await deleteQaOpponents(ctx, existing._id)
			await ctx.db.patch(existing._id, {
				status: 'cancelled',
				matchId: undefined,
				qaRevision: (existing.qaRevision ?? 0) + 1,
				qaPendingCount: 0,
				updatedAt: Date.now(),
			})
		}
		return await queueStateForUser(ctx, currentUser)
	},
})

export const finalizeQaRoster = internalMutationGeneric({
	args: {
		queueEntryId: v.id('ladderQueueEntries'),
		expectedQaRevision: v.number(),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: { queueEntryId: string; expectedQaRevision: number }) => {
		const entry = await ctx.db.get(args.queueEntryId)
		if (!entry || entry.status !== 'waiting' || entry.qaRevision !== args.expectedQaRevision) {
			return { ok: false, code: 'LADDER_QA_FINALIZE_STALE' }
		}
		const [user, opponents] = await Promise.all([
			ctx.db.get(entry.userId),
			getQaOpponents(ctx, entry._id),
		])
		if (!user || !canFinalizeLadderQaRoster({
			status: entry.status,
			qaRevision: entry.qaRevision,
			expectedQaRevision: args.expectedQaRevision,
			pendingOpponentCount: opponents.length,
		})) {
			return { ok: false, code: 'LADDER_QA_FINALIZE_EMPTY' }
		}
		const players: CreateInitialStateInput['players'] = [{
			id: 'qa-player-1',
			userId: user._id,
			participantKind: 'human',
			name: user.displayName ?? 'You',
		}]
		for (const row of opponents) {
			const opponent = await ctx.db.get(row.virtualOpponentId)
			if (!opponent) {
				continue
			}
			players.push({
				id: `qa-player-${players.length + 1}`,
				virtualOpponentId: opponent._id,
				participantKind: 'virtual',
				name: opponent.displayName,
				initialLoadedSlots: [1, 3, 5],
			})
		}
		if (players.length < 2) {
			return { ok: false, code: 'LADDER_QA_FINALIZE_EMPTY' }
		}

		const created = await createAuthoritativeMatch(ctx, players, 'dev')
		await deleteQaOpponents(ctx, entry._id)
		await ctx.db.patch(entry._id, {
			status: 'matched',
			matchId: created.matchId,
			qaPendingCount: 0,
			updatedAt: Date.now(),
		})
		return { ok: true, matchId: created.matchId, playerCount: players.length }
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
				LADDER_QA_OPPONENT_NAMES[index - 1],
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
