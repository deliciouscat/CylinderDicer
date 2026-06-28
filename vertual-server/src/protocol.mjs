function asArray(value) {
  return Array.isArray(value) ? value : []
}

function integerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
}

function bidRank(bid) {
  return (bid.count * 10) + bid.face
}

export function validateCommand(status, command) {
  if (!status || status.protocol_version !== 1) {
    return { ok: false, error: 'status_unavailable' }
  }
  if (!command || typeof command !== 'object') {
    return { ok: false, error: 'invalid_command' }
  }
  if (typeof command.id !== 'string' || command.id.length === 0) {
    return { ok: false, error: 'missing_command_id' }
  }
  if (typeof command.actor_id !== 'string' || command.actor_id.length === 0) {
    return { ok: false, error: 'missing_actor_id' }
  }
  if (typeof command.action !== 'string' || command.action.length === 0) {
    return { ok: false, error: 'missing_action' }
  }

  const player = asArray(status.players).find((candidate) => candidate.id === command.actor_id)
  if (!player) {
    return { ok: false, error: 'unknown_actor' }
  }
  if (player.is_local) {
    return { ok: false, error: 'local_actor_forbidden' }
  }

  const available = asArray(player.available_actions)
  const action = available.find((candidate) => candidate.type === command.action)
  if (!action) {
    return { ok: false, error: 'action_unavailable' }
  }

  const payload = command.payload || {}
  if (command.action === 'load') {
    if (!integerInRange(payload.slot_index, 1, 6)) {
      return { ok: false, error: 'invalid_slot' }
    }
    if (!asArray(action.slots).includes(payload.slot_index)) {
      return { ok: false, error: 'slot_unavailable' }
    }
  }

  if (command.action === 'bid') {
    const minCount = action.min_count ?? 1
    const maxCount = action.max_count ?? 36
    const minFace = action.min_face ?? 1
    const maxFace = action.max_face ?? 6
    if (!integerInRange(payload.count, minCount, maxCount)) {
      return { ok: false, error: 'count_range' }
    }
    if (!integerInRange(payload.face, minFace, maxFace)) {
      return { ok: false, error: 'face_range' }
    }

    const current = status.bidding?.current_bid
    if (current && bidRank(payload) <= bidRank(current)) {
      return { ok: false, error: 'too_low' }
    }
  }

  return { ok: true, player, action }
}
