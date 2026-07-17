<script setup lang="ts">
import { useAuth } from '@clerk/vue'
import { useConvexClient } from 'convex-vue'
import { computed, nextTick, onUnmounted, ref, watchEffect } from 'vue'
import { LADDER_QUEUE_HEARTBEAT_MS } from '@shared/ladder/matchmaking'
import { assetLoader } from '../assets/assetLoader'
import { t } from '../i18n'
import { createLadderService, type LadderQueueUnsubscribe } from '../services/convex/ladderService'
import LadderLoading from './LadderLoading.vue'
import LadderRoster from './LadderRoster.vue'
import {
  initialLadderRuntimeState,
  reduceLadderRuntime,
  safeStats,
} from './ladder.logic'
import type { LadderQueueState, LadderStats } from './ladder.types'

const emit = defineEmits<{ back: []; handoff: [matchId: string] }>()
const auth = useAuth()
const convex = useConvexClient()
const ladderService = createLadderService(convex)
const background = assetLoader('background-custom-game')

const runtime = ref({ ...initialLadderRuntimeState })
const selfStats = ref<LadderStats>(safeStats(null))
const errorMessage = ref('')
const started = ref(false)
const disposed = ref(false)
const params = new URLSearchParams(window.location.search)
const fixtureCount = import.meta.env.DEV ? Number(params.get('ladderFixture') ?? 0) : 0
const fixtureDelay = import.meta.env.DEV ? Number(params.get('ladderFixtureDelay') ?? 900) : 0
const rosterCountdownSeconds = import.meta.env.DEV
  ? Math.max(3, Math.min(60, Number(params.get('ladderRosterSeconds') ?? 3)))
  : 3
const debugFaces = import.meta.env.DEV
  ? (params.get('ladderDice') ?? '').split(',').map(Number).filter((face) => face >= 1 && face <= 6)
  : []

let queueUnsubscribe: LadderQueueUnsubscribe | undefined
let fixtureTimer: number | undefined
let handoffTimer: number | undefined
let heartbeatTimer: number | undefined

const phaseLabel = computed(() => t(`ladder.phase.${runtime.value.phase}`))
const authPending = computed(() => !auth.isLoaded.value)
const shellStyles = {
  '--ladder-bg': `url(${background.url})`,
  '--ladder-bg-focus-x': background.manifest.focus.x,
  '--ladder-bg-focus-y': background.manifest.focus.y,
}

function localizedError(error: unknown, fallbackKey: string) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('UNAUTHENTICATED')) return t('ladder.signInRequired')
  if (message.includes('LADDER_DEV_FIXTURES_DISABLED')) return t('ladder.fixtureDisabled')
  return t(fallbackKey)
}

function applyQueueState(queue: LadderQueueState) {
  selfStats.value = safeStats(queue.selfStats)
  if (queue.status === 'matched' && (!queue.matchId || queue.roster.length < 2)) {
    errorMessage.value = t('ladder.staleMatch')
    return
  }
  const next = reduceLadderRuntime(runtime.value, { type: 'queue_update', queue })
  if (next.phase === 'roster') {
    window.clearTimeout(fixtureTimer)
    window.clearInterval(heartbeatTimer)
    queueUnsubscribe?.unsubscribe()
    queueUnsubscribe = undefined
    errorMessage.value = ''
  }
  runtime.value = next
}

function subscribeQueue() {
  queueUnsubscribe?.unsubscribe()
  queueUnsubscribe = ladderService.subscribeOwnQueue(
    applyQueueState,
    () => { errorMessage.value = t('ladder.queueSubscriptionError') },
  )
}

async function enterQueue() {
  errorMessage.value = ''
  subscribeQueue()
  try {
    applyQueueState(await ladderService.enterQueue())
    window.clearInterval(heartbeatTimer)
    if (runtime.value.phase === 'searching') {
      heartbeatTimer = window.setInterval(() => {
        if (disposed.value || runtime.value.phase !== 'searching') return
        void ladderService.heartbeatQueue().then(applyQueueState).catch(() => {
          errorMessage.value = t('ladder.queueSubscriptionError')
        })
      }, LADDER_QUEUE_HEARTBEAT_MS)
    }
  } catch (error) {
    errorMessage.value = localizedError(error, 'ladder.queueEnterError')
  }
}

async function startFixture() {
  errorMessage.value = ''
  try {
    applyQueueState(await ladderService.createDevFixture(fixtureCount))
  } catch (error) {
    errorMessage.value = localizedError(error, 'ladder.queueEnterError')
  }
}

