import { internal } from '../_generated/api'
import { env } from '../_generated/server'
import { deriveAvailableActions } from '../match/capabilities'
import type { MatchState } from '../match/state'
import type { GenericCtx } from '../users'
import { botReactionDelayMs } from './decision'
import type { BotPersonalityParameters } from './types'

export function gameplayBotsEnabled(): boolean {
	return env.GAMEPLAY_BOTS_ENABLED !== 'false'
}

export async function scheduleNextBotAction(ctx: GenericCtx, state: MatchState) {
	if (!ctx.scheduler || !gameplayBotsEnabled() || state.match.status === 'complete') {
		return { scheduled: false }
	}
	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', state.matchId))
		.take(8)
	participants.sort((left: any, right: any) => left.seatIndex - right.seatIndex)

	const participant = participants.find((candidate: any) => {
		return candidate.status === 'active'
			&& candidate.controlMode === 'server_bot'
			&& Boolean(candidate.virtualOpponentId)
			&& deriveAvailableActions(state, candidate.playerId).length > 0
	})
	if (!participant) {
		return { scheduled: false }
	}

	const availableActions = deriveAvailableActions(state, participant.playerId)
	const pacing = availableActions.some((action) => {
		return action.type === 'bid' || action.type === 'challenge'
	})
		? 'bidding'
		: 'routine'
	const seed = `${state.matchId}:${state.revision}:${participant.playerId}:${participant.botStrategyVersion ?? '1'}`
	const delayMs = botReactionDelayMs(
		participant.botParameters as Partial<BotPersonalityParameters> | undefined,
		seed,
		pacing,
	)
	await ctx.scheduler.runAfter(delayMs, internal.botRunner.advanceBot, {
		matchId: state.matchId,
		playerId: participant.playerId,
		expectedRevision: state.revision,
		expectedPhase: state.flow.phase,
		expectedEpoch: state.flow.epoch ?? 0,
	})
	return {
		scheduled: true,
		playerId: participant.playerId,
		revision: state.revision,
		delayMs,
		pacing,
	}
}
