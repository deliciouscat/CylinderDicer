<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../i18n'

const props = defineProps<{
  chips: number
  outcome: 'idle' | 'gain' | 'skull'
  animationKey: number
}>()

const visibleChips = computed(() => Math.min(12, props.chips))
const statusLabel = computed(() => {
  if (props.outcome === 'skull') {
    return t('ladder.skullOutcome', { count: String(props.chips) })
  }
  if (props.outcome === 'gain') {
    return t('ladder.chipGained', { count: String(props.chips) })
  }
  return t('ladder.chipCount', { count: String(props.chips) })
})
</script>

<template>
  <div
    class="chip-stack"
    :class="`chip-stack--${outcome}`"
    :aria-label="statusLabel"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    data-testid="ladder-chip-stack"
  >
    <div :key="animationKey" class="chip-stack__pile" aria-hidden="true">
      <span
        v-for="index in visibleChips"
        :key="index"
        class="chip-stack__chip"
        :style="{ '--chip-index': index }"
      />
    </div>
    <span class="chip-stack__count">× {{ chips }}</span>
  </div>
</template>
