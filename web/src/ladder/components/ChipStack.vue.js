/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { t } from '../../i18n';
const props = defineProps();
const visibleChips = computed(() => Math.min(12, props.chips));
const statusLabel = computed(() => {
    if (props.outcome === 'skull') {
        return t('ladder.skullOutcome', { count: String(props.chips) });
    }
    if (props.outcome === 'gain') {
        return t('ladder.chipGained', { count: String(props.chips) });
    }
    return t('ladder.chipCount', { count: String(props.chips) });
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chip-stack" },
    ...{ class: (`chip-stack--${__VLS_ctx.outcome}`) },
    'aria-label': (__VLS_ctx.statusLabel),
    role: "status",
    'aria-live': "polite",
    'aria-atomic': "true",
    'data-testid': "ladder-chip-stack",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    key: (__VLS_ctx.animationKey),
    ...{ class: "chip-stack__pile" },
    'aria-hidden': "true",
});
for (const [index] of __VLS_getVForSourceType((__VLS_ctx.visibleChips))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        key: (index),
        ...{ class: "chip-stack__chip" },
        ...{ style: ({ '--chip-index': index }) },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "chip-stack__count" },
});
(__VLS_ctx.chips);
/** @type {__VLS_StyleScopedClasses['chip-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-stack__pile']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-stack__chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-stack__count']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            visibleChips: visibleChips,
            statusLabel: statusLabel,
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
