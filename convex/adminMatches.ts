/**
 * # 개요
 * dev match의 가상 상대를 admin 권한으로 조작하는 Convex 함수 모듈이다.
 * admin은 DB state를 직접 수정하지 않고 일반 match command reducer 경로로만 intent를 제출한다.
 *
 * # 의존성
 * - Clerk JWT custom claims: role/metadata에 admin 권한을 담는다.
 * - `convex/commands.ts`: reducer + write path를 공유하는 `applyMatchCommand`.
 * - `convex/matches.ts`: dev match 생성/조회 helper.
 * - `convex/schema.ts`: adminAudit, matches, matchParticipants.
 */
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import {
	applyMatchCommand,
	matchCommandTypeValidator,
	type ApplyMatchCommandInput,
} from './commands'
import { buildPrivateDelta, buildPublicSnapshot } from './match/snapshots'
import { getCustomGameRoomView } from './customGames'
import {
	createDevMatchForUser,
	getLatestMatchState,
	getMatchParticipantByPlayerId,
	writeStateAndPublicView,
} from './matches'
import { requireCurrentUser, requireExistingCurrentUser, type GenericCtx } from './users'
import type { MatchCommandType } from './protocol/commands'
import type { MatchState } from './match/state'

const DEFAULT_ADMIN_MATCH_LIMIT = 20
const MAX_ADMIN_MATCH_LIMIT = 50
const DEFAULT_PURGE_DELETE_LIMIT = 200
const MAX_PURGE_DELETE_LIMIT = 500
const MAX_AUDIT_PAYLOAD_JSON_LENGTH = 4096
const ADMIN_ROLES = new Set(['admin', 'org:admin', 'cylinderdicer_admin', 'cylinder_dicer_admin'])
const ROLE_KEYS = [
	'role',
	'roles',
	'permission',
	'permissions',
	'org_role',
	'organizationRole',
	'organization_role',
]
const METADATA_KEYS = [
	'metadata',
	'publicMetadata',
	'public_metadata',
	'privateMetadata',
	'private_metadata',
	'unsafeMetadata',
	'unsafe_metadata',
	'claims',
	'authorization',
]
const ADMIN_BOOLEAN_KEYS = ['admin', 'isAdmin', 'is_admin', 'cylinderdicerAdmin', 'cylinderdicer_admin']

type IdentityRecord = Record<string, unknown>

function toConvexValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isAdminRole(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.some(isAdminRole)
	}
	if (typeof value !== 'string') {
		return false
	}

	return value
		.split(/[,\s]+/)
		.map((role) => role.trim().toLowerCase())
		.some((role) => ADMIN_ROLES.has(role) || role.endsWith(':admin'))
}

function metadataHasAdmin(value: unknown, depth = 0): boolean {
	if (!isRecord(value) || depth > 2) {
		return false
	}

	for (const key of ADMIN_BOOLEAN_KEYS) {
		if (value[key] === true) {
			return true
		}
	}
	for (const key of ROLE_KEYS) {
		if (isAdminRole(value[key])) {
			return true
		}
	}
	for (const key of METADATA_KEYS) {
		if (metadataHasAdmin(value[key], depth + 1)) {
			return true
		}
	}
	return false
}

function identityHasAdmin(identity: IdentityRecord): boolean {
	return metadataHasAdmin(identity)
}

async function requireAdminIdentity(ctx: GenericCtx) {
	const identity = await ctx.auth.getUserIdentity()
	if (!identity) {
		throw new Error('UNAUTHENTICATED')
	}
	if (!identityHasAdmin(identity as unknown as IdentityRecord)) {
		throw new Error('UNAUTHORIZED')
	}
	return identity
}

async function requireAdminUser(ctx: GenericCtx) {
	await requireAdminIdentity(ctx)
	return await requireCurrentUser(ctx)
}

async function getAdminExistingUser(ctx: GenericCtx) {
	await requireAdminIdentity(ctx)
	return await requireExistingCurrentUser(ctx).catch(() => null)
}

function boundedLimit(limit: unknown): number {
	if (typeof limit !== 'number' || Number.isNaN(limit)) {
		return DEFAULT_ADMIN_MATCH_LIMIT
	}
	return Math.max(1, Math.min(Math.floor(limit), MAX_ADMIN_MATCH_LIMIT))
}

