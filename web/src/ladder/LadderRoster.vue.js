import { computed, onMounted, onUnmounted, ref } from 'vue';
import { t } from '../i18n';
import RosterPlayerCard from './components/RosterPlayerCard.vue';
import { rosterDensity } from './ladder.logic';
const props = withDefaults(defineProps(), {
    countdownSeconds: 3,
});
const emit = defineEmits();
const seconds = ref(props.countdownSeconds);
const finished = ref(false);
const density = computed(() => rosterDensity(props.players.length));
let countdownTimer;
function finish() {
    if (finished.value)
        return;
    finished.value = true;
    window.clearInterval(countdownTimer);
    emit('ready');
}
onMounted(() => {
    countdownTimer = window.setInterval(() => {
        seconds.value -= 1;
        if (seconds.value <= 0)
            finish();
    }, 1000);
});
onUnmounted(() => window.clearInterval(countdownTimer));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    countdownSeconds: 3,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "ladder-roster" },
    'aria-labelledby': "ladder-roster-title",
    'data-testid': "ladder-roster",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    id: "ladder-roster-title",
    ...{ class: "ladder-roster__eyebrow" },
});
(__VLS_ctx.t('ladder.matchFound'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ladder-roster__players" },
    ...{ class: (`ladder-roster__players--${__VLS_ctx.density}`) },
    ...{ style: ({ '--roster-count': __VLS_ctx.players.length }) },
    role: "list",
    'aria-label': (__VLS_ctx.t('ladder.rosterLabel')),
    'data-testid': "ladder-roster-players",
});
for (const [player] of __VLS_getVForSourceType((__VLS_ctx.players))) {
    /** @type {[typeof RosterPlayerCard, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(RosterPlayerCard, new RosterPlayerCard({
        key: (player.playerId),
        player: (player),
    }));
    const __VLS_1 = __VLS_0({
        key: (player.playerId),
        player: (player),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.finish) },
    ...{ class: "ladder-ready" },
    type: "button",
    'data-testid': "ladder-ready",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.t('ladder.ready'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.seconds);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
    'aria-live': "polite",
});
(__VLS_ctx.t('ladder.countdown', { seconds: String(__VLS_ctx.seconds) }));
/** @type {__VLS_StyleScopedClasses['ladder-roster']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-roster__eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-roster__players']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-ready']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            RosterPlayerCard: RosterPlayerCard,
            seconds: seconds,
            density: density,
            finish: finish,
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
