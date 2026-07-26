/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onUnmounted, ref } from 'vue';
import { assetLoader } from '../../assets/assetLoader';
import { t } from '../../i18n';
const props = defineProps();
const emit = defineEmits();
const diceAssets = Array.from({ length: 6 }, (_, index) => assetLoader(`ladder-die-${index + 1}`));
const face = ref(6);
const rolling = ref(false);
const debugIndex = ref(0);
const pointerStart = ref(null);
let revealTimer;
let finishTimer;
const dieAsset = computed(() => diceAssets[face.value - 1]);
function nextFace() {
    const debugFace = props.debugFaces?.[debugIndex.value];
    if (debugFace && debugFace >= 1 && debugFace <= 6) {
        debugIndex.value += 1;
        return debugFace;
    }
    return Math.floor(Math.random() * 6) + 1;
}
function roll() {
    if (rolling.value)
        return;
    rolling.value = true;
    const next = nextFace();
    revealTimer = window.setTimeout(() => {
        face.value = next;
        emit('outcome', next);
    }, 280);
    finishTimer = window.setTimeout(() => {
        rolling.value = false;
    }, 560);
}
function onPointerDown(event) {
    pointerStart.value = { x: event.clientX, y: event.clientY };
}
function onPointerUp(event) {
    const start = pointerStart.value;
    pointerStart.value = null;
    if (!start)
        return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance >= 18)
        roll();
}
onUnmounted(() => {
    window.clearTimeout(revealTimer);
    window.clearTimeout(finishTimer);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.roll) },
    ...{ onPointerdown: (__VLS_ctx.onPointerDown) },
    ...{ onPointerup: (__VLS_ctx.onPointerUp) },
    ...{ class: "dice-fidget" },
    ...{ class: ({ 'dice-fidget--rolling': __VLS_ctx.rolling }) },
    type: "button",
    disabled: (__VLS_ctx.rolling),
    'aria-label': (__VLS_ctx.t('ladder.rollDice')),
    'data-testid': "ladder-die",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "dice-fidget__halo" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    ...{ class: "dice-fidget__image" },
    src: (__VLS_ctx.dieAsset.url),
    alt: (__VLS_ctx.t('ladder.dieFace', { face: String(__VLS_ctx.face) })),
    draggable: "false",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "dice-fidget__hint" },
});
(__VLS_ctx.t('ladder.rollHint'));
/** @type {__VLS_StyleScopedClasses['dice-fidget']} */ ;
/** @type {__VLS_StyleScopedClasses['dice-fidget__halo']} */ ;
/** @type {__VLS_StyleScopedClasses['dice-fidget__image']} */ ;
/** @type {__VLS_StyleScopedClasses['dice-fidget__hint']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            face: face,
            rolling: rolling,
            dieAsset: dieAsset,
            roll: roll,
            onPointerDown: onPointerDown,
            onPointerUp: onPointerUp,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
