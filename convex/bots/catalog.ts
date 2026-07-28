import type { GenericCtx } from '../users'
import { ensureVirtualOpponent } from '../virtualOpponents'
import { GAMEPLAY_BOT_SPECS } from './specs'
import {
	DEFAULT_BOT_STRATEGY_KEY,
	DEFAULT_BOT_STRATEGY_VERSION,
} from './strategies'

export { GAMEPLAY_BOT_SPECS } from './specs'

export async function ensureGameplayBotCatalog(ctx: GenericCtx) {
	const rows = []
	for (const spec of GAMEPLAY_BOT_SPECS) {
		const opponent = await ensureVirtualOpponent(
			ctx,
			spec.key,
			spec.displayName,
			spec.archetype,
			'gameplay',
			spec.characterKey,
		)
		const now = Date.now()
		const existing = await ctx.db
			.query('botProfiles')
			.withIndex('by_virtual_opponent', (q: any) => q.eq('virtualOpponentId', opponent._id))
			.unique()
		const values = {
			strategyKey: DEFAULT_BOT_STRATEGY_KEY,
			strategyVersion: DEFAULT_BOT_STRATEGY_VERSION,
			difficulty: spec.difficulty,
			baseMmr: spec.baseMmr,
			enabled: true,
			parameters: spec.parameters,
			updatedAt: now,
		}
		let profile
		if (existing) {
			const unchanged =
				existing.strategyKey === values.strategyKey
				&& existing.strategyVersion === values.strategyVersion
				&& existing.difficulty === values.difficulty
				&& existing.baseMmr === values.baseMmr
				&& existing.enabled === values.enabled
				&& JSON.stringify(existing.parameters) === JSON.stringify(values.parameters)
			if (unchanged) {
				profile = existing
			} else {
				await ctx.db.patch(existing._id, values)
				profile = { ...existing, ...values }
			}
		} else {
			const profileId = await ctx.db.insert('botProfiles', {
				virtualOpponentId: opponent._id,
				...values,
				createdAt: now,
			})
			profile = await ctx.db.get(profileId)
		}
		if (profile) {
			rows.push({ opponent, profile })
		}
	}
	return rows
}

export async function selectGameplayBots(
	ctx: GenericCtx,
	count: number,
	anchorMmr: number,
) {
	const catalog = await ensureGameplayBotCatalog(ctx)
	return catalog
		.filter(({ profile }) => profile.enabled)
		.sort((left, right) => {
			return Math.abs(left.profile.baseMmr - anchorMmr)
				- Math.abs(right.profile.baseMmr - anchorMmr)
		})
		.slice(0, Math.max(0, count))
}
