import { normalizePlacement } from '../shared/ladder/placement'
import { calculateMultiplayerElo } from '../shared/ladder/rating'
import type { MatchState } from './match/state'
import type { GenericCtx } from './users'
import { GAME_RULESET } from '../shared/game/ruleset'

const DEFAULT_MMR = GAME_RULESET.rating.defaultMmr
const RECENT_PLACEMENT_LIMIT = 20

export async function finalizeLadderResult(
	ctx: GenericCtx,
	match: any,
	state: MatchState,
	now: number,
): Promise<void> {
	const result = state.match.result
	if (!result) {
		return
	}

	const participants = await ctx.db
		.query('matchParticipants')
		.withIndex('by_match', (q: any) => q.eq('matchId', state.matchId))
		.take(8)
	const byPlayerId = new Map<string, any>(participants.map((participant: any) => [
		participant.playerId,
		participant,
	]))

	for (const placement of result.placements) {
		const participant = byPlayerId.get(placement.playerId)
		if (participant) {
			await ctx.db.patch(participant._id, {
				placement: placement.place,
				playerCount: placement.playerCount,
				updatedAt: now,
			})
		}
	}

	if (match.mode !== 'ranked') {
		return
	}

	if (match.ratingAppliedAt) {
		for (const placement of result.placements) {
			const participant = byPlayerId.get(placement.playerId)
			if (participant?.mmrBefore === undefined || participant?.mmrAfter === undefined) {
				return
			}
			placement.rated = true
			placement.mmrBefore = participant.mmrBefore
			placement.mmrAfter = participant.mmrAfter
			placement.mmrDelta = participant.mmrDelta
		}
		result.rated = true
		return
	}

	const rows: Array<{ placement: any; participant: any; stats: any }> = []
	for (const placement of result.placements) {
		const participant = byPlayerId.get(placement.playerId)
		if (!participant?.userId || participant.participantKind === 'virtual') {
			return
		}
		const stats = await ctx.db
			.query('ladderStats')
			.withIndex('by_user', (q: any) => q.eq('userId', participant.userId))
			.unique()
		rows.push({ placement, participant, stats })
	}

	const ratings = calculateMultiplayerElo(rows.map(({ placement, participant, stats }) => ({
		playerId: placement.playerId,
		rating: stats?.mmr ?? participant.startingMmr ?? DEFAULT_MMR,
		place: placement.place,
	})))
	const ratingByPlayerId = new Map(ratings.map((rating) => [rating.playerId, rating]))

	for (const row of rows) {
		const rating = ratingByPlayerId.get(row.placement.playerId)
		if (!rating) {
			continue
		}
		const normalizedPlacement = normalizePlacement(
			row.placement.place,
			row.placement.playerCount,
		)
		const recentPlacements = [
			...(row.stats?.recentPlacements ?? []),
			{ place: row.placement.place, playerCount: row.placement.playerCount },
		].slice(-RECENT_PLACEMENT_LIMIT)
		const statsPatch = {
			mmr: rating.ratingAfter,
			recentPlacements,
			totalNormalizedPlacementSum:
				(row.stats?.totalNormalizedPlacementSum ?? 0) + normalizedPlacement,
			totalPlacements: (row.stats?.totalPlacements ?? 0) + 1,
			updatedAt: now,
		}
		if (row.stats) {
			await ctx.db.patch(row.stats._id, statsPatch)
		} else {
			await ctx.db.insert('ladderStats', {
				userId: row.participant.userId,
				...statsPatch,
			})
		}
		await ctx.db.patch(row.participant._id, {
			mmrBefore: rating.ratingBefore,
			mmrAfter: rating.ratingAfter,
			mmrDelta: rating.ratingDelta,
			updatedAt: now,
		})
		row.placement.rated = true
		row.placement.mmrBefore = rating.ratingBefore
		row.placement.mmrAfter = rating.ratingAfter
		row.placement.mmrDelta = rating.ratingDelta
	}

	result.rated = true
	await ctx.db.patch(match._id, {
		ratingAppliedAt: now,
		resultRevision: state.revision,
	})
}
