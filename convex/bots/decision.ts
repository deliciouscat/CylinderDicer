import { SKULL_FACE } from '../match/rulesDice'
import { validateBidRaise } from '../match/rulesBidding'
import type { AvailableAction } from '../protocol/snapshots'
import type {
	BotDecisionContext,
	BotIntent,
	BotObservation,
	BotPersonalityParameters,
} from './types'

const DEFAULT_PARAMETERS: BotPersonalityParameters = {
	honesty: 0.65,
	aggression: 0.45,
	bluffRate: 0.2,
	challengeThreshold: 0.62,
	riskTolerance: 0.4,
	skullBidRate: 0.08,
	lowHpCaution: 0.7,
	loadedGunCaution: 0.75,
	randomness: 0.2,
	reactionMinMs: 450,
	reactionMaxMs: 1_100,
}

const BIDDING_THINK_MIN_MS = 1_800
const BIDDING_THINK_MAX_MS = 4_200
const BIDDING_THINK_EXTRA_MIN_MS = 1_200
const BIDDING_THINK_EXTRA_MAX_MS = 2_400

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function boundedReactionMs(value: number | undefined, fallback: number): number {
	const finite = Number.isFinite(value) ? value as number : fallback
	return Math.min(30_000, Math.max(80, Math.floor(finite)))
}

export function normalizeBotParameters(
	value: Partial<BotPersonalityParameters> | null | undefined,
): BotPersonalityParameters {
	return {
		honesty: clamp01(value?.honesty ?? DEFAULT_PARAMETERS.honesty),
		aggression: clamp01(value?.aggression ?? DEFAULT_PARAMETERS.aggression),
		bluffRate: clamp01(value?.bluffRate ?? DEFAULT_PARAMETERS.bluffRate),
		challengeThreshold: clamp01(
			value?.challengeThreshold ?? DEFAULT_PARAMETERS.challengeThreshold,
		),
		riskTolerance: clamp01(value?.riskTolerance ?? DEFAULT_PARAMETERS.riskTolerance),
		skullBidRate: clamp01(value?.skullBidRate ?? DEFAULT_PARAMETERS.skullBidRate),
		lowHpCaution: clamp01(value?.lowHpCaution ?? DEFAULT_PARAMETERS.lowHpCaution),
		loadedGunCaution: clamp01(
			value?.loadedGunCaution ?? DEFAULT_PARAMETERS.loadedGunCaution,
		),
		randomness: clamp01(value?.randomness ?? DEFAULT_PARAMETERS.randomness),
		reactionMinMs: boundedReactionMs(
			value?.reactionMinMs,
			DEFAULT_PARAMETERS.reactionMinMs,
		),
		reactionMaxMs: boundedReactionMs(
			value?.reactionMaxMs,
			DEFAULT_PARAMETERS.reactionMaxMs,
		),
	}
}

