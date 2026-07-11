import { internalMutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { applyMatchCommand, automaticMatchCommandTypeValidator } from './commands'
import { matchesAutomaticTransition } from './match/flow'
import { getLatestMatchState } from './matches'
import type { AutomaticMatchCommandType } from './protocol/commands'
import type { GenericCtx } from './users'

export const advanceMatchFlow = internalMutationGeneric({
	args: {
		matchId: v.id('matches'),
		type: automaticMatchCommandTypeValidator,
		expectedPhase: v.string(),
		expectedEpoch: v.number(),
		expectedRevision: v.number(),
	},
	returns: v.any(),
	handler: async (ctx: GenericCtx, args: any): Promise<Record<string, unknown>> => {
		const state = await getLatestMatchState(ctx, args.matchId)
		if (!state) {
			return { ok: false, code: 'MATCH_NOT_FOUND' }
		}

		const type = args.type as AutomaticMatchCommandType
		if (!matchesAutomaticTransition(state, {
			type,
			expectedPhase: args.expectedPhase,
			expectedEpoch: args.expectedEpoch,
			expectedRevision: args.expectedRevision,
		})) {
			return {
				ok: true,
				skipped: true,
				revision: state.revision,
				phase: state.flow.phase,
				epoch: state.flow.epoch ?? 0,
			}
		}

		const actorPlayerId = state.turn.activePlayerId ?? state.players.order[0]
		if (!actorPlayerId) {
			return { ok: false, code: 'ACTOR_NOT_FOUND' }
		}

		return await applyMatchCommand(ctx, {
			matchId: args.matchId,
			commandId: `system:${args.expectedEpoch}:${args.expectedRevision}:${type}`,
			revision: args.expectedRevision,
			type,
			actorPlayerId,
			source: 'system',
		})
	},
})