function boundedPurgeLimit(limit: unknown): number {
	if (typeof limit !== 'number' || Number.isNaN(limit)) {
		return DEFAULT_PURGE_DELETE_LIMIT
	}
	return Math.max(1, Math.min(Math.floor(limit), MAX_PURGE_DELETE_LIMIT))
}

function safeAuditPayload(value: unknown) {
	if (value === undefined) {
		return {}
	}
	try {
		const encoded = JSON.stringify(value)
		if (encoded.length <= MAX_AUDIT_PAYLOAD_JSON_LENGTH) {
			return value
		}
		return {
			omitted: 'payload_too_large',
			length: encoded.length,
		}
	} catch (error) {
		return {
			omitted: 'payload_not_serializable',
		}
	}
}

async function deleteDocs(ctx: GenericCtx, rows: any[], dryRun: boolean) {
	if (!dryRun) {
		for (const row of rows) {
			await ctx.db.delete(row._id)
		}
	}
	return rows.length
}

async function getLinkedCustomGameRooms(ctx: GenericCtx, matchId: string) {
	return await ctx.db
		.query('customGameRooms')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.take(8)
}

async function hasRemainingMatchRows(ctx: GenericCtx, matchId: string) {
	const participant = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.first()
	if (participant) {
		return true
	}
	const state = await ctx.db
		.query('matchStates')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.first()
	if (state) {
		return true
	}
	const snapshot = await ctx.db
		.query('matchSnapshots')
		.withIndex('by_match_kind', (q: any) => q.eq('matchId', matchId))
		.first()
	if (snapshot) {
		return true
	}
	const command = await ctx.db
		.query('matchCommands')
		.withIndex('by_match_command', (q: any) => q.eq('matchId', matchId))
		.first()
	if (command) {
		return true
	}
	const event = await ctx.db
		.query('matchEvents')
		.withIndex('by_match_revision', (q: any) => q.eq('matchId', matchId))
		.first()
	return Boolean(event)
}

async function hasRemainingRoomParticipants(ctx: GenericCtx, roomId: string) {
	const participant = await ctx.db
		.query('customGameParticipants')
		.withIndex('by_room', (q: any) => q.eq('roomId', roomId))
		.first()
	return Boolean(participant)
}

async function markMatchParticipantsComplete(ctx: GenericCtx, matchId: string, now: number) {
	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.take(8)
	let updated = 0
	for (const participant of participants) {
		if (participant.status !== 'complete') {
			updated += 1
			await ctx.db.patch(participant._id, {
				status: 'complete',
				updatedAt: now,
			})
		}
	}
	return {
		total: participants.length,
		updated,
	}
}

async function completeLatestMatchState(ctx: GenericCtx, state: MatchState, now: number) {
	const nextRevision = state.revision + 1
	const nextState: MatchState = {
		...state,
		revision: nextRevision,
		match: {
			...state.match,
			status: 'complete',
		},
		flow: {
			...state.flow,
			phase: 'complete',
		},
		turn: {
			...state.turn,
			kind: 'complete',
			activePlayerId: undefined,
		},
		pendingLoad: undefined,
		ui: {
			...state.ui,
			hintKey: 'hud.hint.complete',
		},
	}
	await writeStateAndPublicView(ctx, nextState)
	await ctx.db.patch(state.matchId, {
		status: 'complete',
		revision: nextRevision,
		updatedAt: now,
	})
	return nextState
}

function isTerminalMatchState(state: MatchState) {
	return state.match.status === 'complete' &&
		state.flow.phase === 'complete' &&
		state.turn.kind === 'complete'
}

async function deletePublicMatchSnapshots(ctx: GenericCtx, matchId: string) {
	const snapshots = await ctx.db
		.query('matchSnapshots')
		.withIndex('by_match_kind', (q: any) => q.eq('matchId', matchId).eq('kind', 'public'))
		.collect()
	for (const snapshot of snapshots) {
		await ctx.db.delete(snapshot._id)
	}
	return snapshots.length
}

async function requireDevMatch(ctx: GenericCtx, matchId: string) {
	const match = await ctx.db.get(matchId)
	if (!match) {
		return {
			ok: false as const,
			code: 'MATCH_NOT_FOUND',
			message: 'match_not_found',
		}
	}
	if (match.mode !== 'dev') {
		return {
			ok: false as const,
			match,
			code: 'ADMIN_MATCH_MODE_FORBIDDEN',
			message: 'admin_match_mode_forbidden',
		}
	}
	return {
		ok: true as const,
		match,
	}
}

