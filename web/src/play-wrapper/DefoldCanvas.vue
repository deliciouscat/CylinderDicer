<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type {
  CommandRejectedPayload,
  GameBridgeMessage,
  ServerSnapshotPayload,
  StartMatchPayload,
} from '@shared/protocol/game-bridge'
import { t } from '../i18n'
import { listenFromDefold, listenFromDefoldFrame, sendToDefold } from './gameBridge'

const props = defineProps<{
  buildUrl?: string
  match?: StartMatchPayload
  serverSnapshot?: ServerSnapshotPayload | null
  commandRejected?: CommandRejectedPayload | null
}>()

const emit = defineEmits<{
  ready: [message: GameBridgeMessage]
  message: [message: GameBridgeMessage]
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const isDefoldReady = ref(false)
let stopListening: (() => void) | undefined
let stopFrameListening: (() => void) | undefined
let readyRetryTimer: number | undefined
let readyRetryCount = 0

const READY_RETRY_LIMIT = 40
const READY_RETRY_INTERVAL_MS = 250

function send(message: GameBridgeMessage) {
  if (!frame.value) {
    return
  }
  sendToDefold(frame.value, message)
}

function sendStartMatch(force = false) {
  if ((!force && !isDefoldReady.value) || !props.match) {
    return
  }
  send({
    type: 'START_MATCH',
    payload: props.match,
  })
}

function sendServerSnapshot(snapshot: ServerSnapshotPayload | null | undefined, force = false) {
  if ((!force && !isDefoldReady.value) || !snapshot) {
    return
  }
  send({
    type: 'SERVER_SNAPSHOT',
    payload: snapshot,
  })
}

function sendCommandRejected(rejected: CommandRejectedPayload | null | undefined, force = false) {
  if ((!force && !isDefoldReady.value) || !rejected) {
    return
  }
  send({
    type: 'COMMAND_REJECTED',
    payload: rejected,
  })
}

function sendInitialState(force = false) {
  sendStartMatch(force)
  sendServerSnapshot(props.serverSnapshot, force)
  sendCommandRejected(props.commandRejected, force)
}

function stopReadyRetry() {
  if (readyRetryTimer !== undefined) {
    window.clearInterval(readyRetryTimer)
    readyRetryTimer = undefined
  }
}

function markDefoldReady(message: GameBridgeMessage) {
  if (!isDefoldReady.value) {
    isDefoldReady.value = true
    emit('ready', message)
    stopReadyRetry()
  }
}

function installFrameListener() {
  const target = frame.value?.contentWindow
  if (!target) {
    return
  }

  stopFrameListening?.()
  stopFrameListening = listenFromDefoldFrame(target, handleMessage)
}

function startReadyRetry() {
  stopReadyRetry()
  readyRetryCount = 0
  readyRetryTimer = window.setInterval(() => {
    if (isDefoldReady.value) {
      stopReadyRetry()
      return
    }
    readyRetryCount += 1
    installFrameListener()
    sendInitialState(true)
    if (readyRetryCount >= READY_RETRY_LIMIT) {
      stopReadyRetry()
    }
  }, READY_RETRY_INTERVAL_MS)
}

function handleFrameLoad() {
  isDefoldReady.value = false
  installFrameListener()
  startReadyRetry()
}

function handleMessage(message: GameBridgeMessage) {
  emit('message', message)

  if (message.type === 'DEFOLD_READY') {
    markDefoldReady(message)
    sendInitialState()
  } else if (
    message.type === 'MATCH_READY' ||
    message.type === 'SERVER_SNAPSHOT_RECEIVED' ||
    message.type === 'PLAYER_COMMAND'
  ) {
    markDefoldReady(message)
  }
}

onMounted(() => {
  stopListening = listenFromDefold(handleMessage)
  installFrameListener()
  startReadyRetry()
})

onUnmounted(() => {
  stopListening?.()
  stopFrameListening?.()
  stopReadyRetry()
})

watch(
  () => props.match,
  () => sendStartMatch(),
)

watch(
  () => props.serverSnapshot,
  (snapshot) => sendServerSnapshot(snapshot),
)

watch(
  () => props.commandRejected,
  (rejected) => sendCommandRejected(rejected),
)

defineExpose({
  send,
})
</script>

<template>
  <iframe
    ref="frame"
    class="defold-canvas"
    :src="buildUrl ?? '/play/index.html'"
    :title="t('playWrapper.canvasTitle')"
    allow="fullscreen; gamepad"
    @load="handleFrameLoad"
  />
</template>

<style scoped>
.defold-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
  background: #050507;
}
</style>
