<template>
  <!-- Auth loading -->
  <div v-if="authLoading" class="flex-1 flex items-center justify-center">
    <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-400 dark:text-blue-500 animate-spin" />
  </div>

  <!-- Login form when not authenticated -->
  <div v-else-if="!auth.isAuthenticated.value" class="flex-1 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="flex items-center justify-center gap-2.5 mb-3">
          <UIcon name="i-lucide-scale" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
          <span class="text-3xl font-semibold text-gray-900 dark:text-white">全时在线的争议解决专家</span>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono mt-1">Always Online Dispute Resolution Expert</p>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">mediator sign in</p>
      </div>
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 shadow-sm dark:shadow-none">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">用户名</label>
            <UInput v-model="loginUsername" placeholder="请输入拼音用户名" icon="i-lucide-user" size="lg" :disabled="loginLoading" autocomplete="username" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">密码</label>
            <UInput v-model="loginPassword" type="password" placeholder="请输入密码" icon="i-lucide-lock" size="lg" :disabled="loginLoading" autocomplete="current-password" />
          </div>
          <UAlert v-if="loginError" color="error" variant="soft" :title="loginError" />
          <UButton type="submit" block size="xl" :loading="loginLoading" :disabled="!loginUsername.trim() || !loginPassword.trim()" class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100">
            登录
          </UButton>
        </form>
      </div>
    </div>
  </div>

  <!-- Main content when authenticated -->
  <div v-else class="flex-1 flex min-h-0">
    <!-- Left: Case List -->
    <div class="w-80 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-950">
      <!-- Search & Actions -->
      <div class="p-4 border-b border-gray-200 dark:border-gray-800 space-y-3">
        <UInput v-model="searchQuery" placeholder="搜索案件编号..." icon="i-lucide-search" size="sm" />
        <UButton icon="i-lucide-plus" size="lg" block class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100" @click="showCreateDialog = true">
          新建案件
        </UButton>
      </div>

      <!-- Case Cards -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <div v-if="casesLoading" class="flex items-center justify-center py-16">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-blue-400 dark:text-blue-500 animate-spin" />
        </div>
        <template v-else>
          <button
            v-for="c in filteredCases"
            :key="c.id"
            class="w-full text-left p-3 rounded-md transition-colors border"
            :class="selectedCaseId === c.id
              ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'"
            @click="selectCase(c.id)"
          >
            <div class="text-sm font-mono text-gray-400 dark:text-gray-500 mb-1">{{ c.id }}</div>
            <div class="text-base font-medium text-gray-900 dark:text-white truncate">{{ c.title }}</div>
            <div class="flex items-center gap-2 mt-1.5">
              <UBadge :color="getStatusColor(c.status)" variant="soft" size="xs">
                {{ getStatusLabel(c.status) }}
              </UBadge>
              <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">{{ formatDate(c.createdAt) }}</span>
            </div>
          </button>
          <div v-if="!casesLoading && filteredCases.length === 0" class="py-16 text-center">
            <UIcon name="i-lucide-inbox" class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p class="text-sm text-gray-400 dark:text-gray-500">暂无案件</p>
          </div>
        </template>
      </div>
    </div>

    <!-- Right: Empty or Chat -->
    <div class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
      <div v-if="!selectedCaseId" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <UIcon name="i-lucide-message-circle" class="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">调解员工作台</h2>
          <p class="text-sm text-gray-400 dark:text-gray-500 font-mono">选择左侧案件开始对话</p>
        </div>
      </div>
      <div v-else class="flex-1 flex flex-col min-h-0">
        <!-- Chat -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <template v-if="selectedMessages.length">
            <div
              v-for="msg in selectedMessages"
              :key="msg.id"
              class="flex"
              :class="msg.senderType === 'mediator' ? 'justify-end' : 'justify-start'"
            >
              <div class="max-w-[75%] rounded-lg px-3 py-2" :class="bubbleClass(msg.senderType)">
                <div class="text-xs font-medium mb-1 opacity-60">{{ senderLabel(msg) }}</div>
                <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
                <div class="text-xs mt-1 opacity-40 text-right font-mono">{{ formatTime(msg.createdAt) }}</div>
              </div>
            </div>
          </template>
          <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <UIcon name="i-lucide-message-circle" class="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p class="text-sm text-gray-400 dark:text-gray-500">暂无对话记录</p>
            </div>
          </div>
        </div>

        <!-- Quick Input -->
        <div class="border-t border-gray-200 dark:border-gray-800 p-3">
          <form @submit.prevent="sendQuickMessage" class="flex gap-2">
            <UInput v-model="quickMessage" placeholder="输入消息..." class="flex-1" size="sm" />
            <UButton type="submit" icon="i-lucide-send" size="lg" :disabled="!quickMessage.trim()" class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100" />
          </form>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Case Dialog -->
  <UModal v-model:open="showCreateDialog">
    <template #header>
      <h3 class="text-base font-semibold text-gray-900 dark:text-white">新建案件</h3>
    </template>
    <template #body>
      <form @submit.prevent="handleCreateCase" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">案件标题</label>
          <UInput v-model="newCase.title" placeholder="请输入案件标题" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">案件描述</label>
          <UTextarea v-model="newCase.description" placeholder="请输入案件描述" :rows="3" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">甲方名称</label>
            <UInput v-model="newCase.partyAName" placeholder="甲方" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">乙方名称</label>
            <UInput v-model="newCase.partyBName" placeholder="乙方" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">甲方联系方式</label>
            <UInput v-model="newCase.partyAContact" placeholder="选填" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">乙方联系方式</label>
            <UInput v-model="newCase.partyBContact" placeholder="选填" />
          </div>
        </div>
        <UAlert v-if="createError" color="error" variant="soft" :title="createError" />
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" size="lg" @click="showCreateDialog = false">取消</UButton>
        <UButton size="lg" class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100" :loading="creating" :disabled="!newCase.title || !newCase.partyAName || !newCase.partyBName" @click="handleCreateCase">
          创建
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const router = useRouter()
const auth = useAuth()

