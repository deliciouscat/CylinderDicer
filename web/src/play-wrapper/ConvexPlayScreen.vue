<script setup lang="ts">
import { useAuth } from '@clerk/vue'
import type {
  CommandRejectedPayload,
  GameBridgeMessage,
  PlayerCommandPayload,
  ServerSnapshotPayload,
  StartMatchPayload,
} from '@shared/protocol/game-bridge'
import { useConvexClient } from 'convex-vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import {
  createMatchService,
  mergeMatchSnapshots,
  type CreatedMatch,
  type MatchPrivateDelta,
  type MatchPublicSnapshot,
  type MergedMatchSnapshot,
  type SnapshotUnsubscribe,
} from '../services/convex/matchService'
import DefoldCanvas from './DefoldCanvas.vue'

const props = withDefaults(defineProps<{
  matchId?: string
  source?: 'dev' | 'ladder'
}>(), {
  matchId: undefined,
  source: 'dev',
})

const emit = defineEmits<{
  back: []
}>()

const convex = useConvexClient()
const auth = useAuth()
const matchService = createMatchService(convex)

const createdMatch = ref<CreatedMatch | null>(null)
const publicSnapshot = ref<MatchPublicSnapshot | null>(null)
const privateDelta = ref<MatchPrivateDelta | null>(null)
const mergedSnapshot = ref<MergedMatchSnapshot | null>(null)
const status = ref('Preparing Convex play session...')
const errorMessage = ref('')
const lastRejected = ref<CommandRejectedPayload | null>(null)
const linkedMatchId = ref(props.matchId ?? new URLSearchParams(window.location.search).get('matchId') ?? '')
const loadingMatch = ref(false)
const commandInFlight = ref(false)
const defoldCanvas = ref<InstanceType<typeof DefoldCanvas> | null>(null)
const defoldSnapshotAckRevision = ref<number | null>(null)
const pendingPlayerCommands: PlayerCommandPayload[] = []
let drainingPlayerCommands = false

let publicUnsubscribe: SnapshotUnsubscribe | undefined
let commandCounter = 0
let lastFlowResumeKey = ''

const SNAPSHOT_ACK_RETRY_DELAYS_MS = [0, 100, 250, 500, 900, 1400, 2200]

const isSignedIn = computed(() => auth.isSignedIn.value === true)
const canStart = computed(() => auth.isLoaded.value && isSignedIn.value)
const isLinkedMatch = computed(() => linkedMatchId.value.length > 0)
const primaryActionLabel = computed(() => isLinkedMatch.value ? 'Reload Match' : 'Start / Reuse')
const screenTitle = computed(() => props.source === 'ladder' ? 'Ladder Match' : 'Convex Dev Match')

const startMatchPayload = computed<StartMatchPayload | undefined>(() => {
  if (!createdMatch.value || !mergedSnapshot.value?.viewerPlayerId) {
    return undefined
  }

  return {
    sessionId: 'convex-dev-session',
    matchId: createdMatch.value.matchId,
    playerId: mergedSnapshot.value.viewerPlayerId,
    mode: ((publicSnapshot.value as any)?.match?.mode ?? (props.source === 'ladder' ? 'ranked' : 'dev')),
  }
})

const serverSnapshotPayload = computed<ServerSnapshotPayload | null>(() => {
  if (!createdMatch.value || !mergedSnapshot.value) {
    return null
  }

  return {
    matchId: createdMatch.value.matchId,
    revision: mergedSnapshot.value.revision,
    snapshot: mergedSnapshot.value,
    publicSnapshot: publicSnapshot.value,
    privateDelta: privateDelta.value,
  }
})

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function refreshMatchViewsUntil(matchId: string, revision: number | undefined) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await refreshMatchViews(matchId)
    if (!revision || (serverSnapshotPayload.value?.revision ?? 0) >= revision) {
      return
    }
    await sleep(100 + attempt * 150)
  }
}

