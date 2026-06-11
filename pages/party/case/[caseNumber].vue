// v1780639939949 - Taobao-style unified chat
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

      <!-- Status bar: mediator bound + request status -->
      <div
        v-if="chatState === 'waiting_mediator'"
        class="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-amber-50 dark:bg-amber-950 flex items-center gap-2"
      >
        <UIcon name="i-lucide-bell-ring" class="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse" />
        <span class="text-sm text-amber-800 dark:text-amber-200">已通知调解员，请等待回复...</span>
      </div>
      <div
        v-else-if="chatState === 'mediator_active'"
        class="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-green-50 dark:bg-green-950 flex items-center gap-2"
      >
        <UIcon name="i-lucide-user-check" class="w-4 h-4 text-green-600 dark:text-green-400" />
        <span class="text-sm text-green-800 dark:text-green-200">调解员已介入对话</span>
      </div>

      <!-- Call mediator prompt (after 3 rounds, mediator already bound) -->
      <div
        v-if="showCallMediatorPrompt && chatState === 'ai' && caseData.mediatorId"
        class="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-blue-50 dark:bg-blue-950 flex items-center justify-between"
      >
        <span class="text-sm text-blue-800 dark:text-blue-200">
          <UIcon name="i-lucide-info" class="w-4 h-4 inline -mt-0.5 mr-1" />
          已进行 {{ sessionTurnCount }} 轮咨询，如需调解员帮助可点击右侧按钮
        </span>
        <button
          class="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          @click="callMediator"
        >
          <UIcon name="i-lucide-phone-call" class="w-4 h-4 inline -mt-0.5 mr-1" />
          联系调解员
        </button>
      </div>

      <!-- Chat Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
        <template v-if="allMessages.length">
          <template v-for="msg in allMessages" :key="msg.id">
            <!-- System message -->
            <div v-if="msg.senderType === 'system'" class="flex justify-center">
              <div class="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                {{ msg.content }}
              </div>
            </div>
            <!-- Regular message -->
            <div
              v-else
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
            :placeholder="chatState === 'mediator_active' ? '与调解员对话...' : '输入您的问题...'"
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

    <!-- Mediator Selection Overlay -->
    <div v-if="showMediatorModal" class="fixed inset-0 z-50 flex items-center justify-center" style="background:rgba(0,0,0,0.4)" @click.self="showMediatorModal = false">
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" @click.stop>
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">选择调解员</h2>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showMediatorModal = false">
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </div>
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
    mediatorRequestedAt: number | null
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

// ── Intent keywords for semantic detection ──────────────────
const MEDIATOR_KEYWORDS = ['调解员', '人工', '联系', '找调解员', '呼叫', '转人工', '真人']

const route = useRoute()
const caseNumber = route.params.caseNumber as string
const accessCode = route.query.code as string

const inputMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const pending = ref(true)
const fetchError = ref(false)
const sessionToken = ref<string | undefined>()

const caseData = ref<CaseResponse['data'] | null>(null)
const chat = useChat(computed(() => caseNumber))

// ── Session state machine ──────────────────────────────────
// 'ai' | 'waiting_mediator' | 'mediator_active'
const chatState = ref<'ai' | 'waiting_mediator' | 'mediator_active'>('ai')
const sessionTurnCount = ref(0)
const showCallMediatorPrompt = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | null = null

// All messages (party + ai + mediator) — system messages hidden
const allMessages = computed(() => chat.messages.value.filter(m => m.senderType !== 'system'))

// ── Semantic intent detection ──────────────────────────────
function hasMediatorIntent(text: string): boolean {
  return MEDIATOR_KEYWORDS.some(kw => text.includes(kw))
}

// ── Idle timer management ──────────────────────────────────
function startIdleTimer() {
  clearIdleTimer()
  idleTimer = setTimeout(() => {
    if (chatState.value === 'ai' && sessionTurnCount.value >= 3) {
      showCallMediatorPrompt.value = true
    }
  }, 60_000) // 1 minute
}

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
}

// ── Mediator selection (first-time binding) ────────────────
const showMediatorModal = ref(false)
const matchingMediators = ref(false)
const bindingMediator = ref(false)
const selectedMediatorId = ref<string | null>(null)
const matchedMediatorList = ref<Array<{
  id: string; name: string; score: number; specialties: string[]
  appointmentType?: string; education?: string; university?: string
  organization?: string; position?: string
}>>([])

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

async function bindMediator() {
  if (!selectedMediatorId.value) return
  bindingMediator.value = true
  try {
    await $fetch('/api/cases/bind-mediator', {
      method: 'POST',
      body: { caseId: caseNumber, mediatorId: selectedMediatorId.value },
    })
    showMediatorModal.value = false
    if (caseData.value) {
      caseData.value.phase = 'active'
      caseData.value.mediatorId = selectedMediatorId.value
    }
    // After binding, show the "联系调解员" prompt so party can call mediator
    showCallMediatorPrompt.value = true
  } catch {} finally {
    bindingMediator.value = false
  }
}

