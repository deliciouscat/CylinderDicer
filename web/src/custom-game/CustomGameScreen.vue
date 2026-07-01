<script setup lang="ts">
import { useAuth } from '@clerk/vue'
import { useConvexClient } from 'convex-vue'
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { assetLoader } from '../assets/assetLoader'
import { t } from '../i18n'
import {
  type CreatedMatch,
} from '../services/convex/matchService'
import {
  createCustomGameService,
  type CustomGameRoomUnsubscribe,
  type CustomGameRoomView,
} from '../services/convex/customGameService'
import {
  createVirtualOpponentService,
  type VirtualOpponentProfile,
} from '../services/convex/virtualOpponentService'

type RoomPlayer = {
  id: string
  nickname: string
  isHost: boolean
  isReady: boolean
  kind: 'human' | 'virtual'
  archetype?: string
  virtualOpponentKey?: string
}

const emit = defineEmits<{
  back: []
}>()

const convex = useConvexClient()
const auth = useAuth()
const customGameService = createCustomGameService(convex)
const virtualOpponentService = createVirtualOpponentService(convex)

const backgroundAsset = assetLoader('background-custom-game')
const boardAsset = assetLoader('board')
const toolbarButtonAsset = assetLoader('button')
const woodButtonAsset = assetLoader('menu-panel')
const redButtonAsset = assetLoader('menu-pannel-red')
const titleAsset = assetLoader('title')

const virtualOpponents = ref<VirtualOpponentProfile[]>([])
const roomView = ref<CustomGameRoomView | null>(null)
const selectedPlayerId = ref('local-player')
const inviteCodeInput = ref('')
const statusMessage = ref(t('customGame.loadingOpponents'))
const errorMessage = ref('')
const busy = ref(false)
const loadedOnce = ref(false)

let roomUnsubscribe: CustomGameRoomUnsubscribe | undefined

const customGameStyles = {
  '--custom-bg': `url(${backgroundAsset.url})`,
  '--custom-bg-focus-x': backgroundAsset.manifest.focus.x,
  '--custom-bg-focus-y': backgroundAsset.manifest.focus.y,
  '--custom-bg-pan': `${backgroundAsset.manifest.pan.distancePercent}%`,
  '--custom-bg-pan-duration': `${backgroundAsset.manifest.pan.durationSeconds}s`,
  '--custom-bg-scrim': backgroundAsset.manifest.overlay.scrim,
  '--custom-bg-warmth': backgroundAsset.manifest.overlay.warmth,
  '--board-image': `url(${boardAsset.url})`,
  '--board-ratio': `${boardAsset.manifest.width} / ${boardAsset.manifest.height}`,
  '--toolbar-button-image': `url(${toolbarButtonAsset.url})`,
  '--toolbar-button-ratio': `${toolbarButtonAsset.manifest.width} / ${toolbarButtonAsset.manifest.height}`,
  '--wood-button-image': `url(${woodButtonAsset.url})`,
  '--wood-button-ratio': `${woodButtonAsset.manifest.width} / ${woodButtonAsset.manifest.height}`,
  '--red-button-image': `url(${redButtonAsset.url})`,
  '--red-button-ratio': `${redButtonAsset.manifest.width} / ${redButtonAsset.manifest.height}`,
}

const isSignedIn = computed(() => auth.isSignedIn.value === true)
const canUseConvex = computed(() => auth.isLoaded.value && isSignedIn.value)
const isHost = computed(() => roomView.value?.viewer?.isHost === true)
const isGuest = computed(() => Boolean(roomView.value?.viewer && !roomView.value.viewer.isHost))
const roomStarted = computed(() => roomView.value?.room.status === 'started')
const startedMatchId = computed(() => roomView.value?.room.matchId ?? '')
const canToggleOpponents = computed(() => isHost.value && !roomStarted.value && !busy.value)
const canStartMatch = computed(() => isHost.value && !roomStarted.value && allOpponentsReady.value)
const selectedOpponentKeys = computed(() => {
  return roomView.value?.participants
    ?.filter((participant) => participant.participantKind === 'virtual' && participant.status === 'active')
    ?.map((participant) => {
      const opponent = virtualOpponents.value.find((candidate) => candidate._id === participant.virtualOpponentId)
      return opponent?.key ?? ''
    })
    ?.filter(Boolean) ?? []
})
const roomPlayers = computed<RoomPlayer[]>(() => [
  ...(roomView.value?.participants ?? [])
    .slice()
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((participant) => {
      const opponent = virtualOpponents.value.find((candidate) => candidate._id === participant.virtualOpponentId)
      return {
        id: participant.playerId,
        nickname: participant.displayName,
        isHost: participant.playerId === 'local-player',
        isReady: participant.ready,
        kind: participant.participantKind,
        archetype: participant.archetype,
        virtualOpponentKey: opponent?.key,
      }
    }),
])
const selectedPlayer = computed(() => {
  return roomPlayers.value.find((player) => player.id === selectedPlayerId.value) ?? roomPlayers.value[0]
})
const selectedCountLabel = computed(() => {
  return `${roomPlayers.value.length}/6`
})
const allOpponentsReady = computed(() => {
  return roomView.value?.allReady === true
})

