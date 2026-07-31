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
