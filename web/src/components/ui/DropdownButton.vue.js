/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
const root = ref(null);
const open = ref(false);
const panelId = `dropdown-${useId()}`;
const selectedOption = computed(() => (props.options.find((option) => option.value === props.modelValue)
    ?? props.options[0]
    ?? { label: '—', value: '' }));
function toggle() {
    open.value = !open.value;
}
function select(option) {
    emit('update:modelValue', option.value);
    emit('select', option.value);
    open.value = false;
}
function close() {
    open.value = false;
}
function onDocumentPointerDown(event) {
    const target = event.target;
    if (!(target instanceof Node) || !root.value?.contains(target)) {
        close();
    }
}
watch(() => props.options, () => {
    if (props.options.length === 0) {
        close();
    }
});
onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerDown);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onKeydown: (__VLS_ctx.close) },
    ref: "root",
    ...{ class: "cd-dropdown" },
});
/** @type {typeof __VLS_ctx.root} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toggle) },
    ...{ class: "cd-dropdown__button" },
    type: "button",
    'aria-haspopup': "listbox",
    'aria-label': (__VLS_ctx.ariaLabel ?? 'Select option'),
    'aria-controls': (__VLS_ctx.panelId),
    'aria-expanded': (__VLS_ctx.open),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "cd-dropdown__label" },
});
(__VLS_ctx.selectedOption.label);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "cd-dropdown__arrow" },
    'aria-hidden': "true",
});
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        id: (__VLS_ctx.panelId),
        ...{ class: "cd-dropdown__panel" },
        role: "listbox",
    });
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.select(option);
                } },
            key: (option.value),
            ...{ class: "cd-dropdown__option" },
            type: "button",
            role: "option",
            'aria-selected': (option.value === __VLS_ctx.selectedOption.value),
        });
        (option.label);
    }
}
/** @type {__VLS_StyleScopedClasses['cd-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['cd-dropdown__button']} */ ;
/** @type {__VLS_StyleScopedClasses['cd-dropdown__label']} */ ;
/** @type {__VLS_StyleScopedClasses['cd-dropdown__arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['cd-dropdown__panel']} */ ;
/** @type {__VLS_StyleScopedClasses['cd-dropdown__option']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            root: root,
            open: open,
            panelId: panelId,
            selectedOption: selectedOption,
            toggle: toggle,
            select: select,
            close: close,
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