function sendCurrentServerSnapshotToDefold() {
  const snapshot = serverSnapshotPayload.value
  if (!snapshot) {
    return
  }
  defoldCanvas.value?.send({
    type: 'SERVER_SNAPSHOT',
    payload: snapshot,
  })
}

async function sendCurrentServerSnapshotToDefoldUntilAck(revision: number | undefined) {
  for (const delay of SNAPSHOT_ACK_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay)
    }
    if (revision && (defoldSnapshotAckRevision.value ?? 0) >= revision) {
      return true
    }
    sendCurrentServerSnapshotToDefold()
  }
  return !revision || (defoldSnapshotAckRevision.value ?? 0) >= revision
}

function generateCommandId(type: string) {
  commandCounter += 1
  return `web-${Date.now()}-${commandCounter}-${type}`
}

function refreshMergedSnapshot() {
  mergedSnapshot.value = mergeMatchSnapshots(publicSnapshot.value, privateDelta.value)
}

function resumeAutomaticFlow(snapshot: MatchPublicSnapshot | null | undefined) {
  if (!snapshot || !createdMatch.value) {
    return
  }
  const duel = (snapshot as MatchPublicSnapshot & { duel?: { phase?: string } }).duel
  const automatic = snapshot.phase === 'bidding_gap'
    || (snapshot.phase === 'duel' && (duel?.phase === 'ready' || duel?.phase === 'executing'))
  if (!automatic) {
    return
  }
  const key = `${snapshot.matchId}:${snapshot.revision}:${snapshot.phase}:${duel?.phase ?? '-'}`
  if (lastFlowResumeKey === key) {
    return
  }
  lastFlowResumeKey = key
  void matchService.resumeMatchFlow(snapshot.matchId).catch((error) => {
    lastFlowResumeKey = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  })
}

async function refreshPrivateDelta(matchId: string) {
  privateDelta.value = await matchService.getPrivateDelta(matchId)
  refreshMergedSnapshot()
}

async function refreshMatchViews(matchId: string) {
  const [nextPublicSnapshot, nextPrivateDelta] = await Promise.all([
    matchService.getPublicSnapshot(matchId),
    matchService.getPrivateDelta(matchId),
  ])
  publicSnapshot.value = nextPublicSnapshot
  privateDelta.value = nextPrivateDelta
  refreshMergedSnapshot()
  resumeAutomaticFlow(nextPublicSnapshot)
}

function subscribePublicSnapshot(matchId: string) {
  publicUnsubscribe?.unsubscribe()
  publicUnsubscribe = matchService.subscribePublicView(matchId, {
    onSnapshot: () => {
      void refreshMatchViews(matchId)
    },
    onError: (error) => {
      errorMessage.value = error.message
    },
  })
}

async function loadExistingMatch(matchId: string) {
  if (loadingMatch.value) {
    return
  }
  if (!canStart.value) {
    status.value = 'Sign in to open this Convex dev match.'
    return
  }

  loadingMatch.value = true
  status.value = props.source === 'ladder'
    ? 'Opening Ladder match...'
    : 'Opening linked Convex dev match...'
  errorMessage.value = ''
  try {
    const nextPublicSnapshot = await matchService.getPublicSnapshot(matchId)
    const nextPrivateDelta = await matchService.getPrivateDelta(matchId)
    if (!nextPublicSnapshot || !nextPrivateDelta) {
      createdMatch.value = null
      publicSnapshot.value = nextPublicSnapshot
      privateDelta.value = nextPrivateDelta
      refreshMergedSnapshot()
      errorMessage.value = 'MATCH_NOT_AVAILABLE: current user is not a participant or the match does not exist.'
      status.value = 'Could not open linked match.'
      return
    }

    createdMatch.value = {
      matchId,
      revision: nextPublicSnapshot.revision,
      publicSnapshot: nextPublicSnapshot,
      privateDelta: nextPrivateDelta,
    }
    publicSnapshot.value = nextPublicSnapshot
    privateDelta.value = nextPrivateDelta
    refreshMergedSnapshot()
    subscribePublicSnapshot(matchId)
    resumeAutomaticFlow(nextPublicSnapshot)
    status.value = props.source === 'ladder'
      ? `Opened Ladder match ${matchId.slice(-6)}.`
      : `Opened linked Convex dev match ${matchId.slice(-6)}.`
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    status.value = 'Could not open linked match.'
  } finally {
    loadingMatch.value = false
  }
}

