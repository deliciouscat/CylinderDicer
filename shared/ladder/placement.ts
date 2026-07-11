export interface LadderPlacement {
  place: number
  playerCount: number
}

/** Normalize any result to the 1–6 placement scale defined by LADDER_LAYOUT.md. */
export function normalizePlacement(place: number, playerCount: number): number {
  if (!Number.isFinite(place) || !Number.isFinite(playerCount)) {
    return Number.NaN
  }

  if (playerCount === 1 && place === 1) {
    return 1
  }

  if (playerCount < 2 || place < 1 || place > playerCount) {
    return Number.NaN
  }

  return ((place - 1) / (playerCount - 1)) * 5 + 1
}

export function averageNormalizedPlacement(
  placements: readonly LadderPlacement[],
): number | null {
  if (placements.length === 0) {
    return null
  }

  const values = placements
    .map(({ place, playerCount }) => normalizePlacement(place, playerCount))
    .filter(Number.isFinite)

  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}