async function listParticipants(ctx: GenericCtx, matchId: string) {
	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.take(8)
	const rows = []
	for (const participant of participants) {
		const user = participant.userId ? await ctx.db.get(participant.userId) : null
		const virtualOpponent = participant.virtualOpponentId
			? await ctx.db.get(participant.virtualOpponentId)
			: null
		rows.push({
			...participant,
			displayName: user?.displayName ?? virtualOpponent?.displayName,
			clerkId: user?.clerkId,
			virtualOpponentKey: virtualOpponent?.key,
			archetype: virtualOpponent?.archetype,
			isBot: participant.participantKind === 'virtual' || Boolean(participant.virtualOpponentId),
		})
	}
	return rows
}

async function getPublicSnapshot(ctx: GenericCtx, matchId: string, state: MatchState | null) {
	const row = await ctx.db
		.query('matchSnapshots')
		.withIndex('by_match_kind', (q: any) => q.eq('matchId', matchId).eq('kind', 'public'))
		.first()
	return row?.snapshot ?? (state ? buildPublicSnapshot(state) : null)
}

function buildPlayerDeltas(state: MatchState) {
	const deltas: Record<string, unknown> = {}
	for (const playerId of state.players.order) {
		deltas[playerId] = buildPrivateDelta(state, playerId)
	}
	return deltas
}

async function insertAdminAudit(
	ctx: GenericCtx,
	input: {
			adminUserId: string
			matchId?: string
			customGameRoomId?: string
			targetUserId?: string
			targetVirtualOpponentId?: string
			targetPlayerId?: string
		commandId?: string
		commandType?: string
		payload?: unknown
		result: Record<string, any>
	},
) {
	return await ctx.db.insert(
		'adminAudit',
		toConvexValue({
				adminUserId: input.adminUserId,
				matchId: input.matchId,
				customGameRoomId: input.customGameRoomId,
				targetUserId: input.targetUserId,
				targetVirtualOpponentId: input.targetVirtualOpponentId,
				targetPlayerId: input.targetPlayerId,
			commandId: input.commandId,
			commandType: input.commandType,
			payload: safeAuditPayload(input.payload),
			resultOk: input.result.ok === true,
			resultCode: input.result.code,
			resultRevision: input.result.revision,
			createdAt: Date.now(),
		}),
	)
}

