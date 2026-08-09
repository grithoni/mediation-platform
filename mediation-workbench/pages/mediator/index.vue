<script setup lang="ts">
// 调解员工作台 — 我的案件
const { user, isAuthenticated, login, fetchUser, getAuthHeaders, isLoading } = useAuth()

// ── 登录态管理 ──
const checking = ref(true)
const roleOk = ref(false)

interface CaseItem {
  id: string
  title: string
  description: string | null
  partyAName: string | null
  partyBName: string | null
  status: string | null
  phase: string | null
  mediatorId: string | null
  mediatorRequestedAt: number | null
  accessCode: string | null
  createdAt: number
  updatedAt: number
}

const cases = ref<CaseItem[]>([])
const loadingCases = ref(false)
const loadError = ref('')

// 搜索/筛选
const searchQuery = ref('')
const statusFilter = ref('all')
const phaseFilter = ref('all')

const phaseLabels: Record<string, string> = {
  intake: '收件', reviewing: '接案准备', accepted: '开启过程',
  mediating: '倾听理解', negotiating: '方案验证', agreement_drafting: '促成解决',
  withdrawn: '已撤回',
}

// 阶段统计（含顺序，用于统计卡片展示）
const phaseStats: { key: string; label: string; count: number }[] = [
  { key: 'intake', label: '收案', count: 0 },
  { key: 'reviewing', label: '接案准备', count: 0 },
  { key: 'accepted', label: '开启过程', count: 0 },
  { key: 'mediating', label: '倾听理解', count: 0 },
  { key: 'negotiating', label: '方案验证', count: 0 },
  { key: 'agreement_drafting', label: '促成解决', count: 0 },
  { key: 'withdrawn', label: '已撤回', count: 0 },
]

const statusLabels: Record<string, string> = {
  pending: '待处理', active: '进行中', resolved: '已解决', closed: '已关闭',
}

// 初始化：恢复登录态
onMounted(async () => {
  await fetchUser()
  checking.value = false
  if (user.value) {
    roleOk.value = ['mediator', 'case_manager', 'admin'].includes(user.value.role)
    if (roleOk.value) loadCases()
  }
})

// ── 登录 ──
const username = ref('')
const password = ref('')
const loginError = ref('')

async function handleLogin() {
  loginError.value = ''
  try {
    const u = await login(username.value, password.value)
    roleOk.value = ['mediator', 'case_manager', 'admin'].includes(u.role)
    if (!roleOk.value) {
      loginError.value = `当前账号角色（${u.role}）无调解员权限`
      return
    }
    loadCases()
  } catch (err: any) {
    loginError.value = err.message || '登录失败'
  }
}

// ── 案件列表 ──
async function loadCases() {
  loadingCases.value = true
  loadError.value = ''
  try {
    const data = await $fetch<{ success: boolean; data: CaseItem[] }>('/api/cases', {
      headers: getAuthHeaders(),
    })
    cases.value = data.data || []
  } catch (err: any) {
    loadError.value = err?.data?.message || err?.message || '加载案件失败'
  } finally {
    loadingCases.value = false
  }
}

// ── 筛选 ──
const filteredCases = computed(() => {
  let list = cases.value
  if (statusFilter.value !== 'all') {
    list = list.filter((c) => c.status === statusFilter.value)
  }
  if (phaseFilter.value !== 'all') {
    list = list.filter((c) => c.phase === phaseFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter((c) =>
      c.id.toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.partyAName || '').toLowerCase().includes(q) ||
      (c.partyBName || '').toLowerCase().includes(q)
    )
  }
  return list
})

// 各阶段案件数统计（基于当前搜索词，与 status/phase 筛选独立）
const phaseCounts = computed(() => {
  const counts: Record<string, number> = {}
  const q = searchQuery.value.trim().toLowerCase()
  const base = q
    ? cases.value.filter((c) =>
        c.id.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.partyAName || '').toLowerCase().includes(q) ||
        (c.partyBName || '').toLowerCase().includes(q)
      )
    : cases.value
  for (const c of base) {
    counts[c.phase || 'intake'] = (counts[c.phase || 'intake'] || 0) + 1
  }
  return phaseStats.map((s) => ({ ...s, count: counts[s.key] || 0 }))
})

function setPhaseFilter(key: string) {
  phaseFilter.value = phaseFilter.value === key ? 'all' : key
}

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ══════════════════════════════════════════════════════════
// 案件工作台：接入的大模型 + AI 对话框
// ══════════════════════════════════════════════════════════
interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