async function createDevMatch() {
  if (isLinkedMatch.value) {
    await loadExistingMatch(linkedMatchId.value)
    return
  }
  if (loadingMatch.value) {
    return
  }
  if (!canStart.value) {
    status.value = 'Sign in to start a Convex dev match.'
    return
  }

  loadingMatch.value = true
  status.value = 'Creating Convex dev match...'
  errorMessage.value = ''
  try {
    const match = await matchService.createDevMatch({
      localPlayerName: 'You',
      requiresSetupLoad: true,
    })
    createdMatch.value = match
    publicSnapshot.value = match.publicSnapshot ?? await matchService.getPublicSnapshot(match.matchId)
    privateDelta.value = match.privateDelta ?? await matchService.getPrivateDelta(match.matchId)
    refreshMergedSnapshot()
    subscribePublicSnapshot(match.matchId)
    resumeAutomaticFlow(publicSnapshot.value)
    status.value = match.reused ? 'Reused active Convex dev match.' : 'Created Convex dev match.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    status.value = 'Could not create Convex dev match.'
  } finally {
    loadingMatch.value = false
  }
}

async function submitPlayerCommand(command: PlayerCommandPayload) {
  if (!createdMatch.value || !mergedSnapshot.value) {
    return
  }

  commandInFlight.value = true
  const targetMatchId = command.matchId ?? createdMatch.value.matchId
  try {
    const submittedCommandId = command.commandId ?? generateCommandId(command.type)
    const result = await matchService.submitCommand({
      matchId: targetMatchId,
      commandId: submittedCommandId,
      // Always use the freshest known revision. Queued clicks may still carry
      // the pre-accept revision from Defold's emit-time snapshot.
      revision: mergedSnapshot.value.revision,
      type: command.type,
      payload: command.payload,
    }) as { ok?: boolean; [key: string]: any }

    if (result.ok === false) {
      const rejectedPrivateDelta = result.privateDelta ?? privateDelta.value
      if (result.publicSnapshot) {
        publicSnapshot.value = result.publicSnapshot
        privateDelta.value = rejectedPrivateDelta
        refreshMergedSnapshot()
      } else {
        await refreshMatchViews(targetMatchId)
      }
      const rejected: CommandRejectedPayload = {
        matchId: result.matchId,
        commandId: submittedCommandId,
        code: result.code ?? 'COMMAND_REJECTED',
        message: result.message ?? 'command_rejected',
        details: result.details,
        revision: result.revision,
			snapshot: result.publicSnapshot
			  ? mergeMatchSnapshots(result.publicSnapshot, rejectedPrivateDelta) ?? undefined
			  : mergedSnapshot.value ?? undefined,
      }
      lastRejected.value = rejected
      errorMessage.value = `${rejected.code}: ${rejected.message}`
      await nextTick()
      defoldCanvas.value?.send({
        type: 'COMMAND_REJECTED',
        payload: rejected,
      })
      const acked = await sendCurrentServerSnapshotToDefoldUntilAck(Number(result.revision ?? 0) || undefined)
      if (!acked) {
        errorMessage.value = `SNAPSHOT_NOT_ACKED: revision ${result.revision ?? '?'}`
      }
      return rejected
    }

    lastRejected.value = null
    errorMessage.value = ''
    status.value = `Command accepted: ${command.type}`

    // Prefer mutation-returned snapshots: they are authoritative and avoid
    // racing Convex query read-your-writes lag after submitMatchCommand.
    if (result.publicSnapshot) {
      publicSnapshot.value = result.publicSnapshot
      privateDelta.value = result.privateDelta ?? privateDelta.value
      refreshMergedSnapshot()
    } else {
      await refreshMatchViewsUntil(targetMatchId, Number(result.revision ?? 0) || undefined)
    }
    await nextTick()
    const acked = await sendCurrentServerSnapshotToDefoldUntilAck(Number(result.revision ?? 0) || undefined)
    if (!acked) {
      errorMessage.value = `SNAPSHOT_NOT_ACKED: revision ${result.revision ?? '?'}`
    }
    return undefined
  } finally {
    commandInFlight.value = false
  }
}

