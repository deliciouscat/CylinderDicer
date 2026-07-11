<script setup lang="ts">
import { computed, ref } from 'vue'
import OpponentControllerScreen from '../admin/OpponentControllerScreen.vue'
import CustomGameScreen from '../custom-game/CustomGameScreen.vue'
import LadderShell from '../ladder/LadderShell.vue'
import LobbyScreen from '../lobby/LobbyScreen.vue'
import ConvexPlayScreen from '../play-wrapper/ConvexPlayScreen.vue'
import LocalPlayScreen from '../play-wrapper/LocalPlayScreen.vue'
import SignInView from '../views/sign-in.vue'
import SignUpView from '../views/sign-up.vue'

const currentPath = ref(window.location.pathname)
const ladderHandoffMatchId = ref<string | null>(null)
const useLocalDefoldSimulator = import.meta.env.VITE_USE_LOCAL_DEFOLD_SIMULATOR === 'true'
const activeScreen = computed(() => {
  if (currentPath.value === '/play/custom-game') {
    return 'custom-game'
  }
  if (currentPath.value === '/play/ladder') {
    return ladderHandoffMatchId.value ? 'ladder-play' : 'ladder'
  }
  if (currentPath.value === '/admin/opponents') {
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
  return 'lobby'
})

function navigate(path: string) {
  if (path !== '/play/ladder') {
    ladderHandoffMatchId.value = null
  }
  window.history.pushState({}, '', path)
  currentPath.value = path
}

function handoffLadderMatch(matchId: string) {
  if (!matchId) return
  ladderHandoffMatchId.value = matchId
}

window.addEventListener('popstate', () => {
  ladderHandoffMatchId.value = null
  currentPath.value = window.location.pathname
})
</script>

<template>
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
  <LobbyScreen v-else @navigate="navigate" />
</template>
