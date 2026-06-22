<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950">
    <!-- 顶部导航 -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-3">
            <UButton
              variant="ghost"
              color="neutral"
              icon="i-lucide-arrow-left"
              @click="navigateTo('/admin')"
            >
              返回管理后台
            </UButton>
            <div class="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">案件审核</h1>
          </div>
        </div>
      </div>
    </header>

    <!-- 主要内容 -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
      </div>

      <!-- 待审核案件列表 -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">待审核案件</h2>
            <UBadge :label="`${pendingCases.length} 个待审核`" color="warning" variant="subtle" />
          </div>
        </template>

        <UTable :data="pendingCases" :columns="columns">
          <template #id-data="{ row }">
            <UButton variant="link" @click="viewCase(row)">
              {{ row.id }}
            </UButton>
          </template>
          <template #phase-data="{ row }">
            <CaseStatusBadge :status="row.phase" />
          </template>
          <template #amount-data="{ row }">
            <span v-if="row.amount">¥{{ row.amount.toLocaleString() }}</span>
            <span v-else class="text-gray-400">-</span>
          </template>
          <template #createdAt-data="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
          <template #actions-data="{ row }">
            <div class="flex items-center gap-2">
              <UButton
                size="sm"
                color="success"
                variant="soft"
                @click="approveCase(row)"
              >
                通过
              </UButton>
              <UButton
                size="sm"
                color="error"
                variant="soft"
                @click="rejectCase(row)"
              >
                驳回
              </UButton>
              <UButton
                size="sm"
                color="primary"
                variant="soft"
                @click="assignMediator(row)"
              >
                分配调解员
              </UButton>
            </div>
          </template>
        </UTable>
      </UCard>

      <!-- 已审核案件列表 -->
      <UCard class="mt-8">
        <template #header>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">已审核案件</h2>
        </template>

        <UTable :data="reviewedCases" :columns="reviewedColumns">
          <template #id-data="{ row }">
            <UButton variant="link" @click="viewCase(row)">
              {{ row.id }}
            </UButton>
          </template>
          <template #phase-data="{ row }">
            <CaseStatusBadge :status="row.phase" />
          </template>
          <template #reviewedAt-data="{ row }">
            {{ formatDate(row.reviewedAt) }}
          </template>
        </UTable>
      </UCard>
    </main>

    <!-- 审核模态框 -->
    <UModal v-model:open="showReviewModal">
      <template #header>
        <h3 class="text-lg font-semibold">审核案件</h3>
      </template>
      <template #default>
        <div class="space-y-4">
          <div v-if="selectedCase">
            <p class="text-sm text-gray-500">案件编号</p>
            <p class="font-medium">{{ selectedCase.id }}</p>
          </div>
          <div v-if="selectedCase">
            <p class="text-sm text-gray-500">案件标题</p>
            <p class="font-medium">{{ selectedCase.title }}</p>
          </div>
          <UFormGroup label="审核意见">
            <UTextarea v-model="reviewNote" placeholder="请输入审核意见..." />
          </UFormGroup>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="error"
            variant="soft"
            @click="confirmReject"
          >
            驳回
          </UButton>
          <UButton
            color="success"
            @click="confirmApprove"
          >
            通过
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- 分配调解员模态框 -->
    <UModal v-model:open="showAssignModal">
      <template #header>
        <h3 class="text-lg font-semibold">分配调解员</h3>
      </template>
      <template #default>
        <div class="space-y-4">
          <div v-if="selectedCase">
            <p class="text-sm text-gray-500">案件编号</p>
            <p class="font-medium">{{ selectedCase.id }}</p>
          </div>
          <div v-if="selectedCase">
            <p class="text-sm text-gray-500">案件标题</p>
            <p class="font-medium">{{ selectedCase.title }}</p>
          </div>
          <UFormGroup label="选择调解员">
            <USelectMenu
              v-model="selectedMediator"
              :options="mediatorOptions"
              placeholder="请选择调解员"
            />
          </UFormGroup>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            variant="soft"
            color="neutral"
            @click="showAssignModal = false"
          >
            取消
          </UButton>
          <UButton
            :disabled="!selectedMediator"
            @click="confirmAssign"
          >
            确认分配
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { user } = useAuth()
const toast = useToast()

// 搜索和筛选
const searchQuery = ref('')
const statusFilter = ref('')
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '收案', value: 'intake' },
  { label: '审核中', value: 'reviewing' },
  { label: '预评估', value: 'screening' },
]

