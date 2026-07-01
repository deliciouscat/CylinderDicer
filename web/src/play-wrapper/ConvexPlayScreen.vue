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
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
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
const linkedMatchId = ref(new URLSearchParams(window.location.search).get('matchId') ?? '')
const loadingMatch = ref(false)

let publicUnsubscribe: SnapshotUnsubscribe | undefined
let commandCounter = 0

const isSignedIn = computed(() => auth.isSignedIn.value === true)
const canStart = computed(() => auth.isLoaded.value && isSignedIn.value)
const isLinkedMatch = computed(() => linkedMatchId.value.length > 0)
const primaryActionLabel = computed(() => isLinkedMatch.value ? 'Reload Match' : 'Start / Reuse')

const startMatchPayload = computed<StartMatchPayload | undefined>(() => {
  if (!createdMatch.value || !mergedSnapshot.value?.viewerPlayerId) {
    return undefined
  }

  return {
    sessionId: 'convex-dev-session',
    matchId: createdMatch.value.matchId,
    playerId: mergedSnapshot.value.viewerPlayerId,
    mode: 'dev',
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

function generateCommandId(type: string) {
  commandCounter += 1
  return `web-${Date.now()}-${commandCounter}-${type}`
}

function refreshMergedSnapshot() {
  mergedSnapshot.value = mergeMatchSnapshots(publicSnapshot.value, privateDelta.value)
}

async function refreshPrivateDelta(matchId: string) {
  privateDelta.value = await matchService.getPrivateDelta(matchId)
  refreshMergedSnapshot()
}

function subscribePublicSnapshot(matchId: string) {
  publicUnsubscribe?.unsubscribe()
  publicUnsubscribe = matchService.subscribePublicView(matchId, {
    onSnapshot: (snapshot) => {
      publicSnapshot.value = snapshot as MatchPublicSnapshot | null
      void refreshPrivateDelta(matchId)
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
  status.value = 'Opening linked Convex dev match...'
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
    status.value = `Opened linked Convex dev match ${matchId.slice(-6)}.`
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

  const result = await matchService.submitCommand({
    matchId: command.matchId ?? createdMatch.value.matchId,
    commandId: command.commandId ?? generateCommandId(command.type),
    revision: command.revision ?? mergedSnapshot.value.revision,
    type: command.type,
    payload: command.payload,
  }) as { ok?: boolean; [key: string]: any }

  if (result.ok === false) {
    const rejected: CommandRejectedPayload = {
      matchId: result.matchId,
      commandId: command.commandId,
      code: result.code ?? 'COMMAND_REJECTED',
      message: result.message ?? 'command_rejected',
      details: result.details,
      revision: result.revision,
      snapshot: result.publicSnapshot
        ? mergeMatchSnapshots(result.publicSnapshot, result.privateDelta)
        : undefined,
    }
    lastRejected.value = rejected
    errorMessage.value = `${rejected.code}: ${rejected.message}`
    return rejected
  }

  lastRejected.value = null
  status.value = `Command accepted: ${command.type}`
  await refreshPrivateDelta(createdMatch.value.matchId)
  return undefined
}

async function handleDefoldMessage(message: GameBridgeMessage) {
  if (message.type !== 'PLAYER_COMMAND') {
    return
  }

  const rejected = await submitPlayerCommand(message.payload as PlayerCommandPayload)
  if (rejected) {
    errorMessage.value = `${rejected.code}: ${rejected.message}`
  }
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
        <h1>Convex Dev Match</h1>
        <p>{{ status }}</p>
        <p v-if="errorMessage" class="convex-play-screen__error">{{ errorMessage }}</p>
      </div>
      <button class="convex-play-screen__restart" type="button" :disabled="!canStart || loadingMatch" @click="createDevMatch">
        {{ primaryActionLabel }}
      </button>
    </header>

    <DefoldCanvas
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