const activeCaseId = ref('')
const chatMessages = ref<ChatMsg[]>([])
const chatInput = ref('')
const chatSending = ref(false)
const chatError = ref('')

const modelName = ref('deepseek-v4-flash') // 已接入的大模型（可在底部切换）
const modelProvider = 'DeepSeek'
const modelOptions = [
  { label: 'deepseek-v4-flash', value: 'deepseek-v4-flash' },
  { label: 'deepseek-v4-pro', value: 'deepseek-v4-pro' },
]

watch(
  () => cases.value,
  (list) => {
    const first = list[0]
    if (first && !list.some((c) => c.id === activeCaseId.value)) {
      activeCaseId.value = first.id
    }
  },
  { immediate: true },
)

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text || chatSending.value) return
  if (!activeCaseId.value) {
    chatError.value = '请先选择案件'
    return
  }
  chatError.value = ''
  chatMessages.value.push({ role: 'user', content: text })
  chatInput.value = ''
  chatSending.value = true
  try {
    const data = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/ai', {
      method: 'POST',
      body: {
        caseId: activeCaseId.value,
        message: text,
        senderIdentifier: `mediator-${user.value?.username || 'anonymous'}`,
        model: modelName.value,
      },
    })
    chatMessages.value.push({ role: 'assistant', content: data.data?.content || '（无回复）' })
  } catch (err: any) {
    chatError.value = err?.data?.message || err?.message || '发送失败'
  } finally {
    chatSending.value = false
  }
}

