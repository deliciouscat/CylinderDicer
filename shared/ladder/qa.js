import { LADDER_MIN_WAIT_MS, LADDER_TARGET_PLAYER_COUNT, } from './matchmaking';
export const LADDER_QA_MAX_PLAYER_COUNT = 6;
export const LADDER_DEV_MATCH_RESUME_WINDOW_MS = 5 * 60 * 1000;
export function ladderQaFinalizeDelayMs(input) {
    const playerCount = input.pendingOpponentCount + 1;
    if (playerCount >= LADDER_TARGET_PLAYER_COUNT) {
        return 0;
    }
    const waitedMs = Math.max(0, input.now - input.joinedAt);
    return Math.max(0, LADDER_MIN_WAIT_MS - waitedMs);
}
export function nextLadderQaPlayerCount(pendingOpponentCount) {
    if (!Number.isInteger(pendingOpponentCount) || pendingOpponentCount < 0) {
        return null;
    }
    const nextPlayerCount = pendingOpponentCount + 2;
    return nextPlayerCount <= LADDER_QA_MAX_PLAYER_COUNT ? nextPlayerCount : null;
}
export function nextLadderQaWaitingBotCount(waitingBotCount) {
    if (!Number.isInteger(waitingBotCount) || waitingBotCount < 0) {
        return null;
    }
    const nextCount = waitingBotCount + 1;
    return nextCount < LADDER_QA_MAX_PLAYER_COUNT ? nextCount : null;
}
export function canFinalizeLadderQaRoster(input) {
    return input.status === 'waiting'
        && input.qaRevision === input.expectedQaRevision
        && input.pendingOpponentCount >= 1
        && input.pendingOpponentCount < LADDER_QA_MAX_PLAYER_COUNT;
}
export function shouldResumeReadyLadderMatch(input) {
    return input.mode !== 'dev'
        || (Number.isFinite(input.ageMs)
            && input.ageMs >= 0
            && input.ageMs <= LADDER_DEV_MATCH_RESUME_WINDOW_MS);
}
