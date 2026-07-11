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
  type CustomGameRoomListRow,
  type CustomGameRoomUnsubscribe,
  type CustomGameRoomView,
} from '../services/convex/customGameService'

type RoomPlayer = {
  id: string
  nickname: string
  isHost: boolean
  isReady: boolean
  kind: 'human' | 'virtual'
  archetype?: string
}

const emit = defineEmits<{
  back: []
}>()

const convex = useConvexClient()
const auth = useAuth()
const customGameService = createCustomGameService(convex)

const backgroundAsset = assetLoader('background-custom-game')
const boardAsset = assetLoader('board')
const toolbarButtonAsset = assetLoader('button')
const woodButtonAsset = assetLoader('menu-panel')
const redButtonAsset = assetLoader('menu-pannel-red')
const titleAsset = assetLoader('title')

const roomView = ref<CustomGameRoomView | null>(null)
const publicRooms = ref<CustomGameRoomListRow[]>([])
const selectedBrowserRoomId = ref('')
const selectedPlayerId = ref('local-player')
const inviteCodeInput = ref('')
const inviteNameInput = ref('')
const statusMessage = ref(t('customGame.loadingRoom'))
const errorMessage = ref('')
const busy = ref(false)
const convexAuthReady = ref(false)
const loadedOnce = ref(false)

