/**
 * # 개요
 * Custom Game의 시작 전 room composition과 ready 상태를 Convex에 저장한다.
 * 이 단계의 room은 match가 아니며, 모든 virtual opponent가 ready가 된 뒤 match를 생성한다.
 */
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import { createCustomMatchFromRoomParticipants } from './matches'
import {
	ensureDefaultVirtualOpponents,
	getVirtualOpponentByKey,
} from './virtualOpponents'
import {
	requireCurrentUser,
	requireExistingCurrentUser,
	type GenericCtx,
} from './users'

const MAX_CUSTOM_OPPONENTS = 5
const MAX_ROOM_PARTICIPANTS = 6
const DEFAULT_CUSTOM_OPPONENT_KEYS = ['opponent-1', 'opponent-2', 'opponent-3']

function toConvexValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function inviteCodeFor(userId: string, now: number, attempt = 0) {
	const suffix = Math.floor(Math.random() * 1679616)
		.toString(36)
		.padStart(4, '0')
		.slice(-4)
	return `${String(userId).slice(-2)}${String(now + attempt).slice(-2)}${suffix}`.toLowerCase()
}

async function createInviteCode(ctx: GenericCtx, userId: string, now: number) {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const inviteCode = inviteCodeFor(userId, now, attempt)
		const existing = await ctx.db
			.query('customGameRooms')
			.withIndex('by_invite_code', (q: any) => q.eq('inviteCode', inviteCode))
			.first()
		if (!existing) {
			return inviteCode
		}
	}
	throw new Error('INVITE_CODE_EXHAUSTED')
}

async function getRoomForHostByStatus(
	ctx: GenericCtx,
	hostUserId: string,
	status: 'composing' | 'started',
) {
	return await ctx.db
		.query('customGameRooms')
		.withIndex('by_host_status', (q: any) => q.eq('hostUserId', hostUserId).eq('status', status))
		.order('desc')
		.first()
}

async function getActiveRoomForHost(ctx: GenericCtx, hostUserId: string) {
	return await getRoomForHostByStatus(ctx, hostUserId, 'composing')
}

async function findRoomForUser(ctx: GenericCtx, userId: string) {
	const candidates = []
	const startedAsHost = await getRoomForHostByStatus(ctx, userId, 'started')
	const composingAsHost = await getRoomForHostByStatus(ctx, userId, 'composing')
	if (startedAsHost) candidates.push(startedAsHost)
	if (composingAsHost) candidates.push(composingAsHost)

	const memberships = await ctx.db
		.query('customGameParticipants')
		.withIndex('by_user_status', (q: any) => q.eq('userId', userId).eq('status', 'active'))
		.take(8)

	const seenRoomIds = new Set(candidates.map((room: any) => String(room._id)))
	for (const row of memberships) {
		const room = await ctx.db.get(row.roomId)
		if (!room || seenRoomIds.has(String(room._id))) {
			continue
		}
		if (room.status === 'started' || room.status === 'composing') {
			candidates.push(room)
			seenRoomIds.add(String(room._id))
		}
	}

	candidates.sort((left: any, right: any) => {
		if (left.status !== right.status) {
			return left.status === 'started' ? -1 : 1
		}
		return right.updatedAt - left.updatedAt
	})
	return candidates[0] ?? null
}

async function getHumanParticipantForUser(ctx: GenericCtx, roomId: string, userId: string) {
	const participants = await activeRoomParticipants(ctx, roomId)
	return participants.find((participant: any) => participant.userId === userId) ?? null
}

async function activeRoomParticipants(ctx: GenericCtx, roomId: string) {
	const participants = await ctx.db
		.query('customGameParticipants')
		.withIndex('by_room', (q: any) => q.eq('roomId', roomId))
		.take(8)
	return participants.filter((participant: any) => participant.status === 'active')
}

export async function getCustomGameRoomView(ctx: GenericCtx, roomId: string, viewerUserId?: string) {
	const room = await ctx.db.get(roomId)
	if (!room) {
		return null
	}
	const participants = await activeRoomParticipants(ctx, roomId)
	const virtualParticipants = participants.filter((participant: any) => participant.participantKind === 'virtual')
	const guestHumans = participants.filter(
		(participant: any) => participant.participantKind === 'human' && participant.playerId !== 'local-player',
	)
	const viewerParticipant = viewerUserId
		? participants.find((participant: any) => participant.userId === viewerUserId)
		: undefined
	return {
		ok: true,
		room,
		participants,
		allReady:
			virtualParticipants.length > 0 &&
			virtualParticipants.every((participant: any) => participant.ready) &&
			guestHumans.every((participant: any) => participant.ready),
		viewer: viewerParticipant && viewerUserId
			? {
					userId: viewerUserId,
					isHost: room.hostUserId === viewerUserId,
					playerId: viewerParticipant.playerId,
					ready: viewerParticipant.ready,
				}
			: null,
	}
}

