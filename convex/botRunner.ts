import { internalMutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { buildBotObservation } from './bots/observation'
import { gameplayBotsEnabled } from './bots/scheduling'
import {
	DEFAULT_BOT_STRATEGY_KEY,
	DEFAULT_BOT_STRATEGY_VERSION,
	resolveBotStrategy,
} from './bots/strategies'
import type { BotPersonalityParameters } from './bots/types'
import { applyMatchCommand } from './commands'
import { getLatestMatchState, getMatchParticipantByPlayerId } from './matches'
import type { GenericCtx } from './users'

export const advanceBot = internalMutationGeneric({
	args: {
		matchId: v.id('matches'),
		playerId: v.string(),
		expectedRevision: v.number(),
		expectedPhase: v.string(),
		expectedEpoch: v.number(),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any): Promise<Record<string, unknown>> => {
		if (!gameplayBotsEnabled()) {
			return { ok: true, skipped: true, code: 'GAMEPLAY_BOTS_DISABLED' }
		}
		const state = await getLatestMatchState(ctx, args.matchId)
		if (!state || state.match.status === 'complete') {
			return { ok: true, skipped: true, code: 'MATCH_NOT_ACTIONABLE' }
		}
		if (
			state.revision !== args.expectedRevision
			|| state.flow.phase !== args.expectedPhase
			|| (state.flow.epoch ?? 0) !== args.expectedEpoch
		) {
			return {
				ok: true,
				skipped: true,
				code: 'BOT_JOB_STALE',
				revision: state.revision,
			}
		}
		const participant = await getMatchParticipantByPlayerId(
			ctx,
			args.matchId,
			args.playerId,
		)
		if (
			!participant
			|| participant.status !== 'active'
			|| participant.controlMode !== 'server_bot'
			|| !participant.virtualOpponentId
		) {
			return { ok: true, skipped: true, code: 'BOT_PARTICIPANT_NOT_ACTIONABLE' }
		}

		const observation = buildBotObservation(state, participant.playerId)
		if (!observation) {
			return { ok: true, skipped: true, code: 'BOT_OBSERVATION_NOT_FOUND' }
		}
		const strategyKey = participant.botStrategyKey ?? DEFAULT_BOT_STRATEGY_KEY
		const strategyVersion = participant.botStrategyVersion ?? DEFAULT_BOT_STRATEGY_VERSION
		const strategy = resolveBotStrategy(strategyKey, strategyVersion)
		if (!strategy) {
			return {
				ok: true,
				skipped: true,
				code: 'BOT_STRATEGY_UNSUPPORTED',
				strategyKey,
				strategyVersion,
			}
		}
		const seed = `${state.matchId}:${state.revision}:${participant.playerId}:${strategyKey}:${strategyVersion}`
		const intent = strategy(observation, {
			strategyKey,
			strategyVersion,
			parameters: participant.botParameters as Partial<BotPersonalityParameters> | undefined,
			seed,
		})
		if (!intent) {
			return { ok: true, skipped: true, code: 'BOT_NO_LEGAL_INTENT' }
		}

		return await applyMatchCommand(ctx, {
			matchId: args.matchId,
			commandId: `bot:${args.matchId}:${participant.playerId}:${state.revision}:${intent.type}`,
			revision: state.revision,
			type: intent.type,
			payload: intent.payload,
			actorVirtualOpponentId: participant.virtualOpponentId,
			actorPlayerId: participant.playerId,
			source: 'bot',
			stalePrivateDeltaPlayerId: participant.playerId,
		})
	},
})
