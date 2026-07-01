<script setup lang="ts">
import { useAuth } from '@clerk/vue'
import { useConvexClient } from 'convex-vue'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import {
  createAdminMatchService,
  type AdminCustomGameParticipant,
  type AdminCustomGameRoomView,
  type AdminDevMatchRow,
  type AdminMatchState,
  type AdminParticipant,
} from '../services/convex/adminMatchService'

type AvailableAction = {
  type: string
  command?: string
  slots?: number[]
  remaining?: number
  stage?: string
  suggested?: {
    count?: number
    face?: number
  }
}

const emit = defineEmits<{
  back: []
}>()

const convex = useConvexClient()
const auth = useAuth()
const adminService = createAdminMatchService(convex)

const matches = ref<AdminDevMatchRow[]>([])
const customRooms = ref<AdminCustomGameRoomView[]>([])
const selectedMatchId = ref('')
const selectedRoomId = ref('')
const detail = ref<AdminMatchState | null>(null)
const roomDetail = ref<AdminCustomGameRoomView | null>(null)
const selectedPlayerId = ref('')
const selectedRoomPlayerId = ref('')
const status = ref('Loading admin controller...')
const errorMessage = ref('')
const busy = ref(false)
const bidCount = ref(1)
const bidFace = ref(2)
const initialMatchId = new URLSearchParams(window.location.search).get('matchId') ?? ''

let loadedOnce = false
let commandCounter = 0

const isSignedIn = computed(() => auth.isSignedIn.value === true)
const canUseAdmin = computed(() => auth.isLoaded.value && isSignedIn.value)
const participants = computed(() => detail.value?.participants ?? [])
const roomParticipants = computed(() => roomDetail.value?.participants ?? [])
const virtualRoomParticipants = computed(() => {
  return roomParticipants.value.filter((participant) => participant.participantKind === 'virtual')
})
const selectedRoomParticipant = computed(() => {
  return virtualRoomParticipants.value.find((participant) => participant.playerId === selectedRoomPlayerId.value)
})
const botParticipants = computed(() => participants.value.filter((participant) => participant.isBot))
const selectedParticipant = computed(() => {
  return participants.value.find((participant) => participant.playerId === selectedPlayerId.value)
})
const selectedDelta = computed(() => {
  return detail.value?.playerDeltas?.[selectedPlayerId.value] ?? null
})
const availableActions = computed<AvailableAction[]>(() => {
  return (selectedDelta.value?.availableActions ?? []) as AvailableAction[]
})
const currentPlayer = computed(() => {
  return detail.value?.state?.players?.byId?.[selectedPlayerId.value] ?? null
})
const phaseLabel = computed(() => detail.value?.state?.flow?.phase ?? 'unknown')
const activePlayerId = computed(() => detail.value?.state?.turn?.activePlayerId ?? '')
const pendingLoad = computed(() => detail.value?.state?.pendingLoad ?? null)
const playMatchUrl = computed(() => {
  if (!selectedMatchId.value) {
    return ''
  }
  return `/play/dev?matchId=${encodeURIComponent(selectedMatchId.value)}`
})

function roomLabel(row: AdminCustomGameRoomView) {
  const id = row.room?._id?.slice(-6) ?? 'room'
  const ready = row.allReady ? 'ready' : 'waiting'
  return `${id} · ${ready}`
}

function generateCommandId(type: string) {
  commandCounter += 1
  return `admin-${Date.now()}-${commandCounter}-${type}`
}

function matchLabel(row: AdminDevMatchRow) {
  const id = row.match._id.slice(-6)
  return `${id} · r${row.match.revision}`
}

function playerLabel(participant: AdminParticipant) {
  return participant.displayName ?? participant.playerId
}

function roomPlayerLabel(participant: AdminCustomGameParticipant) {
  return participant.displayName ?? participant.playerId
}

