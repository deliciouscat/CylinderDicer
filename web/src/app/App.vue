<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import OpponentControllerScreen from '../admin/OpponentControllerScreen.vue'
import CustomGameScreen from '../custom-game/CustomGameScreen.vue'
import LadderShell from '../ladder/LadderShell.vue'
import LobbyScreen from '../lobby/LobbyScreen.vue'
import ConvexPlayScreen from '../play-wrapper/ConvexPlayScreen.vue'
import BackgroundMusic, { type BackgroundMusicMode } from '../play-wrapper/BackgroundMusic.vue'
import LocalPlayScreen from '../play-wrapper/LocalPlayScreen.vue'
import HowToPlayScreen from '../how-to-play/HowToPlayScreen.vue'
import SettingsScreen from '../settings/SettingsScreen.vue'
import { installButtonClickSound } from '../services/audio/buttonClickSound'
import SignInView from '../views/sign-in.vue'
import SignUpView from '../views/sign-up.vue'

function ladderMatchIdFromUrl(pathname: string, search: string) {
  if (pathname !== '/play/ladder') return null
  return new URLSearchParams(search).get('matchId')
}

const currentPath = ref(window.location.pathname)
const ladderHandoffMatchId = ref<string | null>(
  ladderMatchIdFromUrl(window.location.pathname, window.location.search),
)
const useLocalDefoldSimulator = import.meta.env.VITE_USE_LOCAL_DEFOLD_SIMULATOR === 'true'
const exposeQaTools = import.meta.env.DEV || import.meta.env.VITE_ENABLE_QA_TOOLS === 'true'
let removeButtonClickSound: (() => void) | null = null
const activeScreen = computed(() => {
  if (currentPath.value === '/play/custom-game') {
    return 'custom-game'
  }
  if (currentPath.value === '/play/ladder') {
    return ladderHandoffMatchId.value ? 'ladder-play' : 'ladder'
  }
  if (currentPath.value === '/admin/opponents' && exposeQaTools) {
    return 'admin-opponents'
  }
  if (currentPath.value === '/play/dev' && useLocalDefoldSimulator) {
    return 'local-play'
  }
  if (currentPath.value === '/play/dev') {
    return 'convex-play'
  }
  if (currentPath.value === '/sign-in') {
    return 'sign-in'
  }
  if (currentPath.value === '/sign-up') {
    return 'sign-up'
  }
  if (currentPath.value === '/settings') {
    return 'settings'
  }
  if (currentPath.value === '/how-to-play') {
    return 'how-to-play'
  }
  return 'lobby'
})
const backgroundMusicMode = computed<BackgroundMusicMode>(() =>
  activeScreen.value === 'ladder-play' ||
  activeScreen.value === 'convex-play' ||
  activeScreen.value === 'local-play'
    ? 'battle'
    : 'lobby',
)

function navigate(path: string) {
  const target = new URL(path, window.location.origin)
  ladderHandoffMatchId.value = ladderMatchIdFromUrl(target.pathname, target.search)
  window.history.pushState({}, '', `${target.pathname}${target.search}`)
  currentPath.value = target.pathname
}

function handoffLadderMatch(matchId: string) {
  if (!matchId) return
  window.history.replaceState({}, '', `/play/ladder?matchId=${encodeURIComponent(matchId)}`)
  ladderHandoffMatchId.value = matchId
}

window.addEventListener('popstate', () => {
  ladderHandoffMatchId.value = ladderMatchIdFromUrl(window.location.pathname, window.location.search)
  currentPath.value = window.location.pathname
})

onMounted(() => {
  removeButtonClickSound = installButtonClickSound()
})

onBeforeUnmount(() => {
  removeButtonClickSound?.()
  removeButtonClickSound = null
})
</script>

<template>
  <BackgroundMusic :mode="backgroundMusicMode" />
  <OpponentControllerScreen v-if="activeScreen === 'admin-opponents'" @back="navigate('/')" />
  <CustomGameScreen v-else-if="activeScreen === 'custom-game'" @back="navigate('/')" />
  <LadderShell
    v-else-if="activeScreen === 'ladder'"
    @back="navigate('/')"
    @handoff="handoffLadderMatch"
  />
  <ConvexPlayScreen
    v-else-if="activeScreen === 'ladder-play'"
    :match-id="ladderHandoffMatchId ?? undefined"
    source="ladder"
    @back="navigate('/')"
  />
  <ConvexPlayScreen v-else-if="activeScreen === 'convex-play'" @back="navigate('/')" />
  <LocalPlayScreen v-else-if="activeScreen === 'local-play'" @back="navigate('/')" />
  <SignInView v-else-if="activeScreen === 'sign-in'" />
  <SignUpView v-else-if="activeScreen === 'sign-up'" />
  <SettingsScreen v-else-if="activeScreen === 'settings'" @back="navigate('/')" />
  <HowToPlayScreen v-else-if="activeScreen === 'how-to-play'" @back="navigate('/')" />
  <LobbyScreen v-else @navigate="navigate" />
</template>