export const createDevMatchWithBots = mutationGeneric({
	args: {
		localPlayerName: v.optional(v.string()),
		firstPlayerId: v.optional(v.string()),
		requiresSetupLoad: v.optional(v.boolean()),
		reuseActive: v.optional(v.boolean()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const adminUser = await requireAdminUser(ctx)
		return await createDevMatchForUser(ctx, adminUser, {
			localPlayerName: args.localPlayerName ?? 'Admin',
			firstPlayerId: args.firstPlayerId,
			requiresSetupLoad: args.requiresSetupLoad,
			reuseActive: args.reuseActive ?? true,
		})
	},
})

export const listAdminCustomGameRooms = queryGeneric({
	args: {
		status: v.optional(v.union(v.literal('composing'), v.literal('started'), v.literal('completed'), v.literal('cancelled'))),
		limit: v.optional(v.number()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		await requireAdminIdentity(ctx)
		const rooms = await ctx.db
			.query('customGameRooms')
			.withIndex('by_status_updated', (q: any) => q.eq('status', args.status ?? 'composing'))
			.order('desc')
			.take(boundedLimit(args.limit))
		const rows = []
		for (const room of rooms) {
			const host = await ctx.db.get(room.hostUserId)
			const view = await getCustomGameRoomView(ctx, room._id)
			rows.push({
				...view,
				host: host
					? {
							userId: host._id,
							displayName: host.displayName,
							clerkId: host.clerkId,
						}
					: null,
			})
		}
		return rows
	},
})

export const getAdminCustomGameRoom = queryGeneric({
	args: {
		roomId: v.id('customGameRooms'),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		await requireAdminIdentity(ctx)
		const view = await getCustomGameRoomView(ctx, args.roomId)
		if (!view) {
			return {
				ok: false,
				roomId: args.roomId,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
		}
		const host = await ctx.db.get(view.room.hostUserId)
		return {
			...view,
			host: host
				? {
						userId: host._id,
						displayName: host.displayName,
						clerkId: host.clerkId,
					}
				: null,
		}
	},
})

export const setCustomGameOpponentReady = mutationGeneric({
	args: {
		roomId: v.id('customGameRooms'),
		targetPlayerId: v.string(),
		ready: v.boolean(),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const adminUser = await requireAdminUser(ctx)
		const room = await ctx.db.get(args.roomId)
		if (!room || room.status !== 'composing') {
			const result = {
				ok: false,
				roomId: args.roomId,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				customGameRoomId: args.roomId,
				targetPlayerId: args.targetPlayerId,
				commandType: 'custom_game.ready',
				payload: { ready: args.ready },
				result,
			})
			return result
		}

		const participant = await ctx.db
			.query('customGameParticipants')
			.withIndex('by_room_player', (q: any) => q.eq('roomId', args.roomId).eq('playerId', args.targetPlayerId))
			.first()
		if (!participant || participant.status !== 'active') {
			const result = {
				ok: false,
				roomId: args.roomId,
				code: 'TARGET_PLAYER_NOT_FOUND',
				message: 'target_player_not_found',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				customGameRoomId: args.roomId,
				targetPlayerId: args.targetPlayerId,
				commandType: 'custom_game.ready',
				payload: { ready: args.ready },
				result,
			})
			return result
		}
		if (!participant.virtualOpponentId) {
			const result = {
				ok: false,
				roomId: args.roomId,
				code: 'TARGET_NOT_VIRTUAL_OPPONENT',
				message: 'target_not_virtual_opponent',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				customGameRoomId: args.roomId,
				targetUserId: participant.userId,
				targetPlayerId: args.targetPlayerId,
				commandType: 'custom_game.ready',
				payload: { ready: args.ready },
				result,
			})
			return result
		}

		await ctx.db.patch(participant._id, {
			ready: args.ready,
			updatedAt: Date.now(),
		})
		const view = await getCustomGameRoomView(ctx, args.roomId)
		const result = {
			ok: true,
			roomId: args.roomId,
			targetPlayerId: args.targetPlayerId,
			ready: args.ready,
			allReady: view?.allReady ?? false,
		}
		const auditId = await insertAdminAudit(ctx, {
			adminUserId: adminUser._id,
			customGameRoomId: args.roomId,
			targetVirtualOpponentId: participant.virtualOpponentId,
			targetPlayerId: args.targetPlayerId,
			commandType: 'custom_game.ready',
			payload: { ready: args.ready },
			result,
		})
		return {
			...result,
			auditId,
			room: view,
		}
	},
})

export const closeStartedCustomGameRoom = mutationGeneric({
	args: {
		roomId: v.id('customGameRooms'),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const adminUser = await requireAdminUser(ctx)
		const room = await ctx.db.get(args.roomId)
		if (!room) {
			const result = {
				ok: false,
				roomId: args.roomId,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				customGameRoomId: args.roomId,
				commandType: 'admin.close_started_custom_game_room',
				result,
			})
			return result
		}
		if (room.status !== 'started') {
			const result = {
				ok: false,
				roomId: args.roomId,
				matchId: room.matchId,
				code: 'CUSTOM_ROOM_NOT_STARTED',
				message: 'custom_room_not_started',
				status: room.status,
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: room.matchId,
				customGameRoomId: args.roomId,
				commandType: 'admin.close_started_custom_game_room',
				payload: { status: room.status },
				result,
			})
			return result
		}
		if (!room.matchId) {
			const result = {
				ok: false,
				roomId: args.roomId,
				code: 'CUSTOM_ROOM_MATCH_NOT_FOUND',
				message: 'custom_room_match_not_found',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				customGameRoomId: args.roomId,
				commandType: 'admin.close_started_custom_game_room',
				result,
			})
			return result
		}

		const match = await ctx.db.get(room.matchId)
		if (!match || match.mode !== 'dev') {
			const result = {
				ok: false,
				roomId: args.roomId,
				matchId: room.matchId,
				code: 'LINKED_MATCH_NOT_CLOSABLE',
				message: 'linked_match_not_closable',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: room.matchId,
				customGameRoomId: args.roomId,
				commandType: 'admin.close_started_custom_game_room',
				result,
			})
			return result
		}

		const now = Date.now()
		let nextRevision = match.revision
		let snapshotsDeleted = 0
		const state = await getLatestMatchState(ctx, room.matchId)
		if (state && !isTerminalMatchState(state)) {
			const nextState = await completeLatestMatchState(ctx, state, now)
			nextRevision = nextState.revision
		} else if (state) {
			nextRevision = state.revision
			await ctx.db.patch(room.matchId, {
				status: 'complete',
				revision: state.revision,
				updatedAt: now,
			})
		} else {
			snapshotsDeleted = await deletePublicMatchSnapshots(ctx, room.matchId)
			await ctx.db.patch(room.matchId, {
				status: 'complete',
				updatedAt: now,
			})
		}
		const participantsCompleted = await markMatchParticipantsComplete(ctx, room.matchId, now)
		await ctx.db.patch(args.roomId, {
			status: 'completed',
			updatedAt: now,
		})

		const result = {
			ok: true,
			roomId: args.roomId,
			matchId: room.matchId,
			revision: nextRevision,
			snapshotsDeleted,
			participantsCompleted,
		}
		const auditId = await insertAdminAudit(ctx, {
			adminUserId: adminUser._id,
			matchId: room.matchId,
			customGameRoomId: args.roomId,
			commandType: 'admin.close_started_custom_game_room',
			result,
		})
		return {
			...result,
			auditId,
		}
	},
})

