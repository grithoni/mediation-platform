<template>
  <div class="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-900">

    <!-- Loading -->
    <div v-if="pending" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-400 dark:text-blue-500 animate-spin mx-auto mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">loading case data...</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="fetchError || !caseData" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-md mx-auto px-4">
        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">无法访问案件</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-6">案件编号或访问验证码不正确，请检查后重试。</p>
      </div>
    </div>

    <!-- Main Content -->
    <template v-else>
      <!-- Case Info Header -->
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <div class="grid grid-cols-5 gap-3 text-base">
          <div>
            <span class="text-gray-400 dark:text-gray-500 font-mono text-sm">案号</span>
            <div class="font-mono font-medium text-gray-900 dark:text-white mt-0.5">{{ caseData.id }}</div>
          </div>
          <div>
            <span class="text-gray-400 dark:text-gray-500 font-mono text-sm">案由</span>
            <div class="font-medium text-gray-900 dark:text-white mt-0.5">{{ caseData.title }}</div>
          </div>
          <div>
            <span class="text-gray-400 dark:text-gray-500 font-mono text-sm">申请人</span>
            <div class="font-medium text-gray-900 dark:text-white mt-0.5">{{ caseData.partyAName }}</div>
          </div>
          <div>
            <span class="text-gray-400 dark:text-gray-500 font-mono text-sm">被申请人</span>
            <div class="font-medium text-gray-900 dark:text-white mt-0.5">{{ caseData.partyBName }}</div>
          </div>
          <div>
            <span class="text-gray-400 dark:text-gray-500 font-mono text-sm">标的额</span>
            <div class="font-medium text-gray-900 dark:text-white mt-0.5">{{ amountDisplay }}</div>
          </div>
        </div>
      </div>

      <!-- Chat Tabs -->
      <div class="h-10 shrink-0 flex items-center border-b border-gray-200 dark:border-gray-800 px-3">
        <UTabs v-model="activeTab" :items="tabItems" class="flex-1" />
        <span class="text-xs font-mono text-gray-400 dark:text-gray-500 ml-2">{{ caseData.id }}</span>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
        <!-- AI Chat Tab -->
        <div v-if="activeTab === 0" class="space-y-3">
          <template v-if="aiMessages.length">
            <div
              v-for="msg in aiMessages"
              :key="msg.id"
              class="flex"
              :class="msg.senderType === 'party' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[80%] rounded-lg px-3 py-2"
                :class="bubbleClass(msg.senderType)"
              >
                <div v-if="msg.senderType !== 'party'" class="text-xs font-medium mb-1 opacity-60">
                  {{ msg.senderName || 'AI助手' }}
                </div>
                <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
                <div class="text-xs mt-1 opacity-40 text-right font-mono">
                  {{ formatTime(msg.createdAt) }}
                </div>
              </div>
            </div>
          </template>
          <div v-else class="flex-1 flex items-center justify-center h-full">
            <div class="text-center py-20">
              <UIcon name="i-lucide-message-circle" class="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p class="text-sm text-gray-400 dark:text-gray-500">暂无消息，开始与AI助手对话吧</p>
            </div>
          </div>

          <!-- AI Streaming bubble -->
          <div v-if="chat.aiStreaming.value" class="flex justify-start">
            <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 max-w-[80%]">
              <div class="text-xs font-medium mb-1 opacity-60 text-blue-600 dark:text-blue-400">AI助手</div>
              <div class="text-base whitespace-pre-wrap leading-relaxed text-gray-800 dark:text-gray-200">
                {{ chat.aiStreamContent.value || '思考中...' }}
                <span class="animate-pulse text-blue-500 dark:text-blue-400">▌</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Online Mediation Tab -->
        <div v-else class="space-y-3">
          <template v-if="mediatorMessages.length">
            <div
              v-for="msg in mediatorMessages"
              :key="msg.id"
              class="flex"
              :class="msg.senderType === 'party' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[80%] rounded-lg px-3 py-2"
                :class="bubbleClass(msg.senderType)"
              >
                <div v-if="msg.senderType !== 'party'" class="text-xs font-medium mb-1 opacity-60">
                  {{ msg.senderName || (msg.senderType === 'ai' ? 'AI助手' : '调解员') }}
                </div>
                <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
                <div class="text-xs mt-1 opacity-40 text-right font-mono">
                  {{ formatTime(msg.createdAt) }}
                </div>
              </div>
            </div>
          </template>
          <div v-else class="flex-1 flex items-center justify-center h-full">
            <div class="text-center py-20">
              <UIcon name="i-lucide-users" class="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p class="text-sm text-gray-400 dark:text-gray-500">等待调解员加入对话</p>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="chat.isTyping.value" class="flex justify-start">
            <div class="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg px-3 py-2 text-sm">
              {{ chat.typingUser.value || '调解员' }} 正在输入...
            </div>
          </div>
        </div>
      </div>

      <!-- Input Bar -->
      <div class="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0 bg-white dark:bg-gray-900">
        <form @submit.prevent="handleSend" class="flex gap-2">
          <UTextarea
            v-model="inputMessage"
            :placeholder="activeTab === 0 ? '向AI助手咨询...' : '输入消息...'"
            :rows="1"
            autoresize
            :maxrows="4"
            class="flex-1"
            @keydown.enter.exact.prevent="handleSend"
          />
          <UButton
            type="submit"
            icon="i-lucide-send"
            size="lg"
            :disabled="!inputMessage.trim() || (activeTab === 0 && chat.aiStreaming.value)"
            class="self-end bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
          >
            发送
          </UButton>
        </form>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  // uses party layout from app.vue
})

