<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { assetLoader } from '../assets/assetLoader'
import customGameConfig from '../config/customGame.config.json'
import { t } from '../i18n'
import {
  fetchCustomGameState,
  fetchCustomGameRoom,
  joinCustomGameRoom,
  type MockCustomGameState,
  type MockRoomDetail,
  type MockRoomPlayer,
  type MockRoomSummary,
} from '../services/mock'

type ButtonGroupName = keyof (typeof customGameConfig)['buttonGroups']
type ButtonAction =
  | 'back'
  | 'create'
  | 'joinByCode'
  | 'leaveRoom'
  | 'invite'
  | 'kickSelected'
  | 'startGame'
  | 'toggleReady'
type ButtonConfig = {
  id: string
  action: ButtonAction
  labelKey: string
  alternateLabelKey?: string
  variant: 'wood' | 'red'
}

const emit = defineEmits<{
  back: []
}>()

const backgroundAsset = assetLoader('background-custom-game')
const boardAsset = assetLoader('board')
const toolbarButtonAsset = assetLoader('button')
const woodButtonAsset = assetLoader('menu-panel')
const redButtonAsset = assetLoader('menu-pannel-red')
const titleAsset = assetLoader('title')

const state = ref<MockCustomGameState | null>(null)
const screen = ref<'room-list' | 'room'>('room-list')
const selectedRoomId = ref('')
const selectedPlayerId = ref('')
const roomCode = ref('')
const inviteName = ref('')
const statusMessage = ref('')

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

const rooms = computed<MockRoomSummary[]>(() => state.value?.rooms ?? [])
const activeRoom = computed<MockRoomDetail | null>(() => state.value?.activeRoom ?? null)
const currentUserId = computed(() => state.value?.currentUserId ?? '')
const currentPlayer = computed(() => activeRoom.value?.players.find((player) => player.userId === currentUserId.value))
const selectedPlayer = computed(
  () => activeRoom.value?.players.find((player) => player.userId === selectedPlayerId.value) ?? null,
)
const isHost = computed(() => activeRoom.value?.hostId === currentUserId.value)
const isReady = computed(() => Boolean(currentPlayer.value?.isReady))

const roomActionButtons = computed(() => {
  const groupName: ButtonGroupName = isHost.value ? 'hostRoomActions' : 'playerRoomActions'
  return customGameConfig.buttonGroups[groupName] as ButtonConfig[]
})

function buttonLabel(button: ButtonConfig): string {
  const labelKey = button.action === 'toggleReady' && isReady.value && button.alternateLabelKey
    ? button.alternateLabelKey
    : button.labelKey

  return t(labelKey)
}

function groupButtons(groupName: ButtonGroupName): ButtonConfig[] {
  return customGameConfig.buttonGroups[groupName] as ButtonConfig[]
}

async function loadCustomGameState() {
  state.value = await fetchCustomGameState()
  selectedRoomId.value = ''
  selectedPlayerId.value = ''
}

function selectRoom(room: MockRoomSummary) {
  selectedRoomId.value = room.id
  statusMessage.value = ''
}

async function openSelectedRoom() {
  if (!selectedRoomId.value) {
    return
  }

  const room = await fetchCustomGameRoom(selectedRoomId.value)
  if (state.value) {
    state.value.activeRoom = room
    state.value.selectedRoomId = room.id
  }
  selectedPlayerId.value = room.players.find((player) => !player.isHost)?.userId ?? room.players[0]?.userId ?? ''
  screen.value = 'room'
  statusMessage.value = ''
}

function createRoom() {
  selectedPlayerId.value = activeRoom.value?.players.find((player) => !player.isHost)?.userId ?? ''
  screen.value = 'room'
  statusMessage.value = ''
}

async function joinByCode() {
  if (!roomCode.value.trim()) {
    openSelectedRoom()
    return
  }

  const room = await joinCustomGameRoom(roomCode.value.trim())
  if (state.value) {
    state.value.activeRoom = room
    selectedRoomId.value = room.id
    selectedPlayerId.value = room.players[0]?.userId ?? ''
  }
  screen.value = 'room'
}

function leaveRoom() {
  screen.value = 'room-list'
  statusMessage.value = ''
}

function selectPlayer(player: MockRoomPlayer) {
  selectedPlayerId.value = player.userId
  statusMessage.value = ''
}

function kickSelectedPlayer() {
  if (!state.value || !selectedPlayer.value || selectedPlayer.value.isHost) {
    return
  }

  state.value.activeRoom.players = state.value.activeRoom.players.filter(
    (player) => player.userId !== selectedPlayer.value?.userId,
  )
  state.value.rooms = state.value.rooms.map((room) => room.id === state.value?.activeRoom.id
    ? { ...room, players: state.value.activeRoom.players.length }
    : room)
  selectedPlayerId.value = state.value.activeRoom.players.find((player) => !player.isHost)?.userId ?? ''
}

function toggleReady() {
  if (!currentPlayer.value) {
    return
  }

  currentPlayer.value.isReady = !currentPlayer.value.isReady
}