export function hashSeed(seed: string): number {
	let hash = 2166136261
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

function seededUnit(seed: string): number {
	return hashSeed(seed) / 0xffffffff
}

export function botRaiseCountStep(
	parameters: Partial<BotPersonalityParameters> | null | undefined,
	seed: string,
): 1 | 2 | 3 {
	const normalized = normalizeBotParameters(parameters)
	const boldness = clamp01(
		normalized.aggression * 0.55
			+ normalized.bluffRate * 0.25
			+ normalized.randomness * 0.2,
	)
	const roll = seededUnit(`${seed}:raise-step`) + boldness * 0.25
	if (roll >= 0.92) {
		return 3
	}
	if (roll >= 0.5) {
		return 2
	}
	return 1
}

function actionOfType<T extends AvailableAction['type']>(
	actions: AvailableAction[],
	type: T,
): Extract<AvailableAction, { type: T }> | undefined {
	return actions.find((action) => action.type === type) as
		| Extract<AvailableAction, { type: T }>
		| undefined
}

function ownSupport(observation: BotObservation, face: number): number {
	return observation.self.dice.filter((value) => {
		return value === face || (face !== SKULL_FACE && value === SKULL_FACE)
	}).length
}

function estimatedTableCount(observation: BotObservation, face: number): number {
	const own = ownSupport(observation, face)
	const hiddenDice = observation.players
		.filter((player) => player.id !== observation.playerId && !player.eliminated)
		.reduce((total, player) => total + player.diceCount, 0)
	const probability = face === SKULL_FACE ? 1 / 6 : 2 / 6
	return own + hiddenDice * probability
}

function shouldChallenge(
	observation: BotObservation,
	context: BotDecisionContext,
): boolean {
	const bid = observation.currentBid
	if (!bid) {
		return false
	}
	const parameters = context.parameters
	const estimate = estimatedTableCount(observation, bid.face)
	const excess = Math.max(0, bid.count - estimate)
	const suspicion = clamp01((excess + 0.5) / Math.max(1, bid.count))
	const caution = observation.self.hp <= 2 ? parameters.lowHpCaution * 0.18 : 0
	const threshold = clamp01(parameters.challengeThreshold + caution)
	const noise = (seededUnit(`${context.seed}:challenge`) - 0.5)
		* parameters.randomness
	return suspicion + noise >= threshold
}

function chooseBid(
	observation: BotObservation,
	context: BotDecisionContext,
	bidAction: Extract<AvailableAction, { type: 'bid' }>,
): { count: number; face: number } {
	const currentBid = observation.currentBid
	const parameters = context.parameters
	const candidates: Array<{ count: number; face: number; score: number }> = []
	const currentCount = currentBid?.count ?? 0
	const raiseStep = botRaiseCountStep(parameters, context.seed)
	const targetCount = Math.min(
		bidAction.max_count,
		Math.max(bidAction.min_count, currentCount + raiseStep),
	)
	const minCount = targetCount
	const maxCount = targetCount

	for (let count = minCount; count <= maxCount; count += 1) {
		for (let face = bidAction.min_face; face <= bidAction.max_face; face += 1) {
			const nextBid = { playerId: observation.playerId, count, face }
			if (!validateBidRaise(currentBid, nextBid).ok) {
				continue
			}
			const support = ownSupport(observation, face) / Math.max(1, observation.self.diceCount)
			const estimate = estimatedTableCount(observation, face)
			const overreach = Math.max(0, count - estimate) / Math.max(1, count)
			const raiseSize = Math.max(0, count - currentCount)
			const loadedRatio = observation.self.bullets / 6
			const lowHpRatio = observation.self.hp <= 2 ? (3 - observation.self.hp) / 2 : 0
			const skullPreference = face === SKULL_FACE ? parameters.skullBidRate : 0
			const skullRisk = face === SKULL_FACE
				? loadedRatio * parameters.loadedGunCaution
					+ lowHpRatio * parameters.lowHpCaution
				: 0
			const noise = (seededUnit(`${context.seed}:bid:${count}:${face}`) - 0.5)
				* parameters.randomness
			const score =
				support * parameters.honesty * 2.4
				+ raiseSize * parameters.aggression * 0.45
				+ overreach * parameters.bluffRate
				+ skullPreference * (0.5 + parameters.riskTolerance)
				- skullRisk * (1 - parameters.riskTolerance) * 2
				+ noise
			candidates.push({ count, face, score })
		}
	}

	candidates.sort((left, right) => right.score - left.score)
	return candidates[0]
		? { count: candidates[0].count, face: candidates[0].face }
		: { ...bidAction.suggested }
}

export function decideBotIntent(
	observation: BotObservation,
	input: Omit<BotDecisionContext, 'parameters'> & {
		parameters?: Partial<BotPersonalityParameters> | null
	},
): BotIntent | undefined {
	const context: BotDecisionContext = {
		...input,
		parameters: normalizeBotParameters(input.parameters),
	}
	const actions = observation.availableActions
	const load = actionOfType(actions, 'load')
	if (load && load.slots.length > 0) {
		const offset = hashSeed(`${context.seed}:load`) % load.slots.length
		return {
			type: 'bullet.load',
			payload: { slotIndex: load.slots[offset] },
			reason: 'load_available_slot',
		}
	}
	if (actionOfType(actions, 'shake_complete')) {
		return { type: 'shake.complete', reason: 'complete_shared_shake' }
	}
	if (actionOfType(actions, 'check')) {
		return { type: 'dice.check', reason: 'confirm_private_dice' }
	}

	const challenge = actionOfType(actions, 'challenge')
	if (challenge && shouldChallenge(observation, context)) {
		return { type: 'bid.challenge', reason: 'challenge_threshold_reached' }
	}
	const bid = actionOfType(actions, 'bid')
	if (bid) {
		return {
			type: 'bid.raise',
			payload: chooseBid(observation, context, bid),
			reason: 'weighted_legal_bid',
		}
	}
	return undefined
}

export function botReactionDelayMs(
	parameters: Partial<BotPersonalityParameters> | null | undefined,
	seed: string,
	pacing: 'routine' | 'bidding' = 'routine',
): number {
	const normalized = normalizeBotParameters(parameters)
	const lo = Math.min(normalized.reactionMinMs, normalized.reactionMaxMs)
	const hi = Math.max(normalized.reactionMinMs, normalized.reactionMaxMs)
	const base = Math.round(lo + (hi - lo) * seededUnit(`${seed}:reaction`))
	if (pacing !== 'bidding') {
		return base
	}
	const extra = Math.round(
		BIDDING_THINK_EXTRA_MIN_MS
			+ (BIDDING_THINK_EXTRA_MAX_MS - BIDDING_THINK_EXTRA_MIN_MS)
				* seededUnit(`${seed}:deliberation`),
	)
	return Math.max(
		BIDDING_THINK_MIN_MS,
		Math.min(BIDDING_THINK_MAX_MS, base + extra),
	)
}
