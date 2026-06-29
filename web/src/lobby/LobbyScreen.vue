<script setup lang="ts">
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/vue'
import lobbyConfig from '../config/lobby.config.json'
import { assetLoader } from '../assets/assetLoader'
import { t } from '../i18n'

type MenuEntry = {
  id: string
  url: string
  label: string
}

const emit = defineEmits<{
  navigate: [url: string]
}>()

const menuItems: MenuEntry[] = Object.entries(lobbyConfig.menu).map(([id, entry]) => ({
  id,
  url: entry.url,
  label: t(entry.labelKey),
}))

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
  emit('navigate', item.url)
}
</script>

<template>
  <main class="lobby-screen" :style="lobbyStyles" :aria-label="t('lobby.screenLabel')">
    <div class="lobby-background" aria-hidden="true" />
    <div class="lobby-auth">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button class="lobby-auth__button" type="button">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button class="lobby-auth__button lobby-auth__button--primary" type="button">Sign up</button>
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
  </main>
</template>
