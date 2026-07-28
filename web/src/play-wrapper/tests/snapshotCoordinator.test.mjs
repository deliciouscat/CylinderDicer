import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
	SnapshotCoordinator,
} = require('../../../../.tmp/play-wrapper-test/play-wrapper/snapshotCoordinator.js')

const snapshot = (matchId, revision) => ({ matchId, revision })

test('coordinator rejects mixed revisions and older snapshots', () => {
	const coordinator = new SnapshotCoordinator()
	const scope = coordinator.begin('match-a')

	assert.equal(
		coordinator.canApply(scope, snapshot('match-a', 2), snapshot('match-a', 1)),
		false,
	)
	assert.equal(
		coordinator.canApply(scope, snapshot('match-a', 2), snapshot('match-a', 2)),
		true,
	)
	assert.equal(coordinator.commit(scope, 2), true)
	assert.equal(
		coordinator.canApply(scope, snapshot('match-a', 1), snapshot('match-a', 1)),
		false,
	)
})

test('A to B replacement prevents stale A success and error writes', () => {
	const coordinator = new SnapshotCoordinator()
	const scopeA = coordinator.begin('match-a')
	const scopeB = coordinator.begin('match-b')

	assert.equal(coordinator.isCurrent(scopeA), false)
	assert.equal(
		coordinator.canApply(scopeA, snapshot('match-a', 8), snapshot('match-a', 8)),
		false,
	)
	assert.equal(coordinator.isCurrent(scopeB), true)
	assert.equal(
		coordinator.canApply(scopeB, snapshot('match-b', 1), snapshot('match-b', 1)),
		true,
	)
})

test('unmount invalidation rejects late snapshot completion', () => {
	const coordinator = new SnapshotCoordinator()
	const scope = coordinator.begin('match-a')
	coordinator.invalidate()

	assert.equal(coordinator.isCurrent(scope), false)
	assert.equal(
		coordinator.canApply(scope, snapshot('match-a', 3), snapshot('match-a', 3)),
		false,
	)
})
