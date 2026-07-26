/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { SignUp } from '@clerk/vue';
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "auth-screen" },
});
const __VLS_0 = {}.SignUp;
/** @type {[typeof __VLS_components.SignUp, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    routing: "path",
    path: "/sign-up",
    signInUrl: "/sign-in",
    fallbackRedirectUrl: "/",
}));
const __VLS_2 = __VLS_1({
    routing: "path",
    path: "/sign-up",
    signInUrl: "/sign-in",
    fallbackRedirectUrl: "/",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['auth-screen']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SignUp: SignUp,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
