import type { GenericCtx } from '../users'

const MAX_AUDIT_PAYLOAD_JSON_LENGTH = 4096

function safeAuditPayload(value: unknown) {
	if (value === undefined) {
		return {}
	}
	try {
		const encoded = JSON.stringify(value)
		return encoded.length <= MAX_AUDIT_PAYLOAD_JSON_LENGTH
			? value
			: { omitted: 'payload_too_large', length: encoded.length }
	} catch {
		return { omitted: 'payload_not_serializable' }
	}
}

export async function insertAdminAudit(
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
	return await ctx.db.insert('adminAudit', JSON.parse(JSON.stringify({
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
	})))
}

export async function listRecentAdminAuditRows(
	ctx: GenericCtx,
	input: {
		limit: number
		adminUserId?: string
		matchId?: string
		customGameRoomId?: string
	},
) {
	if (input.matchId) {
		return await ctx.db
			.query('adminAudit')
			.withIndex('by_match_created', (q: any) => q.eq('matchId', input.matchId))
			.order('desc')
			.take(input.limit)
	}
	if (!input.adminUserId) {
		return []
	}
	const rows = await ctx.db
		.query('adminAudit')
		.withIndex('by_admin_created', (q: any) => q.eq('adminUserId', input.adminUserId))
		.order('desc')
		.take(input.customGameRoomId ? input.limit * 4 : input.limit)
	return input.customGameRoomId
		? rows
			.filter((row: any) => row.customGameRoomId === input.customGameRoomId)
			.slice(0, input.limit)
		: rows
}