let roomUnsubscribe: CustomGameRoomUnsubscribe | undefined
let authSetupGeneration = 0
const CONVEX_REQUEST_TIMEOUT_MS = 10000
const CONVEX_AUTH_TIMEOUT_MS = 8000

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
const canUseConvex = computed(() => auth.isLoaded.value && isSignedIn.value && convexAuthReady.value)
const isHost = computed(() => roomView.value?.viewer?.isHost === true)
const isGuest = computed(() => Boolean(roomView.value?.viewer && !roomView.value.viewer.isHost))
const roomStarted = computed(() => roomView.value?.room.status === 'started')
const canStartMatch = computed(() => isHost.value && !roomStarted.value && allOpponentsReady.value)
const hasVirtualOpponents = computed(() => roomPlayers.value.some((player) => player.kind === 'virtual'))
const roomPlayers = computed<RoomPlayer[]>(() => [
  ...(roomView.value?.participants ?? [])
    .slice()
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map((participant) => {
      return {
        id: participant.playerId,
        nickname: participant.displayName,
        isHost: participant.playerId === 'local-player',
        isReady: participant.ready,
        kind: participant.participantKind,
        archetype: participant.archetype,
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
const canShowStart = computed(() => isHost.value && !roomStarted.value)
const createDisabled = computed(() => !canUseConvex.value || busy.value)
const joinDisabled = computed(() => !canUseConvex.value || busy.value)
const toolbarActionDisabled = computed(() => {
  if (!roomView.value) {
    return joinDisabled.value
  }
  return !canUseConvex.value || busy.value
})
const roomBrowserRows = computed(() => {
  return roomView.value
    ? []
    : publicRooms.value
})

function isRoomView(value: unknown): value is CustomGameRoomView {
  return Boolean(value && typeof value === 'object' && 'room' in value && 'participants' in value)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout))
  })
}

async function fetchConvexAuthToken(forceRefreshToken = false) {
  const token = await withTimeout(
    auth.getToken.value({
      template: 'convex',
      skipCache: forceRefreshToken,
    }),
    CONVEX_AUTH_TIMEOUT_MS,
    'convex_auth_token_timeout',
  )
  if (!token) {
    throw new Error('convex_auth_token_missing')
  }
  return token
}

function installConvexAuthProvider() {
  convex.setAuth(
    async ({ forceRefreshToken }) => {
      try {
        return await fetchConvexAuthToken(forceRefreshToken)
      } catch (error) {
        statusMessage.value = t('customGame.authTokenError')
        errorMessage.value = error instanceof Error ? error.message : String(error)
        return null
      }
    },
    () => {},
  )
}

async function prepareConvexAuth(generation: number) {
  installConvexAuthProvider()
  try {
    await fetchConvexAuthToken(false)
    if (generation !== authSetupGeneration) {
      return
    }
    convexAuthReady.value = true
    if (errorMessage.value === 'convex_auth_token_missing' || errorMessage.value === 'convex_auth_token_timeout') {
      errorMessage.value = ''
    }
  } catch (error) {
    if (generation !== authSetupGeneration) {
      return
    }
    convexAuthReady.value = false
    statusMessage.value = t('customGame.authTokenError')
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function loadRoom() {
  roomView.value = await withTimeout(
    customGameService.getMyCustomGameRoom(),
    CONVEX_REQUEST_TIMEOUT_MS,
    'custom_room_load_timeout',
  )
}

async function loadPublicRooms() {
  publicRooms.value = await withTimeout(
    customGameService.listComposingCustomGameRooms(12),
    CONVEX_REQUEST_TIMEOUT_MS,
    'custom_room_list_timeout',
  )
}

async function createRoom() {
  if (!canUseConvex.value || busy.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  statusMessage.value = t('customGame.createQueued')
  try {
    const created = await withTimeout(
      customGameService.ensureMyCustomGameRoom(),
      CONVEX_REQUEST_TIMEOUT_MS,
      'custom_room_create_timeout',
    )
    if (!isRoomView(created)) {
      throw new Error((created as any)?.message ?? 'custom_room_not_available')
    }
    roomView.value = created
    publicRooms.value = []
    subscribeRoomUpdates()
    selectedPlayerId.value = roomPlayers.value[1]?.id ?? 'local-player'
    statusMessage.value = selectedStatusMessage()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    statusMessage.value = t('customGame.createError')
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
    const joined = await withTimeout(
      customGameService.joinCustomGameRoomByInviteCode(inviteCode),
      CONVEX_REQUEST_TIMEOUT_MS,
      'custom_room_join_timeout',
    )
    if (!isRoomView(joined)) {
      throw new Error(`${(joined as any)?.code ?? 'JOIN_FAILED'}: ${(joined as any)?.message ?? 'join_failed'}`)
    }
    roomView.value = joined
    publicRooms.value = []
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

function selectBrowserRoom(room: CustomGameRoomListRow) {
  selectedBrowserRoomId.value = room.roomId
  inviteCodeInput.value = room.inviteCode
}

function queueInvite() {
  const name = inviteNameInput.value.trim()
  if (!name) {
    return
  }
  statusMessage.value = t('customGame.inviteQueued', { name })
  inviteNameInput.value = ''
}

async function leaveRoom() {
  if (!roomView.value || !isGuest.value || busy.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    await withTimeout(
      customGameService.leaveMyCustomGameRoom(roomView.value.room._id),
      CONVEX_REQUEST_TIMEOUT_MS,
      'custom_room_leave_timeout',
    )
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
    const updated = await withTimeout(
      customGameService.setMyCustomGameReady({
        roomId: roomView.value.room._id,
        ready: nextReady,
      }),
      CONVEX_REQUEST_TIMEOUT_MS,
      'custom_room_ready_timeout',
    )
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
  if (!roomView.value) {
    await loadPublicRooms()
  }
}

function refreshRoomFromToolbar() {
  if (!canUseConvex.value || busy.value) {
    return
  }
  statusMessage.value = t('customGame.loadingRoom')
  void refreshRoom()
    .then(() => {
      statusMessage.value = roomView.value ? selectedStatusMessage() : ''
    })
    .catch((error) => {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      statusMessage.value = t('customGame.roomLoadError')
    })
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
          openMatch({ matchId: room.room.matchId, revision: 0 })
        }
        return
      }
      roomView.value = null
    },
    (error) => {
      errorMessage.value = error.message
    },
  )
}

function openMatch(match: CreatedMatch) {
  window.location.assign(`/play/dev?matchId=${encodeURIComponent(match.matchId)}`)
}

async function startGame() {
  if (!canUseConvex.value || !isHost.value) {
    statusMessage.value = t('customGame.signInRequired')
    return
  }
  if (!hasVirtualOpponents.value) {
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
    const result = await withTimeout(
      customGameService.startMyCustomGameRoom(roomView.value.room._id),
      CONVEX_REQUEST_TIMEOUT_MS,
      'custom_room_start_timeout',
    ) as CreatedMatch & { ok?: boolean; code?: string; message?: string }

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
    authSetupGeneration += 1
    convex.setAuth(async () => null)
    convexAuthReady.value = false
    statusMessage.value = t('customGame.signInRequired')
    loadedOnce.value = false
    return
  }

  const generation = authSetupGeneration + 1
  authSetupGeneration = generation
  convexAuthReady.value = false
  void prepareConvexAuth(generation)
})

watchEffect(() => {
  if (!canUseConvex.value || loadedOnce.value) {
    return
  }
  loadedOnce.value = true
  void refreshRoom()
    .then(() => {
      if (roomView.value) {
        subscribeRoomUpdates()
        selectedPlayerId.value = roomView.value.viewer?.playerId ?? roomPlayers.value[1]?.id ?? 'local-player'
      }
      statusMessage.value = roomView.value ? selectedStatusMessage() : ''
    })
    .catch((error) => {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      statusMessage.value = t('customGame.roomLoadError')
    })
})

onMounted(() => {
  if (!canUseConvex.value) {
    statusMessage.value = auth.isLoaded.value && !isSignedIn.value
      ? t('customGame.signInRequired')
      : t('customGame.loadingRoom')
  }
  window.setTimeout(() => {
    if (!auth.isLoaded.value) {
      statusMessage.value = t('customGame.signInRequired')
    }
  }, 5000)
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
        <div
          class="custom-game-toolbar"
          :class="{ 'custom-game-toolbar--browser': !roomView }"
        >
          <button
            class="texture-button texture-button--small texture-button--toolbar"
            type="button"
            @click="emit('back')"
          >
            <span>{{ t('customGame.back') }}</span>
          </button>

          <button
            v-if="!roomView"
            class="texture-button texture-button--small texture-button--toolbar"
            type="button"
            :disabled="createDisabled"
            @click="createRoom"
          >
            <span>{{ t('customGame.create') }}</span>
          </button>

          <div v-else-if="!isHost" class="custom-game-toolbar__spacer" />

          <input
            v-if="!roomView"
            v-model="inviteCodeInput"
            class="custom-game-input"
            type="text"
            :placeholder="t('customGame.roomCodePlaceholder')"
            :aria-label="t('customGame.roomCodeAria')"
            :disabled="joinDisabled"
            @keyup.enter="joinRoom"
          />

          <input
            v-else-if="isHost && !roomStarted"
            v-model="inviteNameInput"
            class="custom-game-input"
            type="text"
            :placeholder="t('customGame.namePlaceholder')"
            :aria-label="t('customGame.inviteNameAria')"
            :disabled="busy || !canUseConvex"
            @keyup.enter="queueInvite"
          />

          <div v-else class="custom-game-toolbar__spacer" />

          <button
            class="texture-button texture-button--small texture-button--toolbar"
            type="button"
            :disabled="toolbarActionDisabled"
            @click="!roomView ? joinRoom() : isHost && !roomStarted ? queueInvite() : refreshRoomFromToolbar()"
          >
            <span>{{ !roomView ? t('customGame.join') : isHost && !roomStarted ? t('customGame.invite') : t('customGame.refreshRoom') }}</span>
          </button>
        </div>

        <section v-if="!roomView" class="custom-game-board custom-game-board--room-list">
          <div class="room-list-header">
            <span>{{ t('customGame.host') }}</span>
            <span>{{ t('customGame.players') }}</span>
          </div>

          <div class="room-list-scroll">
            <button
              v-for="room in roomBrowserRows"
              :key="room.roomId"
              class="room-list-row"
              :class="{ 'is-selected': selectedBrowserRoomId === room.roomId }"
              type="button"
              @click="selectBrowserRoom(room)"
            >
              <span>{{ room.hostDisplayName }}</span>
              <span>{{ room.playerCount }}/{{ room.maxPlayers }}</span>
            </button>
          </div>

          <button
            class="texture-button texture-button--large texture-button--red room-list-join"
            type="button"
            :disabled="joinDisabled || !inviteCodeInput.trim()"
            @click="joinRoom"
          >
            <span>{{ t('customGame.join') }}</span>
          </button>
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
              v-if="canShowStart"
              class="texture-button texture-button--large texture-button--red"
              type="button"
              :disabled="busy || !canUseConvex || !canStartMatch"
              @click="startGame"
            >
              <span>{{ t('customGame.start') }}</span>
            </button>
          </div>
        </section>

        <p v-if="statusMessage" class="custom-game-status">{{ statusMessage }}</p>
        <p v-if="errorMessage" class="custom-game-status custom-game-status--error">{{ errorMessage }}</p>
      </div>
    </section>
  </main>
</template>
