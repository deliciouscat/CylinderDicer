import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  averageNormalizedPlacement,
  normalizePlacement,
} = require('../../../../.tmp/ladder-test/shared/ladder/placement.js')
const {
  canFinalizeLadderQaRoster,
  ladderQaFinalizeDelayMs,
  nextLadderQaPlayerCount,
  nextLadderQaWaitingBotCount,
  shouldResumeReadyLadderMatch,
} = require('../../../../.tmp/ladder-test/shared/ladder/qa.js')
const {
  decideLadderMatch,
  estimateLadderArrivalRate,
  ladderMmrBand,
} = require('../../../../.tmp/ladder-test/shared/ladder/matchmaking.js')
const {
  MAX_FIDGET_CHIPS,
  applyFidgetOutcome,
  formatPlacement,
  initialLadderRuntimeState,
  normalizeRoster,
  reduceLadderRuntime,
  rosterDensity,
  safeStats,
} = require('../../../../.tmp/ladder-test/web/src/ladder/ladder.logic.js')

function stats(overrides = {}) {
  return {
    mmr: 1000,
    recent20AvgPlace: 2.7,
    recent20Count: 20,
    allTimeAvgPlace: 3.1,
    allTimeCount: 100,
    ...overrides,
  }
}

function roster(count) {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `player-${index + 1}`,
    displayName: `Player ${index + 1}`,
    seatIndex: index,
    isSelf: index === 0,
    characterKey: null,
    stats: stats(),
  }))
}

test('normalizes placements to the exact 1–6 formula', () => {
  assert.equal(normalizePlacement(1, 6), 1)
  assert.equal(normalizePlacement(6, 6), 6)
  assert.equal(normalizePlacement(1, 1), 1)
  assert.equal(Number.isNaN(normalizePlacement(0, 4)), true)
  assert.equal(Number.isNaN(normalizePlacement(5, 4)), true)
  assert.equal(Number.isNaN(normalizePlacement(1, 0)), true)
  assert.ok(Math.abs(normalizePlacement(2, 4) - 2.6666666666666665) < Number.EPSILON)
  assert.equal(averageNormalizedPlacement([]), null)
  assert.equal(averageNormalizedPlacement([{ place: 1, playerCount: 2 }, { place: 2, playerCount: 2 }]), 3.5)
  assert.equal(formatPlacement(normalizePlacement(2, 4)), '2.7')
})

test('skull halves chips while pip faces add one and the display cap holds', () => {
  assert.equal(applyFidgetOutcome(0, 1), 0)
  assert.equal(applyFidgetOutcome(9, 1), 4)
  assert.equal(applyFidgetOutcome(4, 6), 5)
  assert.equal(applyFidgetOutcome(MAX_FIDGET_CHIPS, 2), MAX_FIDGET_CHIPS)
  assert.equal(applyFidgetOutcome(7, 0), 7)
})

test('match found wins a cancel race and produces the roster phase', () => {
  const cancelling = reduceLadderRuntime(initialLadderRuntimeState, { type: 'cancel_requested' })
  assert.equal(cancelling.cancelPending, true)
  const matched = reduceLadderRuntime(cancelling, {
    type: 'queue_update',
    queue: { status: 'matched', matchId: 'match-1', selfStats: stats(), roster: roster(4) },
  })
  assert.equal(matched.phase, 'roster')
  assert.equal(matched.cancelPending, false)
  assert.equal(matched.matchId, 'match-1')
})

test('cancel cleanup is idempotent while still searching', () => {
  const cancelling = reduceLadderRuntime(initialLadderRuntimeState, { type: 'cancel_requested' })
  const cancelled = reduceLadderRuntime(cancelling, { type: 'cancel_completed' })
  const cancelledAgain = reduceLadderRuntime(cancelled, { type: 'cancel_completed' })
  assert.equal(cancelled.cancelPending, false)
  assert.deepEqual(cancelledAgain, cancelled)
})

test('roster is seat ordered and supports 2–6 density breakpoints', () => {
  const unordered = roster(6).reverse()
  assert.deepEqual(normalizeRoster(unordered).map((player) => player.seatIndex), [0, 1, 2, 3, 4, 5])
  assert.equal(rosterDensity(2), 'large')
  assert.equal(rosterDensity(4), 'medium')
  assert.equal(rosterDensity(6), 'compact')
})

test('missing stats use em-dash-safe null fallbacks', () => {
  assert.deepEqual(safeStats({ mmr: Number.NaN, recent20Count: -4 }), {
    mmr: null,
    recent20AvgPlace: null,
    recent20Count: 0,
    allTimeAvgPlace: null,
    allTimeCount: 0,
  })
  assert.equal(formatPlacement(null), '—')
})

test('match found can hand off only once until an explicit handoff failure', () => {
  const matched = reduceLadderRuntime(initialLadderRuntimeState, {
    type: 'queue_update',
    queue: { status: 'matched', matchId: 'match-1', selfStats: stats(), roster: roster(2) },
  })
  const handingOff = reduceLadderRuntime(matched, { type: 'handoff_started' })
  const duplicate = reduceLadderRuntime(handingOff, { type: 'handoff_started' })
  assert.equal(handingOff.phase, 'handing_off')
  assert.equal(duplicate, handingOff)
  assert.equal(reduceLadderRuntime(handingOff, { type: 'handoff_failed' }).phase, 'roster')
})