function resetChat() {
  chatMessages.value = []
  chatError.value = ''
}
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col">
    <!-- ── 未登录：登录卡片 ── -->
    <div v-if="checking" class="flex items-center justify-center py-32">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
    </div>

    <div v-else-if="!isAuthenticated" class="max-w-md mx-auto mt-16 px-6">
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 shadow-sm">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">调解员登录</h1>
            <p class="text-xs text-gray-400 dark:text-gray-500">珠江国际商事调解院 · 调解员工作台</p>
          </div>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名</label>
            <UInput v-model="username" placeholder="请输入用户名" autocomplete="username" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">密码</label>
            <UInput v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" class="w-full" />
          </div>
          <UAlert v-if="loginError" color="error" variant="soft" :title="loginError" class="!mb-0" />
          <UButton type="submit" block size="lg" :loading="isLoading" class="bg-blue-600 hover:bg-blue-700 text-white">
            登录工作台
          </UButton>
        </form>

        <p class="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
          调解员账号由管理员分配 · 请联系管理员开通
        </p>
      </div>
    </div>

    <!-- ── 已登录但角色不符 ── -->
    <div v-else-if="!roleOk" class="max-w-md mx-auto mt-16 px-6">
      <UAlert color="error" variant="soft" title="无调解员权限" :description="`当前账号（${user?.name} / ${user?.role}）无法访问调解员工作台`" />
    </div>

    <!-- ── 已登录：案件工作台 + AI 对话框 ── -->
    <div v-else class="flex-1 min-w-0 flex flex-col">
      <!-- 上方案件工作台 -->
      <div class="flex-1 min-w-0 overflow-y-auto p-6">
        <div class="max-w-7xl mx-auto">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">案件工作台</h1>
              <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">共 {{ filteredCases.length }} 个案件 · 调解员 {{ user?.name }}</p>
            </div>
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="loadingCases" @click="loadCases">
              刷新
            </UButton>
          </div>

          <!-- Filters -->
          <div class="flex items-center gap-3 mb-4">
            <UInput v-model="searchQuery" placeholder="搜索案号 / 标题 / 当事人" icon="i-lucide-search" class="flex-1 max-w-sm" />
            <USelect
              v-model="statusFilter"
              :options="[
                { label: '全部状态', value: 'all' },
                { label: '待处理', value: 'pending' },
                { label: '进行中', value: 'active' },
                { label: '已解决', value: 'resolved' },
                { label: '已关闭', value: 'closed' },
              ]"
              class="w-36"
            />
            <USelect
              v-model="phaseFilter"
              :options="[
                { label: '全部阶段', value: 'all' },
                ...phaseCounts.map((p) => ({ label: `${p.label}（${p.count}）`, value: p.key })),
              ]"
              class="w-40"
            />
          </div>

          <!-- 阶段统计条：点击切换筛选，再次点击取消 -->
          <div class="flex flex-wrap items-center gap-2 mb-5">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
              :class="phaseFilter === 'all'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700'"
              @click="setPhaseFilter('all')"
            >
              全部 {{ cases.length }}
            </button>
            <button
              v-for="p in phaseCounts"
              :key="p.key"
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
              :class="phaseFilter === p.key
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700'"
              @click="setPhaseFilter(p.key)"
            >
              {{ p.label }} {{ p.count }}
            </button>
          </div>

          <UAlert v-if="loadError" color="error" variant="soft" :title="loadError" class="mb-4" />

          <!-- Cases Grid -->
          <div v-if="loadingCases && cases.length === 0" class="flex items-center justify-center py-24">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
          </div>

          <div v-else-if="filteredCases.length === 0" class="text-center py-24">
            <UIcon name="i-lucide-inbox" class="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p class="text-gray-400 dark:text-gray-500 text-sm">暂无案件</p>
          </div>

          <div v-else class="grid grid-cols-1 gap-4">
            <div
              v-for="c in filteredCases"
              :key="c.id"
              class="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              @click="navigateTo(`/mediator/cases/${c.id}`)"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{{ c.id }}</span>
                    <span
                      class="px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="{
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300': c.status === 'pending',
                        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300': c.status === 'active',
                        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300': c.status === 'resolved',
                        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': c.status === 'closed',
                      }"
                    >
                      {{ statusLabels[c.status || 'pending'] || c.status }}
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      {{ phaseLabels[c.phase || ''] || c.phase || '收件' }}
                    </span>
                  </div>
                  <h3 class="text-base font-semibold text-gray-900 dark:text-white truncate">{{ c.title || '未命名案件' }}</h3>
                  <div class="flex items-center gap-3 mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <span class="flex items-center gap-1"><UIcon name="i-lucide-user" class="w-3.5 h-3.5" />{{ c.partyAName || '当事人' }}</span>
                    <span class="text-gray-300 dark:text-gray-600">vs</span>
                    <span class="flex items-center gap-1"><UIcon name="i-lucide-user" class="w-3.5 h-3.5" />{{ c.partyBName || '待确认' }}</span>
                  </div>
                  <div class="mt-2 text-xs text-blue-600 dark:text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <UIcon name="i-lucide-arrow-right" class="w-3 h-3 inline" />点击进入
                  </div>
                </div>
                <div class="shrink-0 text-right flex flex-col items-end gap-2">
                  <div class="text-xs text-gray-400 dark:text-gray-500">提交于 {{ fmtTime(c.createdAt) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 下方：AI 对话框 + 接入的大模型 -->
      <div class="shrink-0 h-[340px] border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        <!-- Messages -->
        <div class="relative flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50/60 dark:bg-gray-950/40">
          <UButton
            icon="i-lucide-rotate-ccw"
            size="xs"
            color="neutral"
            variant="ghost"
            title="清空对话"
            class="absolute top-2 right-2 z-10"
            @click="resetChat"
          />
          <div v-if="chatMessages.length === 0" class="h-full flex items-center justify-center">
            <p class="text-sm text-gray-400 dark:text-gray-500">选择案件后，可向 AI 助手咨询调解建议、争议焦点分析等</p>
          </div>
          <div
            v-for="(msg, i) in chatMessages"
            :key="i"
            class="flex"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              :class="msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-md'"
            >
              {{ msg.content }}
            </div>
          </div>
          <div v-if="chatSending" class="flex justify-start">
            <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-4 py-2.5">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
                <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.15s]" />
                <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
          <UAlert v-if="chatError" color="error" variant="soft" :title="chatError" size="sm" />
        </div>

        <!-- Input -->
        <div class="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <div class="flex items-center gap-2">
            <UInput
              v-model="chatInput"
              placeholder="输入消息，向 AI 助手提问…"
              class="flex-1"
              :disabled="chatSending"
              @keyup.enter="sendChat"
            />
            <UButton
              icon="i-lucide-send"
              color="primary"
              :loading="chatSending"
              :disabled="!chatInput.trim() || !activeCaseId"
              @click="sendChat"
            >
              发送
            </UButton>
          </div>
          <!-- opencode 风格模型状态栏 -->
          <div class="mt-2 flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-cpu" class="w-3.5 h-3.5 text-gray-400" />
              <span class="text-gray-400 dark:text-gray-500">模型</span>
              <USelect
                v-model="modelName"
                :options="modelOptions"
                size="xs"
                class="w-36"
                color="neutral"
                variant="soft"
              />
            </div>
            <div class="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{{ modelProvider }} {{ modelName }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