export async function completeLinkedCustomGameRoom(ctx: GenericCtx, matchId: string, now = Date.now()) {
	const rooms = await ctx.db
		.query('customGameRooms')
		.withIndex('by_match', (q: any) => q.eq('matchId', matchId))
		.take(8)
	let updated = 0
	const roomIds = []
	for (const room of rooms) {
		roomIds.push(room._id)
		if (room.status === 'started') {
			updated += 1
			await ctx.db.patch(room._id, {
				status: 'completed',
				updatedAt: now,
			})
		}
	}
	return {
		updated,
		roomIds,
	}
}

async function ensureRoom(ctx: GenericCtx, hostUser: any) {
	const existing = await getActiveRoomForHost(ctx, hostUser._id)
	if (existing) {
		return existing
	}

	const now = Date.now()
	const roomId = await ctx.db.insert('customGameRooms', {
		hostUserId: hostUser._id,
		status: 'composing',
		inviteCode: await createInviteCode(ctx, hostUser._id, now),
		createdAt: now,
		updatedAt: now,
	})
	return await ctx.db.get(roomId)
}

async function upsertRoomParticipants(
	ctx: GenericCtx,
	room: any,
	hostUser: any,
	virtualOpponentKeys: string[] | undefined,
) {
	const now = Date.now()
	const requestedKeys = Array.from(new Set(virtualOpponentKeys ?? DEFAULT_CUSTOM_OPPONENT_KEYS))
		.slice(0, MAX_CUSTOM_OPPONENTS)
	await ensureDefaultVirtualOpponents(ctx)

	const existingRows = await ctx.db
		.query('customGameParticipants')
		.withIndex('by_room', (q: any) => q.eq('roomId', room._id))
		.take(16)
	const existingByVirtualId = new Map<string, any>()
	let existingHost: any
	const activeHumanRows = existingRows.filter((row: any) => {
		return row.status === 'active' && row.participantKind === 'human'
	})
	const availableVirtualSeats = Math.max(0, MAX_ROOM_PARTICIPANTS - Math.max(1, activeHumanRows.length))
	if (requestedKeys.length > availableVirtualSeats) {
		return {
			ok: false as const,
			code: 'CUSTOM_ROOM_FULL',
			message: 'custom_room_full',
			details: {
				maxParticipants: MAX_ROOM_PARTICIPANTS,
				activeHumans: Math.max(1, activeHumanRows.length),
				maxVirtualOpponents: availableVirtualSeats,
			},
		}
	}
	for (const row of existingRows) {
		if (
			row.participantKind === 'human' &&
			row.status === 'active' &&
			(row.userId === hostUser._id || row.playerId === 'local-player')
		) {
			existingHost = row
		}
		if (row.virtualOpponentId) {
			existingByVirtualId.set(row.virtualOpponentId, row)
		}
	}

	const hostValue = toConvexValue({
		roomId: room._id,
		userId: hostUser._id,
		participantKind: 'human',
		playerId: 'local-player',
		displayName: hostUser.displayName ?? 'You',
		ready: true,
		seatIndex: 0,
		status: 'active',
		updatedAt: now,
	})
	if (existingHost) {
		await ctx.db.patch(existingHost._id, hostValue)
	} else {
		await ctx.db.insert('customGameParticipants', hostValue)
	}

	const activeVirtualIds = new Set<string>()
	for (const [index, key] of requestedKeys.entries()) {
		const opponent = await getVirtualOpponentByKey(ctx, key)
		if (!opponent) {
			return {
				ok: false as const,
				code: 'VIRTUAL_OPPONENT_NOT_FOUND',
				message: 'virtual_opponent_not_found',
				key,
			}
		}
		activeVirtualIds.add(opponent._id)
		const existing = existingByVirtualId.get(opponent._id)
		const value = toConvexValue({
			roomId: room._id,
			virtualOpponentId: opponent._id,
			participantKind: 'virtual',
			playerId: `opponent-${index + 1}`,
			displayName: opponent.displayName,
			archetype: opponent.archetype,
			ready: existing?.status === 'active' ? existing.ready === true : false,
			seatIndex: index + 1,
			status: 'active',
			updatedAt: now,
		})
		if (existing) {
			await ctx.db.patch(existing._id, value)
		} else {
			await ctx.db.insert('customGameParticipants', value)
		}
	}

	for (const row of existingRows) {
		if (row.participantKind === 'virtual' && row.virtualOpponentId && !activeVirtualIds.has(row.virtualOpponentId)) {
			await ctx.db.patch(row._id, {
				status: 'removed',
				ready: false,
				updatedAt: now,
			})
		}
	}

	await ctx.db.patch(room._id, {
		updatedAt: now,
	})
	return { ok: true as const }
}