// ── Call mediator (request intervention) ───────────────────
async function callMediator() {
  if (!caseData.value?.mediatorId) {
    // No mediator bound yet → show selection
    await openMediatorModal()
    return
  }
  try {
    await $fetch(`/api/cases/${caseNumber}/call-mediator`, { method: 'POST' })
    chatState.value = 'waiting_mediator'
    showCallMediatorPrompt.value = false
    clearIdleTimer()

    // Add local system message
    chat.messages.value.push({
      id: `sys-${Date.now()}`,
      caseId: caseNumber,
      senderType: 'system',
      senderName: '系统',
      content: '已通知调解员，请等待回复...',
      createdAt: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('call-mediator failed:', err)
  }
}

// ── Mediator message polling ──────────────────────────────
let medPollTimer: ReturnType<typeof setInterval> | null = null

function startMediatorPolling() {
  if (medPollTimer) return
  medPollTimer = setInterval(async () => {
    try {
      const resp = await $fetch<{ success: boolean; data: any[] }>(`/api/chat/messages/${caseNumber}`, {
        query: { sessionToken: sessionToken.value || accessCode },
      })
      if (resp?.data) {
        const prevLen = chat.messages.value.length
        chat.messages.value = resp.data.map((m: any) => ({
          ...m,
          senderType: m.senderType as 'party' | 'mediator' | 'ai' | 'system',
        }))
        // Check if mediator has responded
        if (chatState.value === 'waiting_mediator') {
          const hasMediatorMsg = resp.data.some((m: any) => m.senderType === 'mediator')
          if (hasMediatorMsg) {
            chatState.value = 'mediator_active'
          }
        }
      }
    } catch {}
  }, 1500)
}

function stopMediatorPolling() {
  if (medPollTimer) { clearInterval(medPollTimer); medPollTimer = null }
}

// ── Watch chatState to start/stop polling ──────────────────
watch(chatState, (state) => {
  if (state === 'waiting_mediator' || state === 'mediator_active') {
    startMediatorPolling()
  }
})

// ── Fetch case data ───────────────────────────────────────
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
        senderType: m.senderType as 'party' | 'mediator' | 'ai' | 'system',
      }))
    }

    // Determine initial chatState based on case data
    if (resp.data.phase === 'active' && resp.data.mediatorId) {
      // Mediator already bound — check if there are mediator messages
      const hasMediatorMsgs = resp.data.messages?.some(m => m.senderType === 'mediator')
      if (hasMediatorMsgs) {
        chatState.value = 'mediator_active'
      } else {
        // Mediator bound but hasn't responded yet; start in AI mode
        chatState.value = 'ai'
        showCallMediatorPrompt.value = true
      }
    }
  } catch {
    fetchError.value = true
  } finally {
    pending.value = false
  }

  chat.connectWebSocket(sessionToken.value || accessCode, 'party')
})

onUnmounted(() => {
  stopMediatorPolling()
  clearIdleTimer()
  chat.disconnect()
})

// ── Auto-scroll ───────────────────────────────────────────
watch([() => chat.messages.value.length, () => chat.aiStreamContent.value], () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
})

// ── Helpers ───────────────────────────────────────────────
const amountDisplay = computed(() => {
  if (!caseData.value) return '—'
  const text = caseData.value.claimsSummary || caseData.value.description || ''
  const match = text.match(/(\d[\d,]+)\s*元/)
  if (match) return '¥' + match[1]
  return '—'
})

function bubbleClass(senderType: string) {
  if (senderType === 'party') return 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
  if (senderType === 'ai') return 'bg-blue-50 dark:bg-blue-950/30 text-gray-800 dark:text-gray-200 border border-blue-200 dark:border-blue-900'
  if (senderType === 'mediator') return 'bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100'
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
}

function formatTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// ── Send message ──────────────────────────────────────────
async function handleSend() {
  const text = inputMessage.value.trim()
  if (!text) return
  inputMessage.value = ''

  // ── Mediator active: send to mediator via HTTP ──────────
  if (chatState.value === 'mediator_active') {
    await $fetch('/api/chat/messages', {
      method: 'POST',
      body: {
        caseId: caseNumber,
        content: text,
        senderType: 'party',
        senderName: '当事人',
      },
    })
    // Re-fetch messages to show the new one
    try {
      const resp = await $fetch<{ success: boolean; data: any[] }>(`/api/chat/messages/${caseNumber}`, {
        query: { sessionToken: sessionToken.value || accessCode },
      })
      if (resp?.data) {
        chat.messages.value = resp.data.map((m: any) => ({
          ...m,
          senderType: m.senderType as 'party' | 'mediator' | 'ai' | 'system',
        }))
      }
    } catch {}
    return
  }

  // ── Waiting for mediator: can still chat with AI ────────
  // (Allow party to continue talking to AI while waiting)

  // ── AI mode: send to AI ─────────────────────────────────
  chat.messages.value.push({
    id: `party-${Date.now()}`,
    caseId: caseNumber,
    senderType: 'party',
    senderName: '当事人',
    content: text,
    createdAt: new Date().toISOString(),
  })

  await chat.sendAiMessage(text, 'party', '当事人')
  sessionTurnCount.value++

  // Check semantic intent
  if (sessionTurnCount.value >= 3 && hasMediatorIntent(text)) {
    if (!caseData.value?.mediatorId) {
      // No mediator → show selection
      openMediatorModal()
    } else {
      // Has mediator → show call button immediately
      showCallMediatorPrompt.value = true
      clearIdleTimer()
    }
  } else if (sessionTurnCount.value >= 3 && !showCallMediatorPrompt.value) {
    // Start idle timer after 3rd round
    startIdleTimer()
  }

  // First time: after 3 rounds, no mediator → show selection
  if (sessionTurnCount.value >= 3 && !caseData.value?.mediatorId && !showMediatorModal.value) {
    openMediatorModal()
  }

  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}
</script>
