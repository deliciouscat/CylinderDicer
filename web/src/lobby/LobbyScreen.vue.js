/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/vue';
import { computed } from 'vue';
import lobbyConfig from '../config/lobby.config.json';
import { assetLoader } from '../assets/assetLoader';
import DropdownButton from '../components/ui/DropdownButton.vue';
import { activeLocale, setLocale, t } from '../i18n';
const emit = defineEmits();
const menuItems = computed(() => Object.entries(lobbyConfig.menu).map(([id, entry]) => ({
    id,
    url: entry.url,
    label: t(entry.labelKey),
})));
const localeOptions = computed(() => [
    { label: t('lobby.locales.en'), value: 'en' },
    { label: t('lobby.locales.ko'), value: 'ko' },
    { label: t('lobby.locales.ja'), value: 'ja' },
]);
const selectedLocale = computed({
    get: () => activeLocale.value,
    set: (value) => setLocale(value),
});
const backgroundAsset = assetLoader('background-lobby');
const menuPanelAsset = assetLoader('menu-panel');
const titleAsset = assetLoader('title');
const lobbyStyles = {
    '--lobby-bg': `url(${backgroundAsset.url})`,
    '--lobby-bg-focus-x': backgroundAsset.manifest.focus.x,
    '--lobby-bg-focus-y': backgroundAsset.manifest.focus.y,
    '--lobby-bg-pan': `${backgroundAsset.manifest.pan.distancePercent}%`,
    '--lobby-bg-pan-duration': `${backgroundAsset.manifest.pan.durationSeconds}s`,
    '--title-safe-width': `${titleAsset.manifest.safeWidthPercent}vw`,
    '--title-shadow': titleAsset.manifest.dropShadow,
    '--menu-panel': `url(${menuPanelAsset.url})`,
    '--menu-panel-ratio': `${menuPanelAsset.manifest.width} / ${menuPanelAsset.manifest.height}`,
    '--menu-hover-scale': String(menuPanelAsset.manifest.hoverScale),
    '--menu-pressed-scale': String(menuPanelAsset.manifest.pressedScale),
};
function openMenuItem(item) {
    emit('navigate', item.url);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "lobby-screen" },
    ...{ style: (__VLS_ctx.lobbyStyles) },
    'aria-label': (__VLS_ctx.t('lobby.screenLabel')),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "lobby-background" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "lobby-auth" },
});
/** @type {[typeof DropdownButton, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(DropdownButton, new DropdownButton({
    modelValue: (__VLS_ctx.selectedLocale),
    ...{ class: "lobby-locale" },
    options: (__VLS_ctx.localeOptions),
    'aria-label': (__VLS_ctx.t('lobby.localeLabel')),
}));
const __VLS_1 = __VLS_0({
    modelValue: (__VLS_ctx.selectedLocale),
    ...{ class: "lobby-locale" },
    options: (__VLS_ctx.localeOptions),
    'aria-label': (__VLS_ctx.t('lobby.localeLabel')),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
const __VLS_3 = {}.Show;
/** @type {[typeof __VLS_components.Show, typeof __VLS_components.Show, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(__VLS_3, new __VLS_3({
    when: "signed-out",
}));
const __VLS_5 = __VLS_4({
    when: "signed-out",
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
__VLS_6.slots.default;
const __VLS_7 = {}.SignInButton;
/** @type {[typeof __VLS_components.SignInButton, typeof __VLS_components.SignInButton, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
    mode: "modal",
}));
const __VLS_9 = __VLS_8({
    mode: "modal",
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
__VLS_10.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "lobby-auth__button" },
    type: "button",
});
(__VLS_ctx.t('lobby.signIn'));
var __VLS_10;
const __VLS_11 = {}.SignUpButton;
/** @type {[typeof __VLS_components.SignUpButton, typeof __VLS_components.SignUpButton, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
    mode: "modal",
}));
const __VLS_13 = __VLS_12({
    mode: "modal",
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
__VLS_14.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "lobby-auth__button lobby-auth__button--primary" },
    type: "button",
});
(__VLS_ctx.t('lobby.signUp'));
var __VLS_14;
var __VLS_6;
const __VLS_15 = {}.Show;
/** @type {[typeof __VLS_components.Show, typeof __VLS_components.Show, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
    when: "signed-in",
}));
const __VLS_17 = __VLS_16({
    when: "signed-in",
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_18.slots.default;
const __VLS_19 = {}.UserButton;
/** @type {[typeof __VLS_components.UserButton, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({}));
const __VLS_21 = __VLS_20({}, ...__VLS_functionalComponentArgsRest(__VLS_20));
var __VLS_18;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "lobby-stage" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
    ...{ class: "lobby-title" },
    src: (__VLS_ctx.titleAsset.url),
    alt: (__VLS_ctx.t('lobby.titleAlt')),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "lobby-menu" },
    'aria-label': (__VLS_ctx.t('lobby.mainMenuLabel')),
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.menuItems))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openMenuItem(item);
            } },
        key: (item.id),
        ...{ class: "lobby-menu__button" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (item.label);
}
/** @type {__VLS_StyleScopedClasses['lobby-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-background']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-auth']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-locale']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-auth__button']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-auth__button']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-auth__button--primary']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-stage']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-title']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['lobby-menu__button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Show: Show,
            SignInButton: SignInButton,
            SignUpButton: SignUpButton,
            UserButton: UserButton,
            DropdownButton: DropdownButton,
            t: t,
            menuItems: menuItems,
            localeOptions: localeOptions,
            selectedLocale: selectedLocale,
            titleAsset: titleAsset,
            lobbyStyles: lobbyStyles,
            openMenuItem: openMenuItem,
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