interface CaseResponse {
  success: boolean
  data: {
    id: string
    title: string
    description: string | null
    partyAName: string
    partyBName: string
    claimsSummary: string | null
    evidenceSummary: string | null
    status: string
    messages: Array<{
      id: string
      caseId: string
      senderType: string
      senderId?: string | null
      senderName?: string | null
      content: string
      createdAt: string
    }>
    documents: any[]
  }
  sessionToken?: string
}

const route = useRoute()
const caseNumber = route.params.caseNumber as string
const accessCode = route.query.code as string

const showSidebar = ref(false)
const activeTab = ref(0)
const inputMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const pending = ref(true)
const fetchError = ref(false)
const sessionToken = ref<string | undefined>()

const tabItems = [
  { label: '智能咨询' },
  { label: '在线调解' },
]

const caseData = ref<CaseResponse['data'] | null>(null)
const chat = useChat(computed(() => caseNumber))

// Messages from AI tab (filtered from all messages)
const aiMessages = computed(() =>
  chat.messages.value.filter(m => m.senderType === 'party' || m.senderType === 'ai'),
)

// Messages from mediator tab (all messages)
const mediatorMessages = computed(() => chat.messages.value)

// Fetch case data
onMounted(async () => {
  try {
    const resp = await $fetch<CaseResponse>(`/api/cases/${caseNumber}`, {
      query: { code: accessCode },
    })

    caseData.value = resp.data
    sessionToken.value = resp.sessionToken

    if (resp.data.messages) {
      chat.messages.value = resp.data.messages.map(m => ({
        ...m,
        senderType: m.senderType as 'party' | 'mediator' | 'ai',
      }))
    }
  }
  catch {
    fetchError.value = true
  }
  finally {
    pending.value = false
  }

  // Connect WebSocket for human mediator chat
  chat.connectWebSocket(sessionToken.value || accessCode, 'party')
})

onUnmounted(() => {
  chat.disconnect()
})

const statusColor = computed(() => {
  const map: Record<string, string> = {
    pending: 'warning',
    active: 'success',
    resolved: 'info',
    closed: 'neutral',
  }
  return (map[caseData.value?.status || ''] || 'neutral') as any
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '待处理',
    active: '进行中',
    resolved: '已解决',
    closed: '已关闭',
  }
  return map[caseData.value?.status || ''] || caseData.value?.status
})

// Extract amount from description or claimsSummary
const amountDisplay = computed(() => {
  if (!caseData.value) return '—'
  const text = caseData.value.claimsSummary || caseData.value.description || ''
  const match = text.match(/(\d[\d,]+)\s*元/)
  if (match) return '¥' + match[1]
  return '—'
})

function bubbleClass(senderType: string) {
  if (senderType === 'party') {
    return 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
  }
  if (senderType === 'ai') {
    return 'bg-blue-50 dark:bg-blue-950/30 text-gray-800 dark:text-gray-200 border border-blue-200 dark:border-blue-900'
  }
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
}

function formatTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function handleSend() {
  const text = inputMessage.value.trim()
  if (!text) return

  inputMessage.value = ''

  if (activeTab.value === 0) {
    // AI chat
    chat.messages.value.push({
      id: `party-${Date.now()}`,
      caseId: caseNumber,
      senderType: 'party',
      senderName: '当事人',
      content: text,
      createdAt: new Date().toISOString(),
    })
    await chat.sendAiMessage(text, 'party', '当事人')
  }
  else {
    // Human mediator chat via WebSocket
    chat.sendMessage(text)
    chat.messages.value.push({
      id: `party-${Date.now()}`,
      caseId: caseNumber,
      senderType: 'party',
      senderName: '当事人',
      content: text,
      createdAt: new Date().toISOString(),
    })
  }

  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}
</script>
