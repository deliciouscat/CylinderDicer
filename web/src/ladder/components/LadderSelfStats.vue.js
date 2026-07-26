/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { t } from '../../i18n';
import { formatMmr, formatPlacement } from '../ladder.logic';
const props = defineProps();
const recentLabel = computed(() => {
    if (props.stats.recent20Count === 0) {
        return t('ladder.recent20Empty');
    }
    const key = props.stats.recent20Count < 20
        ? 'ladder.recentNAvgPlace'
        : 'ladder.recent20AvgPlace';
    return t(key, {
        n: String(props.stats.recent20Count),
        place: formatPlacement(props.stats.recent20AvgPlace),
    });
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "ladder-self-stats" },
    'aria-label': (__VLS_ctx.t('ladder.selfStats')),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "ladder-self-stats__label" },
});
(__VLS_ctx.t('ladder.mmr'));
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "ladder-self-stats__mmr" },
    'data-testid': "ladder-self-mmr",
});
(__VLS_ctx.formatMmr(__VLS_ctx.stats.mmr));
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "ladder-self-stats__recent" },
});
(__VLS_ctx.recentLabel);
/** @type {__VLS_StyleScopedClasses['ladder-self-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-self-stats__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-self-stats__mmr']} */ ;
/** @type {__VLS_StyleScopedClasses['ladder-self-stats__recent']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            t: t,
            formatMmr: formatMmr,
            recentLabel: recentLabel,
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
