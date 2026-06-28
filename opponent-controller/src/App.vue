<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { QaAvailableAction, QaCommand, QaPlayer, QaStatus } from '../../shared/qa/protocol'

const status = ref<QaStatus | null>(null)
const selectedPlayerId = ref('')
const connectionError = ref('')
const commandError = ref('')
const sending = ref(false)
const bidCount = ref(1)
const bidFace = ref(2)
let pollTimer: number | undefined

function asArray<T>(value: T[] | Record<string, T> | undefined): T[] {
  return Array.isArray(value) ? value : []
}

const selectedPlayer = computed<QaPlayer | undefined>(() =>
  status.value?.players.find((player) => player.id === selectedPlayerId.value),
)

const controllablePlayers = computed(() =>
  status.value?.players.filter((player) => !player.is_local) ?? [],
)

const availableActions = computed(() => asArray(selectedPlayer.value?.available_actions))

const bidAction = computed(() =>
  availableActions.value.find((action) => action.type === 'bid'),
)

const bidDraftKey = computed(() => {
  const action = bidAction.value
  if (!action?.suggested || !status.value) {
    return null
  }

  const current = status.value.bidding.current_bid
  return [
    selectedPlayerId.value,
    status.value.turn.active_player_id,
    current?.count ?? '-',
    current?.face ?? '-',
    action.suggested.count,
    action.suggested.face,
  ].join(':')
})

function preferredPlayer(next: QaStatus) {
  const opponents = next.players.filter((player) => !player.is_local)
  const pendingOpponent = opponents.find((player) => player.id === next.pending_load?.player_id)
  const activeOpponent = opponents.find((player) => player.id === next.turn.active_player_id)
  return (
    pendingOpponent?.id ||
    activeOpponent?.id ||
    opponents[0]?.id ||
    ''
  )
}

async function refreshStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`status ${response.status}`)
    }
    const next = (await response.json()) as QaStatus
    next.players = asArray(next.players).map((player) => ({
      ...player,
      dice: asArray(player.dice),
      available_actions: asArray(player.available_actions),
      cylinder: {
        ...player.cylinder,
        slots: asArray(player.cylinder?.slots),
      },
    }))
    status.value = next
    connectionError.value = ''
    if (!next.players.some((player) => !player.is_local && player.id === selectedPlayerId.value)) {
      selectedPlayerId.value = preferredPlayer(next)
    }
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : String(error)
  }
}

async function sendCommand(action: QaAvailableAction['type'], payload?: QaCommand['payload']) {
  if (!selectedPlayer.value || sending.value) {
    return
  }

  sending.value = true
  commandError.value = ''
  const command: QaCommand = {
    id: `controller-${crypto.randomUUID()}`,
    actor_id: selectedPlayer.value.id,
    action,
    payload,
  }

  try {
    const response = await fetch('/api/commands', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    })
    if (!response.ok) {
      const body = await response.json()
      throw new Error(body.error || `command ${response.status}`)
    }
    window.setTimeout(refreshStatus, 80)
  } catch (error) {
    commandError.value = error instanceof Error ? error.message : String(error)
  } finally {
    sending.value = false
  }
}

function submitBid() {
  sendCommand('bid', {
    count: Number(bidCount.value),
    face: Number(bidFace.value),
  })
}

watch(
  bidDraftKey,
  (key) => {
    const action = bidAction.value
    if (key && action?.suggested) {
      bidCount.value = action.suggested.count
      bidFace.value = action.suggested.face
    }
  },
  { immediate: true },
)

onMounted(() => {
  refreshStatus()
  pollTimer = window.setInterval(refreshStatus, 300)
})