function updateMatchIdInUrl(matchId: string) {
  const url = new URL(window.location.href)
  if (matchId) {
    url.searchParams.set('matchId', matchId)
  } else {
    url.searchParams.delete('matchId')
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}`)
}

function selectMatch(matchId: string) {
  selectedMatchId.value = matchId
  selectedRoomId.value = ''
  roomDetail.value = null
}

function selectRoom(roomId: string) {
  selectedRoomId.value = roomId
  selectedMatchId.value = ''
  detail.value = null
}

function openPlayMatch() {
  if (!playMatchUrl.value) {
    return
  }
  window.open(playMatchUrl.value, '_blank', 'noopener,noreferrer')
}

function syncSuggestedBid() {
  const bidAction = availableActions.value.find((action) => action.type === 'bid')
  if (!bidAction?.suggested) {
    return
  }
  bidCount.value = Math.max(1, Number(bidAction.suggested.count ?? bidCount.value))
  bidFace.value = Math.max(1, Math.min(6, Number(bidAction.suggested.face ?? bidFace.value)))
}

async function loadMatches() {
  if (!canUseAdmin.value) {
    return
  }

  errorMessage.value = ''
  matches.value = await adminService.listAdminDevMatches({ status: 'ready', limit: 25 })
  if (!selectedRoomId.value && !selectedMatchId.value && initialMatchId) {
    selectedMatchId.value = initialMatchId
  }
  if (!selectedRoomId.value && !selectedMatchId.value && matches.value[0]) {
    selectedMatchId.value = matches.value[0].match._id
  }
  status.value = `${customRooms.value.length} custom rooms · ${matches.value.length} dev matches`
}

async function loadCustomRooms() {
  if (!canUseAdmin.value) {
    return
  }
  customRooms.value = await adminService.listAdminCustomGameRooms({ status: 'composing', limit: 25 })
  if (!selectedRoomId.value && !selectedMatchId.value && customRooms.value[0]?.room?._id) {
    selectedRoomId.value = customRooms.value[0].room._id
  }
}

async function loadDetail() {
  if (!selectedMatchId.value || !canUseAdmin.value || selectedRoomId.value) {
    detail.value = null
    return
  }

  errorMessage.value = ''
  detail.value = await adminService.getAdminMatchState(selectedMatchId.value)
  if (detail.value?.ok === false) {
    errorMessage.value = `${detail.value.code ?? 'ADMIN_ERROR'}: ${detail.value.message ?? 'admin_error'}`
    return
  }
  const selectedStillExists = botParticipants.value.some((participant) => {
    return participant.playerId === selectedPlayerId.value
  })
  if (!selectedStillExists) {
    selectedPlayerId.value = botParticipants.value[0]?.playerId ?? ''
  }
  syncSuggestedBid()
}

async function loadRoomDetail() {
  if (!selectedRoomId.value || !canUseAdmin.value) {
    roomDetail.value = null
    return
  }
  roomDetail.value = await adminService.getAdminCustomGameRoom(selectedRoomId.value)
  if (roomDetail.value?.ok === false) {
    errorMessage.value = `${roomDetail.value.code ?? 'ROOM_ERROR'}: ${roomDetail.value.message ?? 'room_error'}`
    return
  }
  const selectedStillExists = virtualRoomParticipants.value.some((participant) => {
    return participant.playerId === selectedRoomPlayerId.value
  })
  if (!selectedStillExists) {
    selectedRoomPlayerId.value = virtualRoomParticipants.value[0]?.playerId ?? ''
  }
}

async function createOrReuseDevMatch() {
  if (!canUseAdmin.value) {
    status.value = 'Sign in to use admin.'
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const created = await adminService.createDevMatchWithBots({
      localPlayerName: 'Admin',
      requiresSetupLoad: true,
      reuseActive: true,
    }) as { matchId: string }
    selectedMatchId.value = created.matchId
    await loadMatches()
    await loadDetail()
    status.value = 'Dev match ready'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function refreshAll() {
  busy.value = true
  errorMessage.value = ''
  try {
    await loadCustomRooms()
    await loadMatches()
    await loadRoomDetail()
    await loadDetail()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function setSelectedRoomReady(ready: boolean) {
  if (!selectedRoomId.value || !selectedRoomPlayerId.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    const result = await adminService.setCustomGameOpponentReady({
      roomId: selectedRoomId.value,
      targetPlayerId: selectedRoomPlayerId.value,
      ready,
    })
    if (result.ok === false) {
      errorMessage.value = `${result.code ?? 'READY_REJECTED'}: ${result.message ?? 'ready_rejected'}`
    } else {
      status.value = `Set ${selectedRoomPlayerId.value} ${ready ? 'ready' : 'waiting'}`
    }
    await loadRoomDetail()
    await loadCustomRooms()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function commandTypeForLoad() {
  return pendingLoad.value?.source === 'setup' ? 'setup.load_initial' : 'bullet.load'
}

async function submitCommand(type: string, payload?: unknown) {
  if (!detail.value?.state || !selectedMatchId.value || !selectedPlayerId.value) {
    return
  }

  busy.value = true
  errorMessage.value = ''
  try {
    const result = await adminService.submitOpponentCommand({
      matchId: selectedMatchId.value,
      targetPlayerId: selectedPlayerId.value,
      commandId: generateCommandId(type),
      revision: detail.value.state.revision,
      type,
      payload,
    })
    if (result.ok === false) {
      errorMessage.value = `${result.code ?? 'COMMAND_REJECTED'}: ${result.message ?? 'command_rejected'}`
    } else {
      status.value = `Submitted ${type}`
    }
    await loadDetail()
    await loadMatches()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function submitAction(action: AvailableAction) {
  if (action.type === 'shake_complete') {
    void submitCommand(action.command ?? 'shake.complete')
  } else if (action.type === 'check') {
    void submitCommand('dice.check')
  } else if (action.type === 'open') {
    void submitCommand('bidding.open')
  } else if (action.type === 'challenge') {
    void submitCommand('bid.challenge')
  } else if (action.type === 'resolve') {
    void submitCommand(action.stage === 'advance' ? 'round.advance' : 'duel.execute')
  }
}

function submitLoad(slotIndex: number) {
  void submitCommand(commandTypeForLoad(), { slotIndex })
}

function submitBid() {
  void submitCommand('bid.raise', {
    bid: {
      playerId: selectedPlayerId.value,
      count: Number(bidCount.value),
      face: Number(bidFace.value),
    },
  })
}

watchEffect(() => {
  if (!auth.isLoaded.value) {
    return
  }

  if (!isSignedIn.value) {
    convex.setAuth(async () => null)
    status.value = 'Sign in to use admin.'
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
  if (!canUseAdmin.value || loadedOnce) {
    return
  }
  loadedOnce = true
  void refreshAll()
})

watch(selectedMatchId, () => {
  updateMatchIdInUrl(selectedMatchId.value)
  void loadDetail()
})

watch(selectedRoomId, () => {
  void loadRoomDetail()
})

watch(selectedPlayerId, () => {
  syncSuggestedBid()
})

onMounted(() => {
  if (!auth.isLoaded.value) {
    status.value = 'Waiting for Clerk...'
  }
})
</script>

<template>
  <main class="opponent-controller">
    <header class="opponent-controller__header">
      <button class="opponent-controller__button" type="button" @click="emit('back')">
        Back
      </button>
      <div class="opponent-controller__title">
        <h1>Opponent Controller</h1>
        <p>{{ status }}</p>
        <p v-if="errorMessage" class="opponent-controller__error">{{ errorMessage }}</p>
      </div>
      <div class="opponent-controller__header-actions">
        <button class="opponent-controller__button" type="button" :disabled="busy" @click="refreshAll">
          Refresh
        </button>
        <button class="opponent-controller__button" type="button" :disabled="!playMatchUrl" @click="openPlayMatch">
          Open Play
        </button>
        <button class="opponent-controller__button opponent-controller__button--primary" type="button" :disabled="busy" @click="createOrReuseDevMatch">
          Create / Reuse
        </button>
      </div>
    </header>

    <section class="opponent-controller__layout">
      <aside class="opponent-controller__matches">
        <p class="opponent-controller__group-label">Custom Rooms</p>
        <button
          v-for="row in customRooms"
          :key="row.room?._id"
          class="opponent-controller__match"
          :class="{ 'is-selected': selectedRoomId === row.room?._id }"
          type="button"
          @click="row.room?._id && selectRoom(row.room._id)"
        >
          <span>{{ roomLabel(row) }}</span>
          <small>{{ row.participants?.length ?? 0 }} players</small>
        </button>

        <p class="opponent-controller__group-label">Dev Matches</p>
        <button
          v-for="row in matches"
          :key="row.match._id"
          class="opponent-controller__match"
          :class="{ 'is-selected': selectedMatchId === row.match._id }"
          type="button"
          @click="selectMatch(row.match._id)"
        >
          <span>{{ matchLabel(row) }}</span>
          <small>{{ row.participants.length }} players</small>
        </button>
      </aside>

      <section v-if="selectedRoomId" class="opponent-controller__detail">
        <div class="opponent-controller__meta">
          <span>Room {{ selectedRoomId.slice(-6) }}</span>
          <span>Status {{ roomDetail?.room?.status ?? '-' }}</span>
          <span>Ready {{ roomDetail?.allReady ? 'all' : 'waiting' }}</span>
          <span>Invite {{ roomDetail?.room?.inviteCode ?? '-' }}</span>
        </div>

        <div class="opponent-controller__players">
          <button
            v-for="participant in virtualRoomParticipants"
            :key="participant.playerId"
            class="opponent-controller__player"
            :class="{ 'is-selected': selectedRoomPlayerId === participant.playerId }"
            type="button"
            @click="selectedRoomPlayerId = participant.playerId"
          >
            <span>{{ roomPlayerLabel(participant) }}</span>
            <small>{{ participant.ready ? 'ready' : 'waiting' }}</small>
          </button>
        </div>

        <div v-if="selectedRoomParticipant" class="opponent-controller__state">
          <div>
            <strong>{{ roomPlayerLabel(selectedRoomParticipant) }}</strong>
            <span>{{ selectedRoomParticipant.archetype ?? 'virtual' }}</span>
            <span>{{ selectedRoomParticipant.playerId }}</span>
          </div>
          <div>
            <span>Ready {{ selectedRoomParticipant.ready ? 'yes' : 'no' }}</span>
            <span>Seat {{ selectedRoomParticipant.seatIndex }}</span>
          </div>
        </div>

        <div class="opponent-controller__actions">
          <button
            class="opponent-controller__button opponent-controller__button--primary"
            type="button"
            :disabled="busy || !selectedRoomParticipant"
            @click="setSelectedRoomReady(true)"
          >
            Ready
          </button>
          <button
            class="opponent-controller__button"
            type="button"
            :disabled="busy || !selectedRoomParticipant"
            @click="setSelectedRoomReady(false)"
          >
            Unready
          </button>
          <p v-if="virtualRoomParticipants.length === 0" class="opponent-controller__empty">
            No custom room opponents
          </p>
        </div>
      </section>

      <section v-else class="opponent-controller__detail">
        <div class="opponent-controller__meta">
          <span>Match {{ selectedMatchId ? selectedMatchId.slice(-6) : 'none' }}</span>
          <span>Phase {{ phaseLabel }}</span>
          <span>Active {{ activePlayerId || 'none' }}</span>
          <span>Revision {{ detail?.state?.revision ?? '-' }}</span>
        </div>

        <div class="opponent-controller__players">
          <button
            v-for="participant in botParticipants"
            :key="participant.playerId"
            class="opponent-controller__player"
            :class="{ 'is-selected': selectedPlayerId === participant.playerId }"
            type="button"
            @click="selectedPlayerId = participant.playerId"
          >
            <span>{{ playerLabel(participant) }}</span>
            <small>{{ participant.playerId }}</small>
          </button>
        </div>

        <div v-if="selectedParticipant" class="opponent-controller__state">
          <div>
            <strong>{{ playerLabel(selectedParticipant) }}</strong>
            <span>HP {{ currentPlayer?.hp ?? '-' }}</span>
            <span>Bullets {{ currentPlayer?.bullets ?? '-' }}</span>
          </div>
          <div>
            <span>Dice {{ selectedDelta?.dice?.join(', ') || '-' }}</span>
            <span>Actions {{ availableActions.length }}</span>
          </div>
        </div>

        <div class="opponent-controller__actions">
          <template v-for="action in availableActions" :key="`${action.type}-${action.stage ?? ''}`">
            <div v-if="action.type === 'load'" class="opponent-controller__load">
              <button
                v-for="slot in action.slots"
                :key="slot"
                class="opponent-controller__button"
                type="button"
                :disabled="busy"
                @click="submitLoad(slot)"
              >
                Slot {{ slot }}
              </button>
            </div>

            <div v-else-if="action.type === 'bid'" class="opponent-controller__bid">
              <label>
                Count
                <input v-model.number="bidCount" type="number" min="1" max="36" />
              </label>
              <label>
                Face
                <input v-model.number="bidFace" type="number" min="1" max="6" />
              </label>
              <button class="opponent-controller__button opponent-controller__button--primary" type="button" :disabled="busy" @click="submitBid">
                Raise
              </button>
            </div>

            <button
              v-else
              class="opponent-controller__button opponent-controller__button--primary"
              type="button"
              :disabled="busy"
              @click="submitAction(action)"
            >
              {{ action.type }}
            </button>
          </template>

          <p v-if="selectedPlayerId && availableActions.length === 0" class="opponent-controller__empty">
            No actions
          </p>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.opponent-controller {
  min-height: 100vh;
  padding: 24px;
  color: #f3f6f4;
  background: linear-gradient(135deg, #101415, #181b19 52%, #241b16);
}

.opponent-controller__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.opponent-controller__title h1,
.opponent-controller__title p {
  margin: 0;
}

.opponent-controller__title h1 {
  font-size: 28px;
  line-height: 1.1;
}

.opponent-controller__title p {
  color: #aeb9b3;
}

.opponent-controller__error {
  color: #ffb3a8;
}

.opponent-controller__header-actions,
.opponent-controller__players,
.opponent-controller__actions,
.opponent-controller__load,
.opponent-controller__bid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.opponent-controller__layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 18px;
}

.opponent-controller__matches,
.opponent-controller__detail {
  min-height: 520px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: rgb(8 10 10 / 72%);
}

.opponent-controller__matches {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 12px;
}

.opponent-controller__group-label {
  margin: 8px 0 0;
  color: #aeb9b3;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.opponent-controller__detail {
  padding: 16px;
}

.opponent-controller__button,
.opponent-controller__match,
.opponent-controller__player {
  min-height: 38px;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 6px;
  padding: 8px 12px;
  color: inherit;
  background: rgb(255 255 255 / 7%);
}

.opponent-controller__button--primary {
  border-color: rgb(97 213 184 / 54%);
  background: rgb(39 116 99 / 64%);
}

.opponent-controller__button:disabled {
  cursor: wait;
  opacity: 0.5;
}

.opponent-controller__match,
.opponent-controller__player {
  display: grid;
  gap: 3px;
  width: 100%;
  text-align: left;
}

.opponent-controller__match small,
.opponent-controller__player small,
.opponent-controller__empty {
  color: #9ca7a0;
}

.opponent-controller__match.is-selected,
.opponent-controller__player.is-selected {
  border-color: rgb(238 185 105 / 70%);
  background: rgb(120 88 43 / 42%);
}

.opponent-controller__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
  color: #d8ded8;
}

.opponent-controller__meta span,
.opponent-controller__state span {
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  padding: 6px 9px;
  background: rgb(255 255 255 / 5%);
}

.opponent-controller__state {
  display: grid;
  gap: 10px;
  margin: 16px 0;
}

.opponent-controller__state div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.opponent-controller__bid {
  align-items: end;
}

.opponent-controller__bid label {
  display: grid;
  gap: 4px;
  color: #c8d0cb;
  font-size: 13px;
}

.opponent-controller__bid input {
  width: 92px;
  min-height: 38px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 6px;
  padding: 6px 9px;
  color: #f3f6f4;
  background: rgb(0 0 0 / 34%);
}

@media (max-width: 840px) {
  .opponent-controller {
    padding: 16px;
  }

  .opponent-controller__header,
  .opponent-controller__layout {
    grid-template-columns: 1fr;
  }

  .opponent-controller__header {
    display: grid;
  }

  .opponent-controller__matches,
  .opponent-controller__detail {
    min-height: auto;
  }
}
</style>