export const listAdminDevMatches = queryGeneric({
	args: {
		status: v.optional(v.union(v.literal('ready'), v.literal('complete'))),
		limit: v.optional(v.number()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		await requireAdminIdentity(ctx)
		const matches = await ctx.db
			.query('matches')
			.withIndex('by_mode_status', (q: any) => q.eq('mode', 'dev').eq('status', args.status ?? 'ready'))
			.order('desc')
			.take(boundedLimit(args.limit))

		const rows = []
		for (const match of matches) {
			const state = await getLatestMatchState(ctx, match._id)
			const participants = await listParticipants(ctx, match._id)
			const host = match.hostUserId ? await ctx.db.get(match.hostUserId) : null
			rows.push({
				match,
				publicSnapshot: await getPublicSnapshot(ctx, match._id, state),
				host: host
					? {
							userId: host._id,
							displayName: host.displayName,
							clerkId: host.clerkId,
						}
					: null,
				participants,
			})
		}
		return rows
	},
})

export const getAdminMatchState = queryGeneric({
	args: {
		matchId: v.id('matches'),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		await requireAdminIdentity(ctx)
		const matchResult = await requireDevMatch(ctx, args.matchId)
		if (!matchResult.ok) {
			return matchResult
		}

		const state = await getLatestMatchState(ctx, args.matchId)
		if (!state) {
			return {
				ok: false,
				matchId: args.matchId,
				code: 'MATCH_STATE_NOT_FOUND',
				message: 'match_state_not_found',
			}
		}

		return {
			ok: true,
			match: matchResult.match,
			state,
			publicSnapshot: await getPublicSnapshot(ctx, args.matchId, state),
			playerDeltas: buildPlayerDeltas(state),
			participants: await listParticipants(ctx, args.matchId),
		}
	},
})

export const submitOpponentCommand = mutationGeneric({
	args: {
		matchId: v.id('matches'),
		targetPlayerId: v.string(),
		commandId: v.string(),
		revision: v.number(),
		type: matchCommandTypeValidator,
		payload: v.optional(v.any()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const adminUser = await requireAdminUser(ctx)
		const matchResult = await requireDevMatch(ctx, args.matchId)
		if (!matchResult.ok) {
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: args.matchId,
				targetPlayerId: args.targetPlayerId,
				commandId: args.commandId,
				commandType: args.type,
				payload: args.payload,
				result: matchResult,
			})
			return matchResult
		}

		const participant = await getMatchParticipantByPlayerId(ctx, args.matchId, args.targetPlayerId)
		if (!participant) {
			const result = {
				ok: false,
				matchId: args.matchId,
				code: 'TARGET_PLAYER_NOT_FOUND',
				message: 'target_player_not_found',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: args.matchId,
				targetPlayerId: args.targetPlayerId,
				commandId: args.commandId,
				commandType: args.type,
				payload: args.payload,
				result,
			})
			return result
		}

		if (!participant.virtualOpponentId) {
			const result = {
				ok: false,
				matchId: args.matchId,
				code: 'TARGET_NOT_VIRTUAL_OPPONENT',
				message: 'target_not_virtual_opponent',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: args.matchId,
				targetUserId: participant.userId,
				targetVirtualOpponentId: participant.virtualOpponentId,
				targetPlayerId: args.targetPlayerId,
				commandId: args.commandId,
				commandType: args.type,
				payload: args.payload,
				result,
			})
			return result
		}

		const input: ApplyMatchCommandInput = {
			matchId: args.matchId,
			commandId: args.commandId,
			revision: args.revision,
			type: args.type as MatchCommandType,
			payload: args.payload,
			actorVirtualOpponentId: participant.virtualOpponentId,
			actorPlayerId: participant.playerId,
			submittedByUserId: adminUser._id,
			source: 'admin',
			stalePrivateDeltaPlayerId: participant.playerId,
		}
		const result = await applyMatchCommand(ctx, input)
		const auditId = await insertAdminAudit(ctx, {
			adminUserId: adminUser._id,
			matchId: args.matchId,
			targetUserId: participant.userId,
			targetVirtualOpponentId: participant.virtualOpponentId,
			targetPlayerId: participant.playerId,
			commandId: args.commandId,
			commandType: args.type,
			payload: args.payload,
			result,
		})

		return {
			...result,
			auditId,
		}
	},
})

