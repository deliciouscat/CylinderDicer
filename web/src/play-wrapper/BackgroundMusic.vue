<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import musicIconUrl from '../assets/icons/music.svg'
import battle1Url from '../assets/sounds/battle_1.mp3'
import battle2Url from '../assets/sounds/battle_2.mp3'
import lobby1Url from '../assets/sounds/lobby_1.mp3'
import lobby2Url from '../assets/sounds/lobby_2.mp3'
import { t } from '../i18n'

export type BackgroundMusicMode = 'battle' | 'lobby'

const props = defineProps<{
  mode: BackgroundMusicMode
}>()

const MUSIC_ENABLED_KEY = 'cylinderdicer.music.enabled'
const FADE_DURATION_MS = 650
const playlists: Record<BackgroundMusicMode, readonly [string, string]> = {
  battle: [battle1Url, battle2Url],
  lobby: [lobby1Url, lobby2Url],
}

const enabled = ref(window.localStorage.getItem(MUSIC_ENABLED_KEY) !== 'false')
const playbackBlocked = ref(false)
const currentTrack = ref<string | null>(null)
const playlistCursor: Record<BackgroundMusicMode, number> = {
  battle: -1,
  lobby: -1,
}

let activeAudio: HTMLAudioElement | null = null
let generation = 0
let disposed = false

const isMusicPlaying = computed(() => enabled.value && !playbackBlocked.value)
const toggleLabel = computed(() => t(isMusicPlaying.value ? 'music.turnOff' : 'music.turnOn'))
const musicIconStyle = {
  '--music-icon-url': `url("${musicIconUrl}")`,
}

function isCurrent(audio: HTMLAudioElement, intendedGeneration: number) {
  return !disposed && generation === intendedGeneration && activeAudio === audio
}

function fade(
  audio: HTMLAudioElement,
  targetVolume: number,
  intendedGeneration: number,
  pauseWhenDone = false,
) {
  const startVolume = audio.volume
  const startedAt = performance.now()

  return new Promise<boolean>((resolve) => {
    function step(now: number) {
      if (disposed || generation !== intendedGeneration) {
        audio.pause()
        resolve(false)
        return
      }

      const progress = Math.min(1, (now - startedAt) / FADE_DURATION_MS)
      const eased = progress * progress * (3 - 2 * progress)
      audio.volume = startVolume + (targetVolume - startVolume) * eased

      if (progress < 1) {
        window.requestAnimationFrame(step)
        return
      }

      if (pauseWhenDone) audio.pause()
      resolve(true)
    }

    window.requestAnimationFrame(step)
  })
}

async function playWithFade(audio: HTMLAudioElement, intendedGeneration: number) {
  try {
    await audio.play()
  } catch {
    if (isCurrent(audio, intendedGeneration)) playbackBlocked.value = true
    return
  }

  if (!isCurrent(audio, intendedGeneration)) {
    audio.pause()
    return
  }

  playbackBlocked.value = false
  void fade(audio, 1, intendedGeneration)
}

function startNextTrack(mode: BackgroundMusicMode, intendedGeneration: number) {
  if (disposed || generation !== intendedGeneration || !enabled.value) return

  playlistCursor[mode] = (playlistCursor[mode] + 1) % playlists[mode].length
  currentTrack.value = `${mode}_${playlistCursor[mode] + 1}`
  const audio = activeAudio ?? new Audio()
  activeAudio = audio
  audio.pause()
  audio.src = playlists[mode][playlistCursor[mode]]
  audio.volume = 0
  audio.load()

  audio.onended = () => {
    if (!isCurrent(audio, intendedGeneration)) return
    startNextTrack(mode, intendedGeneration)
  }

  void playWithFade(audio, intendedGeneration)
}

function transitionTo(mode: BackgroundMusicMode, startImmediately = false) {
  const intendedGeneration = ++generation
  const audio = activeAudio ?? new Audio()
  audio.preload = 'auto'
  activeAudio = audio
  currentTrack.value = null
  playbackBlocked.value = false

  if (!enabled.value) {
    if (!audio.paused) void fade(audio, 0, intendedGeneration, true)
    return
  }

  if (startImmediately || audio.paused || !audio.currentSrc) {
    startNextTrack(mode, intendedGeneration)
    return
  }

  void fade(audio, 0, intendedGeneration, true).then((completed) => {
    if (completed) startNextTrack(mode, intendedGeneration)
  })
}

function retryBlockedPlayback() {
  if (!enabled.value || !playbackBlocked.value || !activeAudio) return
  void playWithFade(activeAudio, generation)
}

function toggleMusic() {
  if (enabled.value && playbackBlocked.value) {
    retryBlockedPlayback()
    return
  }

  enabled.value = !enabled.value
  window.localStorage.setItem(MUSIC_ENABLED_KEY, String(enabled.value))
  transitionTo(props.mode, enabled.value)
}

watch(
  () => props.mode,
  (mode) => transitionTo(mode),
)

onMounted(() => {
  window.addEventListener('pointerdown', retryBlockedPlayback, { capture: true })
  window.addEventListener('keydown', retryBlockedPlayback, { capture: true })
  transitionTo(props.mode)
})

onBeforeUnmount(() => {
  disposed = true
  generation += 1
  window.removeEventListener('pointerdown', retryBlockedPlayback, { capture: true })
  window.removeEventListener('keydown', retryBlockedPlayback, { capture: true })
  activeAudio?.pause()
  activeAudio = null
})
</script>

<template>
  <button
    class="background-music-toggle"
    type="button"
    :aria-label="toggleLabel"
    :aria-pressed="isMusicPlaying"
    :data-music-mode="mode"
    :data-music-track="currentTrack"
    :data-playback-blocked="playbackBlocked"
    :title="toggleLabel"
    @click="toggleMusic"
  >
    <span class="background-music-toggle__icon" :style="musicIconStyle" aria-hidden="true" />
  </button>
</template>
