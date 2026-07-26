/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import musicIconUrl from '../assets/icons/music.svg';
import battle1Url from '../assets/sounds/battle_1.mp3';
import battle2Url from '../assets/sounds/battle_2.mp3';
import lobby1Url from '../assets/sounds/lobby_1.mp3';
import lobby2Url from '../assets/sounds/lobby_2.mp3';
import { t } from '../i18n';
const props = defineProps();
const MUSIC_ENABLED_KEY = 'cylinderdicer.music.enabled';
const FADE_DURATION_MS = 650;
const playlists = {
    battle: [battle1Url, battle2Url],
    lobby: [lobby1Url, lobby2Url],
};
const enabled = ref(window.localStorage.getItem(MUSIC_ENABLED_KEY) !== 'false');
const playbackBlocked = ref(false);
const currentTrack = ref(null);
const playlistCursor = {
    battle: -1,
    lobby: -1,
};
let activeAudio = null;
let generation = 0;
let disposed = false;
const isMusicPlaying = computed(() => enabled.value && !playbackBlocked.value);
const toggleLabel = computed(() => t(isMusicPlaying.value ? 'music.turnOff' : 'music.turnOn'));
const musicIconStyle = {
    '--music-icon-url': `url("${musicIconUrl}")`,
};
function isCurrent(audio, intendedGeneration) {
    return !disposed && generation === intendedGeneration && activeAudio === audio;
}
function fade(audio, targetVolume, intendedGeneration, pauseWhenDone = false) {
    const startVolume = audio.volume;
    const startedAt = performance.now();
    return new Promise((resolve) => {
        function step(now) {
            if (disposed || generation !== intendedGeneration) {
                audio.pause();
                resolve(false);
                return;
            }
            const progress = Math.min(1, (now - startedAt) / FADE_DURATION_MS);
            const eased = progress * progress * (3 - 2 * progress);
            audio.volume = startVolume + (targetVolume - startVolume) * eased;
            if (progress < 1) {
                window.requestAnimationFrame(step);
                return;
            }
            if (pauseWhenDone)
                audio.pause();
            resolve(true);
        }
        window.requestAnimationFrame(step);
    });
}
async function playWithFade(audio, intendedGeneration) {
    try {
        await audio.play();
    }
    catch {
        if (isCurrent(audio, intendedGeneration))
            playbackBlocked.value = true;
        return;
    }
    if (!isCurrent(audio, intendedGeneration)) {
        audio.pause();
        return;
    }
    playbackBlocked.value = false;
    void fade(audio, 1, intendedGeneration);
}
function startNextTrack(mode, intendedGeneration) {
    if (disposed || generation !== intendedGeneration || !enabled.value)
        return;
    playlistCursor[mode] = (playlistCursor[mode] + 1) % playlists[mode].length;
    currentTrack.value = `${mode}_${playlistCursor[mode] + 1}`;
    const audio = activeAudio ?? new Audio();
    activeAudio = audio;
    audio.pause();
    audio.src = playlists[mode][playlistCursor[mode]];
    audio.volume = 0;
    audio.load();
    audio.onended = () => {
        if (!isCurrent(audio, intendedGeneration))
            return;
        startNextTrack(mode, intendedGeneration);
    };
    void playWithFade(audio, intendedGeneration);
}
function transitionTo(mode, startImmediately = false) {
    const intendedGeneration = ++generation;
    const audio = activeAudio ?? new Audio();
    audio.preload = 'auto';
    activeAudio = audio;
    currentTrack.value = null;
    playbackBlocked.value = false;
    if (!enabled.value) {
        if (!audio.paused)
            void fade(audio, 0, intendedGeneration, true);
        return;
    }
    if (startImmediately || audio.paused || !audio.currentSrc) {
        startNextTrack(mode, intendedGeneration);
        return;
    }
    void fade(audio, 0, intendedGeneration, true).then((completed) => {
        if (completed)
            startNextTrack(mode, intendedGeneration);
    });
}
function retryBlockedPlayback() {
    if (!enabled.value || !playbackBlocked.value || !activeAudio)
        return;
    void playWithFade(activeAudio, generation);
}
function toggleMusic() {
    if (enabled.value && playbackBlocked.value) {
        retryBlockedPlayback();
        return;
    }
    enabled.value = !enabled.value;
    window.localStorage.setItem(MUSIC_ENABLED_KEY, String(enabled.value));
    transitionTo(props.mode, enabled.value);
}
watch(() => props.mode, (mode) => transitionTo(mode));
onMounted(() => {
    window.addEventListener('pointerdown', retryBlockedPlayback, { capture: true });
    window.addEventListener('keydown', retryBlockedPlayback, { capture: true });
    transitionTo(props.mode);
});
onBeforeUnmount(() => {
    disposed = true;
    generation += 1;
    window.removeEventListener('pointerdown', retryBlockedPlayback, { capture: true });
    window.removeEventListener('keydown', retryBlockedPlayback, { capture: true });
    activeAudio?.pause();
    activeAudio = null;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggleMusic) },
    ...{ class: "background-music-toggle" },
    type: "button",
    'aria-label': (__VLS_ctx.toggleLabel),
    'aria-pressed': (__VLS_ctx.isMusicPlaying),
    'data-music-mode': (__VLS_ctx.mode),
    'data-music-track': (__VLS_ctx.currentTrack),
    'data-playback-blocked': (__VLS_ctx.playbackBlocked),
    title: (__VLS_ctx.toggleLabel),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "background-music-toggle__icon" },
    ...{ style: (__VLS_ctx.musicIconStyle) },
    'aria-hidden': "true",
});
/** @type {__VLS_StyleScopedClasses['background-music-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['background-music-toggle__icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            playbackBlocked: playbackBlocked,
            currentTrack: currentTrack,
            isMusicPlaying: isMusicPlaying,
            toggleLabel: toggleLabel,
            musicIconStyle: musicIconStyle,
            toggleMusic: toggleMusic,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