export const purgeCompletedDevMatchData = mutationGeneric({
	args: {
		matchId: v.id('matches'),
		maxDelete: v.optional(v.number()),
		dryRun: v.optional(v.boolean()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const adminUser = await requireAdminUser(ctx)
		const maxDelete = boundedPurgeLimit(args.maxDelete)
		const dryRun = args.dryRun === true
		const match = await ctx.db.get(args.matchId)
		if (!match) {
			const result = {
				ok: false,
				matchId: args.matchId,
				code: 'MATCH_NOT_FOUND',
				message: 'match_not_found',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: args.matchId,
				commandType: 'admin.purge_completed_dev_match_data',
				payload: { dryRun, maxDelete },
				result,
			})
			return result
		}
		if (match.mode !== 'dev') {
			const result = {
				ok: false,
				matchId: args.matchId,
				code: 'MATCH_MODE_FORBIDDEN',
				message: 'match_mode_forbidden',
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: args.matchId,
				commandType: 'admin.purge_completed_dev_match_data',
				payload: { dryRun, maxDelete, mode: match.mode },
				result,
			})
			return result
		}
		if (match.status !== 'complete') {
			const result = {
				ok: false,
				matchId: args.matchId,
				code: 'MATCH_NOT_COMPLETE',
				message: 'match_not_complete',
				status: match.status,
			}
			await insertAdminAudit(ctx, {
				adminUserId: adminUser._id,
				matchId: args.matchId,
				commandType: 'admin.purge_completed_dev_match_data',
				payload: { dryRun, maxDelete, status: match.status },
				result,
			})
			return result
		}

		const rooms = await getLinkedCustomGameRooms(ctx, args.matchId)
		let roomsCompleted = 0
		if (!dryRun) {
			const now = Date.now()
			for (const room of rooms) {
				if (room.status === 'started') {
					roomsCompleted += 1
					await ctx.db.patch(room._id, {
						status: 'completed',
						updatedAt: now,
					})
				}
			}
		}

		const roomParticipantRows = []
		for (const room of rooms) {
			const participants = await ctx.db
				.query('customGameParticipants')
				.withIndex('by_room', (q: any) => q.eq('roomId', room._id))
				.take(maxDelete)
			roomParticipantRows.push(...participants)
		}
		const participantRows = await ctx.db
			.query('matchParticipants')
			.withIndex('by_match', (q: any) => q.eq('matchId', args.matchId))
			.take(maxDelete)
		const stateRows = await ctx.db
			.query('matchStates')
			.withIndex('by_match', (q: any) => q.eq('matchId', args.matchId))
			.take(maxDelete)
		const snapshotRows = await ctx.db
			.query('matchSnapshots')
			.withIndex('by_match_kind', (q: any) => q.eq('matchId', args.matchId))
			.take(maxDelete)
		const commandRows = await ctx.db
			.query('matchCommands')
			.withIndex('by_match_command', (q: any) => q.eq('matchId', args.matchId))
			.take(maxDelete)
		const eventRows = await ctx.db
			.query('matchEvents')
			.withIndex('by_match_revision', (q: any) => q.eq('matchId', args.matchId))
			.take(maxDelete)

		const deleted = {
			customGameParticipants: await deleteDocs(ctx, roomParticipantRows, dryRun),
			matchParticipants: await deleteDocs(ctx, participantRows, dryRun),
			matchStates: await deleteDocs(ctx, stateRows, dryRun),
			matchSnapshots: await deleteDocs(ctx, snapshotRows, dryRun),
			matchCommands: await deleteDocs(ctx, commandRows, dryRun),
			matchEvents: await deleteDocs(ctx, eventRows, dryRun),
		}

		const parentDeleted = {
			customGameRooms: 0,
			match: false,
		}
		const deletedRoomIds = []
		if (!dryRun) {
			for (const room of rooms) {
				if (!(await hasRemainingRoomParticipants(ctx, room._id))) {
					await ctx.db.delete(room._id)
					parentDeleted.customGameRooms += 1
					deletedRoomIds.push(room._id)
				}
			}
			const remainingRooms = await getLinkedCustomGameRooms(ctx, args.matchId)
			if (remainingRooms.length === 0 && !(await hasRemainingMatchRows(ctx, args.matchId))) {
				await ctx.db.delete(args.matchId)
				parentDeleted.match = true
			}
		}

		const reachedDeleteLimit = Object.values(deleted).some((count) => count >= maxDelete)
		const hasRemainingChildren = dryRun ? reachedDeleteLimit : await hasRemainingMatchRows(ctx, args.matchId)
		const result = {
			ok: true,
			matchId: args.matchId,
			dryRun,
			maxDelete,
			deleted,
			parentDeleted,
			deletedRoomIds,
			roomsCompleted,
			mayHaveMore: reachedDeleteLimit || hasRemainingChildren,
			auditRetained: true,
		}
		const auditId = await insertAdminAudit(ctx, {
			adminUserId: adminUser._id,
			matchId: args.matchId,
			commandType: 'admin.purge_completed_dev_match_data',
			payload: { dryRun, maxDelete },
			result,
		})
		return {
			...result,
			auditId,
		}
	},
})

