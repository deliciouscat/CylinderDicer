<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../i18n'
import ChipStack from './components/ChipStack.vue'
import DiceFidget from './components/DiceFidget.vue'
import LadderSelfStats from './components/LadderSelfStats.vue'
import { applyFidgetOutcome } from './ladder.logic'
import type { LadderStats } from './ladder.types'

defineProps<{
  selfStats: LadderStats
  cancelPending: boolean
  authPending: boolean
  errorMessage?: string
  debugFaces?: number[]
}>()

const emit = defineEmits<{ cancel: []; retry: [] }>()
const chips = ref(0)
const outcome = ref<'idle' | 'gain' | 'skull'>('idle')
const animationKey = ref(0)

function applyOutcome(face: number) {
  chips.value = applyFidgetOutcome(chips.value, face)
  outcome.value = face === 1 ? 'skull' : 'gain'
  animationKey.value += 1
}
</script>

<template>
  <section class="ladder-loading" aria-labelledby="ladder-searching-title" data-testid="ladder-searching">
    <h1 id="ladder-searching-title" class="ladder-visually-hidden">{{ t('ladder.searching') }}</h1>
    <LadderSelfStats :stats="selfStats" />

    <div class="ladder-fidget-stage">
      <ChipStack :chips="chips" :outcome="outcome" :animation-key="animationKey" />
      <DiceFidget :debug-faces="debugFaces" @outcome="applyOutcome" />
    </div>

    <div class="ladder-loading__footer">
      <div v-if="!errorMessage" class="ladder-matching-status" role="status">
        <span class="ladder-matching-status__pulse" aria-hidden="true" />
        <span>{{ authPending ? t('ladder.authNotReady') : t('ladder.searching') }}</span>
      </div>
      <p v-if="errorMessage" class="ladder-inline-error" role="alert">{{ errorMessage }}</p>
      <button v-if="errorMessage" class="ladder-text-button" type="button" @click="emit('retry')">
        {{ t('ladder.retry') }}
      </button>
      <button
        class="ladder-text-button ladder-text-button--cancel"
        type="button"
        :disabled="cancelPending"
        data-testid="ladder-cancel"
        @click="emit('cancel')"
      >
        {{ cancelPending ? t('ladder.cancelling') : t('ladder.cancel') }}
      </button>
    </div>
  </section>
</template>
