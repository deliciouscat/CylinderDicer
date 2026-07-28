import type { AvailableAction } from '../protocol/snapshots'
import type { PlayerMatchCommandType } from '../protocol/commands'
import type { CharacterKey } from '../../shared/game/characters'

export interface BotPersonalityParameters {
	honesty: number
	aggression: number
	bluffRate: number
	challengeThreshold: number
	riskTolerance: number
	skullBidRate: number
	lowHpCaution: number
	loadedGunCaution: number
	randomness: number
	reactionMinMs: number
	reactionMaxMs: number
}

export interface BotObservation {
	matchId: string
	revision: number
	phase: string
	roundIndex: number
	playerId: string
	self: {
		hp: number
		bullets: number
		diceCount: number
		dice: number[]
		cylinder: {
			chamberIndex: number
			slots: boolean[]
		}
	}
	players: Array<{
		id: string
		hp: number
		bullets: number
		diceCount: number
		eliminated: boolean
	}>
	currentBid?: {
		playerId: string
		count: number
		face: number
	}
	availableActions: AvailableAction[]
}

export interface BotIntent {
	type: PlayerMatchCommandType
	payload?: Record<string, unknown>
	reason: string
}

export interface BotDecisionContext {
	strategyKey: string
	strategyVersion: string
	parameters: BotPersonalityParameters
	seed: string
}

export interface GameplayBotSpec {
	key: string
	displayName: string
	characterKey: CharacterKey
	archetype: string
	difficulty: 'easy' | 'normal' | 'hard'
	baseMmr: number
	parameters: BotPersonalityParameters
}
