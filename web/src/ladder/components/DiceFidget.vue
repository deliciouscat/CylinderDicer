<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { assetLoader } from '../../assets/assetLoader'
import { t } from '../../i18n'

const props = defineProps<{ debugFaces?: number[] }>()
const emit = defineEmits<{ outcome: [face: number] }>()

const diceAssets = Array.from({ length: 6 }, (_, index) => assetLoader(`ladder-die-${index + 1}`))
const face = ref(6)
const rolling = ref(false)
const debugIndex = ref(0)
const pointerStart = ref<{ x: number; y: number } | null>(null)
let revealTimer: number | undefined
let finishTimer: number | undefined

const dieAsset = computed(() => diceAssets[face.value - 1])

function nextFace() {
  const debugFace = props.debugFaces?.[debugIndex.value]
  if (debugFace && debugFace >= 1 && debugFace <= 6) {
    debugIndex.value += 1
    return debugFace
  }
  return Math.floor(Math.random() * 6) + 1
}

function roll() {
  if (rolling.value) return
  rolling.value = true
  const next = nextFace()
  revealTimer = window.setTimeout(() => {
    face.value = next
    emit('outcome', next)
  }, 280)
  finishTimer = window.setTimeout(() => {
    rolling.value = false
  }, 560)
}

function onPointerDown(event: PointerEvent) {
  pointerStart.value = { x: event.clientX, y: event.clientY }
}

function onPointerUp(event: PointerEvent) {
  const start = pointerStart.value
  pointerStart.value = null
  if (!start) return
  const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
  if (distance >= 18) roll()
}

onUnmounted(() => {
  window.clearTimeout(revealTimer)
  window.clearTimeout(finishTimer)
})
</script>

<template>
  <button
    class="dice-fidget"
    :class="{ 'dice-fidget--rolling': rolling }"
    type="button"
    :disabled="rolling"
    :aria-label="t('ladder.rollDice')"
    data-testid="ladder-die"
    @click="roll"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
  >
    <span class="dice-fidget__halo" aria-hidden="true" />
    <img
      class="dice-fidget__image"
      :src="dieAsset.url"
      :alt="t('ladder.dieFace', { face: String(face) })"
      draggable="false"
    />
    <span class="dice-fidget__hint">{{ t('ladder.rollHint') }}</span>
  </button>
</template>
