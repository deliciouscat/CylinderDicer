import { decideBotIntent } from './decision'
import type {
	BotDecisionContext,
	BotIntent,
	BotObservation,
	BotPersonalityParameters,
} from './types'

export const DEFAULT_BOT_STRATEGY_KEY = 'weighted_baseline'
export const DEFAULT_BOT_STRATEGY_VERSION = '1'

type StrategyDecision = (
	observation: BotObservation,
	context: Omit<BotDecisionContext, 'parameters'> & {
		parameters?: Partial<BotPersonalityParameters> | null
	},
) => BotIntent | undefined

const STRATEGIES: Record<string, Record<string, StrategyDecision>> = {
	[DEFAULT_BOT_STRATEGY_KEY]: {
		[DEFAULT_BOT_STRATEGY_VERSION]: decideBotIntent,
	},
}

export function resolveBotStrategy(
	strategyKey: string,
	strategyVersion: string,
): StrategyDecision | undefined {
	return STRATEGIES[strategyKey]?.[strategyVersion]
}
