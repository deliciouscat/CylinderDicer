export const MAX_CUSTOM_GAME_PARTICIPANTS = 6;
export function planCustomGameBotAddition(participants, availableBotKeys) {
    if (participants.length >= MAX_CUSTOM_GAME_PARTICIPANTS) {
        return null;
    }
    const activeBotKeys = new Set(participants
        .map((participant) => participant.virtualOpponentKey)
        .filter((key) => Boolean(key)));
    const key = availableBotKeys.find((candidate) => !activeBotKeys.has(candidate));
    if (!key) {
        return null;
    }
    const usedPlayerIds = new Set(participants.map((participant) => participant.playerId));
    const usedSeatIndices = new Set(participants.map((participant) => participant.seatIndex));
    for (let index = 1; index < MAX_CUSTOM_GAME_PARTICIPANTS; index += 1) {
        const playerId = `opponent-${index}`;
        if (!usedPlayerIds.has(playerId) && !usedSeatIndices.has(index)) {
            return {
                key,
                playerId,
                seatIndex: index,
            };
        }
    }
    return null;
}
