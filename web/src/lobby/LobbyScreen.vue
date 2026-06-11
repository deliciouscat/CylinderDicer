<script setup lang="ts">
import lobbyConfig from '../config/lobby.config.json'
import backgroundManifest from '../assets/background-panorama/manifest.json'
import backgroundUrl from '../assets/background-panorama/image.webp'
import menuPanelManifest from '../assets/menu-panel/manifest.json'
import menuPanelUrl from '../assets/menu-panel/image.webp'
import titleManifest from '../assets/Title/manifest.json'
import titleUrl from '../assets/Title/image.webp'

type LocaleCode = keyof (typeof lobbyConfig)['menu']['ladder']['locale']
type MenuEntry = {
  id: string
  url: string
  label: string
}

const activeLocale = lobbyConfig.locale as LocaleCode

const menuItems: MenuEntry[] = Object.entries(lobbyConfig.menu).map(([id, entry]) => ({
  id,
  url: entry.url,
  label: entry.locale[activeLocale] ?? entry.locale.en,
}))

const lobbyStyles = {
  '--lobby-bg': `url(${backgroundUrl})`,
  '--lobby-bg-focus-x': backgroundManifest.focus.x,
  '--lobby-bg-focus-y': backgroundManifest.focus.y,
  '--lobby-bg-pan': `${backgroundManifest.pan.distancePercent}%`,
  '--lobby-bg-pan-duration': `${backgroundManifest.pan.durationSeconds}s`,
  '--title-safe-width': `${titleManifest.safeWidthPercent}vw`,
  '--title-shadow': titleManifest.dropShadow,
  '--menu-panel': `url(${menuPanelUrl})`,
  '--menu-panel-ratio': `${menuPanelManifest.width} / ${menuPanelManifest.height}`,
  '--menu-hover-scale': String(menuPanelManifest.hoverScale),
  '--menu-pressed-scale': String(menuPanelManifest.pressedScale),
}

function openMenuItem(item: MenuEntry) {
  window.location.assign(item.url)
}
</script>

<template>
  <main class="lobby-screen" :style="lobbyStyles" aria-label="CylinderDicer lobby">
    <div class="lobby-background" aria-hidden="true" />
    <section class="lobby-stage">
      <img class="lobby-title" :src="titleUrl" alt="CylinderDicer" />

      <nav class="lobby-menu" aria-label="Main menu">
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
