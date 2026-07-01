/**
 * # 개요
 * Clerk 인증 사용자와 Convex `users` row를 연결하는 함수 모듈이다.
 * 현재는 스캐폴드만 두고, 다음 단계에서 `getCurrentUser`와 `createOrUpdateCurrentUser` query/mutation을 구현한다.
 *
 * # 의존성
 * - `convex/auth.config.ts`: Clerk JWT 검증.
 * - `convex/schema.ts`: `users`, `inventories` 테이블.
 * - Clerk identity claims: `subject`, display name, profile metadata.
 *
 * # I/O
 * - 입력:
 *   - Convex auth identity.
 *   - optional profile payload.
 * - 출력:
 *   - 현재 Convex user document.
 *   - 신규 사용자 기본 inventory.
 *
 * # 의사코드
 * ```text
 * read authenticated Clerk identity
 * find users row by clerkId
 * if missing, insert users row and default inventory
 * if profile changed, patch display fields
 * return normalized user profile
 * ```
 */
import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

export interface ConvexAuthIdentity {
	subject: string
	name?: string
	nickname?: string
	email?: string
}

export type GenericCtx = {
	auth: {
		getUserIdentity(): Promise<ConvexAuthIdentity | null>
	}
	db: any
}

function displayNameFromIdentity(
	identity: Awaited<ReturnType<GenericCtx['auth']['getUserIdentity']>>,
): string | undefined {
	return identity?.name ?? identity?.nickname ?? identity?.email
}

export async function getUserByClerkId(ctx: GenericCtx, clerkId: string) {
	return await ctx.db
		.query('users')
		.withIndex('by_clerk_id', (q: any) => q.eq('clerkId', clerkId))
		.first()
}

export async function getExistingCurrentUser(ctx: GenericCtx) {
	const identity = await ctx.auth.getUserIdentity()
	if (!identity) {
		return null
	}
	return await getUserByClerkId(ctx, identity.subject)
}

export async function requireExistingCurrentUser(ctx: GenericCtx) {
	const user = await getExistingCurrentUser(ctx)
	if (!user) {
		throw new Error('UNAUTHENTICATED')
	}
	return user
}

async function createDefaultInventory(ctx: GenericCtx, userId: string, now: number) {
	const existing = await ctx.db
		.query('inventories')
		.withIndex('by_user', (q: any) => q.eq('userId', userId))
		.first()
	if (existing) {
		return existing
	}

	return await ctx.db.insert('inventories', {
		userId,
		currencies: {
			coins: 0,
			gems: 0,
		},
		equipped: {
			diceSkin: 'default',
			cupSkin: 'default',
		},
		revision: 0,
		updatedAt: now,
	})
}

export async function upsertCurrentUser(ctx: GenericCtx) {
	const identity = await ctx.auth.getUserIdentity()
	if (!identity) {
		throw new Error('UNAUTHENTICATED')
	}

	const now = Date.now()
	const clerkId = identity.subject
	const displayName = displayNameFromIdentity(identity)
	const existing = await getUserByClerkId(ctx, clerkId)
	const profileFields = displayName === undefined ? {} : { displayName }

	if (existing) {
		await ctx.db.patch(existing._id, {
			...profileFields,
			updatedAt: now,
		})
		await createDefaultInventory(ctx, existing._id, now)
		return {
			...existing,
			...profileFields,
			updatedAt: now,
		}
	}

	const userId = await ctx.db.insert('users', {
		clerkId,
		...profileFields,
		createdAt: now,
		updatedAt: now,
	})
	await createDefaultInventory(ctx, userId, now)
	return await ctx.db.get(userId)
}

export async function requireCurrentUser(ctx: GenericCtx) {
	const user = await upsertCurrentUser(ctx)
	if (!user) {
		throw new Error('UNAUTHENTICATED')
	}
	return user
}

export const getCurrentUser = queryGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		return await getExistingCurrentUser(ctx)
	},
})

export const createOrUpdateCurrentUser = mutationGeneric({
	args: {},
	returns: v.any(),
	handler: async (ctx: GenericCtx) => {
		return await upsertCurrentUser(ctx)
	},
})
