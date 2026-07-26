import type { GenericCtx } from '../users'
import { ensureVirtualOpponent } from '../virtualOpponents'
import type { GameplayBotSpec } from './types'

export const GAMEPLAY_BOT_SPECS: GameplayBotSpec[] = [
	{
		key: 'opponent-1',
		displayName: 'Hush Feather',
		archetype: 'cautious',
		difficulty: 'normal',
		baseMmr: 960,
		parameters: {
			honesty: 0.84, aggression: 0.22, bluffRate: 0.08,
			challengeThreshold: 0.72, riskTolerance: 0.2, skullBidRate: 0.03,
			lowHpCaution: 0.9, loadedGunCaution: 0.92, randomness: 0.12,
			reactionMinMs: 650, reactionMaxMs: 1_250,
		},
	},
	{
		key: 'opponent-2',
		displayName: 'Samuel Saber',
		archetype: 'bold',
		difficulty: 'hard',
		baseMmr: 1120,
		parameters: {
			honesty: 0.7, aggression: 0.78, bluffRate: 0.32,
			challengeThreshold: 0.5, riskTolerance: 0.68, skullBidRate: 0.16,
			lowHpCaution: 0.42, loadedGunCaution: 0.48, randomness: 0.18,
			reactionMinMs: 380, reactionMaxMs: 900,
		},
	},
	{
		key: 'opponent-3',
		displayName: 'Zippo Jay',
		archetype: 'chaotic',
		difficulty: 'normal',
		baseMmr: 1_020,
		parameters: {
			honesty: 0.38, aggression: 0.72, bluffRate: 0.65,
			challengeThreshold: 0.44, riskTolerance: 0.82, skullBidRate: 0.38,
			lowHpCaution: 0.22, loadedGunCaution: 0.2, randomness: 0.72,
			reactionMinMs: 260, reactionMaxMs: 1_350,
		},
	},
	{
		key: 'opponent-4',
		displayName: 'Calamity Kate',
		archetype: 'reader',
		difficulty: 'hard',
		baseMmr: 1_180,
		parameters: {
			honesty: 0.88, aggression: 0.48, bluffRate: 0.16,
			challengeThreshold: 0.38, riskTolerance: 0.4, skullBidRate: 0.08,
			lowHpCaution: 0.72, loadedGunCaution: 0.75, randomness: 0.08,
			reactionMinMs: 720, reactionMaxMs: 1_400,
		},
	},
	{
		key: 'opponent-5',
		displayName: 'The Kid',
		archetype: 'balanced',
		difficulty: 'easy',
		baseMmr: 860,
		parameters: {
			honesty: 0.58, aggression: 0.34, bluffRate: 0.18,
			challengeThreshold: 0.78, riskTolerance: 0.36, skullBidRate: 0.06,
			lowHpCaution: 0.8, loadedGunCaution: 0.82, randomness: 0.42,
			reactionMinMs: 800, reactionMaxMs: 1_600,
		},
	},
]

export async function ensureGameplayBotCatalog(ctx: GenericCtx) {
	const rows = []
	for (const spec of GAMEPLAY_BOT_SPECS) {
		const opponent = await ensureVirtualOpponent(
			ctx,
			spec.key,
			spec.displayName,
			spec.archetype,
			'gameplay',
		)
		const now = Date.now()
		const existing = await ctx.db
			.query('botProfiles')
			.withIndex('by_virtual_opponent', (q: any) => q.eq('virtualOpponentId', opponent._id))
			.unique()
		const values = {
			strategyKey: 'weighted_baseline',
			strategyVersion: '1',
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
