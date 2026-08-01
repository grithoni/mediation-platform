<script setup lang="ts">
// 调解员工作台 — 案件详情
const route = useRoute()
const { getAuthHeaders } = useAuth()

const caseNumber = route.params.caseNumber as string
const caseData = ref<any>(null)
const loading = ref(true)
const error = ref('')
const runningAgent = ref(false)
const agentError = ref('')
const agentStatus = ref<'pending' | 'processing' | 'done'>('pending')
const agentAnalysis = ref('')
const materialChecklist = ref('')
const agentUpdatedAt = ref<number | null>(null)
const analysisStatus = ref<Record<string, { done: boolean; generatedAt?: number }>>({})
let agentPollTimer: ReturnType<typeof setInterval> | null = null

const phaseLabels: Record<string, string> = {
  intake: '收件', reviewing: '审查中', screening: '甄别中', accepted: '已受理',
  mediating: '调解中', caucus: '协商中', negotiating: '谈判中', agreement_drafting: '拟定协议',
  agreement_pending: '待签协议', signing: '签署中', closed_success: '调解成功',
  closed_failed: '调解未果', withdrawn: '已撤回',
}

const statusLabels: Record<string, string> = {
  pending: '待处理', active: '进行中', resolved: '已解决', closed: '已关闭',
}

const categoryLabels: Record<string, string> = {
  application: '调解申请书', evidence: '证据材料', identity: '身份证明', authorization: '授权委托书',
}

const fileIcons: Record<string, string> = {
  pdf: 'i-lucide-file-text', docx: 'i-lucide-file-text', doc: 'i-lucide-file-text',
  jpg: 'i-lucide-image', jpeg: 'i-lucide-image', png: 'i-lucide-image',
  zip: 'i-lucide-archive', rar: 'i-lucide-archive',
  xls: 'i-lucide-table', xlsx: 'i-lucide-table',
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return fileIcons[ext] || 'i-lucide-file'
}

