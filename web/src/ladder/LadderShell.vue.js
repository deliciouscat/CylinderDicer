/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useAuth } from '@clerk/vue';
import { useConvexClient } from 'convex-vue';
import { computed, nextTick, onUnmounted, ref, watchEffect } from 'vue';
import { LADDER_QUEUE_HEARTBEAT_MS } from '@shared/ladder/matchmaking';
import { assetLoader } from '../assets/assetLoader';
import { t } from '../i18n';
import { createLadderService } from '../services/convex/ladderService';
import LadderLoading from './LadderLoading.vue';
import LadderRoster from './LadderRoster.vue';
import { initialLadderRuntimeState, reduceLadderRuntime, safeStats, } from './ladder.logic';
const emit = defineEmits();
const auth = useAuth();
const convex = useConvexClient();
const ladderService = createLadderService(convex);
const background = assetLoader('background-custom-game');
const runtime = ref({ ...initialLadderRuntimeState });
const selfStats = ref(safeStats(null));
const errorMessage = ref('');
const started = ref(false);
const disposed = ref(false);
const params = new URLSearchParams(window.location.search);
const fixtureCount = import.meta.env.DEV ? Number(params.get('ladderFixture') ?? 0) : 0;
const fixtureDelay = import.meta.env.DEV ? Number(params.get('ladderFixtureDelay') ?? 900) : 0;
const rosterCountdownSeconds = import.meta.env.DEV
    ? Math.max(3, Math.min(60, Number(params.get('ladderRosterSeconds') ?? 3)))
    : 3;
const debugFaces = import.meta.env.DEV
    ? (params.get('ladderDice') ?? '').split(',').map(Number).filter((face) => face >= 1 && face <= 6)
    : [];
let queueUnsubscribe;
let fixtureTimer;
let handoffTimer;
let heartbeatTimer;
const phaseLabel = computed(() => t(`ladder.phase.${runtime.value.phase}`));
const authPending = computed(() => !auth.isLoaded.value);
const shellStyles = {
    '--ladder-bg': `url(${background.url})`,
    '--ladder-bg-focus-x': background.manifest.focus.x,
    '--ladder-bg-focus-y': background.manifest.focus.y,
};
function localizedError(error, fallbackKey) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNAUTHENTICATED'))
        return t('ladder.signInRequired');
    if (message.includes('LADDER_DEV_FIXTURES_DISABLED'))
        return t('ladder.fixtureDisabled');
    return t(fallbackKey);
}
function applyQueueState(queue) {
    selfStats.value = safeStats(queue.selfStats);
    if (queue.status === 'matched' && (!queue.matchId || queue.roster.length < 2)) {
        errorMessage.value = t('ladder.staleMatch');
        return;
    }
    const next = reduceLadderRuntime(runtime.value, { type: 'queue_update', queue });
    if (next.phase === 'roster') {
        window.clearTimeout(fixtureTimer);
        window.clearInterval(heartbeatTimer);
        queueUnsubscribe?.unsubscribe();
        queueUnsubscribe = undefined;
        errorMessage.value = '';
    }
    runtime.value = next;
}
function subscribeQueue() {
    queueUnsubscribe?.unsubscribe();
    queueUnsubscribe = ladderService.subscribeOwnQueue(applyQueueState, () => { errorMessage.value = t('ladder.queueSubscriptionError'); });
}
async function enterQueue() {
    errorMessage.value = '';
    subscribeQueue();
    try {
        applyQueueState(await ladderService.enterQueue());
        window.clearInterval(heartbeatTimer);
        if (runtime.value.phase === 'searching') {
            heartbeatTimer = window.setInterval(() => {
                if (disposed.value || runtime.value.phase !== 'searching')
                    return;
                void ladderService.heartbeatQueue().then(applyQueueState).catch(() => {
                    errorMessage.value = t('ladder.queueSubscriptionError');
                });
            }, LADDER_QUEUE_HEARTBEAT_MS);
        }
    }
    catch (error) {
        errorMessage.value = localizedError(error, 'ladder.queueEnterError');
    }
}
async function startFixture() {
    errorMessage.value = '';
    try {
        applyQueueState(await ladderService.createDevFixture(fixtureCount));
    }
    catch (error) {
        errorMessage.value = localizedError(error, 'ladder.queueEnterError');
    }
}
async function start() {
    if (started.value || disposed.value || !auth.isLoaded.value)
        return;
    if (auth.isSignedIn.value !== true) {
        errorMessage.value = t('ladder.signInRequired');
        return;
    }
    started.value = true;
    if (fixtureCount >= 2 && fixtureCount <= 6) {
        selfStats.value = safeStats({ mmr: 1000 });
        fixtureTimer = window.setTimeout(() => void startFixture(), Math.max(0, fixtureDelay));
        return;
    }
    await enterQueue();
}
async function cancelAndBack() {
    if (runtime.value.phase !== 'searching' || runtime.value.cancelPending)
        return;
    runtime.value = reduceLadderRuntime(runtime.value, { type: 'cancel_requested' });
    window.clearTimeout(fixtureTimer);
    try {
        const queue = await ladderService.leaveQueue();
        applyQueueState(queue);
        if (runtime.value.phase === 'roster')
            return;
        runtime.value = reduceLadderRuntime(runtime.value, { type: 'cancel_completed' });
        emit('back');
    }
    catch (error) {
        runtime.value = reduceLadderRuntime(runtime.value, { type: 'cancel_completed' });
        errorMessage.value = localizedError(error, 'ladder.leaveError');
    }
}
async function retry() {
    if (fixtureCount >= 2 && fixtureCount <= 6) {
        await startFixture();
        return;
    }
    subscribeQueue();
    try {
        applyQueueState(await ladderService.getOwnQueueState());
        if (runtime.value.phase === 'searching')
            applyQueueState(await ladderService.enterQueue());
        errorMessage.value = '';
    }
    catch (error) {
        errorMessage.value = localizedError(error, 'ladder.queueEnterError');
    }
}
async function beginHandoff() {
    const matchId = runtime.value.matchId;
    if (!matchId) {
        errorMessage.value = t('ladder.handoffError');
        return;
    }
    const next = reduceLadderRuntime(runtime.value, { type: 'handoff_started' });
    if (next === runtime.value)
        return;
    runtime.value = next;
    await nextTick();
    await new Promise((resolve) => {
        handoffTimer = window.setTimeout(resolve, 320);
    });
    if (disposed.value)
        return;
    try {
        await ladderService.acknowledgeMatchHandoff(matchId);
        if (!disposed.value)
            emit('handoff', matchId);
    }
    catch (error) {
        runtime.value = reduceLadderRuntime(runtime.value, { type: 'handoff_failed' });
        errorMessage.value = localizedError(error, 'ladder.handoffError');
    }
}
watchEffect(() => {
    if (!auth.isLoaded.value)
        return;
    if (auth.isSignedIn.value !== true) {
        convex.setAuth(async () => null);
        void start();
        return;
    }
    convex.setAuth(async ({ forceRefreshToken }) => await auth.getToken.value({
        template: 'convex',
        skipCache: forceRefreshToken,
    }));
    void start();
});
onUnmounted(() => {
    disposed.value = true;
    window.clearTimeout(fixtureTimer);
    window.clearTimeout(handoffTimer);
    window.clearInterval(heartbeatTimer);
    queueUnsubscribe?.unsubscribe();
    if (started.value && runtime.value.phase === 'searching' && fixtureCount === 0) {
        void ladderService.leaveQueue().catch(() => undefined);
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "ladder-shell" },
    ...{ style: (__VLS_ctx.shellStyles) },
    'aria-label': (__VLS_ctx.t('ladder.screenLabel')),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "ladder-shell__background" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "ladder-topbar" },
});
if (__VLS_ctx.runtime.phase === 'searching') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.cancelAndBack) },
        ...{ class: "ladder-back" },
        type: "button",
        disabled: (__VLS_ctx.runtime.cancelPending),
        'aria-label': (__VLS_ctx.t('ladder.back')),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        'aria-hidden': "true",
    });
    (__VLS_ctx.t('ladder.back'));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.phaseLabel);