export const ensureMyCustomGameRoom = mutationGeneric({
	args: {
		virtualOpponentKeys: v.optional(v.array(v.string())),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const hostUser = await requireCurrentUser(ctx)
		const room = await ensureRoom(ctx, hostUser)
		const update = await upsertRoomParticipants(ctx, room, hostUser, args.virtualOpponentKeys)
		if (!update.ok) {
			return update
		}
		return await getCustomGameRoomView(ctx, room._id, hostUser._id)
	},
})

export const getMyCustomGameRoom = queryGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		const currentUser = await requireExistingCurrentUser(ctx)
		const room = await findRoomForUser(ctx, currentUser._id)
		if (!room) {
			return null
		}
		return await getCustomGameRoomView(ctx, room._id, currentUser._id)
	},
})

export const listComposingCustomGameRooms = queryGeneric({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		await requireExistingCurrentUser(ctx)
		const limit = Math.max(1, Math.min(25, Math.floor(Number(args.limit ?? 12))))
		const rooms = await ctx.db
			.query('customGameRooms')
			.withIndex('by_status_updated', (q: any) => q.eq('status', 'composing'))
			.order('desc')
			.take(limit)
		const rows = []
		for (const room of rooms) {
			const participants = await activeRoomParticipants(ctx, room._id)
			const host = participants.find((participant: any) => participant.playerId === 'local-player')
			const virtualParticipants = participants.filter((participant: any) => participant.participantKind === 'virtual')
			const guestHumans = participants.filter(
				(participant: any) => participant.participantKind === 'human' && participant.playerId !== 'local-player',
			)
			rows.push({
				roomId: room._id,
				hostUserId: room.hostUserId,
				hostDisplayName: host?.displayName ?? 'Host',
				inviteCode: room.inviteCode,
				playerCount: participants.length,
				maxPlayers: MAX_ROOM_PARTICIPANTS,
				allReady:
					virtualParticipants.length > 0 &&
					virtualParticipants.every((participant: any) => participant.ready) &&
					guestHumans.every((participant: any) => participant.ready),
				updatedAt: room.updatedAt,
			})
		}
		return rows
	},
})

export const joinCustomGameRoomByInviteCode = mutationGeneric({
	args: {
		inviteCode: v.string(),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)
		const inviteCode = String(args.inviteCode ?? '').trim().toLowerCase()
		if (!inviteCode) {
			return {
				ok: false,
				code: 'INVITE_CODE_REQUIRED',
				message: 'invite_code_required',
			}
		}

		const ownedRoom = await getActiveRoomForHost(ctx, currentUser._id)
		if (ownedRoom) {
			return {
				ok: false,
				code: 'HOST_ROOM_ACTIVE',
				message: 'host_room_active',
			}
		}

		const matchingRooms = await ctx.db
			.query('customGameRooms')
			.withIndex('by_invite_code', (q: any) => q.eq('inviteCode', inviteCode))
			.take(12)
		const composingRooms = matchingRooms.filter((candidate: any) => candidate.status === 'composing')
		if (composingRooms.length > 1) {
			return {
				ok: false,
				code: 'INVITE_CODE_AMBIGUOUS',
				message: 'invite_code_ambiguous',
			}
		}
		const room = composingRooms[0]
		if (!room) {
			return {
				ok: false,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
		}

		const existingParticipant = await getHumanParticipantForUser(ctx, room._id, currentUser._id)
		if (existingParticipant) {
			return await getCustomGameRoomView(ctx, room._id, currentUser._id)
		}

		const memberships = await ctx.db
			.query('customGameParticipants')
			.withIndex('by_user_status', (q: any) => q.eq('userId', currentUser._id).eq('status', 'active'))
			.take(8)
		for (const row of memberships) {
			if (row.roomId === room._id) {
				continue
			}
			const otherRoom = await ctx.db.get(row.roomId)
			if (otherRoom?.status === 'composing') {
				await ctx.db.patch(row._id, {
					status: 'removed',
					ready: false,
					updatedAt: Date.now(),
				})
			}
		}

		const participants = await activeRoomParticipants(ctx, room._id)
		if (participants.length >= MAX_ROOM_PARTICIPANTS) {
			return {
				ok: false,
				code: 'CUSTOM_ROOM_FULL',
				message: 'custom_room_full',
			}
		}

		const guestHumans = participants.filter(
			(participant: any) => participant.participantKind === 'human' && participant.playerId !== 'local-player',
		)
		const nextGuestNumber = guestHumans.length + 1
		const maxSeatIndex = participants.reduce(
			(max: number, participant: any) => Math.max(max, participant.seatIndex),
			0,
		)
		const now = Date.now()
		await ctx.db.insert('customGameParticipants', {
			roomId: room._id,
			userId: currentUser._id,
			participantKind: 'human',
			playerId: `guest-${nextGuestNumber}`,
			displayName: currentUser.displayName ?? 'Guest',
			ready: false,
			seatIndex: maxSeatIndex + 1,
			status: 'active',
			updatedAt: now,
		})
		await ctx.db.patch(room._id, { updatedAt: now })
		return await getCustomGameRoomView(ctx, room._id, currentUser._id)
	},
})

