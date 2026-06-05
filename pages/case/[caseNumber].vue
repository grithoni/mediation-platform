// v1780639939948
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

      <!-- Phase Banner -->
      <div
        v-if="showMediatorBanner || caseData.phase === 'mediator_selection' || caseData.phase === 'active'"
        class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800"
        :class="caseData.phase === 'active' ? 'bg-green-50 dark:bg-green-950' : 'bg-blue-50 dark:bg-blue-950'"
      >
        <div class="flex items-center gap-2">
          <UIcon :name="caseData.phase === 'active' ? 'i-lucide-check-circle' : 'i-lucide-user-check'"
            :class="caseData.phase === 'active' ? 'text-green-600' : 'text-blue-600'" class="w-5 h-5" />
          <span class="text-sm font-medium" :class="caseData.phase === 'active' ? 'text-green-800' : 'text-blue-800'">
            {{ caseData.phase === 'active' ? '调解员已就位，对话开始' : '请选择调解员' }}
          </span>
          <UButton
            v-if="caseData.phase !== 'active'"
            size="lg"
            @click="openMediatorModal"
            class="ml-auto bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
          >
            选择调解员
          </UButton>
        </div>
      </div>

      <!-- Mode Toggle (hide when active) -->
      <div v-if="caseData.phase !== 'active'" class="shrink-0 flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="chatMode === 'ai'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'"
          @click="switchToAI"
        >
          🤖 与智能体对话
        </button>
        <button
          class="flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors"
          :class="chatMode === 'mediator'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'"
          @click="switchToMediator"
        >
          👤 与调解员对话
        </button>
      </div>

      <!-- 5-turn prompt -->
      <div
        v-if="aiTurnCount >= 5 && !turnPromptShown"
        class="shrink-0 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-yellow-50 dark:bg-yellow-950 flex items-center justify-between"
      >
        <span class="text-xs text-yellow-800 dark:text-yellow-200">已进行 {{ aiTurnCount }} 轮对话，建议切换到调解员</span>
        <UButton size="xs" @click="switchToMediator">选择调解员</UButton>
      </div>

      <!-- Chat Messages (single chat, no tabs) -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
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
            <p class="text-sm text-gray-400 dark:text-gray-500">AI助手已就绪，请输入您的问题</p>
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

      <!-- Input Bar -->
      <div class="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0 bg-white dark:bg-gray-900">
        <form @submit.prevent="handleSend" class="flex gap-2">
          <UTextarea
            v-model="inputMessage"
            :placeholder="caseData?.phase === 'active' ? '与调解员对话...' : '输入消息...'"
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
            :disabled="!inputMessage.trim() || chat.aiStreaming.value"
            class="self-end bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
          >
            发送
          </UButton>
        </form>
      </div>
    </template>

    <!-- Mediator Selection Overlay (plain div, no UModal) -->
    <div v-if="showMediatorModal" class="fixed inset-0 z-50 flex items-center justify-center" style="background:rgba(0,0,0,0.4)" @click.self="showMediatorModal = false">
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" @click.stop>
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">选择调解员</h2>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showMediatorModal = false">
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>
        <!-- Body -->
        <div class="p-4">
          <div v-if="matchingMediators" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-blue-400 animate-spin" />
            <span class="ml-2 text-sm text-gray-500">正在匹配合适的调解员...</span>
          </div>
          <div v-else class="space-y-3">
            <p class="text-sm text-gray-500 dark:text-gray-400">以下是根据案件特征为您匹配的调解员，请选择一位：</p>
            <div
              v-for="m in matchedMediatorList"
              :key="m.id"
              class="w-full text-left p-3 rounded-lg border transition-colors cursor-pointer"
              :class="selectedMediatorId === m.id
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'"
              @click="selectedMediatorId = m.id"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium text-gray-900 dark:text-white">{{ m.name }}</span>
                  <span class="ml-2 text-xs text-blue-500 dark:text-blue-400">{{ m.appointmentType || '' }}</span>
                </div>
                <span v-if="m.score > 0" class="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">{{ m.score }}分</span>
              </div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400 space-x-2">
                <span>{{ m.education || '' }}</span>
                <span>{{ m.university || '' }}</span>
                <span v-if="m.organization">{{ m.organization }}</span>
              </div>
              <div v-if="m.specialties?.length" class="mt-1 flex flex-wrap gap-1">
                <span v-for="s in m.specialties" :key="s" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{{ s }}</span>
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-3">
              <button class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" @click="showMediatorModal = false">取消</button>
              <button
                class="px-4 py-2 text-sm rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100 disabled:opacity-50"
                :disabled="!selectedMediatorId || bindingMediator"
                @click="bindMediator"
              >
                {{ bindingMediator ? '绑定中...' : '确认选择' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
    phase: string
    mediatorId: string | null
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
const inputMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const pending = ref(true)
const fetchError = ref(false)
const sessionToken = ref<string | undefined>()
const tabItems: { label: string }[] = [] // unused, kept for compatibility

const caseData = ref<CaseResponse['data'] | null>(null)
const chat = useChat(computed(() => caseNumber))

// Chat mode: 'ai' | 'mediator'
const chatMode = ref<'ai' | 'mediator'>('ai')
const aiTurnCount = ref(0)
const turnPromptShown = ref(false)

function switchToAI() {
  chatMode.value = 'ai'
  turnPromptShown.value = false
}

function switchToMediator() {
  chatMode.value = 'mediator'
  openMediatorModal()
}

// Mediator selection state
const showMediatorModal = ref(false)

async function openMediatorModal() {
  showMediatorModal.value = true
  selectedMediatorId.value = null
  matchingMediators.value = true
  try {
    const resp = await $fetch<{ success: boolean; data: any[] }>('/api/mediators/match', {
      query: { caseId: caseNumber },
    })
    if (resp.success) matchedMediatorList.value = resp.data
  } catch {}
  matchingMediators.value = false
}
const matchingMediators = ref(false)
const bindingMediator = ref(false)
const selectedMediatorId = ref<string | null>(null)
const matchedMediatorList = ref<Array<{
  id: string; name: string; score: number; specialties: string[]
  appointmentType?: string; education?: string; university?: string
  organization?: string; position?: string
}>>([])

// Bind mediator to case
async function bindMediator() {
  if (!selectedMediatorId.value) return
  bindingMediator.value = true
  try {
    await $fetch('/api/cases/bind-mediator', {
      method: 'POST',
      body: { caseId: caseNumber, mediatorId: selectedMediatorId.value },
    })
    showMediatorModal.value = false
    // Update local state: mark as active, hide buttons
    if (caseData.value) {
      caseData.value.phase = 'active'
      caseData.value.mediatorId = selectedMediatorId.value
    }
    showMediatorBanner.value = true
  } catch {} finally {
    bindingMediator.value = false
  }
}

// End dialog → show mediator selection
async function handleEndDialog() {
  try {
    await $fetch('/api/cases/end-dialog', {
      method: 'POST',
      body: { caseId: caseNumber },
    })
    // Refresh to get new phase
    if (caseData.value) {
      caseData.value.phase = 'mediator_selection'
    }
  } catch {}
}

// Messages from AI tab (filtered from all messages)
const aiMessages = computed(() => {
  // Active phase: show all messages (party + mediator + ai)
  if (caseData.value?.phase === 'active') {
    return chat.messages.value
  }
  return chat.messages.value.filter(m => m.senderType === 'party' || m.senderType === 'ai')
})

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

// Polling for mediator messages when active
let medPollTimer: ReturnType<typeof setInterval> | null = null

watch(() => caseData.value?.phase, (phase) => {
  if (phase === 'active') {
    medPollTimer = setInterval(async () => {
      try {
        const resp = await $fetch<{ success: boolean; data: any[] }>(`/api/chat/messages/${caseNumber}`, {
          query: { sessionToken: sessionToken.value || accessCode },
        })
        if (resp?.data) {
          chat.messages.value = resp.data.map((m: any) => ({
            ...m,
            senderType: m.senderType as 'party' | 'mediator' | 'ai',
          }))
        }
      } catch {}
    }, 1000)
  } else {
    if (medPollTimer) { clearInterval(medPollTimer); medPollTimer = null }
  }
})

onUnmounted(() => {
  if (medPollTimer) clearInterval(medPollTimer)
})

// Auto-scroll when messages change
watch([() => chat.messages.value.length, () => chat.aiStreamContent.value], () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
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
  if (senderType === 'mediator') {
    return 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100'
  }
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
}

function formatTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const showMediatorBanner = ref(false)

async function handleSend() {
  const text = inputMessage.value.trim()
  if (!text) return

  inputMessage.value = ''

  // Active phase: send to mediator via HTTP
  if (caseData.value?.phase === 'active') {
    await $fetch('/api/chat/messages', {
      method: 'POST',
      body: {
        caseId: caseNumber,
        content: text,
        senderType: 'party',
        senderName: '当事人',
      },
    })
    return
  }

  chat.messages.value.push({
    id: `party-${Date.now()}`,
    caseId: caseNumber,
    senderType: 'party',
    senderName: '当事人',
    content: text,
    createdAt: new Date().toISOString(),
  })
  const result = await chat.sendAiMessage(text, 'party', '当事人')

  aiTurnCount.value++
  if (result?.dialogEnded) {
    showMediatorBanner.value = true
    if (caseData.value) caseData.value.phase = 'mediator_selection'
    setTimeout(() => { window.location.reload() }, 500)
  }

  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}
</script>
