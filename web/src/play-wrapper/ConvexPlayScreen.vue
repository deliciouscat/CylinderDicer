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
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
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
import {
  SnapshotCoordinator,
  type SnapshotScope,
} from './snapshotCoordinator'

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
let commandGeneration = 0
let screenRequestGeneration = 0
let disposed = false
let lastFlowResumeKey = ''
const snapshotCoordinator = new SnapshotCoordinator()

const SNAPSHOT_ACK_RETRY_DELAYS_MS = [0, 100, 250, 500, 900, 1400, 2200]

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
    mode: ((publicSnapshot.value as any)?.match?.mode ?? (props.source === 'ladder' ? 'ranked' : 'dev')),
  }
})

const serverSnapshotPayload = computed<ServerSnapshotPayload | null>(() => {
  if (
    !createdMatch.value
    || !mergedSnapshot.value
    || mergedSnapshot.value.matchId !== createdMatch.value.matchId
  ) {
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

function activateMatchScope(matchId: string): SnapshotScope {
  publicUnsubscribe?.unsubscribe()
  publicUnsubscribe = undefined
  pendingPlayerCommands.length = 0
  commandGeneration += 1
  commandInFlight.value = false
  drainingPlayerCommands = false
  defoldSnapshotAckRevision.value = null
  lastFlowResumeKey = ''
  lastRejected.value = null
  createdMatch.value = null
  publicSnapshot.value = null
  privateDelta.value = null
  mergedSnapshot.value = null
  return snapshotCoordinator.begin(matchId)
}

function applySnapshotPair(
  scope: SnapshotScope,
  nextPublicSnapshot: MatchPublicSnapshot | null | undefined,
  nextPrivateDelta: MatchPrivateDelta | null | undefined,
): boolean {
  if (
    !snapshotCoordinator.canApply(scope, nextPublicSnapshot, nextPrivateDelta)
    || !nextPublicSnapshot
    || !nextPrivateDelta
    || !snapshotCoordinator.commit(scope, nextPublicSnapshot.revision)
  ) {
    return false
  }

  publicSnapshot.value = nextPublicSnapshot
  privateDelta.value = nextPrivateDelta
  mergedSnapshot.value = mergeMatchSnapshots(nextPublicSnapshot, nextPrivateDelta)
  createdMatch.value = {
    ...(createdMatch.value ?? {}),
    matchId: scope.matchId,
    revision: nextPublicSnapshot.revision,
  }
  resumeAutomaticFlow(nextPublicSnapshot, scope)
  return true
}

async function refreshMatchViews(
  matchId: string,
  scope = snapshotCoordinator.capture(matchId),
): Promise<boolean> {
  const [nextPublicSnapshot, nextPrivateDelta] = await Promise.all([
    matchService.getPublicSnapshot(matchId),
    matchService.getPrivateDelta(matchId),
  ])
  return applySnapshotPair(scope, nextPublicSnapshot, nextPrivateDelta)
}

async function refreshMatchViewsUntil(
  matchId: string,
  revision: number | undefined,
  scope: SnapshotScope,
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (!snapshotCoordinator.isCurrent(scope)) {
      return false
    }
    const applied = await refreshMatchViews(matchId, scope)
    if (
      applied
      && (revision === undefined || (serverSnapshotPayload.value?.revision ?? -1) >= revision)
    ) {
      return true
    }
    await sleep(100 + attempt * 150)
  }
  return false
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

async function sendCurrentServerSnapshotToDefoldUntilAck(
  revision: number | undefined,
  scope: SnapshotScope,
) {
  for (const delay of SNAPSHOT_ACK_RETRY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay)
    }
    if (!snapshotCoordinator.isCurrent(scope)) {
      return false
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

function resumeAutomaticFlow(
  snapshot: MatchPublicSnapshot | null | undefined,
  scope: SnapshotScope,
) {
  if (!snapshot || !createdMatch.value || !snapshotCoordinator.isCurrent(scope)) {
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
    if (!snapshotCoordinator.isCurrent(scope)) {
      return
    }
    lastFlowResumeKey = ''
    errorMessage.value = error instanceof Error ? error.message : String(error)
  })
}

function subscribePublicSnapshot(matchId: string, scope: SnapshotScope) {
  publicUnsubscribe?.unsubscribe()
  publicUnsubscribe = matchService.subscribePublicView(matchId, {
    onSnapshot: () => {
      if (!snapshotCoordinator.isCurrent(scope)) {
        return
      }
      void refreshMatchViewsUntil(matchId, undefined, scope).catch((error) => {
        if (snapshotCoordinator.isCurrent(scope)) {
          errorMessage.value = error instanceof Error ? error.message : String(error)
        }
      })
    },
    onError: (error) => {
      if (snapshotCoordinator.isCurrent(scope)) {
        errorMessage.value = error.message
      }
    },
  })
}

async function loadExistingMatch(matchId: string) {
  if (!canStart.value) {
    status.value = 'Sign in to open this Convex dev match.'
    return
  }

  const requestGeneration = ++screenRequestGeneration
  const scope = activateMatchScope(matchId)
  loadingMatch.value = true
  status.value = props.source === 'ladder'
    ? 'Opening Ladder match...'
    : 'Opening linked Convex dev match...'
  errorMessage.value = ''
  try {
    const applied = await refreshMatchViewsUntil(matchId, undefined, scope)
    if (!snapshotCoordinator.isCurrent(scope) || requestGeneration !== screenRequestGeneration) {
      return
    }
    if (!applied || !publicSnapshot.value || !privateDelta.value) {
      createdMatch.value = null
      errorMessage.value = 'MATCH_NOT_AVAILABLE: match is missing, inaccessible, or its snapshot pair is incoherent.'
      status.value = 'Could not open linked match.'
      return
    }

    subscribePublicSnapshot(matchId, scope)
    status.value = props.source === 'ladder'
      ? `Opened Ladder match ${matchId.slice(-6)}.`
      : `Opened linked Convex dev match ${matchId.slice(-6)}.`
  } catch (error) {
    if (snapshotCoordinator.isCurrent(scope) && requestGeneration === screenRequestGeneration) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      status.value = 'Could not open linked match.'
    }
  } finally {
    if (snapshotCoordinator.isCurrent(scope) && requestGeneration === screenRequestGeneration) {
      loadingMatch.value = false
    }
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
  const requestGeneration = ++screenRequestGeneration
  status.value = 'Creating Convex dev match...'
  errorMessage.value = ''
  try {
    const match = await matchService.createDevMatch({
      localPlayerName: 'You',
      requiresSetupLoad: true,
    })
    if (disposed || requestGeneration !== screenRequestGeneration) {
      return
    }

    const scope = activateMatchScope(match.matchId)
    createdMatch.value = match
    const applied = match.publicSnapshot && match.privateDelta
      ? applySnapshotPair(scope, match.publicSnapshot, match.privateDelta)
      : await refreshMatchViewsUntil(match.matchId, match.revision, scope)
    if (!snapshotCoordinator.isCurrent(scope) || !applied) {
      if (snapshotCoordinator.isCurrent(scope)) {
        errorMessage.value = 'SNAPSHOT_INCOHERENT: could not load a matching public/private snapshot pair.'
        status.value = 'Could not create Convex dev match.'
      }
      return
    }
    subscribePublicSnapshot(match.matchId, scope)
    status.value = match.reused ? 'Reused active Convex dev match.' : 'Created Convex dev match.'
  } catch (error) {
    if (!disposed && requestGeneration === screenRequestGeneration) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      status.value = 'Could not create Convex dev match.'
    }
  } finally {
    if (!disposed && requestGeneration === screenRequestGeneration) {
      loadingMatch.value = false
    }
  }
}

async function submitPlayerCommand(command: PlayerCommandPayload) {
  if (!createdMatch.value || !mergedSnapshot.value) {
    return
  }

  const targetMatchId = command.matchId ?? createdMatch.value.matchId
  const scope = snapshotCoordinator.capture(targetMatchId)
  if (
    targetMatchId !== createdMatch.value.matchId
    || !snapshotCoordinator.isCurrent(scope)
  ) {
    return
  }

  const activeCommandGeneration = commandGeneration
  commandInFlight.value = true
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

    if (
      activeCommandGeneration !== commandGeneration
      || !snapshotCoordinator.isCurrent(scope)
    ) {
      return
    }

    if (result.ok === false) {
      const rejectedPrivateDelta = result.privateDelta ?? privateDelta.value
      const applied = result.publicSnapshot
        ? applySnapshotPair(scope, result.publicSnapshot, rejectedPrivateDelta)
        : false
      if (!applied) {
        await refreshMatchViewsUntil(
          targetMatchId,
          Number(result.revision ?? 0) || undefined,
          scope,
        )
      }
      if (
        activeCommandGeneration !== commandGeneration
        || !snapshotCoordinator.isCurrent(scope)
      ) {
        return
      }
      const rejected: CommandRejectedPayload = {
        matchId: result.matchId,
        commandId: submittedCommandId,
        code: result.code ?? 'COMMAND_REJECTED',
        message: result.message ?? 'command_rejected',
        details: result.details,
        revision: result.revision,
        snapshot: mergedSnapshot.value ?? undefined,
      }
      lastRejected.value = rejected
      errorMessage.value = `${rejected.code}: ${rejected.message}`
      await nextTick()
      defoldCanvas.value?.send({
        type: 'COMMAND_REJECTED',
        payload: rejected,
      })
      const acked = await sendCurrentServerSnapshotToDefoldUntilAck(
        Number(result.revision ?? 0) || undefined,
        scope,
      )
      if (!acked && snapshotCoordinator.isCurrent(scope)) {
        errorMessage.value = `SNAPSHOT_NOT_ACKED: revision ${result.revision ?? '?'}`
      }
      return rejected
    }

    lastRejected.value = null
    errorMessage.value = ''
    status.value = `Command accepted: ${command.type}`

    // Prefer mutation-returned snapshots: they are authoritative and avoid
    // racing Convex query read-your-writes lag after submitMatchCommand.
    const applied = result.publicSnapshot
      ? applySnapshotPair(scope, result.publicSnapshot, result.privateDelta)
      : false
    if (!applied) {
      await refreshMatchViewsUntil(
        targetMatchId,
        Number(result.revision ?? 0) || undefined,
        scope,
      )
    }
    if (
      activeCommandGeneration !== commandGeneration
      || !snapshotCoordinator.isCurrent(scope)
    ) {
      return
    }
    await nextTick()
    const acked = await sendCurrentServerSnapshotToDefoldUntilAck(
      Number(result.revision ?? 0) || undefined,
      scope,
    )
    if (!acked && snapshotCoordinator.isCurrent(scope)) {
      errorMessage.value = `SNAPSHOT_NOT_ACKED: revision ${result.revision ?? '?'}`
    }
    return undefined
  } finally {
    if (
      activeCommandGeneration === commandGeneration
      && snapshotCoordinator.isCurrent(scope)
    ) {
      commandInFlight.value = false
    }
  }
}

async function drainPlayerCommandQueue() {
  if (drainingPlayerCommands) {
    return
  }
  const activeCommandGeneration = commandGeneration
  drainingPlayerCommands = true
  try {
    while (
      activeCommandGeneration === commandGeneration
      && pendingPlayerCommands.length > 0
    ) {
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
    if (activeCommandGeneration === commandGeneration) {
      drainingPlayerCommands = false
    }
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
    const matchId = typeof payload.matchId === 'string' ? payload.matchId : ''
    if (
      matchId === createdMatch.value?.matchId
      && Number.isSafeInteger(revision)
      && revision > 0
      && payload.applied !== false
    ) {
      defoldSnapshotAckRevision.value = Math.max(defoldSnapshotAckRevision.value ?? 0, revision)
    }
    return
  }

  if (message.type !== 'PLAYER_COMMAND') {
    return
  }

  if (
    commandInFlight.value
    || drainingPlayerCommands
    || pendingPlayerCommands.length > 0
  ) {
    return
  }

  if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) {
    return
  }
  const command = message.payload as PlayerCommandPayload
  if (
    command?.matchId
    && command.matchId !== createdMatch.value?.matchId
  ) {
    return
  }
  pendingPlayerCommands.push(command)
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

watch(
  () => props.matchId,
  (nextMatchId, previousMatchId) => {
    if (!nextMatchId || nextMatchId === previousMatchId) {
      return
    }
    linkedMatchId.value = nextMatchId
    if (canStart.value) {
      void loadExistingMatch(nextMatchId)
    }
  },
)

onUnmounted(() => {
  disposed = true
  screenRequestGeneration += 1
  commandGeneration += 1
  pendingPlayerCommands.length = 0
  publicUnsubscribe?.unsubscribe()
  snapshotCoordinator.invalidate()
})
</script>

<template>
  <main class="convex-play-screen">
    <header class="convex-play-screen__header">
      <button class="convex-play-screen__back" type="button" @click="emit('back')">
        Back
      </button>
      <div v-if="errorMessage" class="convex-play-screen__notice">
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
