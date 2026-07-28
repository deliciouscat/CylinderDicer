import { GAME_RULESET } from '../game/ruleset';
export const LADDER_TARGET_PLAYER_COUNT = GAME_RULESET.players.max;
export const LADDER_MIN_PLAYER_COUNT = GAME_RULESET.players.min;
export const LADDER_MIN_WAIT_MS = 40_000;
export const LADDER_MAX_WAIT_MS = 45_000;
export const LADDER_QUEUE_HEARTBEAT_MS = 8_000;
export const LADDER_QUEUE_LEASE_MS = 20_000;
export const LADDER_INITIAL_MMR_BAND = 150;
export const LADDER_MAX_MMR_BAND = 400;
export function ladderBotFillCount(decision) {
    if (!decision.shouldStart
        || decision.playerCount < LADDER_MIN_PLAYER_COUNT
        || decision.playerCount >= LADDER_TARGET_PLAYER_COUNT) {
        return 0;
    }
    return LADDER_TARGET_PLAYER_COUNT - decision.playerCount;
}
export function ladderMmrBand(waitMs) {
    const boundedWaitMs = Math.max(0, Math.min(LADDER_MAX_WAIT_MS, waitMs));
    const progress = boundedWaitMs / LADDER_MAX_WAIT_MS;
    return Math.round(LADDER_INITIAL_MMR_BAND
        + (LADDER_MAX_MMR_BAND - LADDER_INITIAL_MMR_BAND) * progress);
}
export function estimateLadderArrivalRate(joinedAt) {
    if (joinedAt.length < 2)
        return 0;
    const sorted = [...joinedAt].sort((left, right) => left - right);
    const observationSeconds = Math.max(5, (sorted[sorted.length - 1] - sorted[0]) / 1000);
    return (sorted.length - 1) / observationSeconds;
}
export function decideLadderMatch(candidates, now) {
    const ordered = [...candidates].sort((left, right) => left.joinedAt - right.joinedAt);
    if (ordered.length === 0) {
        return {
            shouldStart: false,
            playerCount: 0,
            reason: 'waiting',
            mmrBand: LADDER_INITIAL_MMR_BAND,
            estimatedArrivalsPerSecond: 0,
            projectedFillSeconds: null,
        };
    }
    const waitMs = Math.max(0, now - ordered[0].joinedAt);
    const mmrBand = ladderMmrBand(waitMs);
    const anchorMmr = ordered[0].mmr;
    const eligible = ordered.filter((candidate) => Math.abs(candidate.mmr - anchorMmr) <= mmrBand);
    const playerCount = Math.min(LADDER_TARGET_PLAYER_COUNT, eligible.length);
    const arrivalRate = estimateLadderArrivalRate(eligible.map((candidate) => candidate.joinedAt));
    const missingPlayers = Math.max(0, LADDER_TARGET_PLAYER_COUNT - playerCount);
    const projectedFillSeconds = arrivalRate > 0 ? missingPlayers / arrivalRate : null;
    if (playerCount >= LADDER_TARGET_PLAYER_COUNT) {
        return {
            shouldStart: true,
            playerCount: LADDER_TARGET_PLAYER_COUNT,
            reason: 'full',
            mmrBand,
            estimatedArrivalsPerSecond: arrivalRate,
            projectedFillSeconds: 0,
        };
    }
    if (playerCount >= LADDER_MIN_PLAYER_COUNT && waitMs >= LADDER_MAX_WAIT_MS) {
        return {
            shouldStart: true,
            playerCount,
            reason: 'max_wait',
            mmrBand,
            estimatedArrivalsPerSecond: arrivalRate,
            projectedFillSeconds,
        };
    }
    const remainingWaitSeconds = Math.max(0, LADDER_MAX_WAIT_MS - waitMs) / 1000;
    if (playerCount >= LADDER_MIN_PLAYER_COUNT
        && waitMs >= LADDER_MIN_WAIT_MS
        && projectedFillSeconds !== null
        && projectedFillSeconds > remainingWaitSeconds) {
        return {
            shouldStart: true,
            playerCount,
            reason: 'projected_slow_fill',
            mmrBand,
            estimatedArrivalsPerSecond: arrivalRate,
            projectedFillSeconds,
        };
    }
    return {
        shouldStart: false,
        playerCount,
        reason: 'waiting',
        mmrBand,
        estimatedArrivalsPerSecond: arrivalRate,
        projectedFillSeconds,
    };
}
export function eligibleLadderCandidates(candidates, now) {
    const ordered = [...candidates].sort((left, right) => left.joinedAt - right.joinedAt);
    if (ordered.length === 0)
        return [];
    const band = ladderMmrBand(Math.max(0, now - ordered[0].joinedAt));
    return ordered.filter((candidate) => Math.abs(candidate.mmr - ordered[0].mmr) <= band);
}
