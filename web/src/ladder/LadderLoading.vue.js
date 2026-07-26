/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import { t } from '../i18n';
import ChipStack from './components/ChipStack.vue';
import DiceFidget from './components/DiceFidget.vue';
import LadderSelfStats from './components/LadderSelfStats.vue';
import { applyFidgetOutcome } from './ladder.logic';
const __VLS_props = defineProps();
const emit = defineEmits();
const chips = ref(0);
const outcome = ref('idle');
const animationKey = ref(0);
function applyOutcome(face) {
    chips.value = applyFidgetOutcome(chips.value, face);
    outcome.value = face === 1 ? 'skull' : 'gain';
    animationKey.value += 1;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "ladder-loading" },
    'aria-labelledby': "ladder-searching-title",
    'data-testid': "ladder-searching",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    id: "ladder-searching-title",
    ...{ class: "ladder-visually-hidden" },
});
(__VLS_ctx.t('ladder.searching'));
/** @type {[typeof LadderSelfStats, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(LadderSelfStats, new LadderSelfStats({
    stats: (__VLS_ctx.selfStats),
}));
const __VLS_1 = __VLS_0({
    stats: (__VLS_ctx.selfStats),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ladder-fidget-stage" },
});
/** @type {[typeof ChipStack, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(ChipStack, new ChipStack({
    chips: (__VLS_ctx.chips),
    outcome: (__VLS_ctx.outcome),
    animationKey: (__VLS_ctx.animationKey),
}));
const __VLS_4 = __VLS_3({
    chips: (__VLS_ctx.chips),
    outcome: (__VLS_ctx.outcome),
    animationKey: (__VLS_ctx.animationKey),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
/** @type {[typeof DiceFidget, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(DiceFidget, new DiceFidget({
    ...{ 'onOutcome': {} },
    debugFaces: (__VLS_ctx.debugFaces),
}));
const __VLS_7 = __VLS_6({
    ...{ 'onOutcome': {} },
    debugFaces: (__VLS_ctx.debugFaces),
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
let __VLS_9;
let __VLS_10;
let __VLS_11;
const __VLS_12 = {
    onOutcome: (__VLS_ctx.applyOutcome)
};
var __VLS_8;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ladder-loading__footer" },
});
if (!__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ladder-matching-status" },
        role: "status",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "ladder-matching-status__pulse" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.authPending ? __VLS_ctx.t('ladder.authNotReady') : __VLS_ctx.t('ladder.searching'));
}
if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "ladder-inline-error" },
        role: "alert",
    });
    (__VLS_ctx.errorMessage);
}
if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.errorMessage))
                    return;
                __VLS_ctx.emit('retry');
            } },
        ...{ class: "ladder-text-button" },
        type: "button",
    });
    (__VLS_ctx.t('ladder.retry'));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('cancel');
        } },
    ...{ class: "ladder-text-button ladder-text-button--cancel" },
    type: "button",
    disabled: (__VLS_ctx.cancelPending),
    'data-testid': "ladder-cancel",
});
(__VLS_ctx.cancelPending ? __VLS_ctx.t('ladder.cancelling') : __VLS_ctx.t('ladder.cancel'));
/** @type {__VLS_StyleScopedClasses['ladder-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-visually-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-fidget-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-loading__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-matching-status']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-matching-status__pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-inline-error']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-text-button--cancel']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            ChipStack: ChipStack,
            DiceFidget: DiceFidget,
            LadderSelfStats: LadderSelfStats,
            emit: emit,
            chips: chips,
            outcome: outcome,
            animationKey: animationKey,
            applyOutcome: applyOutcome,
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
