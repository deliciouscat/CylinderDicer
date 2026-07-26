/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { useAuth } from '@clerk/vue';
import { useConvexClient } from 'convex-vue';
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue';
import { createAdminMatchService, } from '../services/convex/adminMatchService';
const emit = defineEmits();
const convex = useConvexClient();
const auth = useAuth();
const adminService = createAdminMatchService(convex);
const matches = ref([]);
const customRooms = ref([]);
const selectedMatchId = ref('');
const selectedRoomId = ref('');
const detail = ref(null);
const roomDetail = ref(null);
const selectedPlayerId = ref('');
const selectedRoomPlayerId = ref('');
const roomMatchId = ref('');
const status = ref('Loading admin controller...');
const errorMessage = ref('');
const busy = ref(false);
const ladderQaBusy = ref(false);
const bidCount = ref(1);
const bidFace = ref(2);
const bidFaceOptions = [
    { value: 1, label: 'Skull (1)' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
    { value: 6, label: '6' },
];
const lastCommandLine = ref('');
const adminAccess = ref(null);
const auditRows = ref([]);
const ladderQaSession = ref(null);
const initialMatchId = new URLSearchParams(window.location.search).get('matchId') ?? '';
const initialRoomId = new URLSearchParams(window.location.search).get('roomId') ?? '';
let loadedOnce = false;
let commandCounter = 0;
let matchUnsubscribe;
let roomUnsubscribe;
let ladderQaUnsubscribe;
let matchDetailRequest = 0;
let pendingMatchDetailId = '';
const DEV_MATCH_PURGE_MAX_ATTEMPTS = 24;
const isSignedIn = computed(() => auth.isSignedIn.value === true);
const canUseAdmin = computed(() => auth.isLoaded.value && isSignedIn.value && adminAccess.value?.authorized === true);
const adminAccessMessage = computed(() => {
    if (!auth.isLoaded.value) {
        return 'Waiting for Clerk...';
    }
    if (!isSignedIn.value) {
        return 'Sign in to use admin opponent controller.';
    }
    if (!adminAccess.value) {
        return 'Checking admin access...';
    }
    if (adminAccess.value.authorized) {
        return 'Admin access granted.';
    }
    return adminAccess.value.hint ?? `${adminAccess.value.code}: ${adminAccess.value.message ?? 'admin_access_denied'}`;
});
const participants = computed(() => detail.value?.participants ?? []);
const roomParticipants = computed(() => roomDetail.value?.participants ?? []);
const virtualRoomParticipants = computed(() => {
    return roomParticipants.value.filter((participant) => participant.participantKind === 'virtual');
});
const selectedRoomParticipant = computed(() => {
    return virtualRoomParticipants.value.find((participant) => participant.playerId === selectedRoomPlayerId.value);
});
const selectedRoomRow = computed(() => {
    return customRooms.value.find((row) => row.room?._id === selectedRoomId.value) ?? null;
});
const selectedRoomStarted = computed(() => {
    return (roomDetail.value?.room?.status ?? selectedRoomRow.value?.room?.status) === 'started';
});
const selectedRoomMatchId = computed(() => {
    if (!selectedRoomStarted.value) {
        return '';
    }
    return roomMatchId.value
        || roomDetail.value?.room?.matchId
        || selectedRoomRow.value?.room?.matchId
        || '';
});
const activeMatchId = computed(() => selectedMatchId.value || selectedRoomMatchId.value);
const botParticipants = computed(() => participants.value.filter((participant) => participant.isBot));
const selectedParticipant = computed(() => {
    return participants.value.find((participant) => participant.playerId === selectedPlayerId.value);
});
const selectedDelta = computed(() => {
    return detail.value?.playerDeltas?.[selectedPlayerId.value] ?? null;
});
const availableActions = computed(() => {
    return (selectedDelta.value?.availableActions ?? []);
});
const currentPlayer = computed(() => {
    return detail.value?.state?.players?.byId?.[selectedPlayerId.value] ?? null;
});
const phaseLabel = computed(() => detail.value?.state?.flow?.phase ?? 'unknown');
const activePlayerId = computed(() => detail.value?.state?.turn?.activePlayerId ?? '');
const pendingLoad = computed(() => detail.value?.state?.pendingLoad ?? null);
const composingRooms = computed(() => {
    return customRooms.value.filter((row) => row.room?.status === 'composing');
});
const startedRooms = computed(() => {
    return customRooms.value.filter((row) => row.room?.status === 'started');
});
const humanRoomParticipants = computed(() => {
    return roomParticipants.value.filter((participant) => participant.participantKind === 'human');
});
const qaSteps = computed(() => {
    const roomReady = roomDetail.value?.allReady === true;
    const matchSelected = Boolean(activeMatchId.value && detail.value?.ok === true);
    const phase = detail.value?.state?.flow?.phase ?? '';
    return [
        { id: 'room-ready', label: 'Room: all opponents ready', done: roomReady },
        { id: 'match-linked', label: 'Match: linked in play tab', done: matchSelected },
        { id: 'setup', label: 'Gameplay: past setup reload', done: phase !== '' && phase !== 'revolver_reload' },
        { id: 'shake', label: 'Gameplay: shake phase reached', done: ['dice_check', 'bidding_gap', 'bidding', 'duel', 'complete'].includes(phase) },
        { id: 'bidding', label: 'Gameplay: bidding reached', done: ['bidding', 'duel', 'complete'].includes(phase) },
        { id: 'complete', label: 'Gameplay: match complete', done: phase === 'complete' || detail.value?.state?.match?.status === 'complete' },
    ];
});
const ladderQaCanAdd = computed(() => {
    const session = ladderQaSession.value;
    if (!session)
        return false;
    return session.status === 'waiting_for_player'
        ? session.pendingOpponents.length < session.maxPlayerCount - 1
        : session.playerCount < session.maxPlayerCount;
});
const playMatchUrl = computed(() => {
    if (!activeMatchId.value) {
        return '';
    }
    return `/play/dev?matchId=${encodeURIComponent(activeMatchId.value)}`;
});
function roomLabel(row) {
    const id = row.room?._id?.slice(-6) ?? 'room';
    const ready = row.allReady ? 'ready' : 'waiting';
    const status = row.room?.status ?? 'composing';
    return `${id} · ${status} · ${ready}`;
}
function preferredBotPlayerId(state) {
    if (!state?.state) {
        return '';
    }
    const bots = (state.participants ?? []).filter((participant) => participant.isBot);
    const pendingPlayerId = state.state.pendingLoad?.playerId;
    const activeId = state.state.turn?.activePlayerId;
    const pendingBot = bots.find((participant) => participant.playerId === pendingPlayerId);
    const hasActions = (playerId) => {
        return (state.playerDeltas?.[playerId]?.availableActions?.length ?? 0) > 0;
    };
    const activeBot = bots.find((participant) => participant.playerId === activeId && hasActions(participant.playerId));
    const actionableBot = bots.find((participant) => hasActions(participant.playerId));
    return pendingBot?.playerId ?? activeBot?.playerId ?? actionableBot?.playerId ?? bots[0]?.playerId ?? '';
}
function applyMatchDetail(next) {
    if (!next) {
        detail.value = null;
        return;
    }
    detail.value = next;
    if (next.ok === false) {
        errorMessage.value = `${next.code ?? 'ADMIN_ERROR'}: ${next.message ?? 'admin_error'}`;
        return;
    }
    const preferred = preferredBotPlayerId(next);
    const selectedStillExists = botParticipants.value.some((participant) => {
        return participant.playerId === selectedPlayerId.value;
    });
    const selectedHasActions = (next.playerDeltas?.[selectedPlayerId.value]?.availableActions?.length ?? 0) > 0;
    if (selectedStillExists && selectedHasActions) {
        // Keep the operator on the bot they are actively controlling.
    }
    else if (preferred) {
        selectedPlayerId.value = preferred;
    }
    else if (!selectedStillExists) {
        selectedPlayerId.value = botParticipants.value[0]?.playerId ?? '';
    }
    syncSuggestedBid();
}
function applyRoomDetail(next) {
    if (!next) {
        roomDetail.value = null;
        roomMatchId.value = '';
        return;
    }
    roomDetail.value = next;
    roomMatchId.value = next.room?.matchId ?? '';
    if (next.ok === false) {
        errorMessage.value = `${next.code ?? 'ROOM_ERROR'}: ${next.message ?? 'room_error'}`;
        return;
    }
    const selectedStillExists = virtualRoomParticipants.value.some((participant) => {
        return participant.playerId === selectedRoomPlayerId.value;
    });
    if (!selectedStillExists) {
        const firstVirtualPlayerId = virtualRoomParticipants.value[0]?.playerId ?? '';
        selectedRoomPlayerId.value = firstVirtualPlayerId;
        if (!selectedPlayerId.value) {
            selectedPlayerId.value = firstVirtualPlayerId;
        }
    }
    else if (selectedRoomPlayerId.value && !selectedPlayerId.value) {
        selectedPlayerId.value = selectedRoomPlayerId.value;
    }
    const linkedMatchId = next.room?.status === 'started' ? next.room.matchId ?? '' : '';
    if (linkedMatchId
        && detail.value?.match?._id !== linkedMatchId
        && pendingMatchDetailId !== linkedMatchId) {
        void loadDetail(linkedMatchId);
    }
}
function updateMatchIdInUrl(matchId) {
    const url = new URL(window.location.href);
    if (matchId) {
        url.searchParams.set('matchId', matchId);
        url.searchParams.delete('roomId');
    }
    else {
        url.searchParams.delete('matchId');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}
function updateRoomIdInUrl(roomId) {
    const url = new URL(window.location.href);
    if (roomId) {
        url.searchParams.set('roomId', roomId);
        url.searchParams.delete('matchId');
    }
    else {
        url.searchParams.delete('roomId');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}
function subscribeMatchDetail(matchId) {
    matchUnsubscribe?.();
    matchUnsubscribe = adminService.subscribeAdminMatchState(matchId, (next) => applyMatchDetail(next), (error) => {
        errorMessage.value = error.message;
    });
}
function subscribeRoomDetail(roomId) {
    roomUnsubscribe?.();
    roomUnsubscribe = adminService.subscribeAdminCustomGameRoom(roomId, (next) => applyRoomDetail(next), (error) => {
        errorMessage.value = error.message;
    });
}
function generateCommandId(type) {
    commandCounter += 1;
    return `admin-${Date.now()}-${commandCounter}-${type}`;
}
function matchLabel(row) {
    const id = row.match._id.slice(-6);
    return `${id} · r${row.match.revision}`;
}
function playerLabel(participant) {
    return participant.displayName ?? participant.playerId;
}
function roomPlayerLabel(participant) {
    return participant.displayName ?? participant.playerId;
}
function openStartedRoomMatch(row) {
    const matchId = row.room?.matchId;
    if (!matchId) {
        return;
    }
    selectMatch(matchId);
}
function selectMatch(matchId) {
    selectedMatchId.value = matchId;
    selectedRoomId.value = '';
    roomMatchId.value = '';
    roomDetail.value = null;
    roomUnsubscribe?.();
    roomUnsubscribe = undefined;
}
function selectRoom(roomId, matchId = '') {
    selectedRoomId.value = roomId;
    selectedMatchId.value = '';
    roomMatchId.value = matchId;
    detail.value = null;
    matchUnsubscribe?.();
    matchUnsubscribe = undefined;
}
function openPlayMatch() {
    if (!playMatchUrl.value) {
        return;
    }
    window.open(playMatchUrl.value, '_blank', 'noopener,noreferrer');
}
function openCustomGame() {
    window.open('/play/custom-game', '_blank', 'noopener,noreferrer');
}
function syncSuggestedBid() {
    const bidAction = availableActions.value.find((action) => action.type === 'bid');
    if (!bidAction?.suggested) {
        return;
    }
    bidCount.value = Math.max(1, Number(bidAction.suggested.count ?? bidCount.value));
    bidFace.value = Math.max(1, Math.min(6, Number(bidAction.suggested.face ?? bidFace.value)));
}
async function loadAdminAccess() {
    if (!auth.isLoaded.value || !isSignedIn.value) {
        adminAccess.value = null;
        return;
    }
    try {
        adminAccess.value = await adminService.probeAdminAccess();
    }
    catch (error) {
        adminAccess.value = {
            ok: false,
            authorized: false,
            code: 'ADMIN_PROBE_FAILED',
            message: error instanceof Error ? error.message : String(error),
        };
    }
}
async function loadAuditRows() {
    if (!adminAccess.value?.authorized) {
        auditRows.value = [];
        return;
    }
    try {
        auditRows.value = await adminService.listRecentAdminAudit({
            limit: 12,
            matchId: activeMatchId.value || undefined,
            customGameRoomId: selectedRoomId.value || undefined,
        });
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
}
function subscribeLadderQaSession() {
    ladderQaUnsubscribe?.();
    ladderQaUnsubscribe = adminService.subscribeLatestLadderQaSession((session) => {
        ladderQaSession.value = session;
    }, (error) => {
        errorMessage.value = error.message;
    });
}
async function loadLadderQaSession() {
    if (!adminAccess.value?.authorized) {
        ladderQaSession.value = null;
        ladderQaUnsubscribe?.();
        ladderQaUnsubscribe = undefined;
        return;
    }
    ladderQaSession.value = await adminService.getLatestLadderQaSession();
    subscribeLadderQaSession();
}
async function loadMatches() {
    if (!adminAccess.value?.authorized) {
        return;
    }
    errorMessage.value = '';
    matches.value = await adminService.listAdminDevMatches({ status: 'ready', limit: 25 });
    if (!selectedRoomId.value && !selectedMatchId.value && initialMatchId) {
        selectedMatchId.value = initialMatchId;
    }
    if (!selectedRoomId.value && !selectedMatchId.value && matches.value[0]) {
        selectedMatchId.value = matches.value[0].match._id;
    }
    status.value = `${customRooms.value.length} custom rooms · ${matches.value.length} dev matches`;
}
async function loadCustomRooms() {
    if (!adminAccess.value?.authorized) {
        return;
    }
    const [composing, started] = await Promise.all([
        adminService.listAdminCustomGameRooms({ status: 'composing', limit: 25 }),
        adminService.listAdminCustomGameRooms({ status: 'started', limit: 15 }),
    ]);
    customRooms.value = [...composing, ...started];
    if (!selectedRoomId.value && !selectedMatchId.value) {
        if (initialRoomId) {
            selectedRoomId.value = initialRoomId;
        }
        else if (composing[0]?.room?._id) {
            selectedRoomId.value = composing[0].room._id;
        }
    }
}
async function loadDetail(requestedMatchId = activeMatchId.value) {
    const matchId = requestedMatchId;
    const request = ++matchDetailRequest;
    if (!matchId || !adminAccess.value?.authorized) {
        detail.value = null;
        matchUnsubscribe?.();
        matchUnsubscribe = undefined;
        return;
    }
    errorMessage.value = '';
    pendingMatchDetailId = matchId;
    try {
        const next = await adminService.getAdminMatchState(matchId);
        if (request !== matchDetailRequest || activeMatchId.value !== matchId) {
            return;
        }
        applyMatchDetail(next);
        subscribeMatchDetail(matchId);
    }
    finally {
        if (request === matchDetailRequest) {
            pendingMatchDetailId = '';
        }
    }
}
async function loadRoomDetail() {
    if (!selectedRoomId.value || !adminAccess.value?.authorized) {
        roomDetail.value = null;
        roomMatchId.value = '';
        roomUnsubscribe?.();
        roomUnsubscribe = undefined;
        return;
    }
    errorMessage.value = '';
    applyRoomDetail(await adminService.getAdminCustomGameRoom(selectedRoomId.value));
    subscribeRoomDetail(selectedRoomId.value);
}
async function createOrReuseDevMatch() {
    if (!adminAccess.value?.authorized) {
        status.value = adminAccessMessage.value;
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        const created = await adminService.createDevMatchWithBots({
            localPlayerName: 'Admin',
            requiresSetupLoad: true,
            reuseActive: true,
        });
        selectedMatchId.value = created.matchId;
        await loadMatches();
        await loadDetail();
        status.value = 'Standalone dev match ready';
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
async function dismissDevMatch(matchId, bulk = false) {
    if (!adminAccess.value?.authorized || !matchId) {
        return false;
    }
    if (!bulk && !window.confirm('Permanently remove this ready dev match and its QA game data?')) {
        return false;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        const completion = await adminService.dismissReadyDevMatch(matchId);
        if (completion.ok === false) {
            errorMessage.value = `${completion.code ?? 'DEV_MATCH_REMOVE_REJECTED'}`;
            return false;
        }
        let purgeResult = null;
        for (let attempt = 0; attempt < DEV_MATCH_PURGE_MAX_ATTEMPTS; attempt += 1) {
            purgeResult = await adminService.purgeCompletedDevMatchData({ matchId });
            if (purgeResult.ok === false) {
                errorMessage.value = `${purgeResult.code ?? 'DEV_MATCH_PURGE_REJECTED'}`;
                return false;
            }
            if (!purgeResult.mayHaveMore) {
                break;
            }
        }
        if (!purgeResult || purgeResult.mayHaveMore || !purgeResult.parentDeleted?.match) {
            errorMessage.value = 'DEV_MATCH_PURGE_INCOMPLETE';
            return false;
        }
        if (selectedMatchId.value === matchId) {
            selectedMatchId.value = '';
            detail.value = null;
            matchUnsubscribe?.();
            matchUnsubscribe = undefined;
        }
        status.value = 'Dev match and QA game data permanently removed';
        lastCommandLine.value = `purge dev match ok · completion audit ${completion.auditId ?? '-'} · purge audit ${purgeResult.auditId ?? '-'}`;
        await loadMatches();
        await loadDetail();
        await loadAuditRows();
        return true;
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
        return false;
    }
    finally {
        busy.value = false;
    }
}
async function dismissAllDevMatches() {
    if (matches.value.length === 0) {
        return;
    }
    if (!window.confirm(`Permanently remove all ${matches.value.length} ready dev matches and their QA game data?`)) {
        return;
    }
    const matchIds = matches.value.map((row) => row.match._id);
    for (const matchId of matchIds) {
        const removed = await dismissDevMatch(matchId, true);
        if (!removed) {
            break;
        }
    }
}
async function refreshAll() {
    busy.value = true;
    errorMessage.value = '';
    try {
        await loadAdminAccess();
        if (!adminAccess.value?.authorized) {
            status.value = adminAccessMessage.value;
            matches.value = [];
            customRooms.value = [];
            detail.value = null;
            roomDetail.value = null;
            roomMatchId.value = '';
            auditRows.value = [];
            return;
        }
        await loadCustomRooms();
        await loadLadderQaSession();
        await loadMatches();
        await loadRoomDetail();
        await loadDetail();
        await loadAuditRows();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
async function addLadderQaOpponent() {
    if (!ladderQaCanAdd.value || !adminAccess.value?.authorized) {
        return;
    }
    ladderQaBusy.value = true;
    errorMessage.value = '';
    try {
        const result = await adminService.addLadderQaOpponent();
        if (result.ok === false) {
            errorMessage.value = `${result.code ?? 'LADDER_QA_REJECTED'}`;
            lastCommandLine.value = `ladder opponent rejected · ${result.code ?? 'error'}`;
        }
        else {
            status.value = result.waitingForPlayer
                ? `${result.playerCount} Ladder QA bots waiting for a player`
                : `Ladder QA roster staged with ${result.playerCount} players`;
            lastCommandLine.value = `ladder opponent added · ${result.opponentDisplayName} · audit ${result.auditId ?? '-'}`;
        }
        await loadLadderQaSession();
        await loadAuditRows();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        ladderQaBusy.value = false;
    }
}
async function setSelectedRoomReady(ready) {
    if (!selectedRoomId.value || !selectedRoomPlayerId.value) {
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        const result = await adminService.setCustomGameOpponentReady({
            roomId: selectedRoomId.value,
            targetPlayerId: selectedRoomPlayerId.value,
            ready,
        });
        if (result.ok === false) {
            errorMessage.value = `${result.code ?? 'READY_REJECTED'}: ${result.message ?? 'ready_rejected'}`;
            lastCommandLine.value = `ready ${ready} rejected`;
        }
        else {
            status.value = `Set ${selectedRoomPlayerId.value} ${ready ? 'ready' : 'waiting'}`;
            lastCommandLine.value = `ready ${ready} ok · audit ${result.auditId ?? '-'}`;
        }
        await loadRoomDetail();
        await loadCustomRooms();
        await loadAuditRows();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
async function setAllRoomOpponentsReady(ready) {
    if (!selectedRoomId.value || virtualRoomParticipants.value.length === 0) {
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        for (const participant of virtualRoomParticipants.value) {
            const result = await adminService.setCustomGameOpponentReady({
                roomId: selectedRoomId.value,
                targetPlayerId: participant.playerId,
                ready,
            });
            if (result.ok === false) {
                errorMessage.value = `${result.code ?? 'READY_REJECTED'}: ${result.message ?? 'ready_rejected'}`;
                break;
            }
        }
        status.value = ready ? 'All virtual opponents ready' : 'All virtual opponents waiting';
        await loadRoomDetail();
        await loadCustomRooms();
        await loadAuditRows();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
async function closeSelectedStartedRoom() {
    if (!selectedRoomId.value || !selectedRoomStarted.value) {
        return;
    }
    if (!window.confirm('Close this started custom room?')) {
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        const closingRoomId = selectedRoomId.value;
        const result = await adminService.closeStartedCustomGameRoom(closingRoomId);
        if (result.ok === false) {
            errorMessage.value = `${result.code ?? 'CLOSE_ROOM_REJECTED'}: ${result.message ?? 'close_room_rejected'}`;
            lastCommandLine.value = `close room rejected · ${result.code ?? 'error'}`;
        }
        else {
            status.value = 'Started custom room closed';
            lastCommandLine.value = `close room ok · audit ${result.auditId ?? '-'}`;
            selectedRoomId.value = '';
            roomMatchId.value = '';
            roomDetail.value = null;
            roomUnsubscribe?.();
            roomUnsubscribe = undefined;
        }
        await loadCustomRooms();
        await loadMatches();
        await loadAuditRows();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
function commandTypeForLoad() {
    return pendingLoad.value?.source === 'setup' ? 'setup.load_initial' : 'bullet.load';
}
async function submitCommand(type, payload) {
    const matchId = activeMatchId.value;
    if (!detail.value?.state || !matchId || !selectedPlayerId.value) {
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        const revision = detail.value.state.revision;
        const result = await adminService.submitOpponentCommand({
            matchId,
            targetPlayerId: selectedPlayerId.value,
            commandId: generateCommandId(type),
            revision,
            type,
            payload,
        });
        if (result.ok === false) {
            errorMessage.value = `${result.code ?? 'COMMAND_REJECTED'}: ${result.message ?? 'command_rejected'}`;
            lastCommandLine.value = `${type} rejected · ${result.code ?? 'error'}`;
            if (result.code === 'STALE_REVISION') {
                await loadDetail();
                status.value = `Stale revision — refreshed to r${detail.value?.state?.revision ?? '?'}`;
            }
        }
        else {
            status.value = `Submitted ${type} · r${result.revision ?? detail.value.state.revision}`;
            lastCommandLine.value = `${type} ok · audit ${result.auditId ?? '-'} · r${result.revision ?? '-'}`;
        }
        await loadDetail();
        await loadMatches();
        await loadAuditRows();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
async function submitLoadAll() {
    const matchId = activeMatchId.value;
    if (!detail.value?.state?.pendingLoad || !matchId) {
        return;
    }
    busy.value = true;
    errorMessage.value = '';
    try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
            if (!detail.value?.state?.pendingLoad) {
                break;
            }
            const loadAction = availableActions.value.find((action) => action.type === 'load');
            const slot = loadAction?.slots?.[0];
            if (!slot) {
                break;
            }
            const revision = detail.value.state.revision;
            const result = await adminService.submitOpponentCommand({
                matchId,
                targetPlayerId: selectedPlayerId.value,
                commandId: generateCommandId(commandTypeForLoad()),
                revision,
                type: commandTypeForLoad(),
                payload: { slotIndex: slot },
            });
            if (result.ok === false) {
                errorMessage.value = `${result.code ?? 'COMMAND_REJECTED'}: ${result.message ?? 'command_rejected'}`;
                if (result.code === 'STALE_REVISION') {
                    await loadDetail();
                }
                break;
            }
            applyMatchDetail(await adminService.getAdminMatchState(matchId));
        }
        lastCommandLine.value = `load_all finished · r${detail.value?.state?.revision ?? '-'}`;
        await loadMatches();
    }
    catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error);
    }
    finally {
        busy.value = false;
    }
}
function submitAction(action) {
    if (action.type === 'load_all') {
        void submitLoadAll();
    }
    else if (action.type === 'shake_complete') {
        void submitCommand(action.command);
    }
    else if (action.type === 'check') {
        void submitCommand('dice.check');
    }
    else if (action.type === 'challenge') {
        void submitCommand('bid.challenge');
    }
}
function submitLoad(slotIndex) {
    void submitCommand(commandTypeForLoad(), { slotIndex });
}
function submitBid() {
    const face = Math.max(1, Math.min(6, Number(bidFace.value)));
    let count = Math.max(1, Math.min(36, Number(bidCount.value)));
    const currentBid = detail.value?.state?.bidding?.currentBid;
    if (face === 1 && currentBid && count * 10 + face <= currentBid.count * 10 + currentBid.face) {
        count = Math.min(36, currentBid.count + 1);
        bidCount.value = count;
    }
    void submitCommand('bid.raise', {
        bid: {
            playerId: selectedPlayerId.value,
            count,
            face,
        },
    });
}
watchEffect(() => {
    if (!auth.isLoaded.value) {
        return;
    }
    if (!isSignedIn.value) {
        convex.setAuth(async () => null);
        adminAccess.value = null;
        status.value = 'Sign in to use admin.';
        return;
    }
    convex.setAuth(async ({ forceRefreshToken }) => {
        return await auth.getToken.value({
            template: 'convex',
            skipCache: forceRefreshToken,
        });
    }, () => { });
});
watchEffect(() => {
    if (!auth.isLoaded.value || !isSignedIn.value || loadedOnce) {
        return;
    }
    loadedOnce = true;
    void refreshAll();
});
watch([selectedMatchId, selectedRoomId], () => {
    if (adminAccess.value?.authorized) {
        void loadAuditRows();
    }
});
watch(activeMatchId, () => {
    if (adminAccess.value?.authorized) {
        void loadDetail();
        void loadAuditRows();
    }
});
watch(selectedMatchId, () => {
    if (!selectedRoomId.value) {
        updateMatchIdInUrl(selectedMatchId.value);
    }
    void loadDetail();
});
watch(selectedRoomId, () => {
    updateRoomIdInUrl(selectedRoomId.value);
    void loadRoomDetail();
});
watch(selectedPlayerId, () => {
    syncSuggestedBid();
});
onMounted(() => {
    if (!auth.isLoaded.value) {
        status.value = 'Waiting for Clerk...';
    }
});
onUnmounted(() => {
    matchUnsubscribe?.();
    roomUnsubscribe?.();
    ladderQaUnsubscribe?.();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['opponent-controller__title']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__title']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__title']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__qa-list']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__qa-list']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__audit-list']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__audit-list']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__list-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match-row']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__matches']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__detail']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__state']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__state']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__bid']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__bid']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__bid']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__bid']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__header']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__layout']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__header']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__ladder-qa']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__matches']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__detail']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "opponent-controller" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "opponent-controller__header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('back');
        } },
    ...{ class: "opponent-controller__button" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "opponent-controller__title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.status);
if (!__VLS_ctx.adminAccess?.authorized) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "opponent-controller__warn" },
    });
    (__VLS_ctx.adminAccessMessage);
}
if (__VLS_ctx.lastCommandLine) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "opponent-controller__last" },
    });
    (__VLS_ctx.lastCommandLine);
}
if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "opponent-controller__error" },
    });
    (__VLS_ctx.errorMessage);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "opponent-controller__header-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.refreshAll) },
    ...{ class: "opponent-controller__button" },
    type: "button",
    disabled: (__VLS_ctx.busy),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openPlayMatch) },
    ...{ class: "opponent-controller__button" },
    type: "button",
    disabled: (!__VLS_ctx.playMatchUrl),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openCustomGame) },
    ...{ class: "opponent-controller__button" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.createOrReuseDevMatch) },
    ...{ class: "opponent-controller__button opponent-controller__button--primary" },
    type: "button",
    disabled: (__VLS_ctx.busy),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "opponent-controller__qa" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "opponent-controller__group-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "opponent-controller__qa-list" },
});
for (const [step] of __VLS_getVForSourceType((__VLS_ctx.qaSteps))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
        key: (step.id),
        ...{ class: ({ 'is-done': step.done }) },
    });
    (step.label);
}
if (__VLS_ctx.adminAccess?.authorized) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "opponent-controller__qa opponent-controller__ladder-qa" },
        'data-testid': "ladder-qa-panel",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "opponent-controller__group-label" },
    });
    if (__VLS_ctx.ladderQaSession?.status === 'player_joined') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__ladder-copy" },
            'data-testid': "ladder-qa-session",
        });
        (__VLS_ctx.ladderQaSession.displayName);
        (__VLS_ctx.ladderQaSession.playerCount);
        (__VLS_ctx.ladderQaSession.maxPlayerCount);
    }
    else if (__VLS_ctx.ladderQaSession) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__ladder-copy" },
            'data-testid': "ladder-qa-pool",
        });
        (__VLS_ctx.ladderQaSession.pendingOpponents.length);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__ladder-copy" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "opponent-controller__empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addLadderQaOpponent) },
        ...{ class: "opponent-controller__button opponent-controller__button--primary" },
        'data-testid': "add-ladder-opponent",
        type: "button",
        disabled: (__VLS_ctx.ladderQaBusy || !__VLS_ctx.ladderQaCanAdd),
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "opponent-controller__layout" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "opponent-controller__matches" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "opponent-controller__group-label" },
});
if (__VLS_ctx.composingRooms.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "opponent-controller__empty" },
    });
}
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.composingRooms))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                row.room?._id && __VLS_ctx.selectRoom(row.room._id, row.room.matchId ?? '');
            } },
        key: (row.room?._id),
        ...{ class: "opponent-controller__match" },
        ...{ class: ({ 'is-selected': __VLS_ctx.selectedRoomId === row.room?._id }) },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.roomLabel(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (row.participants?.length ?? 0);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "opponent-controller__group-label" },
});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.startedRooms))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                row.room?._id && __VLS_ctx.selectRoom(row.room._id, row.room.matchId ?? '');
            } },
        key: (`started-${row.room?._id}`),
        ...{ class: "opponent-controller__match" },
        ...{ class: ({ 'is-selected': __VLS_ctx.selectedRoomId === row.room?._id }) },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.roomLabel(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (row.room?.matchId?.slice(-6) ?? '-');
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "opponent-controller__group-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "opponent-controller__list-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "opponent-controller__empty" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.dismissAllDevMatches) },
    ...{ class: "opponent-controller__button opponent-controller__button--danger" },
    type: "button",
    disabled: (__VLS_ctx.busy || __VLS_ctx.matches.length === 0),
});
(__VLS_ctx.matches.length);
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.matches))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (row.match._id),
        ...{ class: "opponent-controller__match-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectMatch(row.match._id);
            } },
        ...{ class: "opponent-controller__match" },
        ...{ class: ({ 'is-selected': __VLS_ctx.selectedMatchId === row.match._id }) },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.matchLabel(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    (row.participants.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.dismissDevMatch(row.match._id);
            } },
        ...{ class: "opponent-controller__button opponent-controller__button--danger opponent-controller__remove-match" },
        type: "button",
        disabled: (__VLS_ctx.busy),
    });
}
if (__VLS_ctx.selectedRoomId) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "opponent-controller__detail" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "opponent-controller__meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.selectedRoomId.slice(-6));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.roomDetail?.room?.status ?? '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.roomDetail?.allReady ? 'all' : 'waiting');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.roomDetail?.room?.inviteCode ?? '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "opponent-controller__players" },
    });
    for (const [participant] of __VLS_getVForSourceType((__VLS_ctx.humanRoomParticipants))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            key: (participant.playerId),
            ...{ class: "opponent-controller__player opponent-controller__player--human" },
            type: "button",
            disabled: true,
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.roomPlayerLabel(participant));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (participant.playerId);
        (participant.ready ? 'ready' : 'waiting');
    }
    for (const [participant] of __VLS_getVForSourceType((__VLS_ctx.virtualRoomParticipants))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRoomId))
                        return;
                    __VLS_ctx.selectedRoomPlayerId = participant.playerId;
                    __VLS_ctx.selectedPlayerId = participant.playerId;
                } },
            key: (participant.playerId),
            ...{ class: "opponent-controller__player" },
            ...{ class: ({ 'is-selected': __VLS_ctx.selectedRoomPlayerId === participant.playerId }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.roomPlayerLabel(participant));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (participant.ready ? 'ready' : 'waiting');
    }
    if (__VLS_ctx.selectedRoomParticipant) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "opponent-controller__state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.roomPlayerLabel(__VLS_ctx.selectedRoomParticipant));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selectedRoomParticipant.archetype ?? 'virtual');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selectedRoomParticipant.playerId);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selectedRoomParticipant.ready ? 'yes' : 'no');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selectedRoomParticipant.seatIndex);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "opponent-controller__actions" },
    });
    if (!__VLS_ctx.selectedRoomStarted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRoomId))
                        return;
                    if (!(!__VLS_ctx.selectedRoomStarted))
                        return;
                    __VLS_ctx.setAllRoomOpponentsReady(true);
                } },
            ...{ class: "opponent-controller__button opponent-controller__button--primary" },
            type: "button",
            disabled: (__VLS_ctx.busy || __VLS_ctx.virtualRoomParticipants.length === 0),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRoomId))
                        return;
                    if (!(!__VLS_ctx.selectedRoomStarted))
                        return;
                    __VLS_ctx.setAllRoomOpponentsReady(false);
                } },
            ...{ class: "opponent-controller__button" },
            type: "button",
            disabled: (__VLS_ctx.busy || __VLS_ctx.virtualRoomParticipants.length === 0),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRoomId))
                        return;
                    if (!(!__VLS_ctx.selectedRoomStarted))
                        return;
                    __VLS_ctx.setSelectedRoomReady(true);
                } },
            ...{ class: "opponent-controller__button opponent-controller__button--primary" },
            type: "button",
            disabled: (__VLS_ctx.busy || !__VLS_ctx.selectedRoomParticipant),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRoomId))
                        return;
                    if (!(!__VLS_ctx.selectedRoomStarted))
                        return;
                    __VLS_ctx.setSelectedRoomReady(false);
                } },
            ...{ class: "opponent-controller__button" },
            type: "button",
            disabled: (__VLS_ctx.busy || !__VLS_ctx.selectedRoomParticipant),
        });
    }
    if (__VLS_ctx.activeMatchId) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedRoomId))
                        return;
                    if (!(__VLS_ctx.activeMatchId))
                        return;
                    __VLS_ctx.selectMatch(__VLS_ctx.activeMatchId);
                } },
            ...{ class: "opponent-controller__button" },
            type: "button",
        });
    }
    if (__VLS_ctx.selectedRoomStarted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.closeSelectedStartedRoom) },
            ...{ class: "opponent-controller__button opponent-controller__button--danger" },
            type: "button",
            disabled: (__VLS_ctx.busy),
        });
    }
    if (__VLS_ctx.virtualRoomParticipants.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__empty" },
        });
    }
    if (__VLS_ctx.selectedRoomStarted) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "opponent-controller__started-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__group-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "opponent-controller__meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.activeMatchId ? __VLS_ctx.activeMatchId.slice(-6) : 'none');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.phaseLabel);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.activePlayerId || 'none');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.detail?.state?.revision ?? '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "opponent-controller__players" },
        });
        for (const [participant] of __VLS_getVForSourceType((__VLS_ctx.botParticipants))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedRoomId))
                            return;
                        if (!(__VLS_ctx.selectedRoomStarted))
                            return;
                        __VLS_ctx.selectedPlayerId = participant.playerId;
                    } },
                key: (`started-match-${participant.playerId}`),
                ...{ class: "opponent-controller__player" },
                ...{ class: ({
                        'is-selected': __VLS_ctx.selectedPlayerId === participant.playerId,
                        'is-active-turn': __VLS_ctx.activePlayerId === participant.playerId,
                        'is-pending-load': __VLS_ctx.pendingLoad?.playerId === participant.playerId,
                    }) },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.playerLabel(participant));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (participant.playerId);
        }
        if (__VLS_ctx.selectedParticipant) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "opponent-controller__state" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.playerLabel(__VLS_ctx.selectedParticipant));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.currentPlayer?.hp ?? '-');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.currentPlayer?.bullets ?? '-');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.selectedDelta?.dice?.join(', ') || '-');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.availableActions.length);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "opponent-controller__actions" },
        });
        for (const [action] of __VLS_getVForSourceType((__VLS_ctx.availableActions))) {
            (`started-${action.type}`);
            if (action.type === 'load') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "opponent-controller__load" },
                });
                for (const [slot] of __VLS_getVForSourceType((action.slots))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.selectedRoomId))
                                    return;
                                if (!(__VLS_ctx.selectedRoomStarted))
                                    return;
                                if (!(action.type === 'load'))
                                    return;
                                __VLS_ctx.submitLoad(slot);
                            } },
                        key: (`started-slot-${slot}`),
                        ...{ class: "opponent-controller__button" },
                        type: "button",
                        disabled: (__VLS_ctx.busy),
                    });
                    (slot);
                }
            }
            else if (action.type === 'load_all') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.selectedRoomId))
                                return;
                            if (!(__VLS_ctx.selectedRoomStarted))
                                return;
                            if (!!(action.type === 'load'))
                                return;
                            if (!(action.type === 'load_all'))
                                return;
                            __VLS_ctx.submitAction(action);
                        } },
                    ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                    type: "button",
                    disabled: (__VLS_ctx.busy),
                });
            }
            else if (action.type === 'bid') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "opponent-controller__bid" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    type: "number",
                    min: "1",
                    max: "36",
                });
                (__VLS_ctx.bidCount);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                    value: (__VLS_ctx.bidFace),
                });
                for (const [face] of __VLS_getVForSourceType((__VLS_ctx.bidFaceOptions))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                        key: (face.value),
                        value: (face.value),
                    });
                    (face.label);
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (__VLS_ctx.submitBid) },
                    ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                    type: "button",
                    disabled: (__VLS_ctx.busy),
                });
            }
            else if (action.type === 'shake_complete') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.selectedRoomId))
                                return;
                            if (!(__VLS_ctx.selectedRoomStarted))
                                return;
                            if (!!(action.type === 'load'))
                                return;
                            if (!!(action.type === 'load_all'))
                                return;
                            if (!!(action.type === 'bid'))
                                return;
                            if (!(action.type === 'shake_complete'))
                                return;
                            __VLS_ctx.submitAction(action);
                        } },
                    ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                    type: "button",
                    disabled: (__VLS_ctx.busy),
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.selectedRoomId))
                                return;
                            if (!(__VLS_ctx.selectedRoomStarted))
                                return;
                            if (!!(action.type === 'load'))
                                return;
                            if (!!(action.type === 'load_all'))
                                return;
                            if (!!(action.type === 'bid'))
                                return;
                            if (!!(action.type === 'shake_complete'))
                                return;
                            __VLS_ctx.submitAction(action);
                        } },
                    ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                    type: "button",
                    disabled: (__VLS_ctx.busy),
                });
                (action.type);
            }
        }
        if (__VLS_ctx.activeMatchId && !__VLS_ctx.detail) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "opponent-controller__empty" },
            });
        }
        if (__VLS_ctx.detail && __VLS_ctx.selectedPlayerId && __VLS_ctx.availableActions.length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "opponent-controller__empty" },
            });
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "opponent-controller__detail" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "opponent-controller__meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.selectedMatchId ? __VLS_ctx.selectedMatchId.slice(-6) : 'none');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.phaseLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.activePlayerId || 'none');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.detail?.state?.revision ?? '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "opponent-controller__players" },
    });
    for (const [participant] of __VLS_getVForSourceType((__VLS_ctx.botParticipants))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.selectedRoomId))
                        return;
                    __VLS_ctx.selectedPlayerId = participant.playerId;
                } },
            key: (participant.playerId),
            ...{ class: "opponent-controller__player" },
            ...{ class: ({
                    'is-selected': __VLS_ctx.selectedPlayerId === participant.playerId,
                    'is-active-turn': __VLS_ctx.activePlayerId === participant.playerId,
                    'is-pending-load': __VLS_ctx.pendingLoad?.playerId === participant.playerId,
                }) },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.playerLabel(participant));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (participant.playerId);
    }
    if (__VLS_ctx.selectedParticipant) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "opponent-controller__state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.playerLabel(__VLS_ctx.selectedParticipant));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.currentPlayer?.hp ?? '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.currentPlayer?.bullets ?? '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.selectedDelta?.dice?.join(', ') || '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.availableActions.length);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "opponent-controller__actions" },
    });
    for (const [action] of __VLS_getVForSourceType((__VLS_ctx.availableActions))) {
        (action.type);
        if (action.type === 'load') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "opponent-controller__load" },
            });
            for (const [slot] of __VLS_getVForSourceType((action.slots))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.selectedRoomId))
                                return;
                            if (!(action.type === 'load'))
                                return;
                            __VLS_ctx.submitLoad(slot);
                        } },
                    key: (slot),
                    ...{ class: "opponent-controller__button" },
                    type: "button",
                    disabled: (__VLS_ctx.busy),
                });
                (slot);
            }
        }
        else if (action.type === 'load_all') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.selectedRoomId))
                            return;
                        if (!!(action.type === 'load'))
                            return;
                        if (!(action.type === 'load_all'))
                            return;
                        __VLS_ctx.submitAction(action);
                    } },
                ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                type: "button",
                disabled: (__VLS_ctx.busy),
            });
        }
        else if (action.type === 'bid') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "opponent-controller__bid" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                type: "number",
                min: "1",
                max: "36",
            });
            (__VLS_ctx.bidCount);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                value: (__VLS_ctx.bidFace),
            });
            for (const [face] of __VLS_getVForSourceType((__VLS_ctx.bidFaceOptions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    key: (face.value),
                    value: (face.value),
                });
                (face.label);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.submitBid) },
                ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                type: "button",
                disabled: (__VLS_ctx.busy),
            });
        }
        else if (action.type === 'shake_complete') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.selectedRoomId))
                            return;
                        if (!!(action.type === 'load'))
                            return;
                        if (!!(action.type === 'load_all'))
                            return;
                        if (!!(action.type === 'bid'))
                            return;
                        if (!(action.type === 'shake_complete'))
                            return;
                        __VLS_ctx.submitAction(action);
                    } },
                ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                type: "button",
                disabled: (__VLS_ctx.busy),
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.selectedRoomId))
                            return;
                        if (!!(action.type === 'load'))
                            return;
                        if (!!(action.type === 'load_all'))
                            return;
                        if (!!(action.type === 'bid'))
                            return;
                        if (!!(action.type === 'shake_complete'))
                            return;
                        __VLS_ctx.submitAction(action);
                    } },
                ...{ class: "opponent-controller__button opponent-controller__button--primary" },
                type: "button",
                disabled: (__VLS_ctx.busy),
            });
            (action.type);
        }
    }
    if (__VLS_ctx.activeMatchId && !__VLS_ctx.detail) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__empty" },
        });
    }
    if (__VLS_ctx.detail && __VLS_ctx.selectedPlayerId && __VLS_ctx.availableActions.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__empty" },
        });
    }
}
if (__VLS_ctx.adminAccess?.authorized) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "opponent-controller__audit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "opponent-controller__group-label" },
    });
    if (__VLS_ctx.auditRows.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
            ...{ class: "opponent-controller__audit-list" },
        });
        for (const [row] of __VLS_getVForSourceType((__VLS_ctx.auditRows))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (row._id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (row.commandType ?? 'action');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (row.resultOk ? 'ok' : row.resultCode ?? 'reject');
            if (row.targetPlayerId) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (row.targetPlayerId);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (new Date(row.createdAt).toLocaleTimeString());
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "opponent-controller__empty" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['opponent-controller']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__header']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__title']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__warn']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__last']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__error']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__qa']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__qa-list']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__qa']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__ladder-qa']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__ladder-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__ladder-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__ladder-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__layout']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__matches']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__list-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--danger']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match-row']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__match']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--danger']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__remove-match']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__detail']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__players']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player--human']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__state']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--danger']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__started-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__players']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__state']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__load']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__bid']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__detail']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__meta']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__players']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__player']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__state']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__load']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__bid']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__audit']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__group-label']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__audit-list']} */ ;
/** @type {__VLS_StyleScopedClasses['opponent-controller__empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            matches: matches,
            selectedMatchId: selectedMatchId,
            selectedRoomId: selectedRoomId,
            detail: detail,
            roomDetail: roomDetail,
            selectedPlayerId: selectedPlayerId,
            selectedRoomPlayerId: selectedRoomPlayerId,
            status: status,
            errorMessage: errorMessage,
            busy: busy,
            ladderQaBusy: ladderQaBusy,
            bidCount: bidCount,
            bidFace: bidFace,
            bidFaceOptions: bidFaceOptions,
            lastCommandLine: lastCommandLine,
            adminAccess: adminAccess,
            auditRows: auditRows,
            ladderQaSession: ladderQaSession,
            adminAccessMessage: adminAccessMessage,
            virtualRoomParticipants: virtualRoomParticipants,
            selectedRoomParticipant: selectedRoomParticipant,
            selectedRoomStarted: selectedRoomStarted,
            activeMatchId: activeMatchId,
            botParticipants: botParticipants,
            selectedParticipant: selectedParticipant,
            selectedDelta: selectedDelta,
            availableActions: availableActions,
            currentPlayer: currentPlayer,
            phaseLabel: phaseLabel,
            activePlayerId: activePlayerId,
            pendingLoad: pendingLoad,
            composingRooms: composingRooms,
            startedRooms: startedRooms,
            humanRoomParticipants: humanRoomParticipants,
            qaSteps: qaSteps,
            ladderQaCanAdd: ladderQaCanAdd,
            playMatchUrl: playMatchUrl,
            roomLabel: roomLabel,
            matchLabel: matchLabel,
            playerLabel: playerLabel,
            roomPlayerLabel: roomPlayerLabel,
            selectMatch: selectMatch,
            selectRoom: selectRoom,
            openPlayMatch: openPlayMatch,
            openCustomGame: openCustomGame,
            createOrReuseDevMatch: createOrReuseDevMatch,
            dismissDevMatch: dismissDevMatch,
            dismissAllDevMatches: dismissAllDevMatches,
            refreshAll: refreshAll,
            addLadderQaOpponent: addLadderQaOpponent,
            setSelectedRoomReady: setSelectedRoomReady,
            setAllRoomOpponentsReady: setAllRoomOpponentsReady,
            closeSelectedStartedRoom: closeSelectedStartedRoom,
            submitAction: submitAction,
            submitLoad: submitLoad,
            submitBid: submitBid,
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
