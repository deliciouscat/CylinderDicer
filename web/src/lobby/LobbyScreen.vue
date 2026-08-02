<script setup lang="ts">
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import lobbyConfig from '../config/lobby.config.json'
import { assetLoader } from '../assets/assetLoader'
import DropdownButton, { type DropdownOption } from '../components/ui/DropdownButton.vue'
import { activeLocale, setLocale, t, type LocaleCode } from '../i18n'

type MenuEntry = {
  id: string
  url: string
  label: string
}

const emit = defineEmits<{
  navigate: [url: string]
}>()

const menuItems = computed<MenuEntry[]>(() => Object.entries(lobbyConfig.menu).map(([id, entry]) => ({
  id,
  url: entry.url,
  label: t(entry.labelKey),
})))

const localeOptions = computed<DropdownOption[]>(() => [
  { label: t('lobby.locales.en'), value: 'en' },
  { label: t('lobby.locales.ko'), value: 'ko' },
  { label: t('lobby.locales.ja'), value: 'ja' },
  { label: t('lobby.locales.zh'), value: 'zh' },
])

const selectedLocale = computed({
  get: () => activeLocale.value,
  set: (value: string) => setLocale(value as LocaleCode),
})

const shopNoticeVisible = ref(false)
const shopNoticeKey = ref(0)
let shopNoticeTimer: number | undefined

const backgroundAsset = assetLoader('background-lobby')
const menuPanelAsset = assetLoader('menu-panel')
const titleAsset = assetLoader('title')

const lobbyStyles = {
  '--lobby-bg': `url(${backgroundAsset.url})`,
  '--lobby-bg-focus-x': backgroundAsset.manifest.focus.x,
  '--lobby-bg-focus-y': backgroundAsset.manifest.focus.y,
  '--lobby-bg-pan': `${backgroundAsset.manifest.pan.distancePercent}%`,
  '--lobby-bg-pan-duration': `${backgroundAsset.manifest.pan.durationSeconds}s`,
  '--title-safe-width': `${titleAsset.manifest.safeWidthPercent}vw`,
  '--title-shadow': titleAsset.manifest.dropShadow,
  '--menu-panel': `url(${menuPanelAsset.url})`,
  '--menu-panel-ratio': `${menuPanelAsset.manifest.width} / ${menuPanelAsset.manifest.height}`,
  '--menu-hover-scale': String(menuPanelAsset.manifest.hoverScale),
  '--menu-pressed-scale': String(menuPanelAsset.manifest.pressedScale),
}

function openMenuItem(item: MenuEntry) {
  if (item.id === 'item-shop') {
    window.clearTimeout(shopNoticeTimer)
    shopNoticeKey.value += 1
    shopNoticeVisible.value = true
    shopNoticeTimer = window.setTimeout(() => {
      shopNoticeVisible.value = false
    }, 3200)
    return
  }
  emit('navigate', item.url)
}

onBeforeUnmount(() => {
  window.clearTimeout(shopNoticeTimer)
})
</script>

<template>
  <main class="lobby-screen" :style="lobbyStyles" :aria-label="t('lobby.screenLabel')">
    <div class="lobby-background" aria-hidden="true" />
    <div class="lobby-auth">
      <DropdownButton
        v-model="selectedLocale"
        class="lobby-locale"
        :options="localeOptions"
        :aria-label="t('lobby.localeLabel')"
      />
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button class="lobby-auth__button" type="button">{{ t('lobby.signIn') }}</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button class="lobby-auth__button lobby-auth__button--primary" type="button">{{ t('lobby.signUp') }}</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
    <section class="lobby-stage">
      <img class="lobby-title" :src="titleAsset.url" :alt="t('lobby.titleAlt')" />

      <nav class="lobby-menu" :aria-label="t('lobby.mainMenuLabel')">
        <button
          v-for="item in menuItems"
          :key="item.id"
          class="lobby-menu__button"
          type="button"
          @click="openMenuItem(item)"
        >
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </section>

    <div
      v-if="shopNoticeVisible"
      :key="shopNoticeKey"
      class="lobby-coming-soon"
      role="status"
      aria-live="polite"
    >
      {{ t('lobby.shopComingSoon') }}
    </div>
  </main>
</template>
