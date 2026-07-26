/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useAuth } from '@clerk/vue';
import { useConvexClient } from 'convex-vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { createMatchService, mergeMatchSnapshots, } from '../services/convex/matchService';
import DefoldCanvas from './DefoldCanvas.vue';
const props = withDefaults(defineProps(), {
    matchId: undefined,
    source: 'dev',
});
const emit = defineEmits();
const convex = useConvexClient();
const auth = useAuth();
const matchService = createMatchService(convex);
const createdMatch = ref(null);
const publicSnapshot = ref(null);
const privateDelta = ref(null);
const mergedSnapshot = ref(null);
const status = ref('Preparing Convex play session...');
const errorMessage = ref('');
const lastRejected = ref(null);
const linkedMatchId = ref(props.matchId ?? new URLSearchParams(window.location.search).get('matchId') ?? '');
const loadingMatch = ref(false);
const commandInFlight = ref(false);
const defoldCanvas = ref(null);
const defoldSnapshotAckRevision = ref(null);
const pendingPlayerCommands = [];
let drainingPlayerCommands = false;
let publicUnsubscribe;
let commandCounter = 0;
let lastFlowResumeKey = '';
const SNAPSHOT_ACK_RETRY_DELAYS_MS = [0, 100, 250, 500, 900, 1400, 2200];
const isSignedIn = computed(() => auth.isSignedIn.value === true);
const canStart = computed(() => auth.isLoaded.value && isSignedIn.value);
const isLinkedMatch = computed(() => linkedMatchId.value.length > 0);
const primaryActionLabel = computed(() => isLinkedMatch.value ? 'Reload Match' : 'Start / Reuse');
const screenTitle = computed(() => props.source === 'ladder' ? 'Ladder Match' : 'Convex Dev Match');
const startMatchPayload = computed(() => {
    if (!createdMatch.value || !mergedSnapshot.value?.viewerPlayerId) {
        return undefined;
    }
    return {
        sessionId: 'convex-dev-session',
        matchId: createdMatch.value.matchId,
        playerId: mergedSnapshot.value.viewerPlayerId,
        mode: (publicSnapshot.value?.match?.mode ?? (props.source === 'ladder' ? 'ranked' : 'dev')),
    };
});
const serverSnapshotPayload = computed(() => {
    if (!createdMatch.value || !mergedSnapshot.value) {
        return null;
    }
    return {
        matchId: createdMatch.value.matchId,
        revision: mergedSnapshot.value.revision,
        snapshot: mergedSnapshot.value,
        publicSnapshot: publicSnapshot.value,
        privateDelta: privateDelta.value,
    };
});
function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
async function refreshMatchViewsUntil(matchId, revision) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        await refreshMatchViews(matchId);
        if (!revision || (serverSnapshotPayload.value?.revision ?? 0) >= revision) {
            return;
        }
        await sleep(100 + attempt * 150);
    }
}
function sendCurrentServerSnapshotToDefold() {
    const snapshot = serverSnapshotPayload.value;
    if (!snapshot) {
        return;
    }
    defoldCanvas.value?.send({
        type: 'SERVER_SNAPSHOT',
        payload: snapshot,
    });
}
async function sendCurrentServerSnapshotToDefoldUntilAck(revision) {
    for (const delay of SNAPSHOT_ACK_RETRY_DELAYS_MS) {
        if (delay > 0) {
            await sleep(delay);
        }
        if (revision && (defoldSnapshotAckRevision.value ?? 0) >= revision) {
            return true;
        }
        sendCurrentServerSnapshotToDefold();
    }
    return !revision || (defoldSnapshotAckRevision.value ?? 0) >= revision;
}
function generateCommandId(type) {
    commandCounter += 1;
    return `web-${Date.now()}-${commandCounter}-${type}`;
}
function refreshMergedSnapshot() {
    mergedSnapshot.value = mergeMatchSnapshots(publicSnapshot.value, privateDelta.value);
}
function resumeAutomaticFlow(snapshot) {
    if (!snapshot || !createdMatch.value) {
        return;
    }
    const duel = snapshot.duel;
    const automatic = snapshot.phase === 'bidding_gap'
        || (snapshot.phase === 'duel' && (duel?.phase === 'ready' || duel?.phase === 'executing'));
    if (!automatic) {
        return;
    }
    const key = `${snapshot.matchId}:${snapshot.revision}:${snapshot.phase}:${duel?.phase ?? '-'}`;
    if (lastFlowResumeKey === key) {
        return;
    }
    lastFlowResumeKey = key;
    void matchService.resumeMatchFlow(snapshot.matchId).catch((error) => {
        lastFlowResumeKey = '';
        errorMessage.value = error instanceof Error ? error.message : String(error);
    });
}
async function refreshPrivateDelta(matchId) {
    privateDelta.value = await matchService.getPrivateDelta(matchId);
    refreshMergedSnapshot();
}
async function refreshMatchViews(matchId) {
    const [nextPublicSnapshot, nextPrivateDelta] = await Promise.all([
        matchService.getPublicSnapshot(matchId),
        matchService.getPrivateDelta(matchId),
    ]);
    publicSnapshot.value = nextPublicSnapshot;
    privateDelta.value = nextPrivateDelta;
    refreshMergedSnapshot();
    resumeAutomaticFlow(nextPublicSnapshot);
}
function subscribePublicSnapshot(matchId) {
    publicUnsubscribe?.unsubscribe();
    publicUnsubscribe = matchService.subscribePublicView(matchId, {
        onSnapshot: () => {
            void refreshMatchViews(matchId);
        },
        onError: (error) => {
            errorMessage.value = error.message;
        },
    });
}
async function loadExistingMatch(matchId) {
    if (loadingMatch.value) {
        return;
    }
    if (!canStart.value) {
        status.value = 'Sign in to open this Convex dev match.';
        return;
    }
    loadingMatch.value = true;
    status.value = props.source === 'ladder'
        ? 'Opening Ladder match...'
        : 'Opening linked Convex dev match...';
    errorMessage.value = '';
    try {
        const nextPublicSnapshot = await matchService.getPublicSnapshot(matchId);
        const nextPrivateDelta = await matchService.getPrivateDelta(matchId);
        if (!nextPublicSnapshot || !nextPrivateDelta) {
            createdMatch.value = null;
            publicSnapshot.value = nextPublicSnapshot;
            privateDelta.value = nextPrivateDelta;
            refreshMergedSnapshot();
            errorMessage.value = 'MATCH_NOT_AVAILABLE: current user is not a participant or the match does not exist.';
            status.value = 'Could not open linked match.';
            return;
        }
        createdMatch.value = {
            matchId,
            revision: nextPublicSnapshot.revision,
            publicSnapshot: nextPublicSnapshot,
            privateDelta: nextPrivateDelta,
        };
        publicSnapshot.value = nextPublicSnapshot;
        privateDelta.value = nextPrivateDelta;
        refreshMergedSnapshot();
        subscribePublicSnapshot(matchId);
        resumeAutomaticFlow(nextPublicSnapshot);
        status.value = props.source === 'ladder'
            ? `Opened Ladder match ${matchId.slice(-6)}.`
            : `Opened linked Convex dev match ${matchId.slice(-6)}.`;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        status.value = 'Could not open linked match.';
    }
    finally {
        loadingMatch.value = false;
    }
}
async function createDevMatch() {
    if (isLinkedMatch.value) {
        await loadExistingMatch(linkedMatchId.value);
        return;
    }
    if (loadingMatch.value) {
        return;
    }
    if (!canStart.value) {
        status.value = 'Sign in to start a Convex dev match.';
        return;
    }
    loadingMatch.value = true;
    status.value = 'Creating Convex dev match...';
    errorMessage.value = '';
    try {
        const match = await matchService.createDevMatch({
            localPlayerName: 'You',
            requiresSetupLoad: true,
        });
        createdMatch.value = match;
        publicSnapshot.value = match.publicSnapshot ?? await matchService.getPublicSnapshot(match.matchId);
        privateDelta.value = match.privateDelta ?? await matchService.getPrivateDelta(match.matchId);
        refreshMergedSnapshot();
        subscribePublicSnapshot(match.matchId);
        resumeAutomaticFlow(publicSnapshot.value);
        status.value = match.reused ? 'Reused active Convex dev match.' : 'Created Convex dev match.';
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        status.value = 'Could not create Convex dev match.';
    }
    finally {
        loadingMatch.value = false;
    }
}
async function submitPlayerCommand(command) {
    if (!createdMatch.value || !mergedSnapshot.value) {
        return;
    }
    commandInFlight.value = true;
    const targetMatchId = command.matchId ?? createdMatch.value.matchId;
    try {
        const submittedCommandId = command.commandId ?? generateCommandId(command.type);
        const result = await matchService.submitCommand({
            matchId: targetMatchId,
            commandId: submittedCommandId,
            // Always use the freshest known revision. Queued clicks may still carry
            // the pre-accept revision from Defold's emit-time snapshot.
            revision: mergedSnapshot.value.revision,
            type: command.type,
            payload: command.payload,
        });
        if (result.ok === false) {
            const rejectedPrivateDelta = result.privateDelta ?? privateDelta.value;
            if (result.publicSnapshot) {
                publicSnapshot.value = result.publicSnapshot;
                privateDelta.value = rejectedPrivateDelta;
                refreshMergedSnapshot();
            }
            else {
                await refreshMatchViews(targetMatchId);
            }
            const rejected = {
                matchId: result.matchId,
                commandId: submittedCommandId,
                code: result.code ?? 'COMMAND_REJECTED',
                message: result.message ?? 'command_rejected',
                details: result.details,
                revision: result.revision,
                snapshot: result.publicSnapshot
                    ? mergeMatchSnapshots(result.publicSnapshot, rejectedPrivateDelta) ?? undefined
                    : mergedSnapshot.value ?? undefined,
            };
            lastRejected.value = rejected;
            errorMessage.value = `${rejected.code}: ${rejected.message}`;
            await nextTick();
            defoldCanvas.value?.send({
                type: 'COMMAND_REJECTED',
                payload: rejected,
            });
            const acked = await sendCurrentServerSnapshotToDefoldUntilAck(Number(result.revision ?? 0) || undefined);
            if (!acked) {
                errorMessage.value = `SNAPSHOT_NOT_ACKED: revision ${result.revision ?? '?'}`;
            }
            return rejected;
        }
        lastRejected.value = null;
        errorMessage.value = '';
        status.value = `Command accepted: ${command.type}`;
        // Prefer mutation-returned snapshots: they are authoritative and avoid
        // racing Convex query read-your-writes lag after submitMatchCommand.
        if (result.publicSnapshot) {
            publicSnapshot.value = result.publicSnapshot;
            privateDelta.value = result.privateDelta ?? privateDelta.value;
            refreshMergedSnapshot();
        }
        else {
            await refreshMatchViewsUntil(targetMatchId, Number(result.revision ?? 0) || undefined);
        }
        await nextTick();
        const acked = await sendCurrentServerSnapshotToDefoldUntilAck(Number(result.revision ?? 0) || undefined);
        if (!acked) {
            errorMessage.value = `SNAPSHOT_NOT_ACKED: revision ${result.revision ?? '?'}`;
        }
        return undefined;
    }
    finally {
        commandInFlight.value = false;
    }
}
async function drainPlayerCommandQueue() {
    if (drainingPlayerCommands) {
        return;
    }
    drainingPlayerCommands = true;
    try {
        while (pendingPlayerCommands.length > 0) {
            const command = pendingPlayerCommands.shift();
            if (!command) {
                continue;
            }
            const rejected = await submitPlayerCommand(command);
            if (rejected) {
                pendingPlayerCommands.length = 0;
                break;
            }
        }
    }
    finally {
        drainingPlayerCommands = false;
    }
}
async function handleDefoldMessage(message) {
    if (message.type === 'EXIT_TO_LOBBY') {
        emit('back');
        return;
    }
    if (message.type === 'SERVER_SNAPSHOT_RECEIVED') {
        const payload = (message.payload ?? {});
        const revision = Number(payload.revision ?? 0);
        if (revision > 0 && payload.applied !== false) {
            defoldSnapshotAckRevision.value = Math.max(defoldSnapshotAckRevision.value ?? 0, revision);
        }
        return;
    }
    if (message.type !== 'PLAYER_COMMAND') {
        return;
    }
    pendingPlayerCommands.push(message.payload);
    void drainPlayerCommandQueue();
}
watchEffect(() => {
    if (!auth.isLoaded.value) {
        return;
    }
    if (!isSignedIn.value) {
        convex.setAuth(async () => null);
        return;
    }
    convex.setAuth(async ({ forceRefreshToken }) => {
        return await auth.getToken.value({
            template: 'convex',
            skipCache: forceRefreshToken,
        });
    }, () => { });
});
onMounted(() => {
    if (canStart.value && isLinkedMatch.value) {
        void loadExistingMatch(linkedMatchId.value);
    }
    else if (canStart.value) {
        void createDevMatch();
    }
    else {
        status.value = 'Waiting for Clerk sign-in...';
    }
});
watchEffect(() => {
    if (createdMatch.value || !canStart.value || loadingMatch.value) {
        return;
    }
    if (isLinkedMatch.value) {
        void loadExistingMatch(linkedMatchId.value);
    }
    else {
        void createDevMatch();
    }
});
onUnmounted(() => {
    publicUnsubscribe?.unsubscribe();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    matchId: undefined,
    source: 'dev',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['convex-play-screen__header']} */ ;
/** @type {__VLS_StyleScopedClasses['convex-play-screen__header']} */ ;
/** @type {__VLS_StyleScopedClasses['convex-play-screen__restart']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "convex-play-screen" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "convex-play-screen__header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('back');
        } },
    ...{ class: "convex-play-screen__back" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
(__VLS_ctx.screenTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.status);
if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "convex-play-screen__error" },
    });
    (__VLS_ctx.errorMessage);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.createDevMatch) },
    ...{ class: "convex-play-screen__restart" },
    type: "button",
    disabled: (!__VLS_ctx.canStart || __VLS_ctx.loadingMatch),
});
(__VLS_ctx.primaryActionLabel);
/** @type {[typeof DefoldCanvas, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(DefoldCanvas, new DefoldCanvas({
    ...{ 'onMessage': {} },
    ref: "defoldCanvas",
    match: (__VLS_ctx.startMatchPayload),
    serverSnapshot: (__VLS_ctx.serverSnapshotPayload),
    commandRejected: (__VLS_ctx.lastRejected),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onMessage': {} },
    ref: "defoldCanvas",
    match: (__VLS_ctx.startMatchPayload),
    serverSnapshot: (__VLS_ctx.serverSnapshotPayload),
    commandRejected: (__VLS_ctx.lastRejected),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onMessage: (__VLS_ctx.handleDefoldMessage)
};
/** @type {typeof __VLS_ctx.defoldCanvas} */ ;
var __VLS_7 = {};
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['convex-play-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['convex-play-screen__header']} */ ;
/** @type {__VLS_StyleScopedClasses['convex-play-screen__back']} */ ;
/** @type {__VLS_StyleScopedClasses['convex-play-screen__error']} */ ;
/** @type {__VLS_StyleScopedClasses['convex-play-screen__restart']} */ ;
// @ts-ignore
var __VLS_8 = __VLS_7;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DefoldCanvas: DefoldCanvas,
            emit: emit,
            status: status,
            errorMessage: errorMessage,
            lastRejected: lastRejected,
            loadingMatch: loadingMatch,
            defoldCanvas: defoldCanvas,
            canStart: canStart,
            primaryActionLabel: primaryActionLabel,
            screenTitle: screenTitle,
            startMatchPayload: startMatchPayload,
            serverSnapshotPayload: serverSnapshotPayload,
            createDevMatch: createDevMatch,
            handleDefoldMessage: handleDefoldMessage,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
