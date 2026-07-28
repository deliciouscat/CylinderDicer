import test from 'node:test'
import assert from 'node:assert/strict'

import {
  characterDirectionFromWheel,
  moveCharacterSelection,
  normalizeCharacterSelection,
} from '../../../../.tmp/settings-test/web/src/settings/settings.logic.js'

test('invalid or missing selections fall back to Rosmund', () => {
  assert.equal(normalizeCharacterSelection(undefined), 'rosemund')
  assert.equal(normalizeCharacterSelection('unknown-character'), 'rosemund')
  assert.equal(normalizeCharacterSelection('hush-feather'), 'hush-feather')
})

test('carousel movement wraps in both directions', () => {
  assert.equal(moveCharacterSelection('rosemund', -1), 'the-kid')
  assert.equal(moveCharacterSelection('the-kid', 1), 'rosemund')
  assert.equal(moveCharacterSelection('rosemund', 3), 'zippo-jay')
})

test('wheel navigation follows the dominant finite axis', () => {
  assert.equal(characterDirectionFromWheel(0, 20), 1)
  assert.equal(characterDirectionFromWheel(-30, 5), -1)
  assert.equal(characterDirectionFromWheel(0, 1), 0)
  assert.equal(characterDirectionFromWheel(Number.NaN, 4), 1)
})
