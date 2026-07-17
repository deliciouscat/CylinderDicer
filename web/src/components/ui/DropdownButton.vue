<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

export type DropdownOption = {
  label: string
  value: string
}

const props = defineProps<{
  options: DropdownOption[]
  modelValue?: string
  ariaLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const panelId = `dropdown-${useId()}`

const selectedOption = computed(() => (
  props.options.find((option) => option.value === props.modelValue)
  ?? props.options[0]
  ?? { label: '—', value: '' }
))

function toggle() {
  open.value = !open.value
}

function select(option: DropdownOption) {
  emit('update:modelValue', option.value)
  emit('select', option.value)
  open.value = false
}

function close() {
  open.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || !root.value?.contains(target)) {
    close()
  }
}

watch(
  () => props.options,
  () => {
    if (props.options.length === 0) {
      close()
    }
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div ref="root" class="cd-dropdown" @keydown.esc="close">
    <button
      class="cd-dropdown__button"
      type="button"
      aria-haspopup="listbox"
      :aria-label="ariaLabel ?? 'Select option'"
      :aria-controls="panelId"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="cd-dropdown__label">{{ selectedOption.label }}</span>
      <span class="cd-dropdown__arrow" aria-hidden="true" />
    </button>

    <div v-if="open" :id="panelId" class="cd-dropdown__panel" role="listbox">
      <button
        v-for="option in options"
        :key="option.value"
        class="cd-dropdown__option"
        type="button"
        role="option"
        :aria-selected="option.value === selectedOption.value"
        @click="select(option)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
