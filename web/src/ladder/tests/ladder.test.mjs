import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  averageNormalizedPlacement,
  normalizePlacement,
} = require('../../../../.tmp/ladder-test/shared/ladder/placement.js')
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
