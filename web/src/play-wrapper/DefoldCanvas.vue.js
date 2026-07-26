/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { activeLocale, t } from '../i18n';
import { listenFromDefold, listenFromDefoldFrame, sendToDefold } from './gameBridge';
const props = defineProps();
const emit = defineEmits();
const frame = ref(null);
const isDefoldReady = ref(false);
let stopListening;
let stopFrameListening;
let readyRetryTimer;
let readyRetryCount = 0;
const READY_RETRY_LIMIT = 40;
const READY_RETRY_INTERVAL_MS = 250;
function send(message) {
    if (!frame.value) {
        return;
    }
    sendToDefold(frame.value, message);
}
function sendStartMatch(force = false) {
    if ((!force && !isDefoldReady.value) || !props.match) {
        return;
    }
    send({
        type: 'START_MATCH',
        payload: props.match,
    });
}
function sendLocale(locale = activeLocale.value, force = false) {
    if (!force && !isDefoldReady.value) {
        return;
    }
    send({
        type: 'SET_LOCALE',
        payload: { locale },
    });
}
function sendServerSnapshot(snapshot, force = false) {
    if ((!force && !isDefoldReady.value) || !snapshot) {
        return;
    }
    send({
        type: 'SERVER_SNAPSHOT',
        payload: snapshot,
    });
}
function sendCommandRejected(rejected, force = false) {
    if ((!force && !isDefoldReady.value) || !rejected) {
        return;
    }
    send({
        type: 'COMMAND_REJECTED',
        payload: rejected,
    });
}
function sendInitialState(force = false) {
    sendLocale(activeLocale.value, force);
    sendStartMatch(force);
    sendServerSnapshot(props.serverSnapshot, force);
    sendCommandRejected(props.commandRejected, force);
}
function stopReadyRetry() {
    if (readyRetryTimer !== undefined) {
        window.clearInterval(readyRetryTimer);
        readyRetryTimer = undefined;
    }
}
function markDefoldReady(message) {
    if (!isDefoldReady.value) {
        isDefoldReady.value = true;
        emit('ready', message);
        stopReadyRetry();
    }
}
function installFrameListener() {
    const target = frame.value?.contentWindow;
    if (!target) {
        return;
    }
    stopFrameListening?.();
    stopFrameListening = listenFromDefoldFrame(target, handleMessage);
}
function startReadyRetry() {
    stopReadyRetry();
    readyRetryCount = 0;
    readyRetryTimer = window.setInterval(() => {
        if (isDefoldReady.value) {
            stopReadyRetry();
            return;
        }
        readyRetryCount += 1;
        installFrameListener();
        sendInitialState(true);
        if (readyRetryCount >= READY_RETRY_LIMIT) {
            stopReadyRetry();
        }
    }, READY_RETRY_INTERVAL_MS);
}
function handleFrameLoad() {
    isDefoldReady.value = false;
    installFrameListener();
    startReadyRetry();
}
function handleMessage(message) {
    emit('message', message);
    if (message.type === 'DEFOLD_READY') {
        markDefoldReady(message);
        sendInitialState();
    }
    else if (message.type === 'MATCH_READY' ||
        message.type === 'LOCALE_APPLIED' ||
        message.type === 'SERVER_SNAPSHOT_RECEIVED' ||
        message.type === 'PLAYER_COMMAND') {
        markDefoldReady(message);
    }
}
onMounted(() => {
    stopListening = listenFromDefold(handleMessage);
    installFrameListener();
    startReadyRetry();
});
onUnmounted(() => {
    stopListening?.();
    stopFrameListening?.();
    stopReadyRetry();
});
watch(() => activeLocale.value, (locale) => sendLocale(locale));
watch(() => props.match, () => sendStartMatch());
watch(() => props.serverSnapshot, (snapshot) => sendServerSnapshot(snapshot));
watch(() => props.commandRejected, (rejected) => sendCommandRejected(rejected));
const __VLS_exposed = {
    send,
};
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.iframe)({
    ...{ onLoad: (__VLS_ctx.handleFrameLoad) },
    ref: "frame",
    ...{ class: "defold-canvas" },
    src: (__VLS_ctx.buildUrl ?? '/play/index.html'),
    title: (__VLS_ctx.t('playWrapper.canvasTitle')),
    allow: "fullscreen; gamepad",
});
/** @type {typeof __VLS_ctx.frame} */ ;
/** @type {__VLS_StyleScopedClasses['defold-canvas']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            frame: frame,
            handleFrameLoad: handleFrameLoad,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
