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
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-4">
        <div class="flex-1 grid grid-cols-5 gap-3 text-base">
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
        <button
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
          :disabled="exiting"
          @click="exitCase"
        >
          <UIcon :name="exiting ? 'i-lucide-loader-2' : 'i-lucide-log-out'" class="w-4 h-4" :class="{ 'animate-spin': exiting }" />
          {{ exiting ? '保存中...' : '退出案件' }}
        </button>
      </div>

      <!-- Agent processing status bar -->
      <div
        v-if="agentStatus === 'processing'"
        class="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-amber-50 dark:bg-amber-950 flex items-center gap-2"
      >
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" />
        <span class="text-sm text-amber-800 dark:text-amber-200">专家正在分析您的案件，请稍候...</span>
      </div>
      <div
        v-else-if="agentStatus === 'done'"
        class="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-green-50 dark:bg-green-950 flex items-center gap-2"
      >
        <UIcon name="i-lucide-clipboard-check" class="w-4 h-4 text-green-600 dark:text-green-400" />
        <span class="text-sm text-green-800 dark:text-green-200">专家分析已完成，详见下方《案件分析》与《材料补正清单》</span>
      </div>

      <!-- Expert Analysis Panel -->
      <div v-if="agentStatus === 'done' && (agentAnalysis || materialChecklist)" class="shrink-0 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <div class="px-4 py-3 space-y-3">
          <div v-if="agentAnalysis" class="rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-gray-900 p-3">
            <div class="flex items-center gap-2 mb-1.5">
              <UIcon name="i-lucide-file-text" class="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">案件分析</h3>
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ agentAnalysis }}</div>
          </div>
          <div v-if="materialChecklist" class="rounded-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-gray-900 p-3">
            <div class="flex items-center gap-2 mb-1.5">
              <UIcon name="i-lucide-list-checks" class="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">材料补正清单</h3>
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ materialChecklist }}</div>
          </div>
        </div>
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
            :placeholder="'输入您的问题...'"
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

const inputMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const pending = ref(true)
const fetchError = ref(false)
const sessionToken = ref<string | undefined>()

const caseData = ref<CaseResponse['data'] | null>(null)
const chat = useChat(computed(() => caseNumber))
const exiting = ref(false)

// ── Expert analysis panel state ──────────────────────────
const agentStatus = ref<'pending' | 'processing' | 'done'>('pending')
const agentAnalysis = ref('')
const materialChecklist = ref('')
let agentPollTimer: ReturnType<typeof setInterval> | null = null

async function loadAgentAnalysis() {
  try {
    const resp = await $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}/analysis`, {
      query: { code: accessCode },
    })
    if (resp?.success && resp.data) {
      agentStatus.value = resp.data.agentStatus || 'pending'
      agentAnalysis.value = resp.data.agentAnalysis || ''
      materialChecklist.value = resp.data.materialChecklist || ''
      if (agentStatus.value === 'done') stopAgentPolling()
    }
  } catch {}
}

function startAgentPolling() {
  if (agentPollTimer) return
  agentPollTimer = setInterval(loadAgentAnalysis, 5000)
}

function stopAgentPolling() {
  if (agentPollTimer) { clearInterval(agentPollTimer); agentPollTimer = null }
}

// ── Exit case: save conversation then navigate back ──────
async function exitCase() {
  if (exiting.value) return
  exiting.value = true

  if (chat.messages.value.length > 0) {
    try {
      await $fetch(`/api/cases/${caseNumber}/conversations`, {
        method: 'POST',
        body: {
          messages: chat.messages.value.map(m => ({
            senderType: m.senderType,
            senderName: m.senderName,
            content: m.content,
            createdAt: m.createdAt,
          })),
          savedBy: 'party',
          partyIdentifier: sessionToken.value || accessCode || 'party',
        },
      })
    } catch (err) {
      console.error('Failed to save conversation on exit:', err)
    }
  }

  stopAgentPolling()
  chat.disconnect()
  navigateTo('/party')
}

// All messages (party + ai) — system messages hidden
const allMessages = computed(() => chat.messages.value.filter(m => m.senderType !== 'system'))

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
          senderType: m.senderType as 'party' | 'ai' | 'system',
      }))
    }

    // 如果没有消息，自动触发AI欢迎消息
    if (chat.messages.value.length === 0) {
      try {
        await $fetch('/api/chat/ai', {
          method: 'POST',
          body: {
            caseId: caseNumber,
            message: '__init_welcome__',
            senderIdentifier: caseData.value?.partyAName || '当事人',
            senderName: caseData.value?.partyAName,
            skipSave: true,
          },
        })
        const reload = await $fetch<{ data: any[] }>(`/api/chat/messages/${caseNumber}`)
        chat.messages.value = reload.data.map(m => ({
          ...m,
        senderType: m.senderType as 'party' | 'ai' | 'system',
        }))
      } catch (err) {
        console.warn('[case-page] AI欢迎消息触发失败', err)
      }
    }

    // 加载专家分析状态
    await loadAgentAnalysis()
    if (agentStatus.value !== 'done') startAgentPolling()
  } catch {
    fetchError.value = true
  } finally {
    pending.value = false
  }

  chat.connectWebSocket(sessionToken.value || accessCode)
})

onUnmounted(() => {
  stopAgentPolling()
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
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
}

function formatTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// ── Send message (party → AI, persisted to DB) ───────────
async function handleSend() {
  const text = inputMessage.value.trim()
  if (!text) return
  inputMessage.value = ''

  chat.messages.value.push({
    id: `party-${Date.now()}`,
    caseId: caseNumber,
    senderType: 'party',
    senderName: '当事人',
    content: text,
    createdAt: new Date().toISOString(),
  })

  await chat.sendAiMessage(text, 'party', '当事人')

  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}
</script>