function handleAction(action: ButtonAction) {
  const handlers: Record<ButtonAction, () => void | Promise<void>> = {
    back: () => emit('back'),
    create: createRoom,
    joinByCode,
    leaveRoom,
    invite: () => {
      statusMessage.value = inviteName.value.trim()
        ? t('customGame.inviteQueued', { name: inviteName.value.trim() })
        : t('customGame.inviteCodeStatus', { code: activeRoom.value?.inviteCode ?? '' })
    },
    kickSelected: kickSelectedPlayer,
    startGame: () => {
      statusMessage.value = t('customGame.startQueued')
    },
    toggleReady,
  }

  void handlers[action]()
}

onMounted(() => {
  void loadCustomGameState()
})
</script>

<template>
  <main class="custom-game-screen" :style="customGameStyles" :aria-label="t('customGame.screenLabel')">
    <div class="custom-game-screen__background" aria-hidden="true" />

    <section class="custom-game-stage">
      <img class="custom-game-title" :src="titleAsset.url" :alt="t('customGame.titleAlt')" />

      <div v-if="state" class="custom-game-shell" :class="`custom-game-shell--${screen}`">
        <div class="custom-game-toolbar">
          <template v-if="screen === 'room-list'">
            <button
              v-for="button in groupButtons('roomListToolbar').filter((item) => item.id !== 'join')"
              :key="button.id"
              class="texture-button texture-button--small texture-button--toolbar"
              type="button"
              @click="handleAction(button.action)"
            >
              <span>{{ buttonLabel(button) }}</span>
            </button>

            <input
              v-model="roomCode"
              class="custom-game-input custom-game-input--room-code"
              type="text"
              :placeholder="t('customGame.roomCodePlaceholder')"
              :aria-label="t('customGame.roomCodeAria')"
              @keyup.enter="handleAction('joinByCode')"
            />

            <button
              v-for="button in groupButtons('roomListToolbar').filter((item) => item.id === 'join')"
              :key="button.id"
              class="texture-button texture-button--small texture-button--toolbar"
              type="button"
              @click="handleAction(button.action)"
            >
              <span>{{ buttonLabel(button) }}</span>
            </button>
          </template>

          <template v-else>
            <button
              v-for="button in groupButtons('roomToolbar').filter((item) => item.id === 'back')"
              :key="button.id"
              class="texture-button texture-button--small texture-button--toolbar"
              type="button"
              @click="handleAction(button.action)"
            >
              <span>{{ buttonLabel(button) }}</span>
            </button>

            <div class="custom-game-toolbar__spacer" />

            <input
              v-model="inviteName"
              class="custom-game-input custom-game-input--invite"
              type="text"
              :placeholder="t('customGame.namePlaceholder')"
              :aria-label="t('customGame.inviteNameAria')"
              @keyup.enter="handleAction('invite')"
            />

            <button
              v-for="button in groupButtons('roomToolbar').filter((item) => item.id === 'invite')"
              :key="button.id"
              class="texture-button texture-button--small texture-button--toolbar"
              type="button"
              @click="handleAction(button.action)"
            >
              <span>{{ buttonLabel(button) }}</span>
            </button>
          </template>
        </div>

        <section class="custom-game-board" :class="`custom-game-board--${screen}`">
          <template v-if="screen === 'room-list'">
            <div class="room-list-header">
              <span>{{ t('customGame.host') }}</span>
              <span>{{ t('customGame.players') }}</span>
            </div>

            <div class="room-list-scroll">
              <button
                v-for="room in rooms"
                :key="room.id"
                class="room-list-row"
                :class="{ 'is-selected': selectedRoomId === room.id }"
                type="button"
                @click="selectRoom(room)"
                @dblclick="openSelectedRoom"
              >
                <span>{{ room.hostName }}</span>
                <span>{{ room.players }}/{{ room.capacity }}</span>
              </button>
            </div>

            <button
              class="texture-button texture-button--large texture-button--red room-list-join"
              type="button"
              @click="openSelectedRoom"
            >
              <span>{{ t('customGame.join') }}</span>
            </button>
          </template>

          <template v-else-if="activeRoom">
            <div class="room-detail-layout">
              <div class="room-player-list">
                <button
                  v-for="player in activeRoom.players"
                  :key="player.userId"
                  class="room-player-row"
                  :class="{ 'is-selected': selectedPlayerId === player.userId }"
                  type="button"
                  @click="selectPlayer(player)"
                >
                  <span>{{ player.nickname }}</span>
                  <span v-if="player.isHost" class="room-player-row__host">{{ t('customGame.host') }}</span>
                  <span v-else-if="player.isReady" class="room-player-row__ready">{{ t('customGame.ready') }}</span>
                </button>
              </div>

              <aside class="room-invite-panel">
                <p>{{ t('customGame.inviteCode') }}</p>
                <strong>{{ activeRoom.inviteCode }}</strong>
              </aside>
            </div>

            <div class="room-action-bar" :class="{ 'room-action-bar--single': !isHost }">
              <button
                v-for="button in roomActionButtons"
                :key="button.id"
                class="texture-button texture-button--large"
                :class="button.variant === 'red' ? 'texture-button--red' : 'texture-button--wood'"
                type="button"
                @click="handleAction(button.action)"
              >
                <span>{{ buttonLabel(button) }}</span>
              </button>
            </div>
          </template>
        </section>

        <p v-if="statusMessage" class="custom-game-status">{{ statusMessage }}</p>
      </div>
    </section>
  </main>
</template>
