<script setup lang="ts">
import { useAuth } from '@clerk/vue'
import { useConvexClient } from 'convex-vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import {
  CHARACTER_KEYS,
  type CharacterKey,
} from '@shared/game/characters'
import { assetLoader } from '../assets/assetLoader'
import { t } from '../i18n'
import { createCharacterProfileService } from '../services/convex/characterProfileService'
import {
  characterDirectionFromWheel,
  moveCharacterSelection,
  normalizeCharacterSelection,
} from './settings.logic'

const emit = defineEmits<{
  back: []
}>()

const convex = useConvexClient()
const auth = useAuth()
const profileService = createCharacterProfileService(convex)

const backgroundAsset = assetLoader('background-lobby')
const boardAsset = assetLoader('board')
const buttonAsset = assetLoader('button')
const titleAsset = assetLoader('title')

const characterOptions = CHARACTER_KEYS.map((key) => ({
  key,
  imageUrl: assetLoader(`ladder-character-${key}`).url,
}))

const selectedCharacter = ref<CharacterKey>('rosemund')
const profileLoading = ref(true)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const loadError = ref('')
const trackElement = ref<HTMLElement | null>(null)
const itemElements = new Map<CharacterKey, HTMLElement>()

let disposed = false
let authGeneration = 0
let saveIntentGeneration = 0
let pendingCharacter: CharacterKey | null = null
let persistenceRunning = false
let wheelLockedUntil = 0
let scrollTimer = 0

const signedIn = computed(() => auth.isSignedIn.value === true)
const statusText = computed(() => {
  if (!auth.isLoaded.value || profileLoading.value) return t('settings.loading')
  if (!signedIn.value) return t('settings.signInRequired')
  if (loadError.value) return t('settings.loadError')
  if (saveState.value === 'saving') return t('settings.saving')
  if (saveState.value === 'saved') return t('settings.saved')
  if (saveState.value === 'error') return t('settings.saveError')
  return t('settings.ready')
})

const settingsStyles = {
  '--settings-bg': `url(${backgroundAsset.url})`,
  '--settings-board': `url(${boardAsset.url})`,
  '--settings-button': `url(${buttonAsset.url})`,
  '--settings-button-ratio': `${buttonAsset.manifest.width} / ${buttonAsset.manifest.height}`,
  '--settings-title-shadow': titleAsset.manifest.dropShadow,
}

function setItemElement(key: CharacterKey, element: Element | null) {
  if (element instanceof HTMLElement) {
    itemElements.set(key, element)
  } else {
    itemElements.delete(key)
  }
}

async function centerSelected(behavior: ScrollBehavior = 'smooth') {
  await nextTick()
  itemElements.get(selectedCharacter.value)?.scrollIntoView({
    behavior,
    block: 'nearest',
    inline: 'center',
  })
}

function queueCharacterSave(characterKey: CharacterKey) {
  pendingCharacter = characterKey
  saveIntentGeneration += 1
  saveState.value = 'saving'
  void flushCharacterSave()
}

async function flushCharacterSave() {
  if (persistenceRunning) return
  persistenceRunning = true
  while (pendingCharacter) {
    const characterKey = pendingCharacter
    const intentGeneration = saveIntentGeneration
    pendingCharacter = null
    try {
      await profileService.setCharacter(characterKey)
      if (
        !disposed
        && intentGeneration === saveIntentGeneration
        && selectedCharacter.value === characterKey
        && pendingCharacter === null
      ) {
        saveState.value = 'saved'
      }
    } catch {
      if (!disposed && intentGeneration === saveIntentGeneration && pendingCharacter === null) {
        saveState.value = 'error'
      }
    }
  }
  persistenceRunning = false
  if (pendingCharacter) {
    void flushCharacterSave()
  }
}

function selectCharacter(
  characterKey: CharacterKey,
  options: { persist?: boolean; behavior?: ScrollBehavior } = {},
) {
  selectedCharacter.value = characterKey
  void centerSelected(options.behavior)
  if (options.persist !== false && signedIn.value && !profileLoading.value && !loadError.value) {
    queueCharacterSave(characterKey)
  }
}

function moveSelection(offset: number) {
  selectCharacter(moveCharacterSelection(selectedCharacter.value, offset))
}

function handleWheel(event: WheelEvent) {
  const direction = characterDirectionFromWheel(event.deltaX, event.deltaY)
  if (direction === 0) return
  const now = performance.now()
  if (now < wheelLockedUntil) return
  wheelLockedUntil = now + 180
  moveSelection(direction)
}

function handleScreenKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveSelection(-1)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveSelection(1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    selectCharacter(CHARACTER_KEYS[0])
  } else if (event.key === 'End') {
    event.preventDefault()
    selectCharacter(CHARACTER_KEYS[CHARACTER_KEYS.length - 1])
  }
}

