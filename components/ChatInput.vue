<script setup lang="ts">
interface Props {
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  submit: [message: string]
}>()

const message = ref('')
const textareaRef = ref<HTMLTextAreaElement>()

const canSend = computed(() => message.value.trim().length > 0 && !props.disabled)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}

function send() {
  if (!canSend.value) return
  emit('submit', message.value.trim())
  message.value = ''
  nextTick(() => adjustHeight())
}

function adjustHeight() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 128) + 'px' // max ~4 rows
}

watch(message, () => nextTick(adjustHeight))

onMounted(() => adjustHeight())
</script>

<template>
  <div class="flex items-end gap-2 border-t border-gray-200 dark:border-gray-800 p-3">
    <textarea
      ref="textareaRef"
      v-model="message"
      :disabled="disabled"
      :placeholder="disabled ? 'AI思考中...' : '输入您的消息...'"
      rows="1"
      class="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-base leading-relaxed placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] dark:focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
      @keydown="handleKeydown"
    />
    <UButton
      icon="i-lucide-send"
      :disabled="!canSend"
      :loading="disabled"
      color="primary"
      variant="solid"
      size="sm"
      class="rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
      @click="send"
    />
  </div>
</template>
