// Party 案件详情页：案件信息 + 案件材料列表 + 智能评估（分栏）
<template>
  <div class="w-full px-4 sm:px-6 lg:px-8 py-6 lg:h-screen lg:flex lg:flex-col lg:overflow-hidden">
    <NuxtLink to="/party" class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors">
      <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />返回
    </NuxtLink>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-32">
      <div class="text-center">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-400 dark:text-blue-500 animate-spin mx-auto mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">loading case data...</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="fetchError || !caseData" class="flex items-center justify-center py-32">
      <div class="text-center max-w-md mx-auto px-4">
        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-red-400 dark:text-red-500 mx-auto mb-3" />
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">无法访问案件</h2>
        <p class="text-base text-gray-500 dark:text-gray-400 mb-6">案件编号或访问验证码不正确，请检查后重试。</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else-if="caseData" class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:flex-1 lg:min-h-0 lg:grid-rows-1">
      <!-- ══ 左栏：案件信息 + 材料（独立滚动） ══ -->
      <div class="min-w-0 space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <!-- 案件概览 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div class="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{{ caseData.id }}</div>
              <h1 class="text-xl font-bold text-gray-900 dark:text-white mt-1">{{ caseData.title || '未命名案件' }}</h1>
            </div>
            <div class="text-right text-sm text-gray-400 dark:text-gray-500">
              <div>标的额：<span class="font-medium text-gray-700 dark:text-gray-300">{{ amountDisplay }}</span></div>
            </div>
          </div>

          <!-- 当事人 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
            <div class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <div class="text-xs text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1"><UIcon name="i-lucide-user" class="w-3 h-3" />申请人</div>
              <div class="font-semibold text-gray-900 dark:text-white">{{ caseData.partyAName || '当事人' }}</div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <div class="text-xs text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1"><UIcon name="i-lucide-user" class="w-3 h-3" />被申请人</div>
              <div class="font-semibold text-gray-900 dark:text-white">{{ caseData.partyBName || '待确认' }}</div>
            </div>
          </div>

          <p v-if="caseData.description" class="text-sm text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">{{ caseData.description }}</p>
        </div>

        <!-- 案件材料 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-blue-500" />案件材料（{{ documents.length }}）
          </h2>

          <div v-if="documents.length === 0" class="text-sm text-gray-400 dark:text-gray-500">
            暂无材料
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="doc in documents"
              :key="doc.id"
              class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800"
            >
              <UIcon name="i-lucide-file-text" class="w-4 h-4 text-gray-400 shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="text-sm text-gray-800 dark:text-gray-200 truncate">{{ doc.originalName }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ formatFileSize(doc.size) }}</div>
              </div>
              <a
                :href="`/api/cases/${caseNumber}/file?name=${encodeURIComponent(doc.originalName)}&code=${encodeURIComponent(accessCode)}`"
                target="_blank"
                class="shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
              >
                查看
              </a>
            </div>
          </div>
        </div>
      </div>
      <!-- ══ 左栏结束 ══ -->

      <!-- ══ 右栏：智能评估（独立滚动） ══ -->
      <div class="min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl lg:min-h-0 lg:overflow-y-auto">
        <div class="p-5 sm:p-6 pb-4">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <UIcon name="i-lucide-clipboard-list" class="w-4 h-4 text-blue-500" />智能评估
              </h2>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                AI 基于案件材料生成 6 部分《案情分析评估报告》
              </p>
            </div>
            <UButton
              color="primary"
              icon="i-lucide-sparkles"
              :loading="evaluationLoading"
              :disabled="evaluationLoading"
              @click="runEvaluation"
            >
              {{ report ? '重新评估' : '生成评估报告' }}
            </UButton>
          </div>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-800 p-5 sm:p-6">
          <div v-if="evaluationLoading" class="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
            AI 正在分析案件材料，请稍候...
          </div>
          <div
            v-else-if="report"
            class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed break-words"
          >{{ report }}</div>
          <div v-else class="flex flex-col items-center justify-center text-center py-12">
            <UIcon name="i-lucide-inbox" class="w-10 h-10 text-gray-300 dark:text-gray-700 mb-2" />
            <p class="text-sm text-gray-400 dark:text-gray-500">点击右上角「生成评估报告」，AI 将基于案件材料生成 6 部分《案情分析评估报告》。</p>
          </div>
        </div>
      </div>
      <!-- ══ 右栏结束 ══ -->
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
    status: string
    documents: Array<{
      id: string
      originalName: string
      size: number
      createdAt: string | number
    }>
  }
}

const route = useRoute()
const caseNumber = route.params.caseNumber as string
const accessCode = route.query.code as string

const pending = ref(true)
const fetchError = ref(false)
const caseData = ref<CaseResponse['data'] | null>(null)
const documents = ref<CaseResponse['data']['documents']>([])

// ── 智能评估 state ────────────────────────────────────
const report = ref('')
const evaluationLoading = ref(false)

onMounted(async () => {
  try {
    const resp = await $fetch<CaseResponse>(`/api/cases/${caseNumber}`, {
      query: { code: accessCode },
    })
    caseData.value = resp.data
    documents.value = resp.data.documents || []
  } catch {
    fetchError.value = true
  } finally {
    pending.value = false
  }

  await loadEvaluation()
})

async function loadEvaluation() {
  try {
    const resp = await $fetch<{ success: boolean; data: { report: string; status: string } }>(
      `/api/cases/${caseNumber}/evaluation`,
      { query: { code: accessCode } },
    )
    report.value = resp.data?.report || ''
  } catch {
    // 静默失败，保留空状态
  }
}

async function runEvaluation() {
  if (evaluationLoading.value) return
  evaluationLoading.value = true
  report.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data: { report: string } }>(
      `/api/cases/${caseNumber}/evaluation`,
      { method: 'POST', query: { code: accessCode } },
    )
    report.value = resp.data?.report || ''
  } catch (err: any) {
    report.value = `评估失败：${err?.data?.message || err?.message || '请稍后重试'}`
  } finally {
    evaluationLoading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────
const amountDisplay = computed(() => {
  if (!caseData.value) return '—'
  const text = caseData.value.claimsSummary || caseData.value.description || ''
  const match = text.match(/(\d[\d,]+)\s*元/)
  if (match) return '¥' + match[1]
  return '—'
})

function formatFileSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}
</script>