import type { GameplayBotSpec } from './types'

/**
 * Canonical gameplay identity and personality catalog.
 * QA fixtures may reuse an identity, but must use a separate catalog scope.
 */
export const GAMEPLAY_BOT_SPECS: GameplayBotSpec[] = [
	{
		key: 'opponent-1',
		displayName: 'Hush Feather',
		characterKey: 'hush-feather',
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
		characterKey: 'samuel-saber',
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
		characterKey: 'zippo-jay',
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
		characterKey: 'calamity-kate',
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
		characterKey: 'the-kid',
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