function fileSize(bytes: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtTime(ts: number | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const analysisCards = computed(() => ([
  { key: 'claim_basis', label: '请求权基础分析' },
  { key: 'evidence_checklist', label: '证据清单分析' },
  { key: 'anticipate_defense', label: '预判抗辩' },
  { key: 'recommend_solution', label: '调解方案建议' },
]))

// 文件预览（图片直接打开，其余下载）— 需登录认证（/api/cases/:caseNumber/file?name=xxx）
function fileUrl(name: string): string {
  return `/api/cases/${caseNumber}/file?name=${encodeURIComponent(name)}`
}

async function loadAgentPanel() {
  try {
    const [analysisResp, statusResp] = await Promise.all([
      $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}/analysis`, {
        headers: getAuthHeaders(),
      }),
      $fetch<{ success: boolean; data: Record<string, { done: boolean; generatedAt?: number }> }>(`/api/cases/${caseNumber}/analysis-status`, {
        headers: getAuthHeaders(),
      }),
    ])

    if (analysisResp?.success && analysisResp.data) {
      agentStatus.value = analysisResp.data.agentStatus || 'pending'
      agentAnalysis.value = analysisResp.data.agentAnalysis || ''
      materialChecklist.value = analysisResp.data.materialChecklist || ''
      agentUpdatedAt.value = analysisResp.data.agentUpdatedAt || null
    }

    if (statusResp?.success) {
      analysisStatus.value = statusResp.data || {}
    }

    if (agentStatus.value === 'done') {
      stopAgentPolling()
      runningAgent.value = false
    }
  } catch (err: any) {
    agentError.value = err?.data?.message || err?.message || '加载智能体分析状态失败'
    stopAgentPolling()
    runningAgent.value = false
  }
}

function startAgentPolling() {
  if (agentPollTimer) return
  agentPollTimer = setInterval(() => {
    loadAgentPanel().catch(() => {})
  }, 5000)
}

function stopAgentPolling() {
  if (agentPollTimer) {
    clearInterval(agentPollTimer)
    agentPollTimer = null
  }
}

async function runAgentAnalysis() {
  runningAgent.value = true
  agentError.value = ''
  try {
    await $fetch(`/api/cases/${caseNumber}/agent-run`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    agentStatus.value = 'processing'
    await loadAgentPanel()
    startAgentPolling()
  } catch (err: any) {
    runningAgent.value = false
    agentError.value = err?.data?.message || err?.message || '启动调解智能体失败'
  }
}

onMounted(async () => {
  try {
    const data = await $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}`, {
      headers: getAuthHeaders(),
    })
    caseData.value = data.data
    await loadAgentPanel()
    if (agentStatus.value === 'processing') startAgentPolling()
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || '加载案件失败'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  stopAgentPolling()
})
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <NuxtLink to="/mediator" class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors">
      <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />返回案件列表
    </NuxtLink>

    <div v-if="loading" class="flex items-center justify-center py-32">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
    </div>

    <UAlert v-else-if="error" color="error" variant="soft" :title="error" class="mb-4" />

    <div v-else-if="caseData" class="space-y-6">
      <!-- 案件概览 -->
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{{ caseData.id }}</span>
              <span
                class="px-2 py-0.5 rounded-full text-xs font-medium"
                :class="{
                  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300': caseData.status === 'pending',
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300': caseData.status === 'active',
                  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300': caseData.status === 'resolved',
                  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': caseData.status === 'closed',
                }"
              >
                {{ statusLabels[caseData.status] || caseData.status }}
              </span>
              <span class="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {{ phaseLabels[caseData.phase] || caseData.phase || '收件' }}
              </span>
            </div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">{{ caseData.title || '未命名案件' }}</h1>
          </div>
          <div class="text-right text-sm text-gray-400 dark:text-gray-500">
            <div>提交于 {{ fmtTime(caseData.createdAt) }}</div>
            <div class="mt-1">访问验证码：<span class="font-mono text-gray-600 dark:text-gray-300">{{ caseData.accessCode }}</span></div>
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

      <!-- 调解申请书详情 -->
      <div v-if="caseData.application" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-file-text" class="w-4 h-4 text-blue-500" />调解申请书
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <template v-for="(label, key) in {
            applicantName: '申请人名称', applicantAddress: '申请人地址', applicantPostalCode: '申请人邮编',
            applicantPhone: '申请人固话', applicantMobile: '申请人手机', applicantFax: '申请人传真',
            applicantEmail: '申请人邮箱', applicantOtherContact: '申请人其他联系方式',
          }" :key="key">
            <div v-if="caseData.application[key]" class="flex gap-2">
              <span class="text-gray-400 dark:text-gray-500 shrink-0">{{ label }}</span>
              <span class="text-gray-800 dark:text-gray-200">{{ caseData.application[key] }}</span>
            </div>
          </template>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-800 my-4" />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <template v-for="(label, key) in {
            respondentName: '被申请人名称', respondentAddress: '被申请人地址', respondentPostalCode: '被申请人邮编',
            respondentPhone: '被申请人固话', respondentMobile: '被申请人手机', respondentFax: '被申请人传真',
            respondentEmail: '被申请人邮箱', respondentOtherContact: '被申请人其他联系方式',
          }" :key="key">
            <div v-if="caseData.application[key]" class="flex gap-2">
              <span class="text-gray-400 dark:text-gray-500 shrink-0">{{ label }}</span>
              <span class="text-gray-800 dark:text-gray-200">{{ caseData.application[key] }}</span>
            </div>
          </template>
        </div>

        <div class="border-t border-gray-100 dark:border-gray-800 my-4" />

        <div class="space-y-3 text-sm">
          <div class="flex gap-2">
            <span class="text-gray-400 dark:text-gray-500 shrink-0">调解意愿</span>
            <span class="text-gray-800 dark:text-gray-200">
              {{ caseData.application.mediationWillingness === 'mutual' ? '双方自愿调解' : caseData.application.mediationWillingness === 'single_party' ? '单方请求调解' : '-' }}
            </span>
          </div>
          <div v-if="caseData.application.hasAgent" class="flex gap-2">
            <span class="text-gray-400 dark:text-gray-500 shrink-0">代理人</span>
            <span class="text-gray-800 dark:text-gray-200">{{ caseData.application.agentName }}{{ caseData.application.agentDuties ? `（${caseData.application.agentDuties}）` : '' }}</span>
          </div>
          <div v-if="caseData.application.caseFacts" class="flex gap-2">
            <span class="text-gray-400 dark:text-gray-500 shrink-0">案件事实</span>
            <span class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{{ caseData.application.caseFacts }}</span>
          </div>
          <div v-if="caseData.application.disputeMatters" class="flex gap-2">
            <span class="text-gray-400 dark:text-gray-500 shrink-0">争议事项</span>
            <span class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{{ caseData.application.disputeMatters }}</span>
          </div>
          <div v-if="caseData.application.mediationDemands" class="flex gap-2">
            <span class="text-gray-400 dark:text-gray-500 shrink-0">调解诉求</span>
            <span class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{{ caseData.application.mediationDemands }}</span>
          </div>
          <div v-if="caseData.application.demandsBasis" class="flex gap-2">
            <span class="text-gray-400 dark:text-gray-500 shrink-0">理据</span>
            <span class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{{ caseData.application.demandsBasis }}</span>
          </div>
          <div v-if="caseData.application.evidenceConfidential" class="flex gap-2">
            <span class="text-amber-600 dark:text-amber-400 shrink-0">⚠ 证据材料已申请保密处理</span>
          </div>
        </div>
      </div>

      <!-- 材料文件 -->
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-blue-500" />案件材料（{{ caseData.documents?.length || 0 }}）
        </h2>

        <div v-if="!caseData.documents || caseData.documents.length === 0" class="text-sm text-gray-400 dark:text-gray-500">
          暂无上传材料
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="doc in caseData.documents"
            :key="doc.id"
            class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800"
          >
            <UIcon :name="fileIcon(doc.originalName || doc.filename)" class="w-4 h-4 text-gray-400 shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-800 dark:text-gray-200 truncate">{{ doc.originalName || doc.filename }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {{ categoryLabels[doc.category] || doc.category }} · {{ fileSize(doc.size) }} · {{ fmtTime(doc.createdAt) }}
              </div>
            </div>
            <a
              :href="fileUrl(doc.filename)"
              target="_blank"
              class="shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
            >
              查看
            </a>
          </div>
        </div>
      </div>

      <!-- 沟通记录 -->
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <UIcon name="i-lucide-message-square" class="w-4 h-4 text-blue-500" />沟通记录（{{ caseData.messages?.length || 0 }}）
        </h2>

        <div v-if="!caseData.messages || caseData.messages.length === 0" class="text-sm text-gray-400 dark:text-gray-500">
          暂无沟通记录
        </div>

        <div v-else class="space-y-3 max-h-96 overflow-y-auto">
          <div
            v-for="msg in caseData.messages"
            :key="msg.id"
            class="p-3 rounded-lg"
            :class="msg.senderType === 'ai'
              ? 'bg-blue-50 dark:bg-blue-900/20'
              : msg.senderType === 'mediator'
                ? 'bg-green-50 dark:bg-green-900/20'
                : 'bg-gray-50 dark:bg-gray-950'"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {{ msg.senderName || (msg.senderType === 'ai' ? 'AI 助手' : msg.senderType === 'mediator' ? '调解员' : '当事人') }}
              </span>
              <span class="text-xs text-gray-400 dark:text-gray-500">{{ fmtTime(msg.createdAt) }}</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ msg.content }}</p>
          </div>
        </div>
      </div>

      <!-- 调解智能体 -->
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <div class="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-lucide-bot" class="w-4 h-4 text-blue-500" />调解智能体
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              按“读取材料 → 本地脱敏 → 云端 skills 分析 → 反脱敏 → 回写结果”执行
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span
              class="px-2.5 py-1 rounded-full text-xs font-medium"
              :class="{
                'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300': agentStatus === 'pending',
                'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300': agentStatus === 'processing',
                'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300': agentStatus === 'done',
              }"
            >
              {{ agentStatus === 'pending' ? '待分析' : agentStatus === 'processing' ? '分析中' : '已完成' }}
            </span>
            <UButton
              color="primary"
              icon="i-lucide-play"
              :loading="runningAgent"
              @click="runAgentAnalysis"
            >
              {{ agentStatus === 'done' ? '重新分析' : '开始分析' }}
            </UButton>
          </div>
        </div>

        <UAlert
          v-if="agentError"
          color="error"
          variant="soft"
          :title="agentError"
          class="mb-4"
        />

        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
          <div
            v-for="item in analysisCards"
            :key="item.key"
            class="rounded-lg border p-4"
            :class="analysisStatus[item.key]?.done
              ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40'
              : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950'"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{ item.label }}</span>
              <UIcon
                :name="analysisStatus[item.key]?.done ? 'i-lucide-check-circle-2' : 'i-lucide-clock-3'"
                class="w-4 h-4"
                :class="analysisStatus[item.key]?.done ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'"
              />
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {{ analysisStatus[item.key]?.done ? `完成于 ${fmtTime(analysisStatus[item.key]?.generatedAt)}` : '尚未生成' }}
            </p>
          </div>
        </div>

        <div v-if="agentStatus === 'processing'" class="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 mb-5">
          <div class="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
            智能体正在分析案件材料，页面会自动刷新分析状态。
          </div>
        </div>

        <div v-if="agentUpdatedAt" class="text-xs text-gray-400 dark:text-gray-500 mb-4">
          最近更新：{{ fmtTime(agentUpdatedAt) }}
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-lucide-file-search" class="w-4 h-4 text-blue-500" />
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">案件分析</h3>
            </div>
            <p v-if="agentAnalysis" class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ agentAnalysis }}</p>
            <p v-else class="text-sm text-gray-400 dark:text-gray-500">尚未生成案件分析结果。</p>
          </div>

          <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-lucide-list-checks" class="w-4 h-4 text-blue-500" />
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">材料补正清单</h3>
            </div>
            <p v-if="materialChecklist" class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{{ materialChecklist }}</p>
            <p v-else class="text-sm text-gray-400 dark:text-gray-500">尚未生成材料补正清单。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
