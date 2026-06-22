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
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">数据统计</h1>
          </div>
          <div class="flex items-center gap-4">
            <USelectMenu
              v-model="timeRange"
              :options="timeRangeOptions"
              class="w-40"
            />
          </div>
        </div>
      </div>
    </header>

    <!-- 主要内容 -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- 总览统计 -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <UCard v-for="stat in overviewStats" :key="stat.label">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ stat.label }}</p>
              <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ stat.value }}</p>
            </div>
            <div :class="['p-3 rounded-lg', stat.bgColor]">
              <UIcon :name="stat.icon" :class="['w-6 h-6', stat.iconColor]" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- 图表区域 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- 案件趋势 -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-gray-900 dark:text-white">案件趋势</h3>
          </template>
          <div class="h-80 flex items-center justify-center text-gray-500">
            <div class="text-center">
              <UIcon name="i-lucide-bar-chart-3" class="w-12 h-12 mx-auto mb-4" />
              <p>图表功能开发中...</p>
            </div>
          </div>
        </UCard>

        <!-- 纠纷类型分布 -->
        <UCard>
          <template #header>
            <h3 class="font-semibold text-gray-900 dark:text-white">纠纷类型分布</h3>
          </template>
          <div class="space-y-4">
            <div v-for="item in disputeTypeStats" :key="item.type" class="flex items-center gap-4">
              <div class="w-24 text-sm text-gray-600 dark:text-gray-400">{{ item.label }}</div>
              <div class="flex-1">
                <UProgress :value="item.percentage" :color="item.color" />
              </div>
              <div class="w-16 text-right text-sm font-medium">{{ item.count }}</div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- 调解员统计 -->
      <UCard class="mb-8">
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">调解员绩效</h3>
        </template>
        <UTable :data="mediatorStats" :columns="mediatorColumns">
          <template #successRate-data="{ row }">
            <div class="flex items-center gap-2">
              <UProgress :value="row.successRate" class="w-24" />
              <span class="text-sm">{{ row.successRate }}%</span>
            </div>
          </template>
          <template #rating-data="{ row }">
            <div class="flex items-center gap-1">
              <UIcon name="i-lucide-star" class="w-4 h-4 text-yellow-500" />
              <span>{{ row.rating }}</span>
            </div>
          </template>
        </UTable>
      </UCard>

      <!-- 金额分布 -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">争议金额分布</h3>
        </template>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div
            v-for="range in amountRanges"
            :key="range.label"
            class="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
          >
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ range.count }}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ range.label }}</p>
          </div>
        </div>
      </UCard>
    </main>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
})

const { user } = useAuth()

// 时间范围
const timeRange = ref('month')
const timeRangeOptions = [
  { label: '本月', value: 'month' },
  { label: '本季度', value: 'quarter' },
  { label: '本年度', value: 'year' },
  { label: '全部', value: 'all' },
]

// 总览统计
const overviewStats = ref([
  {
    label: '总案件数',
    value: '156',
    icon: 'i-lucide-folder-open',
    bgColor: 'bg-blue-100 dark:bg-blue-900',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    label: '调解成功',
    value: '128',
    icon: 'i-lucide-check-circle',
    bgColor: 'bg-green-100 dark:bg-green-900',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    label: '成功率',
    value: '82%',
    icon: 'i-lucide-trending-up',
    bgColor: 'bg-purple-100 dark:bg-purple-900',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    label: '平均时长',
    value: '15天',
    icon: 'i-lucide-clock',
    bgColor: 'bg-orange-100 dark:bg-orange-900',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
])

// 纠纷类型统计
const disputeTypeStats = ref([
  { type: 'contract', label: '合同纠纷', count: 68, percentage: 44, color: 'primary' },
  { type: 'finance', label: '金融纠纷', count: 32, percentage: 21, color: 'success' },
  { type: 'property', label: '物业纠纷', count: 25, percentage: 16, color: 'warning' },
  { type: 'consumer', label: '消费纠纷', count: 18, percentage: 12, color: 'error' },
  { type: 'ip', label: '知识产权', count: 13, percentage: 8, color: 'info' },
])

// 调解员统计
const mediatorColumns = [
  { id: 'name', key: 'name', label: '姓名' },
  { id: 'totalCases', key: 'totalCases', label: '总案件' },
  { id: 'successCases', key: 'successCases', label: '成功案件' },
  { id: 'successRate', key: 'successRate', label: '成功率' },
  { id: 'rating', key: 'rating', label: '评分' },
]

const mediatorStats = ref([
  { name: '张调解', totalCases: 56, successCases: 48, successRate: 86, rating: 4.8 },
  { name: '李调解', totalCases: 45, successCases: 38, successRate: 84, rating: 4.6 },
  { name: '王调解', totalCases: 38, successCases: 32, successRate: 84, rating: 4.7 },
  { name: '赵调解', totalCases: 17, successCases: 14, successRate: 82, rating: 4.5 },
])

// 金额分布
const amountRanges = ref([
  { label: '1万以下', count: 25 },
  { label: '1-5万', count: 42 },
  { label: '5-10万', count: 35 },
  { label: '10-50万', count: 28 },
  { label: '50-100万', count: 18 },
  { label: '100万以上', count: 8 },
])
</script>