// 案件数据
const cases = ref([])
const pendingCases = computed(() =>
  cases.value.filter((c) => ['intake', 'reviewing'].includes(c.phase))
)
const reviewedCases = computed(() =>
  cases.value.filter((c) => !['intake', 'reviewing'].includes(c.phase))
)

// 表格列定义
const columns = [
  { id: 'id', key: 'id', label: '案件编号' },
  { id: 'title', key: 'title', label: '案件标题' },
  { id: 'partyAName', key: 'partyAName', label: '申请人' },
  { id: 'partyBName', key: 'partyBName', label: '被申请人' },
  { id: 'phase', key: 'phase', label: '状态' },
  { id: 'amount', key: 'amount', label: '争议金额' },
  { id: 'createdAt', key: 'createdAt', label: '创建时间' },
  { id: 'actions', key: 'actions', label: '操作' },
]

const reviewedColumns = [
  { id: 'id', key: 'id', label: '案件编号' },
  { id: 'title', key: 'title', label: '案件标题' },
  { id: 'partyAName', key: 'partyAName', label: '申请人' },
  { id: 'partyBName', key: 'partyBName', label: '被申请人' },
  { id: 'phase', key: 'phase', label: '状态' },
  { id: 'reviewedAt', key: 'reviewedAt', label: '审核时间' },
]

// 模态框状态
const showReviewModal = ref(false)
const showAssignModal = ref(false)
const selectedCase = ref(null)
const reviewNote = ref('')
const selectedMediator = ref('')

// 调解员选项
const mediatorOptions = ref([])

// 格式化日期
const formatDate = (timestamp: number) => {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 查看案件详情
const viewCase = (row: any) => {
  navigateTo(`/mediator/cases/${row.id}`)
}

// 审核案件
const approveCase = (row: any) => {
  selectedCase.value = row
  reviewNote.value = ''
  showReviewModal.value = true
}

const rejectCase = (row: any) => {
  selectedCase.value = row
  reviewNote.value = ''
  showReviewModal.value = true
}

// 确认审核
const confirmApprove = async () => {
  if (!selectedCase.value) return

  try {
    await $fetch(`/api/cases/${selectedCase.value.id}/review`, {
      method: 'POST',
      body: {
        action: 'approve',
        reason: reviewNote.value,
      },
    })

    toast.add({
      title: '审核通过',
      description: '案件已进入预评估阶段',
      color: 'success',
    })

    showReviewModal.value = false
    loadCases()
  } catch (error: any) {
    toast.add({
      title: '审核失败',
      description: error.message,
      color: 'error',
    })
  }
}

const confirmReject = async () => {
  if (!selectedCase.value) return

  try {
    await $fetch(`/api/cases/${selectedCase.value.id}/review`, {
      method: 'POST',
      body: {
        action: 'reject',
        reason: reviewNote.value,
      },
    })

    toast.add({
      title: '已驳回',
      description: '案件已驳回',
      color: 'warning',
    })

    showReviewModal.value = false
    loadCases()
  } catch (error: any) {
    toast.add({
      title: '操作失败',
      description: error.message,
      color: 'error',
    })
  }
}

// 分配调解员
const assignMediator = (row: any) => {
  selectedCase.value = row
  selectedMediator.value = ''
  showAssignModal.value = true
}

// 确认分配
const confirmAssign = async () => {
  if (!selectedCase.value || !selectedMediator.value) return

  try {
    await $fetch(`/api/cases/${selectedCase.value.id}/assign`, {
      method: 'POST',
      body: {
        mediatorId: selectedMediator.value,
      },
    })

    toast.add({
      title: '分配成功',
      description: '调解员已分配',
      color: 'success',
    })

    showAssignModal.value = false
    loadCases()
  } catch (error: any) {
    toast.add({
      title: '分配失败',
      description: error.message,
      color: 'error',
    })
  }
}

// 加载案件数据
const loadCases = async () => {
  try {
    const { data } = await useFetch('/api/cases')
    if (data.value) {
      cases.value = data.value
    }
  } catch (error) {
    console.error('加载案件失败:', error)
  }
}

// 加载调解员列表
const loadMediators = async () => {
  try {
    const { data } = await useFetch('/api/mediators')
    if (data.value) {
      mediatorOptions.value = data.value.map((m) => ({
        label: m.name,
        value: m.id,
      }))
    }
  } catch (error) {
    console.error('加载调解员失败:', error)
  }
}

// 初始化
onMounted(() => {
  loadCases()
  loadMediators()
})
</script>
