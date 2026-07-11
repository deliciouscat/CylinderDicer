<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { t } from '../i18n'
import RosterPlayerCard from './components/RosterPlayerCard.vue'
import { rosterDensity } from './ladder.logic'
import type { RosterPlayer } from './ladder.types'

const props = withDefaults(defineProps<{
  players: RosterPlayer[]
  countdownSeconds?: number
}>(), {
  countdownSeconds: 3,
})
const emit = defineEmits<{ ready: [] }>()

const seconds = ref(props.countdownSeconds)
const finished = ref(false)
const density = computed(() => rosterDensity(props.players.length))
let countdownTimer: number | undefined

function finish() {
  if (finished.value) return
  finished.value = true
  window.clearInterval(countdownTimer)
  emit('ready')
}

onMounted(() => {
  countdownTimer = window.setInterval(() => {
    seconds.value -= 1
    if (seconds.value <= 0) finish()
  }, 1000)
})

onUnmounted(() => window.clearInterval(countdownTimer))
</script>

<template>
  <section class="ladder-roster" aria-labelledby="ladder-roster-title" data-testid="ladder-roster">
    <h1 id="ladder-roster-title" class="ladder-roster__eyebrow">{{ t('ladder.matchFound') }}</h1>
    <div
      class="ladder-roster__players"
      :class="`ladder-roster__players--${density}`"
      :style="{ '--roster-count': players.length }"
      role="list"
      :aria-label="t('ladder.rosterLabel')"
      data-testid="ladder-roster-players"
    >
      <RosterPlayerCard v-for="player in players" :key="player.playerId" :player="player" />
    </div>
    <button class="ladder-ready" type="button" data-testid="ladder-ready" @click="finish">
      <span>{{ t('ladder.ready') }}</span>
      <strong>{{ seconds }}</strong>
      <small aria-live="polite">{{ t('ladder.countdown', { seconds: String(seconds) }) }}</small>
    </button>
  </section>
</template>
