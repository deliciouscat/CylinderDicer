interface ParticipantLike {
  playerId: string
  displayName?: string
  isBot?: boolean
}

interface RoomParticipantLike {
  playerId: string
  displayName: string
}

interface RoomLike {
  room?: {
    _id: string
    status: string
  }
  allReady?: boolean
}

interface MatchRowLike {
  match: {
    _id: string
    revision: number
  }
}

interface MatchStateLike {
  state?: {
    pendingLoad?: { playerId?: string } | null
    turn?: { activePlayerId?: string }
  }
  participants?: ParticipantLike[]
  playerDeltas?: Record<string, { availableActions?: unknown[] } | null>
}

export function roomLabel(row: RoomLike) {
  const id = row.room?._id?.slice(-6) ?? 'room'
  const ready = row.allReady ? 'ready' : 'waiting'
  const status = row.room?.status ?? 'composing'
  return `${id} · ${status} · ${ready}`
}

export function matchLabel(row: MatchRowLike) {
  return `${row.match._id.slice(-6)} · r${row.match.revision}`
}

export function playerLabel(participant: ParticipantLike) {
  return participant.displayName ?? participant.playerId
}

export function roomPlayerLabel(participant: RoomParticipantLike) {
  return participant.displayName ?? participant.playerId
}

export function preferredBotPlayerId(state: MatchStateLike | null) {
  if (!state?.state) {
    return ''
  }
  const bots = (state.participants ?? []).filter((participant) => participant.isBot)
  const pendingPlayerId = state.state.pendingLoad?.playerId
  const activeId = state.state.turn?.activePlayerId
  const hasActions = (playerId: string) => {
    return (state.playerDeltas?.[playerId]?.availableActions?.length ?? 0) > 0
  }
  const pendingBot = bots.find((participant) => participant.playerId === pendingPlayerId)
  const activeBot = bots.find((participant) => {
    return participant.playerId === activeId && hasActions(participant.playerId)
  })
  const actionableBot = bots.find((participant) => hasActions(participant.playerId))
  return pendingBot?.playerId
    ?? activeBot?.playerId
    ?? actionableBot?.playerId
    ?? bots[0]?.playerId
    ?? ''
}

export function buildQaSteps(input: {
  roomReady: boolean
  matchSelected: boolean
  phase: string
  matchComplete: boolean
}) {
  return [
    { id: 'room-ready', label: 'Room: all opponents ready', done: input.roomReady },
    { id: 'match-linked', label: 'Match: linked in play tab', done: input.matchSelected },
    {
      id: 'setup',
      label: 'Gameplay: past setup reload',
      done: input.phase !== '' && input.phase !== 'revolver_reload',
    },
    {
      id: 'shake',
      label: 'Gameplay: shake phase reached',
      done: ['dice_check', 'bidding_gap', 'bidding', 'duel', 'complete'].includes(input.phase),
    },
    {
      id: 'bidding',
      label: 'Gameplay: bidding reached',
      done: ['bidding', 'duel', 'complete'].includes(input.phase),
    },
    {
      id: 'complete',
      label: 'Gameplay: match complete',
      done: input.phase === 'complete' || input.matchComplete,
    },
  ]
}
