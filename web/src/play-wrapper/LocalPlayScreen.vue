<script setup lang="ts">
import type { StartMatchPayload } from '@shared/protocol/game-bridge'
import DefoldCanvas from './DefoldCanvas.vue'

const emit = defineEmits<{
  back: []
}>()

const localMatch: StartMatchPayload = {
  sessionId: 'local-dev-session',
  matchId: 'local-dev-match',
  playerId: 'local-player',
  mode: 'dev',
  localSimulator: true,
}
</script>

<template>
  <main class="local-play-screen">
    <header class="local-play-screen__header">
      <button class="local-play-screen__back" type="button" @click="emit('back')">
        Back
      </button>
      <div>
        <h1>Local Defold Simulator</h1>
        <p>Convex command submission is disabled for this dev-only route.</p>
      </div>
    </header>

    <DefoldCanvas :match="localMatch" />
  </main>
</template>

<style scoped>
.local-play-screen {
  min-height: 100vh;
  padding: 24px;
  color: #f8efe0;
  background: radial-gradient(circle at 50% 20%, #26221e, #070606 70%);
}

.local-play-screen__header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.local-play-screen__header h1,
.local-play-screen__header p {
  margin: 0;
}

.local-play-screen__back {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  padding: 10px 14px;
  color: inherit;
  background: rgba(0, 0, 0, 0.32);
}
</style>
