<script setup lang="ts">
import DefoldCanvas from '../play-wrapper/DefoldCanvas.vue'
import type { GameBridgeMessage, StartMatchPayload } from '@shared/protocol/game-bridge'

const previewMatch: StartMatchPayload = {
  sessionId: 'preview_session',
  matchId: 'preview_match',
  playerId: 'preview_player',
  mode: 'casual',
  cosmetics: {
    diceSkin: 'default',
    cupSkin: 'default',
  },
}

function handleReady(message: GameBridgeMessage) {
  console.info('Defold ready', message)
}

function handleMessage(message: GameBridgeMessage) {
  console.info('Defold message', message)
}
</script>

<template>
  <main class="shell">
    <section class="lobby">
      <h1>CylinderDicer</h1>
      <div class="actions">
        <button type="button">공방</button>
        <button type="button">래더</button>
        <button type="button">상점</button>
        <button type="button">랭킹</button>
      </div>
    </section>

    <section class="play">
      <DefoldCanvas
        :match="previewMatch"
        @ready="handleReady"
        @message="handleMessage"
      />
    </section>
  </main>
</template>
