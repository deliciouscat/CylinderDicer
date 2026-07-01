<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type {
  CommandRejectedPayload,
  GameBridgeMessage,
  ServerSnapshotPayload,
  StartMatchPayload,
} from '@shared/protocol/game-bridge'
import { t } from '../i18n'
import { listenFromDefold, sendToDefold } from './gameBridge'

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

function send(message: GameBridgeMessage) {
  if (!frame.value) {
    return
  }
  sendToDefold(frame.value, message)
}

function sendStartMatch() {
  if (!isDefoldReady.value || !props.match) {
    return
  }
  send({
    type: 'START_MATCH',
    payload: props.match,
  })
}

function sendServerSnapshot(snapshot: ServerSnapshotPayload | null | undefined) {
  if (!isDefoldReady.value || !snapshot) {
    return
  }
  send({
    type: 'SERVER_SNAPSHOT',
    payload: snapshot,
  })
}

function sendCommandRejected(rejected: CommandRejectedPayload | null | undefined) {
  if (!isDefoldReady.value || !rejected) {
    return
  }
  send({
    type: 'COMMAND_REJECTED',
    payload: rejected,
  })
}

function handleMessage(message: GameBridgeMessage) {
  emit('message', message)

  if (message.type === 'DEFOLD_READY') {
    isDefoldReady.value = true
    emit('ready', message)
    sendStartMatch()
    sendServerSnapshot(props.serverSnapshot)
    sendCommandRejected(props.commandRejected)
  }
}

onMounted(() => {
  stopListening = listenFromDefold(handleMessage)
})

onUnmounted(() => {
  stopListening?.()
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
