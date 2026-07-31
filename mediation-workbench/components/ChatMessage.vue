<script setup lang="ts">
interface Props {
  senderType: 'party' | 'mediator' | 'ai'
  senderName: string
  content: string
  timestamp: string
  isSelf: boolean
}

const props = defineProps<Props>()

const formattedTime = computed(() => {
  const date = new Date(props.timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})

const bubbleClass = computed(() => {
  if (props.senderType === 'ai') {
    return 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900'
  }
  if (props.isSelf) {
    return 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
  }
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
})

function formatContent(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}
</script>

<template>
  <div
    class="flex gap-2 animate-fade-in-up"
    :class="isSelf ? 'flex-row-reverse' : 'flex-row'"
  >
    <div class="flex flex-col gap-1 max-w-[75%]" :class="isSelf ? 'items-end' : 'items-start'">
      <!-- Sender info -->
      <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <span class="font-medium">{{ senderName }}</span>
        <UBadge
          v-if="senderType === 'ai'"
          label="AI"
          color="primary"
          variant="subtle"
          size="xs"
        />
        <span class="font-mono">{{ formattedTime }}</span>
      </div>

      <!-- Bubble -->
      <div
        class="px-3 py-2 rounded-lg text-base leading-relaxed break-words"
        :class="bubbleClass"
        v-html="formatContent(content)"
      />
    </div>
  </div>
</template>

<style scoped>
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.25s ease-out;
}
</style>
