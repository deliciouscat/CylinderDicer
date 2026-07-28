<script setup lang="ts">
import { useAuth } from '@clerk/vue'
import type { AvailableAction } from '@shared/protocol/game-bridge'
import { useConvexClient } from 'convex-vue'
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import {
  createAdminMatchService,
  type AdminCustomGameRoomView,
  type AdminDevMatchRow,
  type AdminLadderQaSession,
  type AdminAccessProbe,
  type AdminAuditRow,
  type AdminMatchState,
} from '../services/convex/adminMatchService'
import {
  buildQaSteps,
  matchLabel,
  playerLabel,
  preferredBotPlayerId,
  roomLabel,
  roomPlayerLabel,
} from './opponentControllerModel'

const emit = defineEmits<{
  back: []
}>()

const convex = useConvexClient()
const auth = useAuth()
const adminService = createAdminMatchService(convex)

const matches = ref<AdminDevMatchRow[]>([])
const customRooms = ref<AdminCustomGameRoomView[]>([])
const selectedMatchId = ref('')
const selectedRoomId = ref('')
const detail = ref<AdminMatchState | null>(null)
const roomDetail = ref<AdminCustomGameRoomView | null>(null)
const selectedPlayerId = ref('')
const selectedRoomPlayerId = ref('')
const roomMatchId = ref('')
const status = ref('Loading admin controller...')
const errorMessage = ref('')
const busy = ref(false)
const ladderQaBusy = ref(false)
const bidCount = ref(1)
const bidFace = ref(2)
const bidFaceOptions = [
  { value: 1, label: 'Skull (1)' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
] as const
const lastCommandLine = ref('')
const adminAccess = ref<AdminAccessProbe | null>(null)
const auditRows = ref<AdminAuditRow[]>([])
const ladderQaSession = ref<AdminLadderQaSession | null>(null)
const initialMatchId = new URLSearchParams(window.location.search).get('matchId') ?? ''
const initialRoomId = new URLSearchParams(window.location.search).get('roomId') ?? ''

let loadedOnce = false
let commandCounter = 0
let matchUnsubscribe: (() => void) | undefined
let roomUnsubscribe: (() => void) | undefined
let ladderQaUnsubscribe: (() => void) | undefined
let matchDetailRequest = 0
let pendingMatchDetailId = ''

const DEV_MATCH_PURGE_MAX_ATTEMPTS = 24

const isSignedIn = computed(() => auth.isSignedIn.value === true)
const canUseAdmin = computed(() => auth.isLoaded.value && isSignedIn.value && adminAccess.value?.authorized === true)
const adminAccessMessage = computed(() => {
  if (!auth.isLoaded.value) {
    return 'Waiting for Clerk...'
  }
  if (!isSignedIn.value) {
    return 'Sign in to use admin opponent controller.'
  }
  if (!adminAccess.value) {
    return 'Checking admin access...'
  }
  if (adminAccess.value.authorized) {
    return 'Admin access granted.'
  }
  return adminAccess.value.hint ?? `${adminAccess.value.code}: ${adminAccess.value.message ?? 'admin_access_denied'}`
})
const participants = computed(() => detail.value?.participants ?? [])
const roomParticipants = computed(() => roomDetail.value?.participants ?? [])
const virtualRoomParticipants = computed(() => {
  return roomParticipants.value.filter((participant) => participant.participantKind === 'virtual')
})
const selectedRoomParticipant = computed(() => {
  return virtualRoomParticipants.value.find((participant) => participant.playerId === selectedRoomPlayerId.value)
})
const selectedRoomRow = computed(() => {
  return customRooms.value.find((row) => row.room?._id === selectedRoomId.value) ?? null
})
const selectedRoomStarted = computed(() => {
  return (roomDetail.value?.room?.status ?? selectedRoomRow.value?.room?.status) === 'started'
})
const selectedRoomMatchId = computed(() => {
  if (!selectedRoomStarted.value) {
    return ''
  }
  return roomMatchId.value
    || roomDetail.value?.room?.matchId
    || selectedRoomRow.value?.room?.matchId
    || ''
})
const activeMatchId = computed(() => selectedMatchId.value || selectedRoomMatchId.value)
const botParticipants = computed(() => participants.value.filter((participant) => participant.isBot))
const selectedParticipant = computed(() => {
  return participants.value.find((participant) => participant.playerId === selectedPlayerId.value)
})
const selectedDelta = computed(() => {
  return detail.value?.playerDeltas?.[selectedPlayerId.value] ?? null
})
const availableActions = computed<AvailableAction[]>(() => {
  return (selectedDelta.value?.availableActions ?? []) as AvailableAction[]
})
const currentPlayer = computed(() => {
  return detail.value?.state?.players?.byId?.[selectedPlayerId.value] ?? null
})
const phaseLabel = computed(() => detail.value?.state?.flow?.phase ?? 'unknown')
const activePlayerId = computed(() => detail.value?.state?.turn?.activePlayerId ?? '')
const pendingLoad = computed(() => detail.value?.state?.pendingLoad ?? null)
const composingRooms = computed(() => {
  return customRooms.value.filter((row) => row.room?.status === 'composing')
})
const startedRooms = computed(() => {
  return customRooms.value.filter((row) => row.room?.status === 'started')
})
const humanRoomParticipants = computed(() => {
  return roomParticipants.value.filter((participant) => participant.participantKind === 'human')
})
const qaSteps = computed(() => {
  const phase = detail.value?.state?.flow?.phase ?? ''
  return buildQaSteps({
    roomReady: roomDetail.value?.allReady === true,
    matchSelected: Boolean(activeMatchId.value && detail.value?.ok === true),
    phase,
    matchComplete: detail.value?.state?.match?.status === 'complete',
  })
})
const ladderQaCanAdd = computed(() => {
  const session = ladderQaSession.value
  if (!session) return false
  return session.status === 'waiting_for_player'
    ? session.pendingOpponents.length < session.maxPlayerCount - 1
    : session.playerCount < session.maxPlayerCount
})
const playMatchUrl = computed(() => {
  if (!activeMatchId.value) {
    return ''
  }
  return `/play/dev?matchId=${encodeURIComponent(activeMatchId.value)}`
})

function applyMatchDetail(next: AdminMatchState | null) {
  if (!next) {
    detail.value = null
    return
  }
  detail.value = next
  if (next.ok === false) {
    errorMessage.value = `${next.code ?? 'ADMIN_ERROR'}: ${next.message ?? 'admin_error'}`
    return
  }
  const preferred = preferredBotPlayerId(next)
  const selectedStillExists = botParticipants.value.some((participant) => {
    return participant.playerId === selectedPlayerId.value
  })
  const selectedHasActions = (next.playerDeltas?.[selectedPlayerId.value]?.availableActions?.length ?? 0) > 0
  if (selectedStillExists && selectedHasActions) {
    // Keep the operator on the bot they are actively controlling.
  } else if (preferred) {
    selectedPlayerId.value = preferred
  } else if (!selectedStillExists) {
    selectedPlayerId.value = botParticipants.value[0]?.playerId ?? ''
  }
  syncSuggestedBid()
}

function applyRoomDetail(next: AdminCustomGameRoomView | null) {
  if (!next) {
    roomDetail.value = null
    roomMatchId.value = ''
    return
  }
  roomDetail.value = next
  roomMatchId.value = next.room?.matchId ?? ''
  if (next.ok === false) {
    errorMessage.value = `${next.code ?? 'ROOM_ERROR'}: ${next.message ?? 'room_error'}`
    return
  }
  const selectedStillExists = virtualRoomParticipants.value.some((participant) => {
    return participant.playerId === selectedRoomPlayerId.value
  })
  if (!selectedStillExists) {
    const firstVirtualPlayerId = virtualRoomParticipants.value[0]?.playerId ?? ''
    selectedRoomPlayerId.value = firstVirtualPlayerId
    if (!selectedPlayerId.value) {
      selectedPlayerId.value = firstVirtualPlayerId
    }
  } else if (selectedRoomPlayerId.value && !selectedPlayerId.value) {
    selectedPlayerId.value = selectedRoomPlayerId.value
  }

  const linkedMatchId = next.room?.status === 'started' ? next.room.matchId ?? '' : ''
  if (linkedMatchId
    && detail.value?.match?._id !== linkedMatchId
    && pendingMatchDetailId !== linkedMatchId) {
    void loadDetail(linkedMatchId)
  }
}

function updateMatchIdInUrl(matchId: string) {
  const url = new URL(window.location.href)
  if (matchId) {
    url.searchParams.set('matchId', matchId)
    url.searchParams.delete('roomId')
  } else {
    url.searchParams.delete('matchId')
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}`)
}

function updateRoomIdInUrl(roomId: string) {
  const url = new URL(window.location.href)
  if (roomId) {
    url.searchParams.set('roomId', roomId)
    url.searchParams.delete('matchId')
  } else {
    url.searchParams.delete('roomId')
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}`)
}

