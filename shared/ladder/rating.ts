export interface LadderRatingPlayer {
  playerId: string
  rating: number
  place: number
}

export interface LadderRatingResult extends LadderRatingPlayer {
  ratingBefore: number
  ratingAfter: number
  ratingDelta: number
}

export const LADDER_ELO_K_FACTOR = 32
export const LADDER_ELO_SCALE = 400

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / LADDER_ELO_SCALE))
}

/**
 * Multiplayer Elo is the average of every pairwise result, calculated from one
 * frozen pre-match rating set so seat/update order cannot change the outcome.
 */
export function calculateMultiplayerElo(
  players: readonly LadderRatingPlayer[],
  kFactor = LADDER_ELO_K_FACTOR,
): LadderRatingResult[] {
  if (players.length < 2) {
    return players.map((player) => ({
      ...player,
      ratingBefore: player.rating,
      ratingAfter: player.rating,
      ratingDelta: 0,
    }))
  }

  return players.map((player) => {
    let scoreDifference = 0
    for (const opponent of players) {
      if (opponent.playerId === player.playerId) {
        continue
      }
      const actual = player.place < opponent.place
        ? 1
        : player.place > opponent.place
          ? 0
          : 0.5
      scoreDifference += actual - expectedScore(player.rating, opponent.rating)
    }

    const ratingDelta = Math.round(kFactor * scoreDifference / (players.length - 1))
    const ratingAfter = Math.max(0, player.rating + ratingDelta)
    return {
      ...player,
      ratingBefore: player.rating,
      ratingAfter,
      ratingDelta: ratingAfter - player.rating,
    }
  })
}
