/**
 * Cross-runtime gameplay constants.
 *
 * Convex owns rule enforcement. Vue and Defold consume these values for
 * capacities, presentation, and local simulation only. Any breaking change
 * must increment `version` and update `ruleset.golden.json` plus the Lua pair.
 */
export const GAME_RULESET = {
	version: 1,
	players: {
		min: 2,
		max: 6,
	},
	dice: {
		perPlayer: 5,
		faceMin: 1,
		faceMax: 6,
		skullFace: 1,
	},
	cylinder: {
		slots: 6,
		initialLoadedSlots: [1, 3, 5],
		initialHp: 6,
	},
	bidding: {
		countMin: 1,
		countMax: 36,
	},
	rating: {
		defaultMmr: 1000,
	},
	shake: {
		requiredActions: 6,
	},
	timingsMs: {
		biddingOpen: 3_000,
		shakeTimeout: 6_000,
		diceCheckTimeout: 6_000,
		biddingTimeout: 40_000,
		bidReloadTimeout: 3_000,
		duelRevealInterval: 160,
		duelRevealDuration: 340,
		duelRevealHold: 3_000,
		duelExecuteIntro: 450,
		duelRouletteStep: 660,
		duelPerfectStep: 1_180,
		duelCompleteHold: 1_000,
	},
} as const

export type GameRuleset = typeof GAME_RULESET