function subscribeMatchDetail(matchId: string) {
  matchUnsubscribe?.()
  matchUnsubscribe = adminService.subscribeAdminMatchState(
    matchId,
    (next) => applyMatchDetail(next),
    (error) => {
      errorMessage.value = error.message
    },
  )
}

function subscribeRoomDetail(roomId: string) {
  roomUnsubscribe?.()
  roomUnsubscribe = adminService.subscribeAdminCustomGameRoom(
    roomId,
    (next) => applyRoomDetail(next),
    (error) => {
      errorMessage.value = error.message
    },
  )
}

function generateCommandId(type: string) {
  commandCounter += 1
  return `admin-${Date.now()}-${commandCounter}-${type}`
}

function openStartedRoomMatch(row: AdminCustomGameRoomView) {
  const matchId = row.room?.matchId
  if (!matchId) {
    return
  }
  selectMatch(matchId)
}

function selectMatch(matchId: string) {
  selectedMatchId.value = matchId
  selectedRoomId.value = ''
  roomMatchId.value = ''
  roomDetail.value = null
  roomUnsubscribe?.()
  roomUnsubscribe = undefined
}

function selectRoom(roomId: string, matchId = '') {
  selectedRoomId.value = roomId
  selectedMatchId.value = ''
  roomMatchId.value = matchId
  detail.value = null
  matchUnsubscribe?.()
  matchUnsubscribe = undefined
}

function openPlayMatch() {
  if (!playMatchUrl.value) {
    return
  }
  window.open(playMatchUrl.value, '_blank', 'noopener,noreferrer')
}

function openCustomGame() {
  window.open('/play/custom-game', '_blank', 'noopener,noreferrer')
}

function syncSuggestedBid() {
  const bidAction = availableActions.value.find((action) => action.type === 'bid')
  if (!bidAction?.suggested) {
    return
  }
  bidCount.value = Math.max(1, Number(bidAction.suggested.count ?? bidCount.value))
  bidFace.value = Math.max(1, Math.min(6, Number(bidAction.suggested.face ?? bidFace.value)))
}