export const leaveMyCustomGameRoom = mutationGeneric({
	args: {
		roomId: v.id('customGameRooms'),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)
		const room = await ctx.db.get(args.roomId)
		if (!room || room.status !== 'composing') {
			return {
				ok: false,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
		}
		if (room.hostUserId === currentUser._id) {
			return {
				ok: false,
				code: 'HOST_CANNOT_LEAVE',
				message: 'host_cannot_leave',
			}
		}

		const participant = await getHumanParticipantForUser(ctx, args.roomId, currentUser._id)
		if (!participant) {
			return {
				ok: false,
				code: 'NOT_A_ROOM_PARTICIPANT',
				message: 'not_a_room_participant',
			}
		}

		await ctx.db.patch(participant._id, {
			status: 'removed',
			ready: false,
			updatedAt: Date.now(),
		})
		await ctx.db.patch(args.roomId, { updatedAt: Date.now() })
		return { ok: true }
	},
})

export const setMyCustomGameReady = mutationGeneric({
	args: {
		roomId: v.id('customGameRooms'),
		ready: v.boolean(),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const currentUser = await requireCurrentUser(ctx)
		const room = await ctx.db.get(args.roomId)
		if (!room || room.status !== 'composing') {
			return {
				ok: false,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
		}

		const participant = await getHumanParticipantForUser(ctx, args.roomId, currentUser._id)
		if (!participant) {
			return {
				ok: false,
				code: 'NOT_A_ROOM_PARTICIPANT',
				message: 'not_a_room_participant',
			}
		}
		if (participant.playerId === 'local-player') {
			return {
				ok: false,
				code: 'HOST_READY_FIXED',
				message: 'host_ready_fixed',
			}
		}

		await ctx.db.patch(participant._id, {
			ready: args.ready,
			updatedAt: Date.now(),
		})
		await ctx.db.patch(args.roomId, { updatedAt: Date.now() })
		return await getCustomGameRoomView(ctx, args.roomId, currentUser._id)
	},
})

export const setMyCustomGameOpponents = mutationGeneric({
	args: {
		roomId: v.id('customGameRooms'),
		virtualOpponentKeys: v.array(v.string()),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const hostUser = await requireCurrentUser(ctx)
		const room = await ctx.db.get(args.roomId)
		if (!room || room.hostUserId !== hostUser._id || room.status !== 'composing') {
			return {
				ok: false,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
		}
		const update = await upsertRoomParticipants(ctx, room, hostUser, args.virtualOpponentKeys)
		if (!update.ok) {
			return update
		}
		return await getCustomGameRoomView(ctx, args.roomId, hostUser._id)
	},
})

export const startMyCustomGameRoom = mutationGeneric({
	args: {
		roomId: v.id('customGameRooms'),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any) => {
		const hostUser = await requireCurrentUser(ctx)
		const room = await ctx.db.get(args.roomId)
		if (!room || room.hostUserId !== hostUser._id || room.status !== 'composing') {
			return {
				ok: false,
				code: 'CUSTOM_ROOM_NOT_FOUND',
				message: 'custom_room_not_found',
			}
		}

		const participants = await activeRoomParticipants(ctx, args.roomId)
		const view = await getCustomGameRoomView(ctx, args.roomId, hostUser._id)
		if (!view?.allReady) {
			return {
				ok: false,
				code: 'CUSTOM_ROOM_NOT_READY',
				message: 'custom_room_not_ready',
			}
		}
		const virtualParticipants = participants.filter((participant: any) => participant.participantKind === 'virtual')
		if (virtualParticipants.length === 0) {
			return {
				ok: false,
				code: 'NO_VIRTUAL_OPPONENTS',
				message: 'no_virtual_opponents',
			}
		}

		const result = await createCustomMatchFromRoomParticipants(ctx, hostUser, participants, {
			requiresSetupLoad: true,
		})
		if (!('matchId' in result) || !result.matchId) {
			return result
		}
		await ctx.db.patch(args.roomId, {
			status: 'started',
			matchId: result.matchId,
			updatedAt: Date.now(),
		})
		return {
			...result,
			roomId: args.roomId,
		}
	},
})
