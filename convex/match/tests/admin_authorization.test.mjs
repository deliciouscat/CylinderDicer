import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
	identityHasAdminRole,
} = require('../../../.tmp/convex-domain/convex/qa/adminAuthorization.js')

test('admin authorization accepts only the exact signed top-level role claim', () => {
	assert.equal(identityHasAdminRole({ role: 'admin' }), true)

	for (const identity of [
		null,
		{},
		{ role: 'Admin' },
		{ role: 'org:admin' },
		{ role: 'cylinderdicer_admin' },
		{ roles: ['admin'] },
		{ unsafeMetadata: { role: 'admin' } },
		{ publicMetadata: { admin: true } },
		{ authorization: { claims: { role: 'admin' } } },
		{ role: ['admin'] },
	]) {
		assert.equal(identityHasAdminRole(identity), false)
	}
})
