<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <!-- 顶部导航 -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-shield-check" class="w-6 h-6 text-primary-500" />
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">管理后台</h1>
          </div>
          <div class="flex items-center gap-4">
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-arrow-left"
              @click="navigateTo('/mediator')"
            >
              返回工作台
            </UButton>
            <UDropdownMenu :items="userMenuItems">
              <UButton variant="ghost" color="neutral">
                <UAvatar :src="user?.avatar" :alt="user?.name" size="xs" />
                <span class="ml-2">{{ user?.name }}</span>
              </UButton>
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </header>

    <!-- 主要内容 -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- 统计卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">总案件数</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ cases.length }}</p>
            </div>
            <div class="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
              <UIcon name="i-lucide-folder-open" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">待审核</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ pendingCases }}</p>
            </div>
            <div class="p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900">
              <UIcon name="i-lucide-clock" class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">调解员数量</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ mediatorCount }}</p>
            </div>
            <div class="p-3 rounded-lg bg-green-100 dark:bg-green-900">
              <UIcon name="i-lucide-users" class="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </UCard>
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">用户数量</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ userCount }}</p>
            </div>
            <div class="p-3 rounded-lg bg-purple-100 dark:bg-purple-900">
              <UIcon name="i-lucide-user" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- 功能入口 -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <UCard
          v-for="feature in features"
          :key="feature.title"
          class="cursor-pointer hover:shadow-lg transition-shadow"
          @click="navigateTo(feature.path)"
        >
          <div class="flex items-start gap-4">
            <div :class="['p-3 rounded-lg', feature.bgColor]">
              <UIcon :name="feature.icon" :class="['w-6 h-6', feature.iconColor]" />
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ feature.title }}</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ feature.description }}</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 案件列表 -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">案件管理</h2>
            <UButton
              icon="i-lucide-plus"
              @click="showCreateCaseModal = true"
            >
              创建案件
            </UButton>
          </div>
        </template>

        <!-- 筛选条件 -->
        <div class="flex flex-wrap gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="搜索案件..."
            icon="i-lucide-search"
            class="w-64"
          />
          <USelectMenu
            v-model="statusFilter"
            :options="statusOptions"
            placeholder="状态筛选"
            class="w-40"
          />
          <USelectMenu
            v-model="typeFilter"
            :options="typeOptions"
            placeholder="类型筛选"
            class="w-40"
          />
        </div>

        <!-- 案件表格 -->
        <UTable :data="filteredCases" :columns="columns">
          <template #id-data="{ row }">
            <UButton variant="link" @click="navigateTo(`/mediator/cases/${row.id}`)">
              {{ row.id }}
            </UButton>
          </template>
          <template #phase-data="{ row }">
            <CaseStatusBadge :status="row.phase" />
          </template>
          <template #actions-data="{ row }">
            <UDropdownMenu :items="getCaseActions(row)">
              <UButton variant="ghost" color="neutral" icon="i-lucide-more-horizontal" />
            </UDropdownMenu>
          </template>
        </UTable>
      </UCard>
    </main>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { user, logout, getAuthHeaders } = useAuth()
const toast = useToast()

// 统计数据
const cases = ref<any[]>([])
const mediatorCount = ref(0)
const userCount = ref(0)

const pendingCases = computed(() => {
  return cases.value.filter(c => c.phase === 'intake' || c.phase === 'reviewing').length
})

// 功能入口
const features = [
  {
    title: '案件审核',
    description: '审核新提交的案件，分配调解员',
    icon: 'i-lucide-clipboard-check',
    bgColor: 'bg-blue-100 dark:bg-blue-900',
    iconColor: 'text-blue-600 dark:text-blue-400',
    path: '/admin/review',
  },
  {
    title: '调解员管理',
    description: '管理调解员信息，查看工作统计',
    icon: 'i-lucide-users',
    bgColor: 'bg-green-100 dark:bg-green-900',
    iconColor: 'text-green-600 dark:text-green-400',
    path: '/admin/mediators',
  },
  {
    title: '用户管理',
    description: '管理系统用户，权限配置',
    icon: 'i-lucide-user-cog',
    bgColor: 'bg-purple-100 dark:bg-purple-900',
    iconColor: 'text-purple-600 dark:text-purple-400',
    path: '/admin/users',
  },
  {
    title: '数据统计',
    description: '查看案件统计，调解员绩效',
    icon: 'i-lucide-bar-chart-3',
    bgColor: 'bg-orange-100 dark:bg-orange-900',
    iconColor: 'text-orange-600 dark:text-orange-400',
    path: '/admin/stats',
  },
  {
    title: '模板管理',
    description: '管理协议模板，文书模板',
    icon: 'i-lucide-file-text',
    bgColor: 'bg-pink-100 dark:bg-pink-900',
    iconColor: 'text-pink-600 dark:text-pink-400',
    path: '/admin/templates',
  },
  {
    title: '系统设置',
    description: '系统配置，参数设置',
    icon: 'i-lucide-settings',
    bgColor: 'bg-gray-100 dark:bg-gray-900',
    iconColor: 'text-gray-600 dark:text-gray-400',
    path: '/admin/settings',
  },
]