async function start() {
  if (started.value || disposed.value || !auth.isLoaded.value) return
  if (auth.isSignedIn.value !== true) {
    errorMessage.value = t('ladder.signInRequired')
    return
  }
  started.value = true
  if (fixtureCount >= 2 && fixtureCount <= 6) {
    selfStats.value = safeStats({ mmr: 1000 })
    fixtureTimer = window.setTimeout(() => void startFixture(), Math.max(0, fixtureDelay))
    return
  }
  await enterQueue()
}

async function cancelAndBack() {
  if (runtime.value.phase !== 'searching' || runtime.value.cancelPending) return
  runtime.value = reduceLadderRuntime(runtime.value, { type: 'cancel_requested' })
  window.clearTimeout(fixtureTimer)
  try {
    const queue = await ladderService.leaveQueue()
    applyQueueState(queue)
    if (runtime.value.phase === 'roster') return
    runtime.value = reduceLadderRuntime(runtime.value, { type: 'cancel_completed' })
    emit('back')
  } catch (error) {
    runtime.value = reduceLadderRuntime(runtime.value, { type: 'cancel_completed' })
    errorMessage.value = localizedError(error, 'ladder.leaveError')
  }
}

async function retry() {
  if (fixtureCount >= 2 && fixtureCount <= 6) {
    await startFixture()
    return
  }
  subscribeQueue()
  try {
    applyQueueState(await ladderService.getOwnQueueState())
    if (runtime.value.phase === 'searching') applyQueueState(await ladderService.enterQueue())
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = localizedError(error, 'ladder.queueEnterError')
  }
}

async function beginHandoff() {
  const matchId = runtime.value.matchId
  if (!matchId) {
    errorMessage.value = t('ladder.handoffError')
    return
  }
  const next = reduceLadderRuntime(runtime.value, { type: 'handoff_started' })
  if (next === runtime.value) return
  runtime.value = next
  await nextTick()
  await new Promise<void>((resolve) => {
    handoffTimer = window.setTimeout(resolve, 320)
  })
  if (disposed.value) return
  try {
    await ladderService.acknowledgeMatchHandoff(matchId)
    if (!disposed.value) emit('handoff', matchId)
  } catch (error) {
    runtime.value = reduceLadderRuntime(runtime.value, { type: 'handoff_failed' })
    errorMessage.value = localizedError(error, 'ladder.handoffError')
  }
}

watchEffect(() => {
  if (!auth.isLoaded.value) return
  if (auth.isSignedIn.value !== true) {
    convex.setAuth(async () => null)
    void start()
    return
  }
  convex.setAuth(async ({ forceRefreshToken }) => await auth.getToken.value({
    template: 'convex',
    skipCache: forceRefreshToken,
  }))
  void start()
})

onUnmounted(() => {
  disposed.value = true
  window.clearTimeout(fixtureTimer)
  window.clearTimeout(handoffTimer)
  window.clearInterval(heartbeatTimer)
  queueUnsubscribe?.unsubscribe()
  if (started.value && runtime.value.phase === 'searching' && fixtureCount === 0) {
    void ladderService.leaveQueue().catch(() => undefined)
  }
})
</script>

<template>
  <main class="ladder-shell" :style="shellStyles" :aria-label="t('ladder.screenLabel')">
    <div class="ladder-shell__background" aria-hidden="true" />
    <header class="ladder-topbar">
      <button
        v-if="runtime.phase === 'searching'"
        class="ladder-back"
        type="button"
        :disabled="runtime.cancelPending"
        :aria-label="t('ladder.back')"
        @click="cancelAndBack"
      >
        <span aria-hidden="true">←</span>
        {{ t('ladder.back') }}
      </button>
      <span v-else />
      <p>{{ phaseLabel }}</p>
    </header>

    <LadderLoading
      v-if="runtime.phase === 'searching'"
      :self-stats="selfStats"
      :cancel-pending="runtime.cancelPending"
      :auth-pending="authPending"
      :error-message="errorMessage"
      :debug-faces="debugFaces"
      @cancel="cancelAndBack"
      @retry="retry"
    />
    <LadderRoster
      v-else-if="runtime.phase === 'roster'"
      :players="runtime.roster"
      :countdown-seconds="rosterCountdownSeconds"
      @ready="beginHandoff"
    />
    <section v-else class="ladder-handoff" role="status" aria-live="assertive" data-testid="ladder-handing-off">
      <span>{{ t('ladder.phase.handing_off') }}</span>
    </section>
  </main>
</template>
