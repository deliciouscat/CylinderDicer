<script setup lang="ts">
import { assetLoader } from '../assets/assetLoader'
import { t } from '../i18n'

const emit = defineEmits<{
  back: []
}>()

const backgroundAsset = assetLoader('background-lobby')
const boardAsset = assetLoader('board')
const buttonAsset = assetLoader('button')
const titleAsset = assetLoader('title')
const skullDieAsset = assetLoader('ladder-die-1')

const howToPlaySteps = [
  {
    key: 'load',
    imageUrl: new URL('../../../play/assets/images/revolver/default/cylinder.png', import.meta.url).href,
  },
  {
    key: 'shake',
    imageUrl: new URL('../../../play/assets/images/cup/default/cup.png', import.meta.url).href,
  },
  {
    key: 'bid',
    imageUrl: new URL('../../../play/assets/images/ui/rail/bid_normal.png', import.meta.url).href,
  },
  {
    key: 'duel',
    imageUrl: new URL('../../../play/assets/images/ui/buttons/challenge_button.png', import.meta.url).href,
  },
  {
    key: 'resolve',
    imageUrl: null,
  },
] as const

const howToPlayStyles = {
  '--how-to-play-bg': `url(${backgroundAsset.url})`,
  '--how-to-play-board': `url(${boardAsset.url})`,
  '--how-to-play-button': `url(${buttonAsset.url})`,
  '--how-to-play-button-ratio': `${buttonAsset.manifest.width} / ${buttonAsset.manifest.height}`,
  '--how-to-play-title-shadow': titleAsset.manifest.dropShadow,
}
</script>

<template>
  <main class="how-to-play-screen" :style="howToPlayStyles" :aria-label="t('howToPlay.screenLabel')">
    <div class="how-to-play-screen__background" aria-hidden="true" />
    <header class="how-to-play-header">
      <img class="how-to-play-logo" :src="titleAsset.url" :alt="t('lobby.titleAlt')" />
    </header>

    <div class="how-to-play-shell">
      <div class="how-to-play-toolbar">
        <button class="how-to-play-wood-button how-to-play-back" type="button" @click="emit('back')">
          <span>{{ t('howToPlay.back') }}</span>
        </button>
      </div>

      <section class="how-to-play-board">
        <div class="how-to-play-scroll-frame">
          <ol class="how-to-play-steps">
            <li
              v-for="(step, index) in howToPlaySteps"
              :key="step.key"
              class="how-to-play-step"
              :class="{ 'how-to-play-step--reverse': index % 2 === 1 }"
            >
              <div class="how-to-play-step__visual">
                <img
                  v-if="step.imageUrl"
                  class="how-to-play-step__image"
                  :class="`how-to-play-step__image--${step.key}`"
                  :src="step.imageUrl"
                  :alt="t(`howToPlay.steps.${step.key}.iconAlt`)"
                />
                <span v-else class="how-to-play-step__placeholder" aria-hidden="true">?</span>
              </div>
              <div class="how-to-play-step__copy">
                <span class="how-to-play-step__number">{{ String(index + 1).padStart(2, '0') }}</span>
                <h2>{{ t(`howToPlay.steps.${step.key}.title`) }}</h2>
                <p>{{ t(`howToPlay.steps.${step.key}.description`) }}</p>
                <span v-if="step.key !== 'resolve'" class="how-to-play-step__hint">
                  {{ t(`howToPlay.steps.${step.key}.hint`) }}
                </span>
              </div>
            </li>
          </ol>

          <aside class="how-to-play-skull" :aria-label="t('howToPlay.skull.title')">
            <img :src="skullDieAsset.url" :alt="t('howToPlay.skull.iconAlt')" />
            <div>
              <h2>{{ t('howToPlay.skull.title') }}</h2>
              <ul>
                <li>{{ t('howToPlay.skull.wildcard') }}</li>
                <li>{{ t('howToPlay.skull.call') }}</li>
                <li>{{ t('howToPlay.skull.pass') }}</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </div>
  </main>
</template>
