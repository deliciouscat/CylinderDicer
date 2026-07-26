/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { assetLoader } from '../../assets/assetLoader';
import { t } from '../../i18n';
import { formatMmr, formatPlacement } from '../ladder.logic';
const props = defineProps();
const characterAsset = computed(() => {
    if (!props.player.characterKey)
        return null;
    try {
        return assetLoader(`ladder-character-${props.player.characterKey}`);
    }
    catch {
        return null;
    }
});
const initials = computed(() => props.player.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?');
const recentPlace = computed(() => formatPlacement(props.player.stats.recent20AvgPlace));
const allTimePlace = computed(() => formatPlacement(props.player.stats.allTimeAvgPlace));
const placesLabel = computed(() => t('ladder.rosterPlaces', {
    recent20: recentPlace.value,
    allTime: allTimePlace.value,
}));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "roster-player-card" },
    ...{ class: ({ 'roster-player-card--self': __VLS_ctx.player.isSelf }) },
    role: "listitem",
    'data-seat': (__VLS_ctx.player.seatIndex),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "roster-player-card__portrait" },
});
if (__VLS_ctx.characterAsset) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        src: (__VLS_ctx.characterAsset.url),
        alt: (__VLS_ctx.t('ladder.characterAlt', { name: __VLS_ctx.player.displayName })),
        draggable: "false",
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "roster-player-card__fallback" },
        'aria-hidden': "true",
    });
    (__VLS_ctx.initials);
}
if (__VLS_ctx.player.isSelf) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "roster-player-card__self-mark" },
    });
    (__VLS_ctx.t('ladder.you'));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.player.displayName);
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "roster-player-card__mmr" },
});
(__VLS_ctx.t('ladder.mmrValue', { mmr: __VLS_ctx.formatMmr(__VLS_ctx.player.stats.mmr) }));
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "roster-player-card__places" },
    'aria-label': (__VLS_ctx.placesLabel),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "roster-player-card__place-label" },
});
(__VLS_ctx.t('ladder.recentShort'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.recentPlace);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "roster-player-card__place-label" },
});
(__VLS_ctx.t('ladder.allTimeShort'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.allTimePlace);
/** @type {__VLS_StyleScopedClasses['roster-player-card']} */ ;
/** @type {__VLS_StyleScopedClasses['roster-player-card__portrait']} */ ;
/** @type {__VLS_StyleScopedClasses['roster-player-card__fallback']} */ ;
/** @type {__VLS_StyleScopedClasses['roster-player-card__self-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['roster-player-card__mmr']} */ ;
/** @type {__VLS_StyleScopedClasses['roster-player-card__places']} */ ;
/** @type {__VLS_StyleScopedClasses['roster-player-card__place-label']} */ ;
/** @type {__VLS_StyleScopedClasses['roster-player-card__place-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            formatMmr: formatMmr,
            characterAsset: characterAsset,
            initials: initials,
            recentPlace: recentPlace,
            allTimePlace: allTimePlace,
            placesLabel: placesLabel,
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