export const probeAdminAccess = queryGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const identity = await ctx.auth.getUserIdentity()
		if (!identity) {
			return {
				ok: false,
				authorized: false,
				code: 'UNAUTHENTICATED',
				message: 'sign_in_required',
			}
		}
		if (!identityHasAdmin(identity as unknown as IdentityRecord)) {
			return {
				ok: false,
				authorized: false,
				code: 'UNAUTHORIZED',
				message: 'admin_claim_missing',
				hint: 'Add {"role":"admin"} to the Clerk JWT template named "convex", then sign out and sign in again.',
				templateExample: { role: 'admin' },
			}
		}

		let user: any
		try {
			user = await requireExistingCurrentUser(ctx)
		} catch {
			user = null
		}

		return {
			ok: true,
			authorized: true,
			code: 'AUTHORIZED',
			clerkSubject: identity.subject,
			userId: user?._id,
		}
	},
})

export const listRecentAdminAudit = queryGeneric({
	args: {
		limit: v.optional(v.number()),
		matchId: v.optional(v.id('matches')),
		customGameRoomId: v.optional(v.id('customGameRooms')),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const adminUser = await getAdminExistingUser(ctx)
		const limit = boundedLimit(args.limit)

		if (args.matchId) {
			return await ctx.db
				.query('adminAudit')
				.withIndex('by_match_created', (q: any) => q.eq('matchId', args.matchId))
				.order('desc')
				.take(limit)
		}

		if (!adminUser) {
			return []
		}

		const rows = await ctx.db
			.query('adminAudit')
			.withIndex('by_admin_created', (q: any) => q.eq('adminUserId', adminUser._id))
			.order('desc')
			.take(args.customGameRoomId ? limit * 4 : limit)

		if (args.customGameRoomId) {
			return rows
				.filter((row: any) => row.customGameRoomId === args.customGameRoomId)
				.slice(0, limit)
		}

		return rows
	},
})
