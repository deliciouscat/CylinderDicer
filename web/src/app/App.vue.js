/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import OpponentControllerScreen from '../admin/OpponentControllerScreen.vue';
import CustomGameScreen from '../custom-game/CustomGameScreen.vue';
import LadderShell from '../ladder/LadderShell.vue';
import LobbyScreen from '../lobby/LobbyScreen.vue';
import ConvexPlayScreen from '../play-wrapper/ConvexPlayScreen.vue';
import BackgroundMusic from '../play-wrapper/BackgroundMusic.vue';
import LocalPlayScreen from '../play-wrapper/LocalPlayScreen.vue';
import { installButtonClickSound } from '../services/audio/buttonClickSound';
import SignInView from '../views/sign-in.vue';
import SignUpView from '../views/sign-up.vue';
function ladderMatchIdFromUrl(pathname, search) {
    if (pathname !== '/play/ladder')
        return null;
    return new URLSearchParams(search).get('matchId');
}
const currentPath = ref(window.location.pathname);
const ladderHandoffMatchId = ref(ladderMatchIdFromUrl(window.location.pathname, window.location.search));
const useLocalDefoldSimulator = import.meta.env.VITE_USE_LOCAL_DEFOLD_SIMULATOR === 'true';
const exposeQaTools = import.meta.env.DEV || import.meta.env.VITE_ENABLE_QA_TOOLS === 'true';
let removeButtonClickSound = null;
const activeScreen = computed(() => {
    if (currentPath.value === '/play/custom-game') {
        return 'custom-game';
    }
    if (currentPath.value === '/play/ladder') {
        return ladderHandoffMatchId.value ? 'ladder-play' : 'ladder';
    }
    if (currentPath.value === '/admin/opponents' && exposeQaTools) {
        return 'admin-opponents';
    }
    if (currentPath.value === '/play/dev' && useLocalDefoldSimulator) {
        return 'local-play';
    }
    if (currentPath.value === '/play/dev') {
        return 'convex-play';
    }
    if (currentPath.value === '/sign-in') {
        return 'sign-in';
    }
    if (currentPath.value === '/sign-up') {
        return 'sign-up';
    }
    return 'lobby';
});
const backgroundMusicMode = computed(() => activeScreen.value === 'ladder-play' ||
    activeScreen.value === 'convex-play' ||
    activeScreen.value === 'local-play'
    ? 'battle'
    : 'lobby');