function selectNearestToTrackCenter() {
  const track = trackElement.value
  if (!track) return
  const trackCenter = track.getBoundingClientRect().left + track.clientWidth / 2
  let nearestKey = selectedCharacter.value
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const [key, element] of itemElements) {
    const bounds = element.getBoundingClientRect()
    const distance = Math.abs(bounds.left + bounds.width / 2 - trackCenter)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestKey = key
    }
  }
  if (nearestKey !== selectedCharacter.value) {
    selectCharacter(nearestKey, { behavior: 'smooth' })
  }
}

function handleTrackScroll() {
  window.clearTimeout(scrollTimer)
  scrollTimer = window.setTimeout(selectNearestToTrackCenter, 150)
}

function retrySave() {
  queueCharacterSave(selectedCharacter.value)
}

async function loadProfile(generation: number) {
  profileLoading.value = true
  loadError.value = ''
  saveState.value = 'idle'
  try {
    const profile = await profileService.ensureCurrentUser()
    if (disposed || generation !== authGeneration) return
    selectedCharacter.value = normalizeCharacterSelection(profile.characterKey)
    profileLoading.value = false
    await centerSelected('auto')
  } catch (error) {
    if (disposed || generation !== authGeneration) return
    loadError.value = error instanceof Error ? error.message : String(error)
    profileLoading.value = false
  }
}

watchEffect(() => {
  const loaded = auth.isLoaded.value
  const isSignedIn = auth.isSignedIn.value === true
  const generation = ++authGeneration

  if (!loaded) {
    profileLoading.value = true
    return
  }
  if (!isSignedIn) {
    convex.setAuth(async () => null)
    selectedCharacter.value = 'rosemund'
    profileLoading.value = false
    loadError.value = ''
    saveState.value = 'idle'
    void centerSelected('auto')
    return
  }

  convex.setAuth(async ({ forceRefreshToken }) => await auth.getToken.value({
    template: 'convex',
    skipCache: forceRefreshToken,
  }))
  void loadProfile(generation)
})

onBeforeUnmount(() => {
  disposed = true
  authGeneration += 1
  saveIntentGeneration += 1
  window.clearTimeout(scrollTimer)
  window.removeEventListener('keydown', handleScreenKeydown)
})

onMounted(() => {
  window.addEventListener('keydown', handleScreenKeydown)
})
</script>

<template>
  <main class="settings-screen" :style="settingsStyles" :aria-label="t('settings.screenLabel')">
    <div class="settings-screen__background" aria-hidden="true" />
    <header class="settings-header">
      <img class="settings-logo" :src="titleAsset.url" :alt="t('lobby.titleAlt')" />
    </header>

    <div class="settings-shell">
      <div class="settings-toolbar">
        <button class="settings-wood-button settings-back" type="button" @click="emit('back')">
          <span>{{ t('settings.back') }}</span>
        </button>
      </div>

      <section class="settings-board">
        <div class="settings-copy">
          <h1>{{ t('settings.title') }}</h1>
        </div>

        <div class="character-carousel">
          <button
            class="character-carousel__arrow character-carousel__arrow--previous"
            type="button"
            :aria-label="t('settings.previous')"
            @click="moveSelection(-1)"
          >
            ‹
          </button>
          <div
            ref="trackElement"
            class="character-carousel__track"
            role="radiogroup"
            :aria-label="t('settings.title')"
            tabindex="0"
            @wheel.prevent="handleWheel"
            @scroll.passive="handleTrackScroll"
          >
            <button
              v-for="character in characterOptions"
              :key="character.key"
              :ref="(element) => setItemElement(character.key, element as Element | null)"
              class="character-carousel__item"
              :class="{ 'is-selected': selectedCharacter === character.key }"
              type="button"
              role="radio"
              :aria-checked="selectedCharacter === character.key"
              :aria-label="t(`settings.characters.${character.key}`)"
              :disabled="profileLoading"
              @click="selectCharacter(character.key)"
            >
              <span class="character-carousel__portrait">
                <img
                  :src="character.imageUrl"
                  :alt="t('settings.characterAlt', { name: t(`settings.characters.${character.key}`) })"
                  draggable="false"
                />
              </span>
              <span class="character-carousel__name">
                {{ t(`settings.characters.${character.key}`) }}
              </span>
            </button>
          </div>
          <button
            class="character-carousel__arrow character-carousel__arrow--next"
            type="button"
            :aria-label="t('settings.next')"
            @click="moveSelection(1)"
          >
            ›
          </button>
        </div>

        <div class="settings-status" role="status" aria-live="polite">
          <span>{{ statusText }}</span>
          <button
            v-if="saveState === 'error' && signedIn"
            class="settings-retry"
            type="button"
            @click="retrySave"
          >
            {{ t('settings.retry') }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
