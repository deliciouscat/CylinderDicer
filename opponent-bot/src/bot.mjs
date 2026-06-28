const serverUrl = process.env.QA_SERVER_URL || 'http://127.0.0.1:4319'
const intervalMs = Number(process.env.BOT_INTERVAL_MS || 500)
const challengeRate = Number(process.env.BOT_CHALLENGE_RATE || 0.25)
const once = process.argv.includes('--once')
const configuredPlayers = new Set(
  (process.env.BOT_PLAYERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
)

let lastRevision = -1
let sequence = 0

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function controls(player) {
  if (player.is_local) {
    return false
  }
  if (configuredPlayers.size > 0) {
    return configuredPlayers.has(player.id)
  }
  return true
}

function chooseAction(status) {
  const candidates = asArray(status.players).filter(
    (player) => controls(player) && asArray(player.available_actions).length > 0,
  )
  const player = candidates[0]
  if (!player) {
    return null
  }

  const byType = new Map(asArray(player.available_actions).map((action) => [action.type, action]))
  for (const type of ['load_all', 'shake', 'check', 'open', 'resolve']) {
    if (byType.has(type)) {
      return { player, action: type }
    }
  }

  const bid = byType.get('bid')
  const challenge = byType.get('challenge')
  if (challenge && (!bid || Math.random() < challengeRate)) {
    return { player, action: 'challenge' }
  }
  if (bid) {
    return {
      player,
      action: 'bid',
      payload: {
        count: bid.suggested.count,
        face: bid.suggested.face,
      },
    }
  }

  const load = byType.get('load')
  if (load?.slots?.length) {
    return {
      player,
      action: 'load',
      payload: { slot_index: load.slots[0] },
    }
  }

  return null
}

async function readStatus() {
  const response = await fetch(`${serverUrl}/api/status`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`status ${response.status}`)
  }
  const status = await response.json()
  if (status.protocol_version !== 1) {
    throw new Error(`unsupported protocol ${status.protocol_version}`)
  }
  return status
}

async function dispatch(decision) {
  sequence += 1
  const command = {
    id: `bot-${Date.now()}-${sequence}`,
    actor_id: decision.player.id,
    action: decision.action,
    payload: decision.payload,
  }
  const response = await fetch(`${serverUrl}/api/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!response.ok) {
    const body = await response.json()
    throw new Error(body.error || `command ${response.status}`)
  }
  console.log(
    `[bot] ${decision.player.id} -> ${decision.action}`,
    decision.payload ? JSON.stringify(decision.payload) : '',
  )
}

async function tick() {
  try {
    const status = await readStatus()
    if (status.revision === lastRevision) {
      return false
    }
    lastRevision = status.revision

    if (status.match?.status === 'complete') {
      console.log(`[bot] match complete, winner=${status.match.winner_id}`)
      return true
    }

    const decision = chooseAction(status)
    if (decision) {
      await dispatch(decision)
    }
  } catch (error) {
    console.error(`[bot] ${error instanceof Error ? error.message : String(error)}`)
  }
  return false
}

console.log(`[bot] server=${serverUrl}`)
console.log(
  configuredPlayers.size > 0
    ? `[bot] players=${[...configuredPlayers].join(',')}`
    : '[bot] players=opponents',
)

if (once) {
  await tick()
} else {
  while (true) {
    const complete = await tick()
    if (complete) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
