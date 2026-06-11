<script setup lang="ts">
import { computed, ref } from 'vue'
import CustomGameScreen from '../custom-game/CustomGameScreen.vue'
import LobbyScreen from '../lobby/LobbyScreen.vue'

const currentPath = ref(window.location.pathname)
const activeScreen = computed(() => (currentPath.value === '/play/custom-game' ? 'custom-game' : 'lobby'))

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
  <LobbyScreen v-else @navigate="navigate" />
</template>