function navigate(path) {
    const target = new URL(path, window.location.origin);
    ladderHandoffMatchId.value = ladderMatchIdFromUrl(target.pathname, target.search);
    window.history.pushState({}, '', `${target.pathname}${target.search}`);
    currentPath.value = target.pathname;
}
function handoffLadderMatch(matchId) {
    if (!matchId)
        return;
    window.history.replaceState({}, '', `/play/ladder?matchId=${encodeURIComponent(matchId)}`);
    ladderHandoffMatchId.value = matchId;
}
window.addEventListener('popstate', () => {
    ladderHandoffMatchId.value = ladderMatchIdFromUrl(window.location.pathname, window.location.search);
    currentPath.value = window.location.pathname;
});
onMounted(() => {
    removeButtonClickSound = installButtonClickSound();
});
onBeforeUnmount(() => {
    removeButtonClickSound?.();
    removeButtonClickSound = null;
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof BackgroundMusic, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(BackgroundMusic, new BackgroundMusic({
    mode: (__VLS_ctx.backgroundMusicMode),
}));
const __VLS_1 = __VLS_0({
    mode: (__VLS_ctx.backgroundMusicMode),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
if (__VLS_ctx.activeScreen === 'admin-opponents') {
    /** @type {[typeof OpponentControllerScreen, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(OpponentControllerScreen, new OpponentControllerScreen({
        ...{ 'onBack': {} },
    }));
    const __VLS_4 = __VLS_3({
        ...{ 'onBack': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        onBack: (...[$event]) => {
            if (!(__VLS_ctx.activeScreen === 'admin-opponents'))
                return;
            __VLS_ctx.navigate('/');
        }
    };
    var __VLS_5;
}
else if (__VLS_ctx.activeScreen === 'custom-game') {
    /** @type {[typeof CustomGameScreen, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(CustomGameScreen, new CustomGameScreen({
        ...{ 'onBack': {} },
    }));
    const __VLS_11 = __VLS_10({
        ...{ 'onBack': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    let __VLS_13;
    let __VLS_14;
    let __VLS_15;
    const __VLS_16 = {
        onBack: (...[$event]) => {
            if (!!(__VLS_ctx.activeScreen === 'admin-opponents'))
                return;
            if (!(__VLS_ctx.activeScreen === 'custom-game'))
                return;
            __VLS_ctx.navigate('/');
        }
    };
    var __VLS_12;
}
else if (__VLS_ctx.activeScreen === 'ladder') {
    /** @type {[typeof LadderShell, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(LadderShell, new LadderShell({
        ...{ 'onBack': {} },
        ...{ 'onHandoff': {} },
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onBack': {} },
        ...{ 'onHandoff': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onBack: (...[$event]) => {
            if (!!(__VLS_ctx.activeScreen === 'admin-opponents'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'custom-game'))
                return;
            if (!(__VLS_ctx.activeScreen === 'ladder'))
                return;
            __VLS_ctx.navigate('/');
        }
    };
    const __VLS_24 = {
        onHandoff: (__VLS_ctx.handoffLadderMatch)
    };
    var __VLS_19;
}
else if (__VLS_ctx.activeScreen === 'ladder-play') {
    /** @type {[typeof ConvexPlayScreen, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(ConvexPlayScreen, new ConvexPlayScreen({
        ...{ 'onBack': {} },
        matchId: (__VLS_ctx.ladderHandoffMatchId ?? undefined),
        source: "ladder",
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onBack': {} },
        matchId: (__VLS_ctx.ladderHandoffMatchId ?? undefined),
        source: "ladder",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onBack: (...[$event]) => {
            if (!!(__VLS_ctx.activeScreen === 'admin-opponents'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'custom-game'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'ladder'))
                return;
            if (!(__VLS_ctx.activeScreen === 'ladder-play'))
                return;
            __VLS_ctx.navigate('/');
        }
    };
    var __VLS_27;
}
else if (__VLS_ctx.activeScreen === 'convex-play') {
    /** @type {[typeof ConvexPlayScreen, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(ConvexPlayScreen, new ConvexPlayScreen({
        ...{ 'onBack': {} },
    }));
    const __VLS_33 = __VLS_32({
        ...{ 'onBack': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    let __VLS_35;
    let __VLS_36;
    let __VLS_37;
    const __VLS_38 = {
        onBack: (...[$event]) => {
            if (!!(__VLS_ctx.activeScreen === 'admin-opponents'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'custom-game'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'ladder'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'ladder-play'))
                return;
            if (!(__VLS_ctx.activeScreen === 'convex-play'))
                return;
            __VLS_ctx.navigate('/');
        }
    };
    var __VLS_34;
}
else if (__VLS_ctx.activeScreen === 'local-play') {
    /** @type {[typeof LocalPlayScreen, ]} */ ;
    // @ts-ignore
    const __VLS_39 = __VLS_asFunctionalComponent(LocalPlayScreen, new LocalPlayScreen({
        ...{ 'onBack': {} },
    }));
    const __VLS_40 = __VLS_39({
        ...{ 'onBack': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_39));
    let __VLS_42;
    let __VLS_43;
    let __VLS_44;
    const __VLS_45 = {
        onBack: (...[$event]) => {
            if (!!(__VLS_ctx.activeScreen === 'admin-opponents'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'custom-game'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'ladder'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'ladder-play'))
                return;
            if (!!(__VLS_ctx.activeScreen === 'convex-play'))
                return;
            if (!(__VLS_ctx.activeScreen === 'local-play'))
                return;
            __VLS_ctx.navigate('/');
        }
    };
    var __VLS_41;
}
else if (__VLS_ctx.activeScreen === 'sign-in') {
    /** @type {[typeof SignInView, ]} */ ;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent(SignInView, new SignInView({}));
    const __VLS_47 = __VLS_46({}, ...__VLS_functionalComponentArgsRest(__VLS_46));
}
else if (__VLS_ctx.activeScreen === 'sign-up') {
    /** @type {[typeof SignUpView, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(SignUpView, new SignUpView({}));
    const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
}
else {
    /** @type {[typeof LobbyScreen, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(LobbyScreen, new LobbyScreen({
        ...{ 'onNavigate': {} },
    }));
    const __VLS_53 = __VLS_52({
        ...{ 'onNavigate': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    let __VLS_55;
    let __VLS_56;
    let __VLS_57;
    const __VLS_58 = {
        onNavigate: (__VLS_ctx.navigate)
    };
    var __VLS_54;
}
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            OpponentControllerScreen: OpponentControllerScreen,
            CustomGameScreen: CustomGameScreen,
            LadderShell: LadderShell,
            LobbyScreen: LobbyScreen,
            ConvexPlayScreen: ConvexPlayScreen,
            BackgroundMusic: BackgroundMusic,
            LocalPlayScreen: LocalPlayScreen,
            SignInView: SignInView,
            SignUpView: SignUpView,
            ladderHandoffMatchId: ladderHandoffMatchId,
            activeScreen: activeScreen,
            backgroundMusicMode: backgroundMusicMode,
            navigate: navigate,
            handoffLadderMatch: handoffLadderMatch,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