const authLoading = ref(true)
const casesLoading = ref(true)
const searchQuery = ref('')
const showCreateDialog = ref(false)
const creating = ref(false)
const createError = ref('')
const selectedCaseId = ref<string | null>(null)
const quickMessage = ref('')

// Login form state
const loginUsername = ref('')
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')

interface CaseItem {
  id: string
  title: string
  description: string | null
  partyAName: string
  partyBName: string
  partyAContact: string | null
  partyBContact: string | null
  status: string
  mediatorId: string | null
  mediatorName: string | null
  accessCode: string
  createdAt: string
  updatedAt: string
}

interface MessageItem {
  id: string
  caseId: string
  senderType: string
  senderId?: string | null
  senderName?: string | null
  content: string
  createdAt: string
}

const cases = ref<CaseItem[]>([])
const allMessages = ref<MessageItem[]>([])
const chat = useChat(computed(() => selectedCaseId.value || ''))

const newCase = reactive({
  title: '',
  description: '',
  partyAName: '',
  partyBName: '',
  partyAContact: '',
  partyBContact: '',
})

onMounted(async () => {
  const user = await auth.fetchUser()
  authLoading.value = false
  if (user) {
    await fetchCases()
  }
})

async function handleLogin() {
  loginError.value = ''
  loginLoading.value = true
  try {
    await auth.login(loginUsername.value.trim(), loginPassword.value)
    await fetchCases()
  } catch (err: any) {
    loginError.value = err.message || '登录失败，请检查用户名和密码'
  } finally {
    loginLoading.value = false
  }
}

async function fetchCases() {
  casesLoading.value = true
  try {
    const data = await $fetch<{ success: boolean; data: CaseItem[] }>('/api/cases')
    if (data?.data) {
      cases.value = data.data
    }
  } catch {
    // silent
  } finally {
    casesLoading.value = false
  }
}

const filteredCases = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return cases.value
  return cases.value.filter(c => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
})

const selectedMessages = computed(() => {
  if (!selectedCaseId.value) return []
  return allMessages.value.filter(m => m.caseId === selectedCaseId.value)
})

async function selectCase(id: string) {
  selectedCaseId.value = id
  chat.connectWebSocket(undefined, 'mediator', auth.user.value?.id)
  try {
    const resp = await $fetch<{ success: boolean; data: { messages: MessageItem[] } }>(`/api/cases/${id}`)
    if (resp?.data?.messages) {
      const otherMsgs = allMessages.value.filter(m => m.caseId !== id)
      const newMsgs = resp.data.messages.map(m => ({ ...m, caseId: id }))
      allMessages.value = [...otherMsgs, ...newMsgs]
    }
  } catch {
    // silent
  }
}

async function sendQuickMessage() {
  const text = quickMessage.value.trim()
  if (!text) return
  quickMessage.value = ''

  const msg: MessageItem = {
    id: `mediator-${Date.now()}`,
    caseId: selectedCaseId.value!,
    senderType: 'mediator',
    senderId: auth.user.value?.id,
    senderName: auth.user.value?.name || '调解员',
    content: text,
    createdAt: new Date().toISOString(),
  }
  allMessages.value.push(msg)
  chat.sendMessage(text)
}

function senderLabel(msg: { senderType: string; senderName?: string | null }) {
  if (msg.senderType === 'mediator') return '调解员（您）'
  if (msg.senderType === 'ai') return 'AI助手'
  return msg.senderName || '当事人'
}

function bubbleClass(senderType: string) {
  if (senderType === 'mediator') return 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
  if (senderType === 'ai') return 'bg-blue-50 dark:bg-blue-950/30 text-gray-800 dark:text-gray-200 border border-blue-200 dark:border-blue-900'
  return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
}

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString('zh-CN') } catch { return dateStr }
}

function getStatusColor(status: string) {
  const map: Record<string, string> = { pending: 'warning', active: 'success', resolved: 'info', closed: 'neutral' }
  return (map[status] || 'neutral') as any
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = { pending: '待处理', active: '进行中', resolved: '已解决', closed: '已关闭' }
  return map[status] || status
}

async function handleCreateCase() {
  creating.value = true
  createError.value = ''
  try {
    const data = await $fetch<{ success: boolean; data: CaseItem }>('/api/cases', {
      method: 'POST',
      body: {
        title: newCase.title,
        description: newCase.description,
        partyAName: newCase.partyAName,
        partyBName: newCase.partyBName,
        partyAContact: newCase.partyAContact,
        partyBContact: newCase.partyBContact,
      },
    })
    if (data?.data) cases.value.unshift(data.data)
    Object.assign(newCase, { title: '', description: '', partyAName: '', partyBName: '', partyAContact: '', partyBContact: '' })
    showCreateDialog.value = false
  } catch (err: any) {
    createError.value = err?.data?.message || err?.message || '创建失败'
  } finally {
    creating.value = false
  }
}

onUnmounted(() => {
  chat.disconnect()
})
</script>
