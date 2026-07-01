/**
 * # 개요
 * Clerk 계정/JWT와 무관한 Convex-only virtual opponent identity를 관리한다.
 * 이 row는 human `users` row가 아니며, match participant가 가리키는 bot/opponent 프로필이다.
 */
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'
import type { GenericCtx } from './users'
import { requireCurrentUser, requireExistingCurrentUser } from './users'

export const DEFAULT_VIRTUAL_OPPONENT_SPECS = [
	{ key: 'opponent-1', displayName: 'Hush Feather', archetype: 'balanced' },
	{ key: 'opponent-2', displayName: 'Samuel Saber', archetype: 'bold' },
	{ key: 'opponent-3', displayName: 'Zippo Jay', archetype: 'chaotic' },
] as const

export async function getVirtualOpponentByKey(ctx: GenericCtx, key: string) {
	return await ctx.db
		.query('virtualOpponents')
		.withIndex('by_key', (q: any) => q.eq('key', key))
		.first()
}

export async function ensureVirtualOpponent(
	ctx: GenericCtx,
	key: string,
	displayName: string,
	archetype?: string,
) {
	const now = Date.now()
	const existing = await getVirtualOpponentByKey(ctx, key)
	const fields = {
		displayName,
		archetype,
		updatedAt: now,
	}
	if (existing) {
		await ctx.db.patch(existing._id, fields)
		return {
			...existing,
			...fields,
		}
	}

	const opponentId = await ctx.db.insert('virtualOpponents', {
		key,
		displayName,
		archetype,
		createdAt: now,
		updatedAt: now,
	})
	const opponent = await ctx.db.get(opponentId)
	if (!opponent) {
		throw new Error('VIRTUAL_OPPONENT_CREATE_FAILED')
	}
	return opponent
}

export async function ensureDefaultVirtualOpponents(ctx: GenericCtx) {
	const opponents = []
	for (const spec of DEFAULT_VIRTUAL_OPPONENT_SPECS) {
		opponents.push(await ensureVirtualOpponent(ctx, spec.key, spec.displayName, spec.archetype))
	}
	return opponents
}

export const ensureDefaultVirtualOpponentsLoaded = mutationGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		await requireCurrentUser(ctx)
		return await ensureDefaultVirtualOpponents(ctx)
	},
})

export const listVirtualOpponents = queryGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		await requireExistingCurrentUser(ctx)
		return await ctx.db
			.query('virtualOpponents')
			.withIndex('by_key')
			.order('asc')
			.collect()
	},
})