test('Ladder QA clicks build only 2–6 player rosters', () => {
  assert.equal(nextLadderQaPlayerCount(0), 2)
  assert.equal(nextLadderQaPlayerCount(2), 4)
  assert.equal(nextLadderQaPlayerCount(4), 6)
  assert.equal(nextLadderQaPlayerCount(5), null)
  assert.equal(nextLadderQaPlayerCount(-1), null)
  assert.equal(nextLadderQaPlayerCount(1.5), null)
})

test('Ladder QA bots can wait before the human player joins', () => {
  assert.equal(nextLadderQaWaitingBotCount(0), 1)
  assert.equal(nextLadderQaWaitingBotCount(4), 5)
  assert.equal(nextLadderQaWaitingBotCount(5), null)
  assert.equal(nextLadderQaWaitingBotCount(-1), null)
})

test('Ladder QA waits from player arrival for a partial roster but starts six immediately', () => {
  assert.equal(ladderQaFinalizeDelayMs({
    joinedAt: 10_000, now: 10_000, pendingOpponentCount: 1,
  }), 40_000)
  assert.equal(ladderQaFinalizeDelayMs({
    joinedAt: 10_000, now: 35_000, pendingOpponentCount: 3,
  }), 15_000)
  assert.equal(ladderQaFinalizeDelayMs({
    joinedAt: 10_000, now: 50_000, pendingOpponentCount: 1,
  }), 0)
  assert.equal(ladderQaFinalizeDelayMs({
    joinedAt: 10_000, now: 10_000, pendingOpponentCount: 5,
  }), 0)
})

test('only the latest waiting QA revision can finalize', () => {
  assert.equal(canFinalizeLadderQaRoster({
    status: 'waiting', qaRevision: 3, expectedQaRevision: 3, pendingOpponentCount: 3,
  }), true)
  assert.equal(canFinalizeLadderQaRoster({
    status: 'waiting', qaRevision: 4, expectedQaRevision: 3, pendingOpponentCount: 3,
  }), false)
  assert.equal(canFinalizeLadderQaRoster({
    status: 'cancelled', qaRevision: 3, expectedQaRevision: 3, pendingOpponentCount: 3,
  }), false)
  assert.equal(canFinalizeLadderQaRoster({
    status: 'waiting', qaRevision: 3, expectedQaRevision: 3, pendingOpponentCount: 0,
  }), false)
})

test('only recent dev matches resume while ranked matches remain recoverable', () => {
  assert.equal(shouldResumeReadyLadderMatch({ mode: 'dev', ageMs: 30_000 }), true)
  assert.equal(shouldResumeReadyLadderMatch({ mode: 'dev', ageMs: 5 * 60_000 + 1 }), false)
  assert.equal(shouldResumeReadyLadderMatch({ mode: 'ranked', ageMs: 24 * 60 * 60_000 }), true)
  assert.equal(shouldResumeReadyLadderMatch({ mode: 'dev', ageMs: Number.NaN }), false)
})

test('matchmaking waits for six when the projected fill fits inside the wait budget', () => {
  const now = 20_000
  const decision = decideLadderMatch([
    { joinedAt: 10_000, mmr: 1000 },
    { joinedAt: 15_000, mmr: 1050 },
    { joinedAt: 20_000, mmr: 950 },
  ], now)
  assert.equal(decision.shouldStart, false)
  assert.equal(decision.playerCount, 3)
  assert.equal(decision.reason, 'waiting')
})

test('matchmaking never starts a partial roster before the 40 second hold', () => {
  const decision = decideLadderMatch([
    { joinedAt: 0, mmr: 1000 },
    { joinedAt: 20_000, mmr: 1100 },
  ], 39_999)
  assert.equal(decision.shouldStart, false)
  assert.equal(decision.playerCount, 2)
  assert.equal(decision.reason, 'waiting')
})

test('matchmaking starts a partial roster after 40 seconds when fill is still too slow', () => {
  const decision = decideLadderMatch([
    { joinedAt: 0, mmr: 1000 },
    { joinedAt: 20_000, mmr: 1100 },
  ], 40_000)
  assert.equal(decision.shouldStart, true)
  assert.equal(decision.playerCount, 2)
  assert.equal(decision.reason, 'projected_slow_fill')
})

test('matchmaking starts six immediately and widens MMR only with wait time', () => {
  const full = Array.from({ length: 6 }, (_, index) => ({
    joinedAt: index * 500,
    mmr: 1000 + index * 10,
  }))
  assert.equal(decideLadderMatch(full, 3_000).reason, 'full')
  assert.equal(ladderMmrBand(0), 150)
  assert.equal(ladderMmrBand(45_000), 400)
  assert.equal(estimateLadderArrivalRate([0, 20_000]), 0.05)
})

test('MMR outliers do not count toward a partial roster before the band widens', () => {
  const decision = decideLadderMatch([
    { joinedAt: 0, mmr: 1000 },
    { joinedAt: 12_000, mmr: 1300 },
  ], 12_000)
  assert.equal(decision.playerCount, 1)
  assert.equal(decision.shouldStart, false)
})
