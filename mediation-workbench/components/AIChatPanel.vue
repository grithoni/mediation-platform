<script setup lang="ts">
// Local message shape used by this panel (matches ChatMessage component props)
interface Message {
  id: string
  senderType: 'party' | 'mediator' | 'ai' | 'system'
  senderName: string
  content: string
  timestamp: string
  isSelf: boolean
}

interface Props {
  caseId: string
}

const props = defineProps<Props>()

const messages = ref<Message[]>([])
const isSending = ref(false)
const messagesContainerRef = ref<HTMLElement>()

const quickActions = [
  { label: '生成调解建议', prompt: '请根据当前案件情况生成调解建议。' },
  { label: '分析案件焦点', prompt: '请分析本案的主要争议焦点。' },
  { label: '起草调解方案', prompt: '请起草一份初步的调解方案。' },
]

function scrollToBottom() {
  nextTick(() => {
    const el = messagesContainerRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function sendMessage(content: string) {
  if (!content.trim() || isSending.value) return

  // Add user message
  messages.value.push({
    id: crypto.randomUUID(),
    senderType: 'mediator',
    senderName: '调解员',
    content,
    timestamp: new Date().toISOString(),
    isSelf: true,
  })
  scrollToBottom()

  isSending.value = true

  try {
    const data = await $fetch<{ reply: string }>('/api/chat/ai', {
      method: 'POST',
      body: {
        caseId: props.caseId,
        message: content,
      },
    })

    messages.value.push({
      id: crypto.randomUUID(),
      senderType: 'ai',
      senderName: 'AI助手',
      content: data.reply,
      timestamp: new Date().toISOString(),
      isSelf: false,
    })
  } catch {
    messages.value.push({
      id: crypto.randomUUID(),
      senderType: 'ai',
      senderName: '系统',
      content: '抱歉，AI服务暂时不可用，请稍后再试。',
      timestamp: new Date().toISOString(),
      isSelf: false,
    })
  } finally {
    isSending.value = false
    scrollToBottom()
  }
}

function handleQuickAction(prompt: string) {
  sendMessage(prompt)
}
</script>

<template>
  <div class="flex flex-col h-full border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-[#1e3a5f] dark:text-gray-400" />
      <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">AI咨询</span>
      <div v-if="isSending" class="flex items-center gap-1 ml-auto text-xs text-gray-400 dark:text-gray-500 font-mono">
        <UIcon name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />
        thinking...
      </div>
    </div>

    <!-- Quick actions -->
    <div class="flex flex-wrap gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
      <UButton
        v-for="action in quickActions"
        :key="action.label"
        :label="action.label"
        size="md"
        variant="soft"
        color="primary"
        :disabled="isSending"
        @click="handleQuickAction(action.prompt)"
      />
    </div>

    <!-- Messages -->
    <div
      ref="messagesContainerRef"
      class="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0"
    >
      <div
        v-if="messages.length === 0"
        class="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm"
      >
        <UIcon name="i-lucide-message-circle" class="w-8 h-8 mb-2" />
        <p>选择上方快捷操作，或输入您的问题</p>
      </div>

      <ChatMessage
        v-for="msg in messages"
        :key="msg.id"
        :sender-type="msg.senderType as 'party' | 'mediator' | 'ai'"
        :sender-name="msg.senderName"
        :content="msg.content"
        :timestamp="msg.timestamp"
        :is-self="msg.isSelf"
      />
    </div>

    <!-- Input -->
    <ChatInput :disabled="isSending" @submit="sendMessage" />
  </div>
</template>
