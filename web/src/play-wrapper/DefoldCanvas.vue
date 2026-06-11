<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { GameBridgeMessage, StartMatchPayload } from '@shared/protocol/game-bridge'
import { t } from '../i18n'
import { listenFromDefold, sendToDefold } from './gameBridge'

const props = defineProps<{
  buildUrl?: string
  match?: StartMatchPayload
}>()

const emit = defineEmits<{
  ready: [message: GameBridgeMessage]
  message: [message: GameBridgeMessage]
}>()

const frame = ref<HTMLIFrameElement | null>(null)
let stopListening: (() => void) | undefined

function handleMessage(message: GameBridgeMessage) {
  emit('message', message)

  if (message.type === 'DEFOLD_READY') {
    emit('ready', message)

    if (props.match && frame.value) {
      sendToDefold(frame.value, {
        type: 'START_MATCH',
        payload: props.match,
      })
    }
  }
}

onMounted(() => {
  stopListening = listenFromDefold(handleMessage)
})

onUnmounted(() => {
  stopListening?.()
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
