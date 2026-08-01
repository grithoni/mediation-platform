<script setup lang="ts">
// 调解员工作台 — 案件管理
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

const phaseLabels: Record<string, string> = {
  intake: '收件', reviewing: '审查中', screening: '甄别中', accepted: '已受理',
  mediating: '调解中', caucus: '协商中', negotiating: '谈判中', agreement_drafting: '拟定协议',
  agreement_pending: '待签协议', signing: '签署中', closed_success: '调解成功',
  closed_failed: '调解未果', withdrawn: '已撤回',
}

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

const smartAgentSteps = [
  '读取案件材料与调解申请书',
  '使用本地模型执行脱敏',
  '调用云端大模型按 skills 分析',
  '反脱敏后回写案件分析与补正清单',
]

const agentModules = [
  {
    title: '案情概要',
    desc: '先把人物、金额、时间、争议点收拢成一张可读的案件底图。',
    state: '材料进入后自动生成',
  },
  {
    title: '请求权基础',
    desc: '围绕调解主张拆解请求路径、成立要件和关键事实。',
    state: '本地脱敏后进入云端 skills',
  },
  {
    title: '证据清单',
    desc: '把现有材料映射到待证事实，并指出缺口与补正方向。',
    state: '反脱敏后回写工作台',
  },
  {
    title: '调解建议',
    desc: '基于双方立场、争议焦点和材料强弱给出谈判抓手。',
    state: '后续可扩展为推荐方案',
  },
]

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <!-- ── 未登录：登录卡片 ── -->
    <div v-if="checking" class="flex items-center justify-center py-32">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
    </div>

    <div v-else-if="!isAuthenticated" class="max-w-md mx-auto mt-16">
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
    <div v-else-if="!roleOk" class="max-w-md mx-auto mt-16">
      <UAlert color="error" variant="soft" title="无调解员权限" :description="`当前账号（${user?.name} / ${user?.role}）无法访问调解员工作台`" />
    </div>

    <!-- ── 已登录：案件管理 ── -->
    <div v-else>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">案件管理</h1>
          <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">共 {{ filteredCases.length }} 个案件 · 调解员 {{ user?.name }}</p>
        </div>
        <UButton icon="i-lucide-refresh-cw" color="gray" variant="soft" :loading="loadingCases" @click="loadCases">
          刷新
        </UButton>
      </div>

      <div class="rounded-[28px] border border-slate-200 dark:border-slate-800 bg-[linear-gradient(135deg,#f8fafc_0%,#eef6ff_48%,#f8fafc_100%)] dark:bg-[linear-gradient(135deg,#0f172a_0%,#111827_48%,#0f172a_100%)] p-6 md:p-8 mb-6 overflow-hidden relative">
        <div class="absolute right-0 top-0 w-48 h-48 rounded-full bg-blue-200/30 dark:bg-blue-500/10 blur-3xl pointer-events-none" />
        <div class="absolute left-20 bottom-0 w-40 h-40 rounded-full bg-cyan-200/20 dark:bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div class="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-900/80 border border-blue-100 dark:border-slate-700 text-xs text-blue-700 dark:text-blue-300 mb-4">
              <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5" />调解智能中枢
            </div>
            <h2 class="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <UIcon name="i-lucide-bot" class="w-6 h-6 text-blue-500" />案件工作台
            </h2>
          </div>
          <div class="grid grid-cols-2 gap-3 shrink-0 min-w-[220px]">
            <div class="px-4 py-3 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700">
              <div class="text-xs text-slate-500 dark:text-slate-400">当前案件数</div>
              <div class="text-2xl font-bold text-slate-900 dark:text-white mt-1">{{ cases.length }}</div>
            </div>
            <div class="px-4 py-3 rounded-2xl bg-white/85 dark:bg-slate-900/85 border border-slate-200 dark:border-slate-700">
              <div class="text-xs text-slate-500 dark:text-slate-400">智能体状态</div>
              <div class="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-2">已接入</div>
            </div>
          </div>
        </div>

        <div class="relative grid grid-cols-1 md:grid-cols-4 gap-3 mt-6">
          <div
            v-for="step in smartAgentSteps"
            :key="step"
            class="rounded-2xl border border-white/70 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur p-4"
          >
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-lucide-check-circle-2" class="w-4 h-4 text-green-500" />
              <span class="text-sm font-medium text-slate-900 dark:text-white">流程节点</span>
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{{ step }}</p>
          </div>
        </div>

        <div
          v-if="filteredCases.length === 0"
          class="relative mt-6 rounded-2xl border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-5"
        >
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-info" class="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p class="text-sm font-medium text-amber-800 dark:text-amber-200">当前没有可进入的案件</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6 mb-6">
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6">
          <div class="flex items-center justify-between gap-3 mb-5">
            <div>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">智能体研判模块</h3>
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500">模块化输出</div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="item in agentModules"
              :key="item.title"
              class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5"
            >
              <div class="flex items-center justify-between gap-3 mb-3">
                <div class="text-base font-semibold text-slate-900 dark:text-white">{{ item.title }}</div>
                <span class="px-2 py-1 rounded-full text-[11px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">已规划</span>
              </div>
              <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{{ item.desc }}</p>
              <div class="text-xs text-slate-400 dark:text-slate-500">{{ item.state }}</div>
            </div>
          </div>
        </div>

        <div class="bg-[#0f172a] border border-slate-800 rounded-3xl p-6 text-white overflow-hidden relative">
          <div class="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.35),transparent_60%)] pointer-events-none" />
          <div class="relative">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs text-blue-200 mb-4">
              <UIcon name="i-lucide-shield" class="w-3.5 h-3.5" />安全分析链
            </div>
            <h3 class="text-xl font-semibold leading-snug">本地脱敏 → 云端分析 → 结果回写</h3>

            <div class="space-y-3 mt-6">
              <div class="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div class="text-xs text-slate-400">输入</div>
                <div class="text-sm font-medium mt-1">官网提交材料、申请书、证据附件</div>
              </div>
              <div class="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div class="text-xs text-slate-400">处理中枢</div>
                <div class="text-sm font-medium mt-1">本地模型脱敏 + 云端 skills 编排 + MCP 工具协同</div>
              </div>
              <div class="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div class="text-xs text-slate-400">输出</div>
                <div class="text-sm font-medium mt-1">案件分析、材料补正清单、调解员后续操作入口</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-3 mb-5">
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
          class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
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
            </div>
            <div class="shrink-0 text-right">
              <div class="text-xs text-gray-400 dark:text-gray-500 mb-2">提交于 {{ fmtTime(c.createdAt) }}</div>
              <UButton
                size="sm"
                color="gray"
                variant="soft"
                icon="i-lucide-arrow-right"
                :to="`/mediator/cases/${c.id}`"
              >
                查看
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
