import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCommand } from '../src/protocol.mjs'

function statusWith(actions) {
  return {
    protocol_version: 1,
    bidding: {
      current_bid: {
        player_id: 'local-player',
        count: 2,
        face: 3,
      },
    },
    players: [
      {
        id: 'local-player',
        is_local: true,
        available_actions: actions,
      },
      {
        id: 'opponent-1',
        is_local: false,
        available_actions: actions,
      },
    ],
  }
}

test('rejects local actor commands', () => {
  const result = validateCommand(statusWith([{ type: 'challenge' }]), {
    id: 'local-command',
    actor_id: 'local-player',
    action: 'challenge',
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'local_actor_forbidden')
})

test('rejects actions not exposed by Defold status', () => {
  const result = validateCommand(statusWith([]), {
    id: 'unavailable-command',
    actor_id: 'opponent-1',
    action: 'challenge',
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'action_unavailable')
})

test('validates load slot against available slots', () => {
  const result = validateCommand(statusWith([{ type: 'load', slots: [2, 4] }]), {
    id: 'load-command',
    actor_id: 'opponent-1',
    action: 'load',
    payload: { slot_index: 3 },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'slot_unavailable')
})

test('accepts a higher opponent bid', () => {
  const result = validateCommand(statusWith([{
    type: 'bid',
    min_count: 1,
    max_count: 36,
    min_face: 1,
    max_face: 6,
  }]), {
    id: 'bid-command',
    actor_id: 'opponent-1',
    action: 'bid',
    payload: { count: 2, face: 4 },
  })
  assert.equal(result.ok, true)
})

test('rejects a bid that does not raise current bid', () => {
  const result = validateCommand(statusWith([{
    type: 'bid',
    min_count: 1,
    max_count: 36,
    min_face: 1,
    max_face: 6,
  }]), {
    id: 'low-bid-command',
    actor_id: 'opponent-1',
    action: 'bid',
    payload: { count: 2, face: 3 },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'too_low')
})
