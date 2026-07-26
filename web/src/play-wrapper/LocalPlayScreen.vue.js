/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import DefoldCanvas from './DefoldCanvas.vue';
const emit = defineEmits();
const localMatch = {
    sessionId: 'local-dev-session',
    matchId: 'local-dev-match',
    playerId: 'local-player',
    mode: 'dev',
    localSimulator: true,
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['local-play-screen__header']} */ ;
/** @type {__VLS_StyleScopedClasses['local-play-screen__header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "local-play-screen" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "local-play-screen__header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.emit('back');
        } },
    ...{ class: "local-play-screen__back" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
/** @type {[typeof DefoldCanvas, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(DefoldCanvas, new DefoldCanvas({
    match: (__VLS_ctx.localMatch),
}));
const __VLS_1 = __VLS_0({
    match: (__VLS_ctx.localMatch),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {__VLS_StyleScopedClasses['local-play-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['local-play-screen__header']} */ ;
/** @type {__VLS_StyleScopedClasses['local-play-screen__back']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DefoldCanvas: DefoldCanvas,
            emit: emit,
            localMatch: localMatch,
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
