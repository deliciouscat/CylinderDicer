/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useAuth } from '@clerk/vue';
import { useConvexClient } from 'convex-vue';
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { assetLoader } from '../assets/assetLoader';
import { t } from '../i18n';
import { createCustomGameService, } from '../services/convex/customGameService';
const emit = defineEmits();
const convex = useConvexClient();
const auth = useAuth();
const customGameService = createCustomGameService(convex);
const backgroundAsset = assetLoader('background-custom-game');
const boardAsset = assetLoader('board');
const toolbarButtonAsset = assetLoader('button');
const woodButtonAsset = assetLoader('menu-panel');
const redButtonAsset = assetLoader('menu-pannel-red');
const titleAsset = assetLoader('title');
const roomView = ref(null);
const publicRooms = ref([]);
const selectedBrowserRoomId = ref('');
const selectedPlayerId = ref('local-player');
const inviteCodeInput = ref('');
const inviteNameInput = ref('');
const statusMessage = ref(t('customGame.loadingRoom'));
const errorMessage = ref('');
const busy = ref(false);
const convexAuthReady = ref(false);
const loadedOnce = ref(false);
let roomUnsubscribe;
let authSetupGeneration = 0;
const CONVEX_REQUEST_TIMEOUT_MS = 10000;
const CONVEX_AUTH_TIMEOUT_MS = 8000;
const customGameStyles = {
    '--custom-bg': `url(${backgroundAsset.url})`,
    '--custom-bg-focus-x': backgroundAsset.manifest.focus.x,
    '--custom-bg-focus-y': backgroundAsset.manifest.focus.y,
    '--custom-bg-pan': `${backgroundAsset.manifest.pan.distancePercent}%`,
    '--custom-bg-pan-duration': `${backgroundAsset.manifest.pan.durationSeconds}s`,
    '--custom-bg-scrim': backgroundAsset.manifest.overlay.scrim,
    '--custom-bg-warmth': backgroundAsset.manifest.overlay.warmth,
    '--board-image': `url(${boardAsset.url})`,
    '--board-ratio': `${boardAsset.manifest.width} / ${boardAsset.manifest.height}`,
    '--toolbar-button-image': `url(${toolbarButtonAsset.url})`,
    '--toolbar-button-ratio': `${toolbarButtonAsset.manifest.width} / ${toolbarButtonAsset.manifest.height}`,
    '--wood-button-image': `url(${woodButtonAsset.url})`,
    '--wood-button-ratio': `${woodButtonAsset.manifest.width} / ${woodButtonAsset.manifest.height}`,
    '--red-button-image': `url(${redButtonAsset.url})`,
    '--red-button-ratio': `${redButtonAsset.manifest.width} / ${redButtonAsset.manifest.height}`,
};
const isSignedIn = computed(() => auth.isSignedIn.value === true);
const canUseConvex = computed(() => auth.isLoaded.value && isSignedIn.value && convexAuthReady.value);
const isHost = computed(() => roomView.value?.viewer?.isHost === true);
const isGuest = computed(() => Boolean(roomView.value?.viewer && !roomView.value.viewer.isHost));
const roomStarted = computed(() => roomView.value?.room.status === 'started');
const canStartMatch = computed(() => isHost.value && !roomStarted.value && allOpponentsReady.value);
const hasVirtualOpponents = computed(() => roomPlayers.value.some((player) => player.kind === 'virtual'));
const roomPlayers = computed(() => [
    ...(roomView.value?.participants ?? [])
        .slice()
        .sort((left, right) => left.seatIndex - right.seatIndex)
        .map((participant) => {
        return {
            id: participant.playerId,
            nickname: participant.displayName,
            isHost: participant.playerId === 'local-player',
            isReady: participant.ready,
            kind: participant.participantKind,
            archetype: participant.archetype,
        };
    }),
]);
const selectedPlayer = computed(() => {
    return roomPlayers.value.find((player) => player.id === selectedPlayerId.value) ?? roomPlayers.value[0];
});
const selectedCountLabel = computed(() => {
    return `${roomPlayers.value.length}/6`;
});
const allOpponentsReady = computed(() => {
    return roomView.value?.allReady === true;
});
const canShowStart = computed(() => isHost.value && !roomStarted.value);
const canAddBot = computed(() => {
    return isHost.value
        && !roomStarted.value
        && roomPlayers.value.length < 6;
});
const createDisabled = computed(() => !canUseConvex.value || busy.value);
const joinDisabled = computed(() => !canUseConvex.value || busy.value);
const toolbarActionDisabled = computed(() => {
    if (!roomView.value) {
        return joinDisabled.value;
    }
    return !canUseConvex.value || busy.value;
});
const roomBrowserRows = computed(() => {
    return roomView.value
        ? []
        : publicRooms.value;
});
function isRoomView(value) {
    return Boolean(value && typeof value === 'object' && 'room' in value && 'participants' in value);
}
function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
        promise
            .then(resolve, reject)
            .finally(() => window.clearTimeout(timeout));
    });
}
async function fetchConvexAuthToken(forceRefreshToken = false) {
    const token = await withTimeout(auth.getToken.value({
        template: 'convex',
        skipCache: forceRefreshToken,
    }), CONVEX_AUTH_TIMEOUT_MS, 'convex_auth_token_timeout');
    if (!token) {
        throw new Error('convex_auth_token_missing');
    }
    return token;
}
function installConvexAuthProvider() {
    convex.setAuth(async ({ forceRefreshToken }) => {
        try {
            return await fetchConvexAuthToken(forceRefreshToken);
        }
        catch (error) {
            statusMessage.value = t('customGame.authTokenError');
            errorMessage.value = error instanceof Error ? error.message : String(error);
            return null;
        }
    }, () => { });
}
async function prepareConvexAuth(generation) {
    installConvexAuthProvider();
    try {
        await fetchConvexAuthToken(false);
        if (generation !== authSetupGeneration) {
            return;
        }
        convexAuthReady.value = true;
        if (errorMessage.value === 'convex_auth_token_missing' || errorMessage.value === 'convex_auth_token_timeout') {
            errorMessage.value = '';
        }
    }
    catch (error) {
        if (generation !== authSetupGeneration) {
            return;
        }
        convexAuthReady.value = false;
        statusMessage.value = t('customGame.authTokenError');
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
}
async function loadRoom() {
    roomView.value = await withTimeout(customGameService.getMyCustomGameRoom(), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_load_timeout');
}
async function loadPublicRooms() {
    publicRooms.value = await withTimeout(customGameService.listComposingCustomGameRooms(12), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_list_timeout');
}
async function createRoom() {
    if (!canUseConvex.value || busy.value) {
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    statusMessage.value = t('customGame.createQueued');
    try {
        const created = await withTimeout(customGameService.ensureMyCustomGameRoom(), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_create_timeout');
        if (!isRoomView(created)) {
            throw new Error(created?.message ?? 'custom_room_not_available');
        }
        roomView.value = created;
        publicRooms.value = [];
        subscribeRoomUpdates();
        selectedPlayerId.value = roomPlayers.value[1]?.id ?? 'local-player';
        statusMessage.value = selectedStatusMessage();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        statusMessage.value = t('customGame.createError');
    }
    finally {
        busy.value = false;
    }
}
async function joinRoom() {
    if (!canUseConvex.value || busy.value) {
        return;
    }
    const inviteCode = inviteCodeInput.value.trim();
    if (!inviteCode) {
        errorMessage.value = t('customGame.inviteCodeRequired');
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    statusMessage.value = t('customGame.joinQueued');
    try {
        const joined = await withTimeout(customGameService.joinCustomGameRoomByInviteCode(inviteCode), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_join_timeout');
        if (!isRoomView(joined)) {
            throw new Error(`${joined?.code ?? 'JOIN_FAILED'}: ${joined?.message ?? 'join_failed'}`);
        }
        roomView.value = joined;
        publicRooms.value = [];
        subscribeRoomUpdates();
        selectedPlayerId.value = joined.viewer?.playerId ?? roomPlayers.value[0]?.id ?? 'local-player';
        statusMessage.value = t('customGame.joinedRoom');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        statusMessage.value = t('customGame.joinError');
    }
    finally {
        busy.value = false;
    }
}
function selectBrowserRoom(room) {
    selectedBrowserRoomId.value = room.roomId;
    inviteCodeInput.value = room.inviteCode;
}
function queueInvite() {
    const name = inviteNameInput.value.trim();
    if (!name) {
        return;
    }
    statusMessage.value = t('customGame.inviteQueued', { name });
    inviteNameInput.value = '';
}
async function leaveRoom() {
    if (!roomView.value || !isGuest.value || busy.value) {
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        await withTimeout(customGameService.leaveMyCustomGameRoom(roomView.value.room._id), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_leave_timeout');
        roomUnsubscribe?.unsubscribe();
        roomView.value = null;
        inviteCodeInput.value = '';
        statusMessage.value = t('customGame.leftRoom');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
async function toggleMyReady() {
    if (!roomView.value || !isGuest.value || busy.value) {
        return;
    }
    const nextReady = roomView.value.viewer?.ready !== true;
    busy.value = true;
    errorMessage.value = '';
    try {
        const updated = await withTimeout(customGameService.setMyCustomGameReady({
            roomId: roomView.value.room._id,
            ready: nextReady,
        }), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_ready_timeout');
        if (!isRoomView(updated)) {
            throw new Error(updated?.message ?? 'ready_update_failed');
        }
        roomView.value = updated;
        statusMessage.value = selectedStatusMessage();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
async function refreshRoom() {
    await loadRoom();
    if (!roomView.value) {
        await loadPublicRooms();
    }
}
function refreshRoomFromToolbar() {
    if (!canUseConvex.value || busy.value) {
        return;
    }
    statusMessage.value = t('customGame.loadingRoom');
    void refreshRoom()
        .then(() => {
        statusMessage.value = roomView.value ? selectedStatusMessage() : '';
    })
        .catch((error) => {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        statusMessage.value = t('customGame.roomLoadError');
    });
}
function selectedStatusMessage() {
    if (isHost.value && !hasVirtualOpponents.value && !roomStarted.value) {
        return t('customGame.addBotPrompt');
    }
    return roomView.value?.allReady
        ? t('customGame.allReady')
        : t('customGame.waitingForReady');
}
async function addBot() {
    if (!roomView.value || !canUseConvex.value || !canAddBot.value || busy.value) {
        return;
    }
    const previousPlayerIds = new Set(roomPlayers.value.map((player) => player.id));
    busy.value = true;
    errorMessage.value = '';
    statusMessage.value = t('customGame.addBotQueued');
    try {
        const updated = await withTimeout(customGameService.addMyCustomGameOpponent(roomView.value.room._id), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_add_bot_timeout');
        if (!isRoomView(updated)) {
            throw new Error(`${updated?.code ?? 'ADD_BOT_FAILED'}: ${updated?.message ?? 'add_bot_failed'}`);
        }
        roomView.value = updated;
        const addedPlayer = roomPlayers.value.find((player) => player.kind === 'virtual' && !previousPlayerIds.has(player.id));
        selectedPlayerId.value = addedPlayer?.id ?? selectedPlayerId.value;
        statusMessage.value = t('customGame.botAdded');
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        statusMessage.value = t('customGame.addBotError');
    }
    finally {
        busy.value = false;
    }
}
function subscribeRoomUpdates() {
    roomUnsubscribe?.unsubscribe();
    roomUnsubscribe = customGameService.subscribeMyCustomGameRoom((room) => {
        if (room) {
            roomView.value = room;
            statusMessage.value = selectedStatusMessage();
            if (room.room.status === 'started' && room.room.matchId) {
                statusMessage.value = t('customGame.matchStarted');
                openMatch({ matchId: room.room.matchId, revision: 0 });
            }
            return;
        }
        roomView.value = null;
    }, (error) => {
        errorMessage.value = error.message;
    });
}
function openMatch(match) {
    window.location.assign(`/play/dev?matchId=${encodeURIComponent(match.matchId)}`);
}
async function startGame() {
    if (!canUseConvex.value || !isHost.value) {
        statusMessage.value = t('customGame.signInRequired');
        return;
    }
    if (!hasVirtualOpponents.value) {
        errorMessage.value = t('customGame.selectOpponent');
        return;
    }
    if (!allOpponentsReady.value) {
        errorMessage.value = t('customGame.waitingForReady');
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    statusMessage.value = t('customGame.startQueued');
    try {
        if (!roomView.value) {
            errorMessage.value = t('customGame.startError');
            return;
        }
        const result = await withTimeout(customGameService.startMyCustomGameRoom(roomView.value.room._id), CONVEX_REQUEST_TIMEOUT_MS, 'custom_room_start_timeout');
        if (result.ok === false || !result.matchId) {
            errorMessage.value = `${result.code ?? 'CUSTOM_MATCH_FAILED'}: ${result.message ?? 'custom_match_failed'}`;
            statusMessage.value = t('customGame.startError');
            return;
        }
        statusMessage.value = t('customGame.customMatchCreated');
        openMatch(result);
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        statusMessage.value = t('customGame.startError');
    }
    finally {
        busy.value = false;
    }
}
watchEffect(() => {
    if (!auth.isLoaded.value) {
        return;
    }
    if (!isSignedIn.value) {
        authSetupGeneration += 1;
        convex.setAuth(async () => null);
        convexAuthReady.value = false;
        statusMessage.value = t('customGame.signInRequired');
        loadedOnce.value = false;
        return;
    }
    const generation = authSetupGeneration + 1;
    authSetupGeneration = generation;
    convexAuthReady.value = false;
    void prepareConvexAuth(generation);
});
watchEffect(() => {
    if (!canUseConvex.value || loadedOnce.value) {
        return;
    }
    loadedOnce.value = true;
    void refreshRoom()
        .then(() => {
        if (roomView.value) {
            subscribeRoomUpdates();
            selectedPlayerId.value = roomView.value.viewer?.playerId ?? roomPlayers.value[1]?.id ?? 'local-player';
        }
        statusMessage.value = roomView.value ? selectedStatusMessage() : '';
    })
        .catch((error) => {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        statusMessage.value = t('customGame.roomLoadError');
    });
});
onMounted(() => {
    if (!canUseConvex.value) {
        statusMessage.value = auth.isLoaded.value && !isSignedIn.value
            ? t('customGame.signInRequired')
            : t('customGame.loadingRoom');
    }
    window.setTimeout(() => {
        if (!auth.isLoaded.value) {
            statusMessage.value = t('customGame.signInRequired');
        }
    }, 5000);
});
onUnmounted(() => {
    roomUnsubscribe?.unsubscribe();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "custom-game-screen" },
    ...{ style: (__VLS_ctx.customGameStyles) },
    'aria-label': (__VLS_ctx.t('customGame.screenLabel')),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "custom-game-screen__background" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "custom-game-stage" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    ...{ class: "custom-game-title" },
    src: (__VLS_ctx.titleAsset.url),
    alt: (__VLS_ctx.t('customGame.titleAlt')),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "custom-game-shell custom-game-shell--room" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "custom-game-toolbar" },
    ...{ class: ({ 'custom-game-toolbar--browser': !__VLS_ctx.roomView }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('back');
        } },
    ...{ class: "texture-button texture-button--small texture-button--toolbar" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.t('customGame.back'));
if (!__VLS_ctx.roomView) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.createRoom) },
        ...{ class: "texture-button texture-button--small texture-button--toolbar" },
        type: "button",
        disabled: (__VLS_ctx.createDisabled),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.t('customGame.create'));
}
else if (!__VLS_ctx.isHost) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "custom-game-toolbar__spacer" },
    });
}
if (!__VLS_ctx.roomView) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onKeyup: (__VLS_ctx.joinRoom) },
        value: (__VLS_ctx.inviteCodeInput),
        ...{ class: "custom-game-input" },
        type: "text",
        placeholder: (__VLS_ctx.t('customGame.roomCodePlaceholder')),
        'aria-label': (__VLS_ctx.t('customGame.roomCodeAria')),
        disabled: (__VLS_ctx.joinDisabled),
    });
}
else if (__VLS_ctx.isHost && !__VLS_ctx.roomStarted) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onKeyup: (__VLS_ctx.queueInvite) },
        value: (__VLS_ctx.inviteNameInput),
        ...{ class: "custom-game-input" },
        type: "text",
        placeholder: (__VLS_ctx.t('customGame.namePlaceholder')),
        'aria-label': (__VLS_ctx.t('customGame.inviteNameAria')),
        disabled: (__VLS_ctx.busy || !__VLS_ctx.canUseConvex),
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
        ...{ class: "custom-game-toolbar__spacer" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            !__VLS_ctx.roomView ? __VLS_ctx.joinRoom() : __VLS_ctx.isHost && !__VLS_ctx.roomStarted ? __VLS_ctx.queueInvite() : __VLS_ctx.refreshRoomFromToolbar();
        } },
    ...{ class: "texture-button texture-button--small texture-button--toolbar" },
    type: "button",
    disabled: (__VLS_ctx.toolbarActionDisabled),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(!__VLS_ctx.roomView ? __VLS_ctx.t('customGame.join') : __VLS_ctx.isHost && !__VLS_ctx.roomStarted ? __VLS_ctx.t('customGame.invite') : __VLS_ctx.t('customGame.refreshRoom'));
if (!__VLS_ctx.roomView) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "custom-game-board custom-game-board--room-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "room-list-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.t('customGame.host'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.t('customGame.players'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "room-list-scroll" },
    });
    for (const [room] of __VLS_getVForSourceType((__VLS_ctx.roomBrowserRows))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.roomView))
                        return;
                    __VLS_ctx.selectBrowserRoom(room);
                } },
            key: (room.roomId),
            ...{ class: "room-list-row" },
            ...{ class: ({ 'is-selected': __VLS_ctx.selectedBrowserRoomId === room.roomId }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (room.hostDisplayName);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (room.playerCount);
        (room.maxPlayers);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.joinRoom) },
        ...{ class: "texture-button texture-button--large texture-button--red room-list-join" },
        type: "button",
        disabled: (__VLS_ctx.joinDisabled || !__VLS_ctx.inviteCodeInput.trim()),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.t('customGame.join'));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "custom-game-board custom-game-board--room" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "room-detail-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "room-player-list" },
    });
    for (const [player] of __VLS_getVForSourceType((__VLS_ctx.roomPlayers))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.roomView))
                        return;
                    __VLS_ctx.selectedPlayerId = player.id;
                } },
            key: (player.id),
            ...{ class: "room-player-row" },
            ...{ class: ({ 'is-selected': __VLS_ctx.selectedPlayer?.id === player.id }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (player.nickname);
        if (player.isHost) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "room-player-row__host" },
            });
            (__VLS_ctx.t('customGame.host'));
        }
        else if (player.isReady) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "room-player-row__ready" },
            });
            (__VLS_ctx.t('customGame.ready'));
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "room-player-row__waiting" },
            });
            (__VLS_ctx.t('customGame.notReady'));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "room-invite-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.isHost ? __VLS_ctx.t('customGame.virtualOpponents') : __VLS_ctx.t('customGame.players'));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedCountLabel);
    if (__VLS_ctx.isHost) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (__VLS_ctx.t('customGame.inviteCodeStatus', { code: __VLS_ctx.roomView.room.inviteCode }));
    }
    else if (__VLS_ctx.selectedPlayer?.archetype) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (__VLS_ctx.t('customGame.archetype'));
        (__VLS_ctx.selectedPlayer.archetype);
    }
    else if (__VLS_ctx.roomStarted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (__VLS_ctx.t('customGame.matchStarted'));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "room-action-bar" },
    });
    if (__VLS_ctx.isHost && !__VLS_ctx.roomStarted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.addBot) },
            ...{ class: "texture-button texture-button--large texture-button--wood" },
            'data-testid': "add-custom-game-bot",
            type: "button",
            disabled: (__VLS_ctx.busy || !__VLS_ctx.canUseConvex || !__VLS_ctx.canAddBot),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.t('customGame.addBot'));
    }
    if (__VLS_ctx.isGuest && !__VLS_ctx.roomStarted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.toggleMyReady) },
            ...{ class: "texture-button texture-button--large texture-button--wood" },
            type: "button",
            disabled: (__VLS_ctx.busy || !__VLS_ctx.canUseConvex),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.roomView.viewer?.ready ? __VLS_ctx.t('customGame.unready') : __VLS_ctx.t('customGame.ready'));
    }
    if (__VLS_ctx.isGuest && !__VLS_ctx.roomStarted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.leaveRoom) },
            ...{ class: "texture-button texture-button--large texture-button--toolbar" },
            type: "button",
            disabled: (__VLS_ctx.busy || !__VLS_ctx.canUseConvex),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.t('customGame.leaveRoom'));
    }
    if (__VLS_ctx.canShowStart) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.startGame) },
            ...{ class: "texture-button texture-button--large texture-button--red" },
            type: "button",
            disabled: (__VLS_ctx.busy || !__VLS_ctx.canUseConvex || !__VLS_ctx.canStartMatch),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.t('customGame.start'));
    }
}
if (__VLS_ctx.statusMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "custom-game-status" },
    });
    (__VLS_ctx.statusMessage);
}
if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "custom-game-status custom-game-status--error" },
    });
    (__VLS_ctx.errorMessage);
}
/** @type {__VLS_StyleScopedClasses['custom-game-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-screen__background']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-title']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-shell--room']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--small']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--small']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-toolbar__spacer']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-input']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-input']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-toolbar__spacer']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--small']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-board']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-board--room-list']} */ ;
/** @type {__VLS_StyleScopedClasses['room-list-header']} */ ;
/** @type {__VLS_StyleScopedClasses['room-list-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['room-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--large']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--red']} */ ;
/** @type {__VLS_StyleScopedClasses['room-list-join']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-board']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-board--room']} */ ;
/** @type {__VLS_StyleScopedClasses['room-detail-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['room-player-list']} */ ;
/** @type {__VLS_StyleScopedClasses['room-player-row']} */ ;
/** @type {__VLS_StyleScopedClasses['room-player-row__host']} */ ;
/** @type {__VLS_StyleScopedClasses['room-player-row__ready']} */ ;
/** @type {__VLS_StyleScopedClasses['room-player-row__waiting']} */ ;
/** @type {__VLS_StyleScopedClasses['room-invite-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['room-action-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--large']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--wood']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--large']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--wood']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--large']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--large']} */ ;
/** @type {__VLS_StyleScopedClasses['texture-button--red']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-status']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-status']} */ ;
/** @type {__VLS_StyleScopedClasses['custom-game-status--error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            emit: emit,
            titleAsset: titleAsset,
            roomView: roomView,
            selectedBrowserRoomId: selectedBrowserRoomId,
            selectedPlayerId: selectedPlayerId,
            inviteCodeInput: inviteCodeInput,
            inviteNameInput: inviteNameInput,
            statusMessage: statusMessage,
            errorMessage: errorMessage,
            busy: busy,
            customGameStyles: customGameStyles,
            canUseConvex: canUseConvex,
            isHost: isHost,
            isGuest: isGuest,
            roomStarted: roomStarted,
            canStartMatch: canStartMatch,
            roomPlayers: roomPlayers,
            selectedPlayer: selectedPlayer,
            selectedCountLabel: selectedCountLabel,
            canShowStart: canShowStart,
            canAddBot: canAddBot,
            createDisabled: createDisabled,
            joinDisabled: joinDisabled,
            toolbarActionDisabled: toolbarActionDisabled,
            roomBrowserRows: roomBrowserRows,
            createRoom: createRoom,
            joinRoom: joinRoom,
            selectBrowserRoom: selectBrowserRoom,
            queueInvite: queueInvite,
            leaveRoom: leaveRoom,
            toggleMyReady: toggleMyReady,
            refreshRoomFromToolbar: refreshRoomFromToolbar,
            addBot: addBot,
            startGame: startGame,
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
