export const LADDER_QA_MAX_PLAYER_COUNT = 6
export const LADDER_QA_FINALIZE_DELAY_MS = 1500
export const LADDER_DEV_MATCH_RESUME_WINDOW_MS = 5 * 60 * 1000

export function nextLadderQaPlayerCount(pendingOpponentCount: number): number | null {
	if (!Number.isInteger(pendingOpponentCount) || pendingOpponentCount < 0) {
		return null
	}
	const nextPlayerCount = pendingOpponentCount + 2
	return nextPlayerCount <= LADDER_QA_MAX_PLAYER_COUNT ? nextPlayerCount : null
}

export function nextLadderQaWaitingBotCount(waitingBotCount: number): number | null {
	if (!Number.isInteger(waitingBotCount) || waitingBotCount < 0) {
		return null
	}
	const nextCount = waitingBotCount + 1
	return nextCount < LADDER_QA_MAX_PLAYER_COUNT ? nextCount : null
}

export function canFinalizeLadderQaRoster(input: {
	status: string
	qaRevision?: number
	expectedQaRevision: number
	pendingOpponentCount: number
}): boolean {
	return input.status === 'waiting'
		&& input.qaRevision === input.expectedQaRevision
		&& input.pendingOpponentCount >= 1
		&& input.pendingOpponentCount < LADDER_QA_MAX_PLAYER_COUNT
}

export function shouldResumeReadyLadderMatch(input: {
	mode: string
	ageMs: number
}): boolean {
	return input.mode !== 'dev'
		|| (Number.isFinite(input.ageMs)
			&& input.ageMs >= 0
			&& input.ageMs <= LADDER_DEV_MATCH_RESUME_WINDOW_MS)
}
