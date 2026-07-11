<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../i18n'
import { formatMmr, formatPlacement } from '../ladder.logic'
import type { LadderStats } from '../ladder.types'

const props = defineProps<{ stats: LadderStats }>()

const recentLabel = computed(() => {
  if (props.stats.recent20Count === 0) {
    return t('ladder.recent20Empty')
  }
  const key = props.stats.recent20Count < 20
    ? 'ladder.recentNAvgPlace'
    : 'ladder.recent20AvgPlace'
  return t(key, {
    n: String(props.stats.recent20Count),
    place: formatPlacement(props.stats.recent20AvgPlace),
  })
})
</script>

<template>
  <section class="ladder-self-stats" :aria-label="t('ladder.selfStats')">
    <p class="ladder-self-stats__label">{{ t('ladder.mmr') }}</p>
    <p class="ladder-self-stats__mmr" data-testid="ladder-self-mmr">{{ formatMmr(stats.mmr) }}</p>
    <p class="ladder-self-stats__recent">{{ recentLabel }}</p>
  </section>
</template>