// 案件筛选
const searchQuery = ref('')
const statusFilter = ref('')
const typeFilter = ref('')

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '收案', value: 'intake' },
  { label: '审核中', value: 'reviewing' },
  { label: '预评估', value: 'screening' },
  { label: '受理', value: 'accepted' },
  { label: '调解中', value: 'mediating' },
  { label: '方案协商', value: 'negotiating' },
  { label: '协议待确认', value: 'agreement_pending' },
  { label: '调解成功', value: 'closed_success' },
  { label: '调解失败', value: 'closed_failed' },
]

const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '合同纠纷', value: 'contract' },
  { label: '消费纠纷', value: 'consumer' },
  { label: '物业纠纷', value: 'property' },
  { label: '知识产权', value: 'ip' },
  { label: '金融纠纷', value: 'finance' },
  { label: '民商事', value: 'civil' },
]

// 表格列定义
const columns = [
  { id: 'id', key: 'id', label: '案件编号' },
  { id: 'title', key: 'title', label: '案件标题' },
  { id: 'partyAName', key: 'partyAName', label: '申请人' },
  { id: 'partyBName', key: 'partyBName', label: '被申请人' },
  { id: 'phase', key: 'phase', label: '状态' },
  { id: 'createdAt', key: 'createdAt', label: '创建时间' },
  { id: 'actions', key: 'actions', label: '操作' },
]

// 筛选后的案件
const filteredCases = computed(() => {
  let result = cases.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (c) =>
        c.id.toLowerCase().includes(query) ||
        c.title.toLowerCase().includes(query) ||
        c.partyAName.toLowerCase().includes(query) ||
        c.partyBName.toLowerCase().includes(query)
    )
  }

  if (statusFilter.value) {
    result = result.filter((c) => c.phase === statusFilter.value)
  }

  if (typeFilter.value) {
    result = result.filter((c) => c.disputeType === typeFilter.value)
  }

  return result
})

// 用户菜单
const userMenuItems = [
  {
    label: '个人设置',
    icon: 'i-lucide-user',
    click: () => navigateTo('/admin/profile'),
  },
  {
    label: '退出登录',
    icon: 'i-lucide-log-out',
    click: () => logout(),
  },
]

// 案件操作菜单
const getCaseActions = (row: any) => [
  {
    label: '查看详情',
    icon: 'i-lucide-eye',
    click: () => navigateTo(`/mediator/cases/${row.id}`),
  },
  {
    label: '分配调解员',
    icon: 'i-lucide-user-plus',
    click: () => showAssignModal(row),
  },
  {
    label: '审核',
    icon: 'i-lucide-clipboard-check',
    click: () => showReviewModal(row),
  },
]

// 模态框状态
const showCreateCaseModal = ref(false)

// 加载案件数据
const loadCases = async () => {
  try {
    const { data } = await useFetch('/api/cases', {
      headers: getAuthHeaders(),
    })
    if (data.value?.success) {
      cases.value = data.value.data || []
    }
  } catch (error) {
    console.error('加载案件失败:', error)
  }
}

// 加载调解员数量
const loadMediatorCount = async () => {
  try {
    const { data } = await useFetch('/api/mediators', {
      headers: getAuthHeaders(),
    })
    if (data.value) {
      mediatorCount.value = Array.isArray(data.value) ? data.value.length : 0
    }
  } catch (error) {
    console.error('加载调解员失败:', error)
  }
}

// 加载用户数量（这里用调解员数量估算，实际应有用户API）
const loadUserCount = async () => {
  // 暂时使用固定值，实际应调用用户API
  userCount.value = 15
}

// 初始化
onMounted(async () => {
  await Promise.all([
    loadCases(),
    loadMediatorCount(),
    loadUserCount(),
  ])
})
</script>
