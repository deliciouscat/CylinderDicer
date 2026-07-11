<script setup lang="ts">
import { computed } from 'vue'
import { assetLoader } from '../../assets/assetLoader'
import { t } from '../../i18n'
import { formatMmr, formatPlacement } from '../ladder.logic'
import type { RosterPlayer } from '../ladder.types'

const props = defineProps<{ player: RosterPlayer }>()

const characterAsset = computed(() => {
  if (!props.player.characterKey) return null
  try {
    return assetLoader(`ladder-character-${props.player.characterKey}`)
  } catch {
    return null
  }
})

const initials = computed(() => props.player.displayName
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join('') || '?')

const recentPlace = computed(() => formatPlacement(props.player.stats.recent20AvgPlace))
const allTimePlace = computed(() => formatPlacement(props.player.stats.allTimeAvgPlace))
const placesLabel = computed(() => t('ladder.rosterPlaces', {
  recent20: recentPlace.value,
  allTime: allTimePlace.value,
}))
</script>

<template>
  <article
    class="roster-player-card"
    :class="{ 'roster-player-card--self': player.isSelf }"
    role="listitem"
    :data-seat="player.seatIndex"
  >
    <div class="roster-player-card__portrait">
      <img
        v-if="characterAsset"
        :src="characterAsset.url"
        :alt="t('ladder.characterAlt', { name: player.displayName })"
        draggable="false"
      />
      <span v-else class="roster-player-card__fallback" aria-hidden="true">{{ initials }}</span>
      <span v-if="player.isSelf" class="roster-player-card__self-mark">{{ t('ladder.you') }}</span>
    </div>
    <h2>{{ player.displayName }}</h2>
    <p class="roster-player-card__mmr">{{ t('ladder.mmrValue', { mmr: formatMmr(player.stats.mmr) }) }}</p>
    <p class="roster-player-card__places" :aria-label="placesLabel">
      <span class="roster-player-card__place-label">{{ t('ladder.recentShort') }}</span>
      <span>{{ recentPlace }}</span>
      <span aria-hidden="true">·</span>
      <span class="roster-player-card__place-label">{{ t('ladder.allTimeShort') }}</span>
      <span>{{ allTimePlace }}</span>
    </p>
  </article>
</template>