if (__VLS_ctx.runtime.phase === 'searching') {
    /** @type {[typeof LadderLoading, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(LadderLoading, new LadderLoading({
        ...{ 'onCancel': {} },
        ...{ 'onRetry': {} },
        selfStats: (__VLS_ctx.selfStats),
        cancelPending: (__VLS_ctx.runtime.cancelPending),
        authPending: (__VLS_ctx.authPending),
        errorMessage: (__VLS_ctx.errorMessage),
        debugFaces: (__VLS_ctx.debugFaces),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onCancel': {} },
        ...{ 'onRetry': {} },
        selfStats: (__VLS_ctx.selfStats),
        cancelPending: (__VLS_ctx.runtime.cancelPending),
        authPending: (__VLS_ctx.authPending),
        errorMessage: (__VLS_ctx.errorMessage),
        debugFaces: (__VLS_ctx.debugFaces),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onCancel: (__VLS_ctx.cancelAndBack)
    };
    const __VLS_7 = {
        onRetry: (__VLS_ctx.retry)
    };
    var __VLS_2;
}
else if (__VLS_ctx.runtime.phase === 'roster') {
    /** @type {[typeof LadderRoster, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(LadderRoster, new LadderRoster({
        ...{ 'onReady': {} },
        players: (__VLS_ctx.runtime.roster),
        countdownSeconds: (__VLS_ctx.rosterCountdownSeconds),
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onReady': {} },
        players: (__VLS_ctx.runtime.roster),
        countdownSeconds: (__VLS_ctx.rosterCountdownSeconds),
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_11;
    let __VLS_12;
    let __VLS_13;
    const __VLS_14 = {
        onReady: (__VLS_ctx.beginHandoff)
    };
    var __VLS_10;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "ladder-handoff" },
        role: "status",
        'aria-live': "assertive",
        'data-testid': "ladder-handing-off",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.t('ladder.phase.handing_off'));
}
/** @type {__VLS_StyleScopedClasses['ladder-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-shell__background']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-back']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-handoff']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            LadderLoading: LadderLoading,
            LadderRoster: LadderRoster,
            runtime: runtime,
            selfStats: selfStats,
            errorMessage: errorMessage,
            rosterCountdownSeconds: rosterCountdownSeconds,
            debugFaces: debugFaces,
            phaseLabel: phaseLabel,
            authPending: authPending,
            shellStyles: shellStyles,
            cancelAndBack: cancelAndBack,
            retry: retry,
            beginHandoff: beginHandoff,
        };
    },
    __typeEmits: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
});
; /* PartiallyEnd: #4569/main.vue */