async function drainPlayerCommandQueue() {
  if (drainingPlayerCommands) {
    return
  }
  drainingPlayerCommands = true
  try {
    while (pendingPlayerCommands.length > 0) {
      const command = pendingPlayerCommands.shift()
      if (!command) {
        continue
      }
      const rejected = await submitPlayerCommand(command)
      if (rejected) {
        pendingPlayerCommands.length = 0
        break
      }
    }
  } finally {
    drainingPlayerCommands = false
  }
}

async function handleDefoldMessage(message: GameBridgeMessage) {
  if (message.type === 'EXIT_TO_LOBBY') {
    emit('back')
    return
  }

  if (message.type === 'SERVER_SNAPSHOT_RECEIVED') {
    const payload = (message.payload ?? {}) as Record<string, unknown>
    const revision = Number(payload.revision ?? 0)
    if (revision > 0 && payload.applied !== false) {
      defoldSnapshotAckRevision.value = Math.max(defoldSnapshotAckRevision.value ?? 0, revision)
    }
    return
  }

  if (message.type !== 'PLAYER_COMMAND') {
    return
  }

  pendingPlayerCommands.push(message.payload as PlayerCommandPayload)
  void drainPlayerCommandQueue()
}

watchEffect(() => {
  if (!auth.isLoaded.value) {
    return
  }

  if (!isSignedIn.value) {
    convex.setAuth(async () => null)
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

onMounted(() => {
  if (canStart.value && isLinkedMatch.value) {
    void loadExistingMatch(linkedMatchId.value)
  } else if (canStart.value) {
    void createDevMatch()
  } else {
    status.value = 'Waiting for Clerk sign-in...'
  }
})

watchEffect(() => {
  if (createdMatch.value || !canStart.value || loadingMatch.value) {
    return
  }
  if (isLinkedMatch.value) {
    void loadExistingMatch(linkedMatchId.value)
  } else {
    void createDevMatch()
  }
})

onUnmounted(() => {
  publicUnsubscribe?.unsubscribe()
})
</script>

<template>
  <main class="convex-play-screen">
    <header class="convex-play-screen__header">
      <button class="convex-play-screen__back" type="button" @click="emit('back')">
        Back
      </button>
      <div>
        <h1>{{ screenTitle }}</h1>
        <p>{{ status }}</p>
        <p v-if="errorMessage" class="convex-play-screen__error">{{ errorMessage }}</p>
      </div>
      <button class="convex-play-screen__restart" type="button" :disabled="!canStart || loadingMatch" @click="createDevMatch">
        {{ primaryActionLabel }}
      </button>
    </header>

    <DefoldCanvas
      ref="defoldCanvas"
      :match="startMatchPayload"
      :server-snapshot="serverSnapshotPayload"
      :command-rejected="lastRejected"
      @message="handleDefoldMessage"
    />
  </main>
</template>

<style scoped>
.convex-play-screen {
  min-height: 100vh;
  padding: 24px;
  color: #f8efe0;
  background: radial-gradient(circle at 50% 20%, #322019, #090706 70%);
}

.convex-play-screen__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.convex-play-screen__header h1,
.convex-play-screen__header p {
  margin: 0;
}

.convex-play-screen__back,
.convex-play-screen__restart {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  padding: 10px 14px;
  color: inherit;
  background: rgba(0, 0, 0, 0.32);
}

.convex-play-screen__restart:disabled {
  opacity: 0.45;
}

.convex-play-screen__error {
  color: #ff9f9f;
}
</style>