function isOpponentSelected(key: string) {
  return selectedOpponentKeys.value.includes(key)
}

function toggleOpponent(key: string) {
  if (!canToggleOpponents.value || !roomView.value) {
    return
  }
  void setSelectedOpponents(
    isOpponentSelected(key)
      ? selectedOpponentKeys.value.filter((selectedKey) => selectedKey !== key)
      : [...selectedOpponentKeys.value, key],
    key,
  )
}

async function setSelectedOpponents(nextKeys: string[], focusKey?: string) {
  if (!roomView.value || busy.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const updated = await customGameService.setMyCustomGameOpponents({
      roomId: roomView.value.room._id,
      virtualOpponentKeys: nextKeys,
    })
    if (!isRoomView(updated)) {
      throw new Error((updated as any)?.message ?? 'custom_room_update_failed')
    }
    roomView.value = updated
    selectedPlayerId.value = focusKey && selectedOpponentKeys.value.includes(focusKey)
      ? `opponent-${selectedOpponentKeys.value.indexOf(focusKey) + 1}`
      : roomPlayers.value[1]?.id ?? 'local-player'
    statusMessage.value = roomView.value.allReady
      ? t('customGame.allReady')
      : t('customGame.waitingForReady')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function defaultOpponentKeys() {
  return virtualOpponents.value.slice(0, 3).map((opponent) => opponent.key)
}

function isRoomView(value: unknown): value is CustomGameRoomView {
  return Boolean(value && typeof value === 'object' && 'room' in value && 'participants' in value)
}

async function loadRoom() {
  roomView.value = await customGameService.getMyCustomGameRoom()
}

async function createRoom() {
  if (!canUseConvex.value || busy.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const created = await customGameService.ensureMyCustomGameRoom({
      virtualOpponentKeys: defaultOpponentKeys(),
    })
    if (!isRoomView(created)) {
      throw new Error((created as any)?.message ?? 'custom_room_not_available')
    }
    roomView.value = created
    subscribeRoomUpdates()
    selectedPlayerId.value = roomPlayers.value[1]?.id ?? 'local-player'
    statusMessage.value = selectedStatusMessage()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function joinRoom() {
  if (!canUseConvex.value || busy.value) {
    return
  }
  const inviteCode = inviteCodeInput.value.trim()
  if (!inviteCode) {
    errorMessage.value = t('customGame.inviteCodeRequired')
    return
  }

  busy.value = true
  errorMessage.value = ''
  statusMessage.value = t('customGame.joinQueued')
  try {
    const joined = await customGameService.joinCustomGameRoomByInviteCode(inviteCode)
    if (!isRoomView(joined)) {
      throw new Error(`${(joined as any)?.code ?? 'JOIN_FAILED'}: ${(joined as any)?.message ?? 'join_failed'}`)
    }
    roomView.value = joined
    subscribeRoomUpdates()
    selectedPlayerId.value = joined.viewer?.playerId ?? roomPlayers.value[0]?.id ?? 'local-player'
    statusMessage.value = t('customGame.joinedRoom')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    statusMessage.value = t('customGame.joinError')
  } finally {
    busy.value = false
  }
}

async function leaveRoom() {
  if (!roomView.value || !isGuest.value || busy.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    await customGameService.leaveMyCustomGameRoom(roomView.value.room._id)
    roomUnsubscribe?.unsubscribe()
    roomView.value = null
    inviteCodeInput.value = ''
    statusMessage.value = t('customGame.leftRoom')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function toggleMyReady() {
  if (!roomView.value || !isGuest.value || busy.value) {
    return
  }
  const nextReady = roomView.value.viewer?.ready !== true
  busy.value = true
  errorMessage.value = ''
  try {
    const updated = await customGameService.setMyCustomGameReady({
      roomId: roomView.value.room._id,
      ready: nextReady,
    })
    if (!isRoomView(updated)) {
      throw new Error((updated as any)?.message ?? 'ready_update_failed')
    }
    roomView.value = updated
    statusMessage.value = selectedStatusMessage()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function refreshRoom() {
  await loadRoom()
}

function selectedStatusMessage() {
  return roomView.value?.allReady
    ? t('customGame.allReady')
    : t('customGame.waitingForReady')
}

function subscribeRoomUpdates() {
  roomUnsubscribe?.unsubscribe()
  roomUnsubscribe = customGameService.subscribeMyCustomGameRoom(
    (room) => {
      if (room) {
        roomView.value = room
        statusMessage.value = selectedStatusMessage()
        if (room.room.status === 'started' && room.room.matchId) {
          statusMessage.value = t('customGame.matchStarted')
        }
      }
    },
    (error) => {
      errorMessage.value = error.message
    },
  )
}

async function loadVirtualOpponents() {
  if (!canUseConvex.value || busy.value) {
    return
  }

  busy.value = true
  errorMessage.value = ''
  statusMessage.value = t('customGame.loadingOpponents')
  try {
    const loaded = await virtualOpponentService.ensureDefaultVirtualOpponentsLoaded()
    virtualOpponents.value = loaded.length > 0
      ? loaded
      : await virtualOpponentService.listVirtualOpponents()
    await refreshRoom()
    if (roomView.value) {
      subscribeRoomUpdates()
      selectedPlayerId.value = roomView.value.viewer?.playerId ?? roomPlayers.value[1]?.id ?? 'local-player'
    }
    loadedOnce.value = true
    statusMessage.value = selectedStatusMessage()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    statusMessage.value = t('customGame.startError')
  } finally {
    busy.value = false
  }
}

function openMatch(match: CreatedMatch) {
  window.location.assign(`/play/dev?matchId=${encodeURIComponent(match.matchId)}`)
}

async function startGame() {
  if (!canUseConvex.value || !isHost.value) {
    statusMessage.value = t('customGame.signInRequired')
    return
  }
  if (selectedOpponentKeys.value.length === 0) {
    errorMessage.value = t('customGame.selectOpponent')
    return
  }
  if (!allOpponentsReady.value) {
    errorMessage.value = t('customGame.waitingForReady')
    return
  }

  busy.value = true
  errorMessage.value = ''
  statusMessage.value = t('customGame.startQueued')
  try {
    if (!roomView.value) {
      errorMessage.value = t('customGame.startError')
      return
    }
    const result = await customGameService.startMyCustomGameRoom(roomView.value.room._id) as CreatedMatch & { ok?: boolean; code?: string; message?: string }

    if (result.ok === false || !result.matchId) {
      errorMessage.value = `${result.code ?? 'CUSTOM_MATCH_FAILED'}: ${result.message ?? 'custom_match_failed'}`
      statusMessage.value = t('customGame.startError')
      return
    }

    statusMessage.value = t('customGame.customMatchCreated')
    openMatch(result)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    statusMessage.value = t('customGame.startError')
  } finally {
    busy.value = false
  }
}

watchEffect(() => {
  if (!auth.isLoaded.value) {
    return
  }

  if (!isSignedIn.value) {
    convex.setAuth(async () => null)
    statusMessage.value = t('customGame.signInRequired')
    return
  }

  convex.setAuth(
    async ({ forceRefreshToken }) => {
      return await auth.getToken.value({
        template: 'convex',
        skipCache: forceRefreshToken,
      })
    },
    () => {},
  )
})

watchEffect(() => {
  if (!canUseConvex.value || loadedOnce.value) {
    return
  }
  void loadVirtualOpponents()
})

onMounted(() => {
  if (!canUseConvex.value) {
    statusMessage.value = auth.isLoaded.value
      ? t('customGame.signInRequired')
      : t('customGame.loadingOpponents')
  }
})

onUnmounted(() => {
  roomUnsubscribe?.unsubscribe()
})
</script>

<template>
  <main class="custom-game-screen" :style="customGameStyles" :aria-label="t('customGame.screenLabel')">
    <div class="custom-game-screen__background" aria-hidden="true" />

    <section class="custom-game-stage">
      <img class="custom-game-title" :src="titleAsset.url" :alt="t('customGame.titleAlt')" />

      <div class="custom-game-shell custom-game-shell--room">
        <div class="custom-game-toolbar">
          <button
            class="texture-button texture-button--small texture-button--toolbar"
            type="button"
            @click="emit('back')"
          >
            <span>{{ t('customGame.back') }}</span>
          </button>

          <div class="custom-game-toolbar__spacer" />

          <button
            class="texture-button texture-button--small texture-button--toolbar"
            type="button"
            :disabled="busy || !canUseConvex"
            @click="loadVirtualOpponents"
          >
            <span>{{ t('customGame.refreshOpponents') }}</span>
          </button>
        </div>

        <section v-if="!roomView" class="custom-game-board custom-game-board--lobby">
          <div class="room-join-panel">
            <label class="room-join-panel__label" for="custom-game-invite-code">{{ t('customGame.inviteCode') }}</label>
            <input
              id="custom-game-invite-code"
              v-model="inviteCodeInput"
              class="room-join-panel__input"
              type="text"
              :placeholder="t('customGame.roomCodePlaceholder')"
              :aria-label="t('customGame.roomCodeAria')"
              :disabled="busy || !canUseConvex"
            />
            <div class="room-action-bar">
              <button
                class="texture-button texture-button--large texture-button--wood"
                type="button"
                :disabled="busy || !canUseConvex"
                @click="joinRoom"
              >
                <span>{{ t('customGame.join') }}</span>
              </button>
              <button
                class="texture-button texture-button--large texture-button--red"
                type="button"
                :disabled="busy || !canUseConvex"
                @click="createRoom"
              >
                <span>{{ t('customGame.create') }}</span>
              </button>
            </div>
          </div>
        </section>

        <section v-else class="custom-game-board custom-game-board--room">
          <div class="room-detail-layout">
            <div class="room-player-list">
              <button
                v-for="player in roomPlayers"
                :key="player.id"
                class="room-player-row"
                :class="{ 'is-selected': selectedPlayer?.id === player.id }"
                type="button"
                @click="selectedPlayerId = player.id"
              >
                <span>{{ player.nickname }}</span>
                <span v-if="player.isHost" class="room-player-row__host">{{ t('customGame.host') }}</span>
                <span v-else-if="player.isReady" class="room-player-row__ready">{{ t('customGame.ready') }}</span>
                <span v-else class="room-player-row__waiting">{{ t('customGame.notReady') }}</span>
              </button>
            </div>

            <aside class="room-invite-panel">
              <p>{{ isHost ? t('customGame.virtualOpponents') : t('customGame.players') }}</p>
              <strong>{{ selectedCountLabel }}</strong>
              <small v-if="isHost">{{ t('customGame.inviteCodeStatus', { code: roomView.room.inviteCode }) }}</small>
              <small v-else-if="selectedPlayer?.archetype">
                {{ t('customGame.archetype') }}: {{ selectedPlayer.archetype }}
              </small>
              <small v-else-if="roomStarted">{{ t('customGame.matchStarted') }}</small>
            </aside>
          </div>

          <div v-if="isHost" class="virtual-opponent-grid">
            <button
              v-for="opponent in virtualOpponents"
              :key="opponent.key"
              class="virtual-opponent-tile"
              :class="{ 'is-selected': isOpponentSelected(opponent.key) }"
              type="button"
              :disabled="!canToggleOpponents"
              @click="toggleOpponent(opponent.key)"
            >
              <span>{{ opponent.displayName }}</span>
              <small>{{ opponent.archetype ?? opponent.key }}</small>
              <strong>{{ isOpponentSelected(opponent.key) ? t('customGame.selected') : t('customGame.add') }}</strong>
            </button>
          </div>

          <div class="room-action-bar">
            <button
              v-if="isGuest && !roomStarted"
              class="texture-button texture-button--large texture-button--wood"
              type="button"
              :disabled="busy || !canUseConvex"
              @click="toggleMyReady"
            >
              <span>{{ roomView.viewer?.ready ? t('customGame.unready') : t('customGame.ready') }}</span>
            </button>
            <button
              v-if="isGuest && !roomStarted"
              class="texture-button texture-button--large texture-button--toolbar"
              type="button"
              :disabled="busy || !canUseConvex"
              @click="leaveRoom"
            >
              <span>{{ t('customGame.leaveRoom') }}</span>
            </button>
            <button
              v-if="canStartMatch"
              class="texture-button texture-button--large texture-button--red"
              type="button"
              :disabled="busy || !canUseConvex"
              @click="startGame"
            >
              <span>{{ t('customGame.start') }}</span>
            </button>
            <button
              v-if="roomStarted && startedMatchId"
              class="texture-button texture-button--large texture-button--red"
              type="button"
              :disabled="busy"
              @click="openMatch({ matchId: startedMatchId, revision: 0 })"
            >
              <span>{{ t('customGame.openMatch') }}</span>
            </button>
          </div>
        </section>

        <p v-if="statusMessage" class="custom-game-status">{{ statusMessage }}</p>
        <p v-if="errorMessage" class="custom-game-status custom-game-status--error">{{ errorMessage }}</p>
      </div>
    </section>
  </main>
</template>
