<template>
  <div class="flex-1 min-h-0 flex flex-col">
    <!-- Loading -->
    <div v-if="authLoading" class="flex items-center justify-center py-32">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-[#1e3a5f] dark:text-gray-400 animate-spin" />
    </div>

    <!-- Main Content -->
    <div v-else class="flex-1 flex flex-col min-h-0">

      <!-- Three-column layout -->
      <div class="flex-1 flex min-h-0">
        <!-- Left Panel: Case Info -->
        <div class="w-72 shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-950">
          <div v-if="caseData" class="p-4 space-y-5">
            <div>
              <label class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">案件编号</label>
              <p class="font-mono text-base font-medium text-gray-900 dark:text-white">{{ caseData.id }}</p>
            </div>
            <div>
              <label class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">案件标题</label>
              <p class="text-base font-medium text-gray-900 dark:text-white">{{ caseData.title }}</p>
            </div>
            <div>
              <label class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">状态</label>
              <UBadge :color="statusColor" variant="soft" size="xs">
                {{ statusLabel }}
              </UBadge>
            </div>
            <div>
              <label class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">甲方</label>
              <p class="text-base text-gray-900 dark:text-white">{{ caseData.partyAName }}</p>
              <p v-if="caseData.partyAContact" class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ caseData.partyAContact }}</p>
            </div>
            <div>
              <label class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">乙方</label>
              <p class="text-base text-gray-900 dark:text-white">{{ caseData.partyBName }}</p>
              <p v-if="caseData.partyBContact" class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ caseData.partyBContact }}</p>
            </div>
            <div>
              <label class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">访问验证码</label>
              <p class="font-mono text-sm bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded px-2 py-1 inline-block">
                {{ caseData.accessCode }}
              </p>
            </div>
            <div v-if="caseData.description">
              <label class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1">案件描述</label>
              <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{{ caseData.description }}</p>
            </div>
          </div>
        </div>

        <!-- Center: Chat Area -->
        <div class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
          <!-- Chat header -->
          <div class="h-10 shrink-0 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
            <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">案件对话</span>
            <div class="flex items-center gap-1.5">
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="chat.connected.value ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'"
              />
              <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                {{ chat.connected.value ? 'connected' : 'disconnected' }}
              </span>
            </div>
          </div>

          <!-- Messages -->
          <div ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <template v-if="chat.messages.value.length">
              <div
                v-for="msg in chat.messages.value"
                :key="msg.id"
                class="flex"
                :class="isSelf(msg) ? 'justify-end' : 'justify-start'"
              >
                <div
                  class="max-w-[75%] rounded-lg px-3 py-2"
                  :class="bubbleClass(msg.senderType)"
                >
                  <div class="text-xs font-medium mb-1 opacity-60">
                    {{ senderLabel(msg) }}
                  </div>
                  <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
                  <div class="text-xs mt-1 opacity-40 text-right font-mono">
                    {{ formatTime(msg.createdAt) }}
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="flex items-center justify-center h-full">
              <div class="text-center">
                <UIcon name="i-lucide-message-circle" class="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                <p class="text-sm text-gray-400 dark:text-gray-500">暂无对话记录</p>
              </div>
            </div>

            <!-- Typing indicator -->
            <div v-if="chat.isTyping.value" class="flex justify-start">
              <div class="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg px-3 py-2 text-sm">
                {{ chat.typingUser.value || '对方' }} 正在输入...
              </div>
            </div>
          </div>

          <!-- Input -->
          <div class="border-t border-gray-200 dark:border-gray-800 p-3">
            <form @submit.prevent="handleSend" class="flex gap-2">
              <UTextarea
                v-model="inputMessage"
                placeholder="输入消息..."
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
                :disabled="!inputMessage.trim()"
                class="self-end bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
              >
                发送
              </UButton>
            </form>
          </div>
        </div>

        <!-- Right Panel: AI Assistant -->
        <div class="w-72 shrink-0 border-l border-gray-200 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-950">
          <div class="p-4 space-y-4">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-brain" class="w-4 h-4 text-[#1e3a5f] dark:text-gray-400" />
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">AI 助手</span>
            </div>

            <div class="space-y-2">
              <UButton
                block
                variant="outline"
                size="lg"
                icon="i-lucide-lightbulb"
                :loading="aiActionLoading === 'suggest'"
                :disabled="!!aiActionLoading"
                @click="generateMediationSuggestion"
              >
                生成调解建议
              </UButton>

              <UButton
                block
                variant="outline"
                size="lg"
                icon="i-lucide-file-search"
                :loading="aiActionLoading === 'analyze'"
                :disabled="!!aiActionLoading"
                @click="analyzeCase"
              >
                分析案件
              </UButton>
            </div>

            <!-- AI Response -->
            <div v-if="aiResponse" class="mt-3">
              <div class="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                <div class="text-xs font-mono font-medium text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">
                  {{ aiResponseTitle }}
                </div>
                <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {{ aiResponse }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const caseId = route.params.id as string
const auth = useAuth()

const authLoading = ref(true)
const inputMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const aiResponse = ref('')
const aiResponseTitle = ref('')
const aiActionLoading = ref<string | null>(null)

interface CaseDetail {
  id: string
  title: string
  description: string | null
  partyAName: string
  partyBName: string
  partyAContact: string | null
  partyBContact: string | null
  status: string
  accessCode: string
  mediatorId: string | null
  createdAt: string
  updatedAt: string
}

const caseData = ref<CaseDetail | null>(null)

const chat = useChat(computed(() => caseId))

// Auth check + fetch data
onMounted(async () => {
  const user = await auth.fetchUser()
  if (!user) {
    navigateTo('/mediator/login')
    return
  }
  authLoading.value = false

  // Fetch case
  await fetchCaseDetail()

  // Connect WebSocket as mediator
  chat.connectWebSocket(undefined, 'mediator', auth.user.value?.id)
})

onUnmounted(() => {
  chat.disconnect()
})

async function fetchCaseDetail() {
  try {
    const resp = await $fetch<{
      success: boolean
      data: CaseDetail & {
        messages: Array<{
          id: string
          senderType: string
          senderId?: string | null
          senderName?: string | null
          content: string
          createdAt: string
        }>
        documents: any[]
      }
    }>(`/api/cases/${caseId}`)

    if (resp.data) {
      caseData.value = {
        id: resp.data.id,
        title: resp.data.title,
        description: resp.data.description,
        partyAName: resp.data.partyAName,
        partyBName: resp.data.partyBName,
        partyAContact: resp.data.partyAContact,
        partyBContact: resp.data.partyBContact,
        status: resp.data.status,
        accessCode: resp.data.accessCode,
        mediatorId: resp.data.mediatorId,
        createdAt: resp.data.createdAt,
        updatedAt: resp.data.updatedAt,
      }
      if (resp.data.messages) {
        chat.messages.value = resp.data.messages.map(m => ({
          ...m,
          senderType: m.senderType as 'party' | 'mediator' | 'ai',
          caseId: caseId,
        }))
      }
    }
  }
  catch {
    navigateTo('/mediator')
  }
}

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

function isSelf(msg: { senderType: string }) {
  return msg.senderType === 'mediator'
}

function senderLabel(msg: { senderType: string; senderName?: string | null }) {
  if (msg.senderType === 'mediator') return '调解员（您）'
  if (msg.senderType === 'ai') return 'AI助手'
  return msg.senderName || '当事人'
}

function bubbleClass(senderType: string) {
  if (senderType === 'mediator') {
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

function handleSend() {
  const text = inputMessage.value.trim()
  if (!text) return

  inputMessage.value = ''

  chat.sendMessage(text)
  chat.messages.value.push({
    id: `mediator-${Date.now()}`,
    caseId: caseId,
    senderType: 'mediator',
    senderId: auth.user.value?.id,
    senderName: auth.user.value?.name || '调解员',
    content: text,
    createdAt: new Date().toISOString(),
  })

  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

async function generateMediationSuggestion() {
  aiActionLoading.value = 'suggest'
  aiResponseTitle.value = '调解建议'
  aiResponse.value = ''

  try {
    const data = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/ai', {
      method: 'POST',
      body: {
        caseId,
        message: '请根据当前案件的全部信息，生成专业的调解建议。包括：1) 双方争议焦点分析；2) 可能的调解方案；3) 调解策略建议。',
        senderIdentifier: 'mediator',
        senderName: auth.user.value?.name || '调解员',
      },
    })

    if (data?.data?.content) {
      aiResponse.value = data.data.content
    }
  }
  catch (err: any) {
    aiResponse.value = `错误: ${err?.data?.message || err?.message || '请求失败'}`
  }
  finally {
    aiActionLoading.value = null
  }
}

async function analyzeCase() {
  aiActionLoading.value = 'analyze'
  aiResponseTitle.value = '案件分析'
  aiResponse.value = ''

  try {
    const data = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/ai', {
      method: 'POST',
      body: {
        caseId,
        message: '请对当前案件进行全面分析。包括：1) 案件概况总结；2) 双方权利义务分析；3) 法律依据参考；4) 风险评估；5) 处理建议。',
        senderIdentifier: 'mediator',
        senderName: auth.user.value?.name || '调解员',
      },
    })

    if (data?.data?.content) {
      aiResponse.value = data.data.content
    }
  }
  catch (err: any) {
    aiResponse.value = `错误: ${err?.data?.message || err?.message || '请求失败'}`
  }
  finally {
    aiActionLoading.value = null
  }
}

async function handleLogout() {
  await auth.logout()
}
</script>