onUnmounted(() => {
  if (pollTimer) {
    window.clearInterval(pollTimer)
  }
})
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">CylinderDicer QA</p>
        <h1>Opponent Controller</h1>
      </div>
      <div class="connection" :class="{ error: connectionError }">
        <span class="signal" />
        {{ connectionError ? 'Disconnected' : 'Live' }}
      </div>
    </header>

    <section v-if="status" class="status-strip">
      <div><span>Phase</span><strong>{{ status.phase }}</strong></div>
      <div><span>HUD</span><strong>{{ status.hud }}</strong></div>
      <div><span>Active</span><strong>{{ status.turn.active_player_id }}</strong></div>
      <div><span>Revision</span><strong>#{{ status.revision }}</strong></div>
    </section>

    <section class="workspace">
      <aside class="players-panel">
        <label for="player-select">Control player</label>
        <select id="player-select" v-model="selectedPlayerId" :disabled="!status">
          <option v-for="player in controllablePlayers" :key="player.id" :value="player.id">
            {{ player.name }} · {{ player.id }}
          </option>
        </select>

        <div v-if="selectedPlayer" class="player-card">
          <div class="player-heading">
            <div>
              <p>{{ selectedPlayer.is_local ? 'LOCAL' : 'OPPONENT' }}</p>
              <h2>{{ selectedPlayer.name }}</h2>
            </div>
            <span v-if="selectedPlayer.is_active" class="active-badge">ACTIVE</span>
          </div>

          <div class="meters">
            <div><span>HP</span><strong>{{ selectedPlayer.hp }}</strong></div>
            <div><span>Bullets</span><strong>{{ selectedPlayer.bullets }}/6</strong></div>
          </div>

          <div class="cylinder" aria-label="Cylinder slots">
            <span
              v-for="(loaded, index) in selectedPlayer.cylinder.slots"
              :key="index"
              :class="{ loaded }"
              :title="`Slot ${index + 1}`"
            >{{ index + 1 }}</span>
          </div>
        </div>
      </aside>

      <section class="actions-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Available now</p>
            <h2>Actions</h2>
          </div>
          <span>{{ availableActions.length }}</span>
        </div>

        <div v-if="!selectedPlayer" class="empty-state">Waiting for Defold status.</div>
        <div v-else-if="availableActions.length === 0" class="empty-state">
          이 유저가 지금 선택할 수 있는 행동 없음.
        </div>

        <article
          v-for="action in availableActions"
          :key="action.type"
          class="action-card"
        >
          <template v-if="action.type === 'load'">
            <div>
              <h3>Load one bullet</h3>
              <p>Remaining {{ action.remaining }}</p>
            </div>
            <div class="slot-actions">
              <button
                v-for="slot in action.slots"
                :key="slot"
                :disabled="sending"
                @click="sendCommand('load', { slot_index: slot })"
              >Slot {{ slot }}</button>
            </div>
          </template>

          <template v-else-if="action.type === 'load_all'">
            <div>
              <h3>Auto load</h3>
              <p>빈 슬롯부터 {{ action.remaining }}발 장전</p>
            </div>
            <button class="primary" :disabled="sending" @click="sendCommand('load_all')">
              Load all
            </button>
          </template>

          <template v-else-if="action.type === 'bid'">
            <div>
              <h3>Raise bid</h3>
              <p v-if="status?.bidding.current_bid">
                Current {{ status.bidding.current_bid.count }} × {{ status.bidding.current_bid.face }}
              </p>
              <p v-else>Opening bid</p>
            </div>
            <div class="bid-form">
              <label>Count <input v-model.number="bidCount" type="number" min="1" max="36" /></label>
              <label>Face <input v-model.number="bidFace" type="number" min="1" max="6" /></label>
              <button class="primary" :disabled="sending" @click="submitBid">Submit bid</button>
            </div>
          </template>

          <template v-else>
            <div>
              <h3>{{ action.type.replace('_', ' ') }}</h3>
              <p v-if="action.remaining">Remaining {{ action.remaining }}</p>
              <p v-else>Dispatch as {{ selectedPlayer?.name }}</p>
            </div>
            <button
              :class="{ danger: action.type === 'challenge' }"
              :disabled="sending"
              @click="sendCommand(action.type)"
            >Execute</button>
          </template>
        </article>

        <p v-if="commandError" class="message error">{{ commandError }}</p>
        <p
          v-else-if="status?.last_command"
          class="message"
          :class="{ error: !status.last_command.ok }"
        >
          {{ status.last_command.action }}:
          {{ status.last_command.ok ? 'accepted' : status.last_command.error }}
        </p>
      </section>
    </section>
  </main>
</template>