async function loadAdminAccess() {
  if (!auth.isLoaded.value || !isSignedIn.value) {
    adminAccess.value = null
    return
  }
  try {
    adminAccess.value = await adminService.probeAdminAccess()
  } catch (error) {
    adminAccess.value = {
      ok: false,
      authorized: false,
      code: 'ADMIN_PROBE_FAILED',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function loadAuditRows() {
  if (!adminAccess.value?.authorized) {
    auditRows.value = []
    return
  }
  try {
    auditRows.value = await adminService.listRecentAdminAudit({
      limit: 12,
      matchId: activeMatchId.value || undefined,
      customGameRoomId: selectedRoomId.value || undefined,
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

function subscribeLadderQaSession() {
  ladderQaUnsubscribe?.()
  ladderQaUnsubscribe = adminService.subscribeLatestLadderQaSession(
    (session) => {
      ladderQaSession.value = session
    },
    (error) => {
      errorMessage.value = error.message
    },
  )
}

async function loadLadderQaSession() {
  if (!adminAccess.value?.authorized) {
    ladderQaSession.value = null
    ladderQaUnsubscribe?.()
    ladderQaUnsubscribe = undefined
    return
  }
  ladderQaSession.value = await adminService.getLatestLadderQaSession()
  subscribeLadderQaSession()
}

async function loadMatches() {
  if (!adminAccess.value?.authorized) {
    return
  }

  errorMessage.value = ''
  matches.value = await adminService.listAdminDevMatches({ status: 'ready', limit: 25 })
  if (!selectedRoomId.value && !selectedMatchId.value && initialMatchId) {
    selectedMatchId.value = initialMatchId
  }
  if (!selectedRoomId.value && !selectedMatchId.value && matches.value[0]) {
    selectedMatchId.value = matches.value[0].match._id
  }
  status.value = `${customRooms.value.length} custom rooms · ${matches.value.length} dev matches`
}

async function loadCustomRooms() {
  if (!adminAccess.value?.authorized) {
    return
  }
  const [composing, started] = await Promise.all([
    adminService.listAdminCustomGameRooms({ status: 'composing', limit: 25 }),
    adminService.listAdminCustomGameRooms({ status: 'started', limit: 15 }),
  ])
  customRooms.value = [...composing, ...started]
  if (!selectedRoomId.value && !selectedMatchId.value) {
    if (initialRoomId) {
      selectedRoomId.value = initialRoomId
    } else if (composing[0]?.room?._id) {
      selectedRoomId.value = composing[0].room._id
    }
  }
}

async function loadDetail(requestedMatchId = activeMatchId.value) {
  const matchId = requestedMatchId
  const request = ++matchDetailRequest
  if (!matchId || !adminAccess.value?.authorized) {
    detail.value = null
    matchUnsubscribe?.()
    matchUnsubscribe = undefined
    return
  }

  errorMessage.value = ''
  pendingMatchDetailId = matchId
  try {
    const next = await adminService.getAdminMatchState(matchId)
    if (request !== matchDetailRequest || activeMatchId.value !== matchId) {
      return
    }
    applyMatchDetail(next)
    subscribeMatchDetail(matchId)
  } finally {
    if (request === matchDetailRequest) {
      pendingMatchDetailId = ''
    }
  }
}

async function loadRoomDetail() {
  if (!selectedRoomId.value || !adminAccess.value?.authorized) {
    roomDetail.value = null
    roomMatchId.value = ''
    roomUnsubscribe?.()
    roomUnsubscribe = undefined
    return
  }
  errorMessage.value = ''
  applyRoomDetail(await adminService.getAdminCustomGameRoom(selectedRoomId.value))
  subscribeRoomDetail(selectedRoomId.value)
}

async function createOrReuseDevMatch() {
  if (!adminAccess.value?.authorized) {
    status.value = adminAccessMessage.value
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const created = await adminService.createDevMatchWithBots({
      localPlayerName: 'Admin',
      requiresSetupLoad: true,
      reuseActive: true,
    }) as { matchId: string }
    selectedMatchId.value = created.matchId
    await loadMatches()
    await loadDetail()
    status.value = 'Standalone dev match ready'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function dismissDevMatch(matchId: string, bulk = false) {
  if (!adminAccess.value?.authorized || !matchId) {
    return false
  }
  if (!bulk && !window.confirm('Permanently remove this ready dev match and its QA game data?')) {
    return false
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const completion = await adminService.dismissReadyDevMatch(matchId)
    if (completion.ok === false) {
      errorMessage.value = `${completion.code ?? 'DEV_MATCH_REMOVE_REJECTED'}`
      return false
    }

    let purgeResult: Awaited<ReturnType<typeof adminService.purgeCompletedDevMatchData>> | null = null
    for (let attempt = 0; attempt < DEV_MATCH_PURGE_MAX_ATTEMPTS; attempt += 1) {
      purgeResult = await adminService.purgeCompletedDevMatchData({ matchId })
      if (purgeResult.ok === false) {
        errorMessage.value = `${purgeResult.code ?? 'DEV_MATCH_PURGE_REJECTED'}`
        return false
      }
      if (!purgeResult.mayHaveMore) {
        break
      }
    }

    if (!purgeResult || purgeResult.mayHaveMore || !purgeResult.parentDeleted?.match) {
      errorMessage.value = 'DEV_MATCH_PURGE_INCOMPLETE'
      return false
    }

    if (selectedMatchId.value === matchId) {
      selectedMatchId.value = ''
      detail.value = null
      matchUnsubscribe?.()
      matchUnsubscribe = undefined
    }
    status.value = 'Dev match and QA game data permanently removed'
    lastCommandLine.value = `purge dev match ok · completion audit ${completion.auditId ?? '-'} · purge audit ${purgeResult.auditId ?? '-'}`
    await loadMatches()
    await loadDetail()
    await loadAuditRows()
    return true
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    return false
  } finally {
    busy.value = false
  }
}

async function dismissAllDevMatches() {
  if (matches.value.length === 0) {
    return
  }
  if (!window.confirm(`Permanently remove all ${matches.value.length} ready dev matches and their QA game data?`)) {
    return
  }
  const matchIds = matches.value.map((row) => row.match._id)
  for (const matchId of matchIds) {
    const removed = await dismissDevMatch(matchId, true)
    if (!removed) {
      break
    }
  }
}

async function refreshAll() {
  busy.value = true
  errorMessage.value = ''
  try {
    await loadAdminAccess()
    if (!adminAccess.value?.authorized) {
      status.value = adminAccessMessage.value
      matches.value = []
      customRooms.value = []
      detail.value = null
      roomDetail.value = null
      roomMatchId.value = ''
      auditRows.value = []
      return
    }
    await loadCustomRooms()
    await loadLadderQaSession()
    await loadMatches()
    await loadRoomDetail()
    await loadDetail()
    await loadAuditRows()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function addLadderQaOpponent() {
  if (!ladderQaCanAdd.value || !adminAccess.value?.authorized) {
    return
  }
  ladderQaBusy.value = true
  errorMessage.value = ''
  try {
    const result = await adminService.addLadderQaOpponent()
    if (result.ok === false) {
      errorMessage.value = `${result.code ?? 'LADDER_QA_REJECTED'}`
      lastCommandLine.value = `ladder opponent rejected · ${result.code ?? 'error'}`
    } else {
      status.value = result.waitingForPlayer
        ? `${result.playerCount} Ladder QA bots waiting for a player`
        : `Ladder QA roster staged with ${result.playerCount} players`
      lastCommandLine.value = `ladder opponent added · ${result.opponentDisplayName} · audit ${result.auditId ?? '-'}`
    }
    await loadLadderQaSession()
    await loadAuditRows()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    ladderQaBusy.value = false
  }
}

async function setSelectedRoomReady(ready: boolean) {
  if (!selectedRoomId.value || !selectedRoomPlayerId.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const result = await adminService.setCustomGameOpponentReady({
      roomId: selectedRoomId.value,
      targetPlayerId: selectedRoomPlayerId.value,
      ready,
    })
    if (result.ok === false) {
      errorMessage.value = `${result.code ?? 'READY_REJECTED'}: ${result.message ?? 'ready_rejected'}`
      lastCommandLine.value = `ready ${ready} rejected`
    } else {
      status.value = `Set ${selectedRoomPlayerId.value} ${ready ? 'ready' : 'waiting'}`
      lastCommandLine.value = `ready ${ready} ok · audit ${result.auditId ?? '-'}`
    }
    await loadRoomDetail()
    await loadCustomRooms()
    await loadAuditRows()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function setAllRoomOpponentsReady(ready: boolean) {
  if (!selectedRoomId.value || virtualRoomParticipants.value.length === 0) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    for (const participant of virtualRoomParticipants.value) {
      const result = await adminService.setCustomGameOpponentReady({
        roomId: selectedRoomId.value,
        targetPlayerId: participant.playerId,
        ready,
      })
      if (result.ok === false) {
        errorMessage.value = `${result.code ?? 'READY_REJECTED'}: ${result.message ?? 'ready_rejected'}`
        break
      }
    }
    status.value = ready ? 'All virtual opponents ready' : 'All virtual opponents waiting'
    await loadRoomDetail()
    await loadCustomRooms()
    await loadAuditRows()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function closeSelectedStartedRoom() {
  if (!selectedRoomId.value || !selectedRoomStarted.value) {
    return
  }
  if (!window.confirm('Close this started custom room?')) {
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const closingRoomId = selectedRoomId.value
    const result = await adminService.closeStartedCustomGameRoom(closingRoomId)
    if (result.ok === false) {
      errorMessage.value = `${result.code ?? 'CLOSE_ROOM_REJECTED'}: ${result.message ?? 'close_room_rejected'}`
      lastCommandLine.value = `close room rejected · ${result.code ?? 'error'}`
    } else {
      status.value = 'Started custom room closed'
      lastCommandLine.value = `close room ok · audit ${result.auditId ?? '-'}`
      selectedRoomId.value = ''
      roomMatchId.value = ''
      roomDetail.value = null
      roomUnsubscribe?.()
      roomUnsubscribe = undefined
    }
    await loadCustomRooms()
    await loadMatches()
    await loadAuditRows()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function commandTypeForLoad() {
  return pendingLoad.value?.source === 'setup' ? 'setup.load_initial' : 'bullet.load'
}

async function submitCommand(type: string, payload?: unknown) {
  const matchId = activeMatchId.value
  if (!detail.value?.state || !matchId || !selectedPlayerId.value) {
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const revision = detail.value.state.revision
    const result = await adminService.submitOpponentCommand({
      matchId,
      targetPlayerId: selectedPlayerId.value,
      commandId: generateCommandId(type),
      revision,
      type,
      payload,
    })
    if (result.ok === false) {
      errorMessage.value = `${result.code ?? 'COMMAND_REJECTED'}: ${result.message ?? 'command_rejected'}`
      lastCommandLine.value = `${type} rejected · ${result.code ?? 'error'}`
      if (result.code === 'STALE_REVISION') {
        await loadDetail()
        status.value = `Stale revision — refreshed to r${detail.value?.state?.revision ?? '?'}`
      }
    } else {
      status.value = `Submitted ${type} · r${result.revision ?? detail.value.state.revision}`
      lastCommandLine.value = `${type} ok · audit ${result.auditId ?? '-'} · r${result.revision ?? '-'}`
    }
    await loadDetail()
    await loadMatches()
    await loadAuditRows()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function submitLoadAll() {
  const matchId = activeMatchId.value
  if (!detail.value?.state?.pendingLoad || !matchId) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (!detail.value?.state?.pendingLoad) {
        break
      }
      const loadAction = availableActions.value.find((action) => action.type === 'load')
      const slot = loadAction?.slots?.[0]
      if (!slot) {
        break
      }
      const revision = detail.value.state.revision
      const result = await adminService.submitOpponentCommand({
        matchId,
        targetPlayerId: selectedPlayerId.value,
        commandId: generateCommandId(commandTypeForLoad()),
        revision,
        type: commandTypeForLoad(),
        payload: { slotIndex: slot },
      })
      if (result.ok === false) {
        errorMessage.value = `${result.code ?? 'COMMAND_REJECTED'}: ${result.message ?? 'command_rejected'}`
        if (result.code === 'STALE_REVISION') {
          await loadDetail()
        }
        break
      }
      applyMatchDetail(await adminService.getAdminMatchState(matchId))
    }
    lastCommandLine.value = `load_all finished · r${detail.value?.state?.revision ?? '-'}`
    await loadMatches()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function submitAction(action: AvailableAction) {
  if (action.type === 'load_all') {
    void submitLoadAll()
  } else if (action.type === 'shake_complete') {
    void submitCommand(action.command)
	} else if (action.type === 'check') {
	  void submitCommand('dice.check')
	} else if (action.type === 'challenge') {
	  void submitCommand('bid.challenge')
	}
}

function submitLoad(slotIndex: number) {
  void submitCommand(commandTypeForLoad(), { slotIndex })
}

function submitBid() {
	const face = Math.max(1, Math.min(6, Number(bidFace.value)))
	let count = Math.max(1, Math.min(36, Number(bidCount.value)))
	const currentBid = detail.value?.state?.bidding?.currentBid
	if (face === 1 && currentBid && count * 10 + face <= currentBid.count * 10 + currentBid.face) {
		count = Math.min(36, currentBid.count + 1)
		bidCount.value = count
	}
  void submitCommand('bid.raise', {
    bid: {
      playerId: selectedPlayerId.value,
			count,
			face,
    },
  })
}

watchEffect(() => {
  if (!auth.isLoaded.value) {
    return
  }

  if (!isSignedIn.value) {
    convex.setAuth(async () => null)
    adminAccess.value = null
    status.value = 'Sign in to use admin.'
    return
  }

  convex.setAuth(
    async ({ forceRefreshToken }) => {
      return await auth.getToken.value({
        template: 'convex',
        skipCache: forceRefreshToken,
      })
    },
    () => {},
  )
})

watchEffect(() => {
  if (!auth.isLoaded.value || !isSignedIn.value || loadedOnce) {
    return
  }
  loadedOnce = true
  void refreshAll()
})

watch([selectedMatchId, selectedRoomId], () => {
  if (adminAccess.value?.authorized) {
    void loadAuditRows()
  }
})

watch(activeMatchId, () => {
  if (adminAccess.value?.authorized) {
    void loadDetail()
    void loadAuditRows()
  }
})

watch(selectedMatchId, () => {
  if (!selectedRoomId.value) {
    updateMatchIdInUrl(selectedMatchId.value)
  }
  void loadDetail()
})

watch(selectedRoomId, () => {
  updateRoomIdInUrl(selectedRoomId.value)
  void loadRoomDetail()
})

watch(selectedPlayerId, () => {
  syncSuggestedBid()
})

onMounted(() => {
  if (!auth.isLoaded.value) {
    status.value = 'Waiting for Clerk...'
  }
})

onUnmounted(() => {
  matchUnsubscribe?.()
  roomUnsubscribe?.()
  ladderQaUnsubscribe?.()
})
</script>

<template>
  <main class="opponent-controller">
    <header class="opponent-controller__header">
      <button class="opponent-controller__button" type="button" @click="emit('back')">
        Back
      </button>
      <div class="opponent-controller__title">
        <h1>Opponent Controller</h1>
        <p>{{ status }}</p>
        <p v-if="!adminAccess?.authorized" class="opponent-controller__warn">{{ adminAccessMessage }}</p>
        <p v-if="lastCommandLine" class="opponent-controller__last">{{ lastCommandLine }}</p>
        <p v-if="errorMessage" class="opponent-controller__error">{{ errorMessage }}</p>
      </div>
      <div class="opponent-controller__header-actions">
        <button class="opponent-controller__button" type="button" :disabled="busy" @click="refreshAll">
          Refresh
        </button>
        <button class="opponent-controller__button" type="button" :disabled="!playMatchUrl" @click="openPlayMatch">
          Open Play
        </button>
        <button class="opponent-controller__button" type="button" @click="openCustomGame">
          Open Custom Game
        </button>
        <button class="opponent-controller__button opponent-controller__button--primary" type="button" :disabled="busy" @click="createOrReuseDevMatch">
          Create Dev Match
        </button>
      </div>
    </header>

    <section class="opponent-controller__qa">
      <p class="opponent-controller__group-label">QA Playthrough</p>
      <ul class="opponent-controller__qa-list">
        <li
          v-for="step in qaSteps"
          :key="step.id"
          :class="{ 'is-done': step.done }"
        >
          {{ step.label }}
        </li>
      </ul>
    </section>

    <section v-if="adminAccess?.authorized" class="opponent-controller__qa opponent-controller__ladder-qa" data-testid="ladder-qa-panel">
      <div>
        <p class="opponent-controller__group-label">Ladder QA</p>
        <p v-if="ladderQaSession?.status === 'player_joined'" class="opponent-controller__ladder-copy" data-testid="ladder-qa-session">
          {{ ladderQaSession.displayName }} · {{ ladderQaSession.playerCount }}/{{ ladderQaSession.maxPlayerCount }} players staged
        </p>
        <p v-else-if="ladderQaSession" class="opponent-controller__ladder-copy" data-testid="ladder-qa-pool">
          {{ ladderQaSession.pendingOpponents.length }}/5 virtual opponents waiting · player joins after them
        </p>
        <p v-else class="opponent-controller__ladder-copy">
          Loading Ladder QA queue…
        </p>
        <p class="opponent-controller__empty">
          Add bots before or after opening Ladder. Six players start immediately; smaller QA rosters wait up to 40 seconds from player arrival.
        </p>
      </div>
      <button
        class="opponent-controller__button opponent-controller__button--primary"
        data-testid="add-ladder-opponent"
        type="button"
        :disabled="ladderQaBusy || !ladderQaCanAdd"
        @click="addLadderQaOpponent"
      >
        Add Ladder Opponent
      </button>
    </section>

    <section class="opponent-controller__layout">
      <aside class="opponent-controller__matches">
        <p class="opponent-controller__group-label">Custom Rooms (composing)</p>
        <p v-if="composingRooms.length === 0" class="opponent-controller__empty">
          No custom rooms. Create one from Custom Game, then use this controller to ready virtual opponents.
        </p>
        <button
          v-for="row in composingRooms"
          :key="row.room?._id"
          class="opponent-controller__match"
          :class="{ 'is-selected': selectedRoomId === row.room?._id }"
          type="button"
          @click="row.room?._id && selectRoom(row.room._id, row.room.matchId ?? '')"
        >
          <span>{{ roomLabel(row) }}</span>
          <small>{{ row.participants?.length ?? 0 }} players</small>
        </button>

        <p class="opponent-controller__group-label">Custom Rooms (started)</p>
        <button
          v-for="row in startedRooms"
          :key="`started-${row.room?._id}`"
          class="opponent-controller__match"
          :class="{ 'is-selected': selectedRoomId === row.room?._id }"
          type="button"
          @click="row.room?._id && selectRoom(row.room._id, row.room.matchId ?? '')"
        >
          <span>{{ roomLabel(row) }}</span>
          <small>match {{ row.room?.matchId?.slice(-6) ?? '-' }}</small>
        </button>

        <p class="opponent-controller__group-label">Dev Matches</p>
        <div class="opponent-controller__list-actions">
          <p class="opponent-controller__empty">
            Create Dev Match is a direct admin QA shortcut. It does not create a Custom Game room.
          </p>
          <button
            class="opponent-controller__button opponent-controller__button--danger"
            type="button"
            :disabled="busy || matches.length === 0"
            @click="dismissAllDevMatches"
          >
            Remove All ({{ matches.length }})
          </button>
        </div>
        <div v-for="row in matches" :key="row.match._id" class="opponent-controller__match-row">
          <button
            class="opponent-controller__match"
            :class="{ 'is-selected': selectedMatchId === row.match._id }"
            type="button"
            @click="selectMatch(row.match._id)"
          >
            <span>{{ matchLabel(row) }}</span>
            <small>{{ row.participants.length }} players</small>
          </button>
          <button
            class="opponent-controller__button opponent-controller__button--danger opponent-controller__remove-match"
            type="button"
            :disabled="busy"
            @click="dismissDevMatch(row.match._id)"
          >
            Remove
          </button>
        </div>
      </aside>

      <section v-if="selectedRoomId" class="opponent-controller__detail">
        <div class="opponent-controller__meta">
          <span>Room {{ selectedRoomId.slice(-6) }}</span>
          <span>Status {{ roomDetail?.room?.status ?? '-' }}</span>
          <span>Ready {{ roomDetail?.allReady ? 'all' : 'waiting' }}</span>
          <span>Invite {{ roomDetail?.room?.inviteCode ?? '-' }}</span>
        </div>

        <div class="opponent-controller__players">
          <button
            v-for="participant in humanRoomParticipants"
            :key="participant.playerId"
            class="opponent-controller__player opponent-controller__player--human"
            type="button"
            disabled
          >
            <span>{{ roomPlayerLabel(participant) }}</span>
            <small>{{ participant.playerId }} · {{ participant.ready ? 'ready' : 'waiting' }}</small>
          </button>
          <button
            v-for="participant in virtualRoomParticipants"
            :key="participant.playerId"
            class="opponent-controller__player"
            :class="{ 'is-selected': selectedRoomPlayerId === participant.playerId }"
            type="button"
            @click="selectedRoomPlayerId = participant.playerId; selectedPlayerId = participant.playerId"
          >
            <span>{{ roomPlayerLabel(participant) }}</span>
            <small>{{ participant.ready ? 'ready' : 'waiting' }}</small>
          </button>
        </div>

        <div v-if="selectedRoomParticipant" class="opponent-controller__state">
          <div>
            <strong>{{ roomPlayerLabel(selectedRoomParticipant) }}</strong>
            <span>{{ selectedRoomParticipant.archetype ?? 'virtual' }}</span>
            <span>{{ selectedRoomParticipant.playerId }}</span>
          </div>
          <div>
            <span>Ready {{ selectedRoomParticipant.ready ? 'yes' : 'no' }}</span>
            <span>Seat {{ selectedRoomParticipant.seatIndex }}</span>
          </div>
        </div>

        <div class="opponent-controller__actions">
          <template v-if="!selectedRoomStarted">
            <button
              class="opponent-controller__button opponent-controller__button--primary"
              type="button"
              :disabled="busy || virtualRoomParticipants.length === 0"
              @click="setAllRoomOpponentsReady(true)"
            >
              Ready All
            </button>
            <button
              class="opponent-controller__button"
              type="button"
              :disabled="busy || virtualRoomParticipants.length === 0"
              @click="setAllRoomOpponentsReady(false)"
            >
              Unready All
            </button>
            <button
              class="opponent-controller__button opponent-controller__button--primary"
              type="button"
              :disabled="busy || !selectedRoomParticipant"
              @click="setSelectedRoomReady(true)"
            >
              Ready
            </button>
            <button
              class="opponent-controller__button"
              type="button"
              :disabled="busy || !selectedRoomParticipant"
              @click="setSelectedRoomReady(false)"
            >
              Unready
            </button>
          </template>
          <button
            v-if="activeMatchId"
            class="opponent-controller__button"
            type="button"
            @click="selectMatch(activeMatchId)"
          >
            Open Started Match
          </button>
          <button
            v-if="selectedRoomStarted"
            class="opponent-controller__button opponent-controller__button--danger"
            type="button"
            :disabled="busy"
            @click="closeSelectedStartedRoom"
          >
            Close this room
          </button>
          <p v-if="virtualRoomParticipants.length === 0" class="opponent-controller__empty">
            No custom room opponents
          </p>
        </div>

        <div v-if="selectedRoomStarted" class="opponent-controller__started-panel">
          <p class="opponent-controller__group-label">Started Match Controls</p>

          <div class="opponent-controller__meta">
            <span>Match {{ activeMatchId ? activeMatchId.slice(-6) : 'none' }}</span>
            <span>Phase {{ phaseLabel }}</span>
            <span>Active {{ activePlayerId || 'none' }}</span>
            <span>Revision {{ detail?.state?.revision ?? '-' }}</span>
          </div>

          <div class="opponent-controller__players">
            <button
              v-for="participant in botParticipants"
              :key="`started-match-${participant.playerId}`"
              class="opponent-controller__player"
              :class="{
                'is-selected': selectedPlayerId === participant.playerId,
                'is-active-turn': activePlayerId === participant.playerId,
                'is-pending-load': pendingLoad?.playerId === participant.playerId,
              }"
              type="button"
              @click="selectedPlayerId = participant.playerId"
            >
              <span>{{ playerLabel(participant) }}</span>
              <small>{{ participant.playerId }}</small>
            </button>
          </div>

          <div v-if="selectedParticipant" class="opponent-controller__state">
            <div>
              <strong>{{ playerLabel(selectedParticipant) }}</strong>
              <span>HP {{ currentPlayer?.hp ?? '-' }}</span>
              <span>Bullets {{ currentPlayer?.bullets ?? '-' }}</span>
            </div>
            <div>
              <span>Dice {{ selectedDelta?.dice?.join(', ') || '-' }}</span>
              <span>Actions {{ availableActions.length }}</span>
            </div>
          </div>

          <div class="opponent-controller__actions">
			<template v-for="action in availableActions" :key="`started-${action.type}`">
              <div v-if="action.type === 'load'" class="opponent-controller__load">
                <button
                  v-for="slot in action.slots"
                  :key="`started-slot-${slot}`"
                  class="opponent-controller__button"
                  type="button"
                  :disabled="busy"
                  @click="submitLoad(slot)"
                >
                  Slot {{ slot }}
                </button>
              </div>

              <button
                v-else-if="action.type === 'load_all'"
                class="opponent-controller__button opponent-controller__button--primary"
                type="button"
                :disabled="busy"
                @click="submitAction(action)"
              >
                Load All
              </button>

              <div v-else-if="action.type === 'bid'" class="opponent-controller__bid">
                <label>
                  Count
                  <input v-model.number="bidCount" type="number" min="1" max="36" />
                </label>
                <label>
                  Face
                  <select v-model.number="bidFace">
                    <option v-for="face in bidFaceOptions" :key="face.value" :value="face.value">
                      {{ face.label }}
                    </option>
                  </select>
                </label>
                <button class="opponent-controller__button opponent-controller__button--primary" type="button" :disabled="busy" @click="submitBid">
                  Raise
                </button>
              </div>

              <button
                v-else-if="action.type === 'shake_complete'"
                class="opponent-controller__button opponent-controller__button--primary"
                type="button"
                :disabled="busy"
                @click="submitAction(action)"
              >
                Complete Shake
              </button>

              <button
                v-else
                class="opponent-controller__button opponent-controller__button--primary"
                type="button"
                :disabled="busy"
                @click="submitAction(action)"
              >
                {{ action.type }}
              </button>
            </template>

            <p v-if="activeMatchId && !detail" class="opponent-controller__empty">
              Loading match controls...
            </p>
            <p v-if="detail && selectedPlayerId && availableActions.length === 0" class="opponent-controller__empty">
              No actions
            </p>
          </div>
        </div>
      </section>

      <section v-else class="opponent-controller__detail">
        <div class="opponent-controller__meta">
          <span>Match {{ selectedMatchId ? selectedMatchId.slice(-6) : 'none' }}</span>
          <span>Phase {{ phaseLabel }}</span>
          <span>Active {{ activePlayerId || 'none' }}</span>
          <span>Revision {{ detail?.state?.revision ?? '-' }}</span>
        </div>

        <div class="opponent-controller__players">
          <button
            v-for="participant in botParticipants"
            :key="participant.playerId"
            class="opponent-controller__player"
            :class="{
              'is-selected': selectedPlayerId === participant.playerId,
              'is-active-turn': activePlayerId === participant.playerId,
              'is-pending-load': pendingLoad?.playerId === participant.playerId,
            }"
            type="button"
            @click="selectedPlayerId = participant.playerId"
          >
            <span>{{ playerLabel(participant) }}</span>
            <small>{{ participant.playerId }}</small>
          </button>
        </div>

        <div v-if="selectedParticipant" class="opponent-controller__state">
          <div>
            <strong>{{ playerLabel(selectedParticipant) }}</strong>
            <span>HP {{ currentPlayer?.hp ?? '-' }}</span>
            <span>Bullets {{ currentPlayer?.bullets ?? '-' }}</span>
          </div>
          <div>
            <span>Dice {{ selectedDelta?.dice?.join(', ') || '-' }}</span>
            <span>Actions {{ availableActions.length }}</span>
          </div>
        </div>

        <div class="opponent-controller__actions">
		  <template v-for="action in availableActions" :key="action.type">
            <div v-if="action.type === 'load'" class="opponent-controller__load">
              <button
                v-for="slot in action.slots"
                :key="slot"
                class="opponent-controller__button"
                type="button"
                :disabled="busy"
                @click="submitLoad(slot)"
              >
                Slot {{ slot }}
              </button>
            </div>

            <button
              v-else-if="action.type === 'load_all'"
              class="opponent-controller__button opponent-controller__button--primary"
              type="button"
              :disabled="busy"
              @click="submitAction(action)"
            >
              Load All
            </button>

            <div v-else-if="action.type === 'bid'" class="opponent-controller__bid">
              <label>
                Count
                <input v-model.number="bidCount" type="number" min="1" max="36" />
              </label>
              <label>
                Face
                <select v-model.number="bidFace">
                  <option v-for="face in bidFaceOptions" :key="face.value" :value="face.value">
                    {{ face.label }}
                  </option>
                </select>
              </label>
              <button class="opponent-controller__button opponent-controller__button--primary" type="button" :disabled="busy" @click="submitBid">
                Raise
              </button>
            </div>

            <button
              v-else-if="action.type === 'shake_complete'"
              class="opponent-controller__button opponent-controller__button--primary"
              type="button"
              :disabled="busy"
              @click="submitAction(action)"
            >
              Complete Shake
            </button>

            <button
              v-else
              class="opponent-controller__button opponent-controller__button--primary"
              type="button"
              :disabled="busy"
              @click="submitAction(action)"
            >
              {{ action.type }}
            </button>
          </template>

          <p v-if="activeMatchId && !detail" class="opponent-controller__empty">
            Loading match controls...
          </p>
          <p v-if="detail && selectedPlayerId && availableActions.length === 0" class="opponent-controller__empty">
            No actions
          </p>
        </div>
      </section>
    </section>

    <section v-if="adminAccess?.authorized" class="opponent-controller__audit">
      <p class="opponent-controller__group-label">Recent Admin Audit</p>
      <ul v-if="auditRows.length > 0" class="opponent-controller__audit-list">
        <li v-for="row in auditRows" :key="row._id">
          <span>{{ row.commandType ?? 'action' }}</span>
          <span>{{ row.resultOk ? 'ok' : row.resultCode ?? 'reject' }}</span>
          <span v-if="row.targetPlayerId">{{ row.targetPlayerId }}</span>
          <small>{{ new Date(row.createdAt).toLocaleTimeString() }}</small>
        </li>
      </ul>
      <p v-else class="opponent-controller__empty">No audit rows yet for this selection.</p>
    </section>
  </main>
</template>

<style scoped>
.opponent-controller {
  min-height: 100vh;
  padding: 24px;
  color: #f3f6f4;
  background: linear-gradient(135deg, #101415, #181b19 52%, #241b16);
}

.opponent-controller__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.opponent-controller__title h1,
.opponent-controller__title p {
  margin: 0;
}

.opponent-controller__title h1 {
  font-size: 28px;
  line-height: 1.1;
}

.opponent-controller__title p {
  color: #aeb9b3;
}

.opponent-controller__error {
  color: #ffb3a8;
}

.opponent-controller__warn {
  color: #ffd59a;
}

.opponent-controller__last {
  color: #9fd9c8;
  font-size: 13px;
}

.opponent-controller__qa {
  margin-bottom: 14px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  padding: 12px 14px;
  background: rgb(8 10 10 / 52%);
}

.opponent-controller__qa-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.opponent-controller__qa-list li {
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  padding: 5px 10px;
  color: #aeb9b3;
  font-size: 12px;
}

.opponent-controller__qa-list li.is-done {
  border-color: rgb(97 213 184 / 54%);
  color: #d8f5ec;
  background: rgb(39 116 99 / 28%);
}

.opponent-controller__ladder-qa {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.opponent-controller__ladder-copy {
  margin: 6px 0 2px;
  color: #d8f5ec;
}

.opponent-controller__audit {
  margin-top: 14px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  padding: 12px 14px;
  background: rgb(8 10 10 / 52%);
}

.opponent-controller__audit-list {
  display: grid;
  gap: 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.opponent-controller__audit-list li {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto auto auto;
  gap: 10px;
  align-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  color: #d8ded8;
}

.opponent-controller__audit-list small {
  color: #9ca7a0;
}

.opponent-controller__header-actions,
.opponent-controller__players,
.opponent-controller__actions,
.opponent-controller__load,
.opponent-controller__bid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.opponent-controller__list-actions,
.opponent-controller__match-row {
  display: grid;
  gap: 8px;
}

.opponent-controller__list-actions {
  margin-bottom: 4px;
}

.opponent-controller__match-row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.opponent-controller__remove-match {
  min-width: 76px;
}

.opponent-controller__layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 18px;
}

.opponent-controller__matches,
.opponent-controller__detail {
  min-height: 520px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: rgb(8 10 10 / 72%);
}

.opponent-controller__matches {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 12px;
}

.opponent-controller__group-label {
  margin: 8px 0 0;
  color: #aeb9b3;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.opponent-controller__detail {
  padding: 16px;
}

.opponent-controller__started-panel {
  margin-top: 18px;
  border-top: 1px solid rgb(255 255 255 / 12%);
  padding-top: 14px;
}

.opponent-controller__button,
.opponent-controller__match,
.opponent-controller__player {
  min-height: 38px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 6px;
  padding: 8px 12px;
  color: inherit;
  background: rgb(255 255 255 / 7%);
}

.opponent-controller__button--primary {
  border-color: rgb(97 213 184 / 54%);
  background: rgb(39 116 99 / 64%);
}

.opponent-controller__button--danger {
  border-color: rgb(255 92 92 / 72%);
  background: rgb(158 36 36 / 78%);
}

.opponent-controller__button:disabled {
  cursor: wait;
  opacity: 0.5;
}

.opponent-controller__match,
.opponent-controller__player {
  display: grid;
  gap: 3px;
  width: 100%;
  text-align: left;
}

.opponent-controller__match small,
.opponent-controller__player small,
.opponent-controller__empty {
  color: #9ca7a0;
}

.opponent-controller__match.is-selected,
.opponent-controller__player.is-selected {
  border-color: rgb(238 185 105 / 70%);
  background: rgb(120 88 43 / 42%);
}

.opponent-controller__player.is-active-turn {
  box-shadow: inset 0 0 0 1px rgb(97 213 184 / 70%);
}

.opponent-controller__player.is-pending-load {
  border-color: rgb(120 176 255 / 70%);
}

.opponent-controller__player--human {
  opacity: 0.82;
  cursor: default;
}

.opponent-controller__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
  color: #d8ded8;
}

.opponent-controller__meta span,
.opponent-controller__state span {
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  padding: 6px 9px;
  background: rgb(255 255 255 / 5%);
}

.opponent-controller__state {
  display: grid;
  gap: 10px;
  margin: 16px 0;
}

.opponent-controller__state div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.opponent-controller__bid {
  align-items: end;
}

.opponent-controller__bid label {
  display: grid;
  gap: 4px;
  color: #c8d0cb;
  font-size: 13px;
}

.opponent-controller__bid input,
.opponent-controller__bid select {
  width: 92px;
  min-height: 38px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 6px;
  padding: 6px 9px;
  color: #f3f6f4;
  background: rgb(0 0 0 / 34%);
}

@media (max-width: 840px) {
  .opponent-controller {
    padding: 16px;
  }

  .opponent-controller__header,
  .opponent-controller__layout {
    grid-template-columns: 1fr;
  }

  .opponent-controller__header {
    display: grid;
  }

  .opponent-controller__ladder-qa {
    align-items: stretch;
    flex-direction: column;
  }

  .opponent-controller__matches,
  .opponent-controller__detail {
    min-height: auto;
  }
}
</style>
