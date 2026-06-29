<script setup lang="ts">
import { computed, ref } from 'vue'
import CustomGameScreen from '../custom-game/CustomGameScreen.vue'
import LobbyScreen from '../lobby/LobbyScreen.vue'
import SignInView from '../views/sign-in.vue'
import SignUpView from '../views/sign-up.vue'

const currentPath = ref(window.location.pathname)
const activeScreen = computed(() => {
  if (currentPath.value === '/play/custom-game') {
    return 'custom-game'
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
  window.history.pushState({}, '', path)
  currentPath.value = path
}

window.addEventListener('popstate', () => {
  currentPath.value = window.location.pathname
})
</script>

<template>
  <CustomGameScreen v-if="activeScreen === 'custom-game'" @back="navigate('/')" />
  <SignInView v-else-if="activeScreen === 'sign-in'" />
  <SignUpView v-else-if="activeScreen === 'sign-up'" />
  <LobbyScreen v-else @navigate="navigate" />
</template>
