export const LADDER_ELO_K_FACTOR = 32;
export const LADDER_ELO_SCALE = 400;
function expectedScore(rating, opponentRating) {
    return 1 / (1 + 10 ** ((opponentRating - rating) / LADDER_ELO_SCALE));
}
/**
 * Multiplayer Elo is the average of every pairwise result, calculated from one
 * frozen pre-match rating set so seat/update order cannot change the outcome.
 */
export function calculateMultiplayerElo(players, kFactor = LADDER_ELO_K_FACTOR) {
    if (players.length < 2) {
        return players.map((player) => ({
            ...player,
            ratingBefore: player.rating,
            ratingAfter: player.rating,
            ratingDelta: 0,
        }));
    }
    return players.map((player) => {
        let scoreDifference = 0;
        for (const opponent of players) {
            if (opponent.playerId === player.playerId) {
                continue;
            }
            const actual = player.place < opponent.place
                ? 1
                : player.place > opponent.place
                    ? 0
                    : 0.5;
            scoreDifference += actual - expectedScore(player.rating, opponent.rating);
        }
        const ratingDelta = Math.round(kFactor * scoreDifference / (players.length - 1));
        const ratingAfter = Math.max(0, player.rating + ratingDelta);
        return {
            ...player,
            ratingBefore: player.rating,
            ratingAfter,
            ratingDelta: ratingAfter - player.rating,
        };
    });
}
