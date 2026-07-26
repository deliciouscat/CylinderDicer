import type {
	DuelResolutionState,
	DuelState,
	MatchResultEntry,
	MatchState,
} from './state'

export function recordElimination(state: MatchState, playerId: string): void {
	const player = state.players.byId[playerId]
	if (!player?.eliminated || state.eliminationOrder.includes(playerId)) {
		return
	}
	state.eliminationOrder.push(playerId)
	state.match.result = {
		playerCount: state.players.order.length,
		rated: false,
		placements: state.eliminationOrder.map((eliminatedId, index) => ({
			playerId: eliminatedId,
			place: state.players.order.length - index,
			playerCount: state.players.order.length,
			rated: false,
		})),
	}
}

export function recordResolutionEliminations(
	state: MatchState,
	duel: DuelState,
	resolution: DuelResolutionState | undefined,
): void {
	if (!resolution) {
		return
	}

	const hpByPlayer = new Map(
		duel.players.map((player) => [player.id, player.hp]),
	)
	for (const step of resolution.steps) {
		if (!step.hit) {
			continue
		}
		const hp = (hpByPlayer.get(step.targetId) ?? state.players.byId[step.targetId]?.hp ?? 0) - 1
		hpByPlayer.set(step.targetId, hp)
		if (hp <= 0) {
			recordElimination(state, step.targetId)
		}
	}

	for (const playerId of state.players.order) {
		recordElimination(state, playerId)
	}
}

export function buildPlacementResult(state: MatchState): MatchResultEntry[] {
	const playerCount = state.players.order.length
	const rankedIds = new Set<string>()
	const placements: MatchResultEntry[] = []
	let place = playerCount

	for (const playerId of state.eliminationOrder) {
		if (!rankedIds.has(playerId) && state.players.byId[playerId]) {
			placements.push({ playerId, place, playerCount, rated: false })
			rankedIds.add(playerId)
			place -= 1
		}
	}

	const remaining = state.players.order.filter((playerId) => !rankedIds.has(playerId))
	remaining.sort((left, right) => {
		if (left === state.match.winnerId) return -1
		if (right === state.match.winnerId) return 1
		return state.players.order.indexOf(left) - state.players.order.indexOf(right)
	})
	for (const playerId of remaining.reverse()) {
		placements.push({ playerId, place, playerCount, rated: false })
		place -= 1
	}

	return placements.sort((left, right) => left.place - right.place)
}

export function finalizeMatchResult(state: MatchState): void {
	const placements = buildPlacementResult(state)
	state.match.result = {
		playerCount: state.players.order.length,
		placements,
		rated: false,
	}
}
