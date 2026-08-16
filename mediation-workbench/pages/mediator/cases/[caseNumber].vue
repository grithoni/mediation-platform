<script setup lang="ts">
// 调解员工作台 — 案件详情
import { renderRichText } from '~/server/utils/md-table'
const route = useRoute()
const { getAuthHeaders, fetchUser } = useAuth()

/**
 * 去除技能结果中的 Markdown 标记，转成纯文字（保留表格结构可选）。
 * preserveTables=true 时，Markdown 表格行（| 开头）原样保留，由 renderRichText 转 HTML。
 */
function stripValueMarkdown(text: string, preserveTables = false): string {
  if (!text) return ''
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, (line) => {
      if (preserveTables) return line
      const cells = line.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim())
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return ''
      return cells.join('　')
    })
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.、]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const caseNumber = route.params.caseNumber as string
const caseData = ref<any>(null)
const loading = ref(true)
const error = ref('')

// ── VALUE 调解技能库（5 阶段 × 5 技能）──────────────────
interface ValuePhase { key: string; en: string; name: string; desc: string }
interface ValueSkill { id: string; phaseKey: string; name: string; prompt: string }

const valuePhases = ref<ValuePhase[]>([])
const valueSkills = ref<ValueSkill[]>([])
const valueStatus = ref<Record<string, { done: boolean; generatedAt?: number }>>({})
const selectedPhase = ref('V')
const selectedValueSkill = ref<string | null>(null)
const valueResults = ref<Record<string, string>>({})
const valueCached = ref<Record<string, boolean>>({})
const valueLoading = ref<Record<string, boolean>>({})
const abortControllers = ref<Record<string, AbortController>>({})
const valueError = ref('')

const currentPhaseSkills = computed(() => valueSkills.value.filter((s) => s.phaseKey === selectedPhase.value))
const currentValueSkill = computed(() => valueSkills.value.find((s) => s.id === selectedValueSkill.value))

async function loadValue() {
  try {
    const [catResp, statusResp] = await Promise.all([
      $fetch<{ success: boolean; data: any }>(`/api/value`, { headers: getAuthHeaders() }),
      $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}/value`, { headers: getAuthHeaders() }),
    ])
    valuePhases.value = catResp?.data?.phases || []
    valueSkills.value = catResp?.data?.skills || []
    valueStatus.value = statusResp?.data?.status || {}
    if (!selectedValueSkill.value && currentPhaseSkills.value.length) {
      const firstDone = currentPhaseSkills.value.find((skill) => valueStatus.value[skill.id]?.done)
      selectedValueSkill.value = (firstDone || currentPhaseSkills.value[0])?.id || null
      if (selectedValueSkill.value && valueStatus.value[selectedValueSkill.value]?.done) {
        // 初始化拉取缓存：仅填充结果，不展开结果区（保持默认折叠）
        await runValue(selectedValueSkill.value, false, false)
      }
    }
  } catch {}
}

async function runValue(skillId: string, force = false, expand = true) {
  selectedValueSkill.value = skillId
  if (!force && valueResults.value[skillId]) {
    // 已有缓存结果：仅在用户主动操作时展开
    if (expand) resultsOpen.value = true
    return
  }
  if (valueLoading.value[skillId]) return
  valueLoading.value[skillId] = true
  valueError.value = ''
  // 中止控制器：运行中可"暂停"（AbortController 中止请求）
  const controller = new AbortController()
  abortControllers.value[skillId] = controller
  try {
    const resp = await $fetch<{ success: boolean; data: any }>(
      `/api/cases/${caseNumber}/value/${skillId}${force ? '?force=1' : ''}`,
      { method: 'POST', headers: getAuthHeaders(), signal: controller.signal },
    )
    if (resp?.success && resp.data) {
      valueResults.value[skillId] = stripValueMarkdown(resp.data.content || '', true)
      valueCached.value[skillId] = !!resp.data.cached
      valueStatus.value[skillId] = { done: true, generatedAt: Date.now() }
      // 结果生成后自动展开结果区（初始化拉取缓存时不展开，保持默认折叠）
      if (expand) resultsOpen.value = true
      // 刷新评估信息（幻觉检测/引用来源）；异步 judge 稍后完成，延时二次刷新
      loadRuns()
      setTimeout(loadRuns, 8000)
    } else {
      valueError.value = resp?.data?.message || '未返回结果'
    }
  } catch (err: any) {
    // 用户主动暂停（AbortError）不视为错误
    if (err?.name === 'AbortError') {
      pipelineProgress.value = `已暂停 ${currentValueSkill?.name || skillId}`
      setTimeout(() => { pipelineProgress.value = '' }, 3000)
    } else {
      valueError.value = err?.data?.message || err?.message || '技能运行失败，请稍后重试'
    }
  } finally {
    valueLoading.value[skillId] = false
    delete abortControllers.value[skillId]
  }
}

/** 中止单个技能运行（暂停按钮） */
function pauseSkill(skillId: string) {
  abortControllers.value[skillId]?.abort()
}

// ── 单技能运行前确认（内联展开在技能下方）──
const confirmSkill = ref<string | null>(null) // 待确认的技能 id

function requestRunSkill(skillId: string) {
  // 已在运行则忽略
  if (valueLoading.value[skillId]) return
  // 点击同一技能：若在确认态则取消，否则进入确认态
  confirmSkill.value = confirmSkill.value === skillId ? null : skillId
}

function confirmRunSkill() {
  if (confirmSkill.value) {
    runValue(confirmSkill.value)
    confirmSkill.value = null
  }
}

// ── 自动编排：阶段暂停 + 人工接管（先单点技能会被跳过，缺口自动补齐）──
const pipelineRunning = ref(false)
const pipelineProgress = ref('')
const phasePause = ref<string | null>(null) // 等待确认的阶段（如 'V'）
const resumeFromPhase = ref('')             // 恢复时从哪一阶段继续

interface PipelineResult {
  run: string[]; skipped: string[]; failed: Array<{ skillId: string; error: string }>; total: number
  pauseAtPhase?: string | null
}

const PHASE_NAMES: Record<string, string> = { V: '接案准备', A: '开启过程', L: '倾听理解', U: '方案验证', E: '促成解决' }

/** 运行自动编排：从指定阶段开始（默认从头），启用阶段暂停，每阶段出口后返回等确认 */
async function runAllSkills(fromPhase = '') {
  if (pipelineRunning.value) return
  pipelineRunning.value = true
  pipelineProgress.value = fromPhase
    ? `正在运行 ${PHASE_NAMES[fromPhase] || fromPhase} 阶段…`
    : '正在准备…'
  try {
    const resp = await $fetch<{ success: boolean; data: PipelineResult }>(
      `/api/cases/${caseNumber}/value/run-all?phaseByPhase=1${fromPhase ? `&fromPhase=${fromPhase}` : ''}`,
      { method: 'POST', headers: getAuthHeaders() },
    )
    const r = resp?.data
    if (r) {
      pipelineProgress.value = `完成 ${r.run.length} / 跳过 ${r.skipped.length} / 失败 ${r.failed.length}`
      await loadValue()
      if (r.pauseAtPhase) {
        // 阶段暂停：等待人工确认后继续下一阶段
        phasePause.value = r.pauseAtPhase
        resumeFromPhase.value = (['V', 'A', 'L', 'U', 'E'].find((p) => p > r.pauseAtPhase!) ?? '')
      }
    }
  } catch (err: any) {
    valueError.value = err?.data?.message || err?.message || '自动分析失败'
  } finally {
    pipelineRunning.value = false
  }
}

/** 确认继续：从暂停的下一阶段恢复自动编排 */
async function confirmContinue() {
  const from = resumeFromPhase.value
  phasePause.value = null
  if (from) {
    await runAllSkills(from)
  }
}

/** 终止自动编排（转为纯手动） */
async function cancelPipeline() {
  phasePause.value = null
  resumeFromPhase.value = ''
  pipelineProgress.value = '已终止自动编排，可手动运行技能'
  try {
    await $fetch(`/api/cases/${caseNumber}/value/pipeline-cancel`, { method: 'POST', headers: getAuthHeaders() })
  } catch {}
  setTimeout(() => { pipelineProgress.value = '' }, 3000)
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

// 文件预览（图片直接打开，其余下载）— 需登录认证（/api/cases/:caseNumber/file?name=xxx）
function fileUrl(name: string): string {
  return `/api/cases/${caseNumber}/file?name=${encodeURIComponent(name)}`
}

// ── 智能对话（右下角 AI 对话框，调用 deepseek-v4-flash）────────
interface ChatMsg { role: 'user' | 'assistant'; content: string }
const chatInput = ref('')
const chatSending = ref(false)
const chatMessages = ref<ChatMsg[]>([])

function chatScrollToBottom() {
  nextTick(() => {
    const el = document.getElementById('ai-chat-scroll')
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text || chatSending.value) return
  chatInput.value = ''
  chatMessages.value.push({ role: 'user', content: text })
  chatSending.value = true
  chatScrollToBottom()
  try {
    const resp = await $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: { message: text, history: chatMessages.value.slice(0, -1) },
    })
    chatMessages.value.push({ role: 'assistant', content: resp?.data?.content || '（无回复）' })
  } catch (err: any) {
    chatMessages.value.push({ role: 'assistant', content: err?.data?.message || err?.message || 'AI 服务调用失败，请稍后重试' })
  } finally {
    chatSending.value = false
    chatScrollToBottom()
  }
}

// ── 分析结果展示区（默认折叠，点击标题展开）────
const resultsOpen = ref(false)
// ── 案件材料 / 沟通记录（默认折叠，点击标题展开）────
const materialsOpen = ref(false)
const messagesOpen = ref(false)

// ── 技能评估信息（幻觉检测 / 引用来源 / 复核，随选中技能展示在报告区）──
const agentRuns = ref<any[]>([])
const reviewOpen = ref('')

interface AgentRunItem {
  id: string
  agentType: string
  status: string
  planJson: any
  inputContext: string | null
  retrievalRefs: Array<{ path: string; score: number }>
  toolCalls: any[]
  outputContent: string | null
  reviewState: string
  errorMessage: string | null
  startedAt: number
  finishedAt: number | null
}

const reviewStateLabels: Record<string, string> = {
  none: '未复核',
  pending: '待复核',
  approved: '已通过',
  rejected: '待人工复核',
}

/** 当前选中技能对应的最近一次执行记录（优先取有评估结果的） */
const currentRun = computed<AgentRunItem | null>(() => {
  if (!selectedValueSkill.value) return null
  const skillRuns = agentRuns.value.filter((r) => r.planJson?.skillId === selectedValueSkill.value)
  if (skillRuns.length === 0) return null
  return skillRuns.find((r) => runScore(r)) || skillRuns[0]
})

function runScore(run: AgentRunItem): { normalized: number; totalScore: number; maxTotal: number; hallucinationCount: number; hallucinations: string[]; missingPoints: string[] } | null {
  const evalCall = (run.toolCalls || []).find((t) => t.name === 'eval_llm_judge')
  return evalCall?.result || null
}

/** 旧版评估数据：报告了幻觉数量但未存明细（修复前生成的记录） */
function isLegacyEval(run: AgentRunItem): boolean {
  const score = runScore(run)
  if (!score) return false
  return (score.hallucinationCount > 0 || score.totalScore > 0) && !Array.isArray(score.hallucinations)
}

async function loadRuns() {
  try {
    const resp = await $fetch<{ success: boolean; data: AgentRunItem[] }>(`/api/cases/${caseNumber}/runs`, {
      headers: getAuthHeaders(),
    })
    agentRuns.value = resp?.data || []
  } catch {
    agentRuns.value = []
  }
}

/** 人工复核通过：将执行记录的 review_state 标记为 approved */
async function approveRun(runId: string) {
  try {
    await $fetch(`/api/cases/${caseNumber}/runs/${runId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    })
    const run = agentRuns.value.find((r) => r.id === runId)
    if (run) run.reviewState = 'approved'
    reviewOpen.value = ''
  } catch (err: any) {
    alert(err?.data?.message || err?.message || '复核失败')
  }
}

// ── 调解员手动设置案件状态（不强制流转，可前进/回退/跳过）──
const phaseOptions: { value: string; label: string }[] = [
  { value: 'intake', label: '收案' },
  { value: 'reviewing', label: '接案准备' },
  { value: 'accepted', label: '开启过程' },
  { value: 'mediating', label: '倾听理解' },
  { value: 'negotiating', label: '方案验证' },
  { value: 'agreement_drafting', label: '促成解决' },
  { value: 'withdrawn', label: '撤回' },
]
const phaseUpdating = ref(false)
const phaseError = ref('')

async function updatePhase() {
  if (!caseData.value || phaseUpdating.value) return
  phaseUpdating.value = true
  phaseError.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data: any }>(
      `/api/cases/${caseNumber}/phase`,
      { method: 'PUT', headers: getAuthHeaders(), body: { phase: caseData.value.phase } },
    )
    if (resp?.success) {
      caseData.value.phase = resp.data.phase
      caseData.value.status = resp.data.status
    } else {
      phaseError.value = resp?.data?.message || '状态更新失败'
    }
  } catch (err: any) {
    phaseError.value = err?.data?.message || err?.message || '状态更新失败'
  } finally {
    phaseUpdating.value = false
  }
}

onMounted(async () => {
  try {
    // 硬刷新/直链访问时先恢复登录态，确保 getAuthHeaders 带上 token
    await fetchUser()
    const data = await $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}`, {
      headers: getAuthHeaders(),
    })
    caseData.value = data.data
    await loadValue()
    loadRuns() // 加载技能评估信息（幻觉检测/引用来源/复核状态）
    // 恢复自动编排：若有暂停状态，提示继续
    try {
      const pipeResp = await $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}/value/pipeline-status`, {
        headers: getAuthHeaders(),
      })
      const ps = pipeResp?.data
      if (ps?.status === 'paused' && ps.resumePhase) {
        resumeFromPhase.value = ps.resumePhase
        phasePause.value = ps.currentPhase || 'V'
      }
    } catch { /* 无暂停状态则忽略 */ }
    // 支持从 agents 页跳转：?value=skillId 预选并自动运行该技能
    const jumpSkill = route.query.value as string | undefined
    if (jumpSkill && valueSkills.value.some((s) => s.id === jumpSkill)) {
      const skill = valueSkills.value.find((s) => s.id === jumpSkill)!
      selectedPhase.value = skill.phaseKey
      await runValue(jumpSkill)
    }
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || '加载案件失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="w-full px-4 sm:px-6 lg:px-8 py-6 lg:h-screen lg:flex lg:flex-col lg:overflow-hidden">
    <NuxtLink to="/mediator" class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors">
      <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />返回案件列表
    </NuxtLink>

    <div v-if="loading" class="flex items-center justify-center py-32">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
    </div>

    <UAlert v-else-if="error" color="error" variant="soft" :title="error" class="mb-4" />

    <div v-else-if="caseData" class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:flex-1 lg:min-h-0 lg:grid-rows-1">
      <!-- ══ 左栏：案件信息区（独立滚动） ══ -->
      <div class="min-w-0 space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <!-- 案件概览 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6">
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
                <!-- 调解员手动设置案件阶段（不强制流转，可前进/回退/跳过） -->
                <select
                  v-model="caseData.phase"
                  @change="updatePhase"
                  :disabled="phaseUpdating"
                  class="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-transparent hover:border-blue-400 dark:hover:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer disabled:opacity-60"
                  :title="phaseError || '点击切换案件阶段'"
                >
                  <option v-for="opt in phaseOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
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
        <div v-if="caseData.application" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <UIcon name="i-lucide-file-text" class="w-4 h-4 text-blue-500" />调解申请书
          </h2>
  
          <!-- 申请人联系方式 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <template v-for="(label, key) in {
              applicantName: '申请人名称', applicantAddress: '申请人地址', applicantPostalCode: '申请人邮编',
              applicantPhone: '申请人固话', applicantMobile: '申请人手机', applicantFax: '申请人传真',
              applicantEmail: '申请人邮箱', applicantOtherContact: '申请人其他联系方式',
            }" :key="key">
              <div v-if="caseData.application[key]" class="flex gap-2 min-w-0">
                <span class="text-gray-400 dark:text-gray-500 shrink-0">{{ label }}</span>
                <span class="text-gray-800 dark:text-gray-200 break-words">{{ caseData.application[key] }}</span>
              </div>
            </template>
          </div>
  
          <div class="border-t border-gray-100 dark:border-gray-800 my-4" />
  
          <!-- 被申请人联系方式 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <template v-for="(label, key) in {
              respondentName: '被申请人名称', respondentAddress: '被申请人地址', respondentPostalCode: '被申请人邮编',
              respondentPhone: '被申请人固话', respondentMobile: '被申请人手机', respondentFax: '被申请人传真',
              respondentEmail: '被申请人邮箱', respondentOtherContact: '被申请人其他联系方式',
            }" :key="key">
              <div v-if="caseData.application[key]" class="flex gap-2 min-w-0">
                <span class="text-gray-400 dark:text-gray-500 shrink-0">{{ label }}</span>
                <span class="text-gray-800 dark:text-gray-200 break-words">{{ caseData.application[key] }}</span>
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
  
            <!-- 长文本字段：标签在上、内容占满整行，利于阅读 -->
            <div v-for="(label, field) in {
              caseFacts: '案件事实', disputeMatters: '争议事项', mediationDemands: '调解诉求', demandsBasis: '理据',
            }" :key="field">
              <div v-if="caseData.application[field]" class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 p-3">
                <div class="text-xs text-gray-400 dark:text-gray-500 mb-1.5">{{ label }}</div>
                <p class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed break-words">{{ caseData.application[field] }}</p>
              </div>
            </div>
  
            <div v-if="caseData.application.evidenceConfidential" class="flex gap-2">
              <span class="text-amber-600 dark:text-amber-400 shrink-0">⚠ 证据材料已申请保密处理</span>
            </div>
          </div>
        </div>
  
        <!-- 材料文件（默认折叠，点击展开） -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
          <button
            class="w-full flex items-center gap-2 p-5 sm:p-6 pb-4 text-left"
            @click="materialsOpen = !materialsOpen"
          >
            <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-blue-500 shrink-0" />
            <span class="flex-1 min-w-0">
              <span class="block text-base font-semibold text-gray-900 dark:text-white">案件材料（{{ caseData.documents?.length || 0 }}）</span>
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200"
              :class="materialsOpen ? 'rotate-180' : ''"
            />
          </button>

          <div v-if="materialsOpen" class="px-5 sm:px-6 pb-6">
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
        </div>

        <!-- 沟通记录（默认折叠，点击展开） -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
          <button
            class="w-full flex items-center gap-2 p-5 sm:p-6 pb-4 text-left"
            @click="messagesOpen = !messagesOpen"
          >
            <UIcon name="i-lucide-message-square" class="w-4 h-4 text-blue-500 shrink-0" />
            <span class="flex-1 min-w-0">
              <span class="block text-base font-semibold text-gray-900 dark:text-white">沟通记录（{{ caseData.messages?.length || 0 }}）</span>
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200"
              :class="messagesOpen ? 'rotate-180' : ''"
            />
          </button>

          <div v-if="messagesOpen" class="px-5 sm:px-6 pb-6">
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
        </div>
  
      </div>
      <!-- ══ 左栏结束 ══ -->

      <!-- ══ 右栏：VALUE 技能库（独立滚动） ══ -->
      <div class="min-w-0 space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <!-- VALUE 调解技能库卡 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
          <div class="p-5 sm:p-6 pb-4 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <UIcon name="i-lucide-wand-2" class="w-4 h-4 text-blue-500" />VALUE 调解技能库
              </h2>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">5 阶段 × 5 技能，自动编排运行，结果缓存至本地</p>
            </div>
            <div class="shrink-0">
              <UButton
                color="primary"
                icon="i-lucide-play"
                :loading="pipelineRunning"
                :disabled="pipelineRunning"
                size="sm"
                title="按阶段顺序自动运行全部技能（依赖自动补跑）"
                @click="runAllSkills"
              >
                {{ pipelineRunning ? '自动分析中…' : '自动分析' }}
              </UButton>
              <p v-if="pipelineProgress" class="text-xs text-blue-600 dark:text-blue-400 mt-1 text-right">
                {{ pipelineProgress }}
              </p>
            </div>
          </div>

          <!-- 阶段切换 -->
          <div class="px-5 pb-4 border-b border-gray-100 dark:border-gray-800 grid grid-cols-2 lg:grid-cols-5 gap-1.5">
            <button
              v-for="phase in valuePhases"
              :key="phase.key"
              class="w-full rounded-xl border px-2 py-1.5 text-left transition-colors"
              :class="selectedPhase === phase.key
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-800 dark:hover:bg-gray-800'"
              @click="selectedPhase = phase.key"
            >
              <div class="text-[11px] font-semibold leading-tight">{{ phase.key }} · {{ phase.name }}</div>
              <div
                class="mt-0.5 text-[9px] uppercase tracking-[0.08em] leading-tight"
                :class="selectedPhase === phase.key ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'"
              >
                {{ phase.en }}
              </div>
            </button>
          </div>

          <!-- 技能列表 -->
          <div class="px-3 py-3 border-b border-gray-100 dark:border-gray-800 space-y-1">
            <div
              v-for="skill in currentPhaseSkills"
              :key="skill.id"
              class="rounded-lg"
              :class="confirmSkill === skill.id
                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                : selectedValueSkill === skill.id
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                  : 'border border-transparent'"
            >
              <button
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                @click="requestRunSkill(skill.id)"
              >
                <UIcon name="i-lucide-magic-wand" class="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
                <span class="flex-1 text-sm font-medium min-w-0 truncate text-gray-700 dark:text-gray-300">{{ skill.name }}</span>
                <span v-if="valueLoading[skill.id]" class="shrink-0 flex items-center gap-1.5">
                  <span class="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                    <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />运行中
                  </span>
                  <button
                    class="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="暂停运行"
                    @click.stop="pauseSkill(skill.id)"
                  >
                    <UIcon name="i-lucide-square" class="w-3 h-3" />暂停
                  </button>
                </span>
                <UIcon v-else-if="valueStatus[skill.id]?.done" name="i-lucide-check-circle-2" class="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
                <UIcon v-else name="i-lucide-clock-3" class="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              </button>

              <!-- 内联确认区：点技能后在此技能下方出现 -->
              <div v-if="confirmSkill === skill.id" class="px-3 pb-3">
                <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2">
                  运行前将先执行本地脱敏，再基于脱敏后的案件材料调用云端模型分析，完成后结果回填还原并缓存至本地。
                </p>
                <div class="flex items-center gap-2">
                  <UButton size="xs" color="primary" icon="i-lucide-play" @click="confirmRunSkill">确认运行</UButton>
                  <UButton size="xs" color="neutral" variant="soft" @click="confirmSkill = null">取消</UButton>
                </div>
              </div>
            </div>
          </div>

          <!-- 结果展示区（默认折叠，点击展开） -->
          <div class="border-t border-gray-100 dark:border-gray-800">
            <button
              class="w-full flex items-center gap-2 p-5 text-left"
              @click="resultsOpen = !resultsOpen"
            >
              <UIcon name="i-lucide-clipboard-list" class="w-4 h-4 text-blue-500 shrink-0" />
              <span class="flex-1 min-w-0">
                <span class="block text-base font-semibold text-gray-900 dark:text-white">分析结果</span>
                <span class="block text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {{ selectedValueSkill ? currentValueSkill?.name + (valueResults[selectedValueSkill] ? '（已生成）' : '') : '选择技能后查看分析结果' }}
                </span>
              </span>
              <UIcon
                name="i-lucide-chevron-down"
                class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200"
                :class="resultsOpen ? 'rotate-180' : ''"
              />
            </button>

            <div v-if="resultsOpen" class="px-5 pb-5">
              <div v-if="selectedValueSkill && valueLoading[selectedValueSkill]" class="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 py-6">
                <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />正在运行技能，请稍候…
              </div>
              <UAlert v-else-if="valueError" color="error" variant="soft" :title="valueError" />
              <div v-else-if="selectedValueSkill && valueResults[selectedValueSkill]">
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ currentValueSkill?.name }}</h3>
                  <div class="flex-1" />
                  <span v-if="valueCached[selectedValueSkill]" class="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">缓存结果</span>
                  <button
                    class="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="重新生成"
                    @click="runValue(selectedValueSkill, true)"
                  >
                    <UIcon name="i-lucide-refresh-cw" class="w-3.5 h-3.5" />重新生成
                  </button>
                </div>
                <div class="eval-md-body text-sm text-gray-700 dark:text-gray-300 leading-relaxed break-words" v-html="renderRichText(valueResults[selectedValueSkill], stripValueMarkdown)" />

                <!-- 评估信息：幻觉检测 / 引用来源 / 复核（随当前技能显示在报告中） -->
                <template v-if="currentRun">
                  <!-- 幻觉警告 + 明细 -->
                  <template v-if="runScore(currentRun) && runScore(currentRun)!.hallucinationCount > 0">
                    <div class="mt-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-3">
                      <div class="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <UIcon name="i-lucide-alert-triangle" class="w-3.5 h-3.5 shrink-0" />
                        <span class="font-semibold">⚠ 检测到 {{ runScore(currentRun)!.hallucinationCount }} 处潜在幻觉，建议人工复核</span>
                        <button
                          class="ml-auto inline-flex items-center gap-0.5 hover:underline"
                          @click="reviewOpen = reviewOpen === currentRun.id ? '' : currentRun.id"
                        >
                          <UIcon :name="reviewOpen === currentRun.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="w-3 h-3" />
                          {{ reviewOpen === currentRun.id ? '收起' : '查看详情' }}
                        </button>
                      </div>
                      <div v-if="reviewOpen === currentRun.id" class="mt-2 space-y-2">
                        <div v-if="isLegacyEval(currentRun)" class="text-xs text-amber-700/80 dark:text-amber-300/80">
                          此条为旧版评估记录，未保存幻觉明细。请点击"重新生成"重新运行该技能获取可核实的明细。
                        </div>
                        <template v-else>
                          <ul class="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-4">
                            <li v-for="(h, hi) in (runScore(currentRun)!.hallucinations || [])" :key="hi">{{ h }}</li>
                            <li v-if="!(runScore(currentRun)!.hallucinations || []).length" class="list-none">（无具体明细）</li>
                          </ul>
                          <div class="flex items-center gap-2 pt-1">
                            <button
                              class="text-xs px-2 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                              @click="approveRun(currentRun.id)"
                            >
                              已人工核实，无问题
                            </button>
                            <span class="text-xs text-gray-400 dark:text-gray-500">核实后此报告将标记为已通过</span>
                          </div>
                        </template>
                      </div>
                    </div>
                  </template>

                  <!-- 引用来源（可审计可追溯） -->
                  <div v-if="currentRun.retrievalRefs && currentRun.retrievalRefs.length" class="mt-3">
                    <div class="text-xs text-gray-400 dark:text-gray-500 mb-1.5">引用来源（知识库，可溯源）</div>
                    <div class="flex flex-wrap gap-1.5">
                      <span
                        v-for="(ref, ri) in currentRun.retrievalRefs"
                        :key="ri"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                      >
                        {{ (ref.path || '').split('/').pop() }}
                        <span class="text-blue-400 dark:text-blue-500 text-[10px]">{{ (ref.score || 0).toFixed(2) }}</span>
                      </span>
                    </div>
                  </div>
                </template>
              </div>
              <div v-else class="text-sm text-gray-400 dark:text-gray-500">
                <UIcon name="i-lucide-inbox" class="w-4 h-4 inline mr-1 align-[-2px]" />点击上方技能开始运行。
              </div>
            </div>
          </div>
        </div>
        <!-- VALUE 卡结束 -->

        <!-- ══ 阶段暂停确认（自动编排关键节点人工接管） ══ -->
        <UModal v-model="phasePause" :ui="{ width: 'sm:max-w-md' }">
          <div class="p-5 sm:p-6">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <UIcon name="i-lucide-pause" class="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                  {{ PHASE_NAMES[phasePause || ''] || phasePause }} 阶段已完成
                </h3>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">自动编排已暂停，请在关键节点确认后继续</p>
              </div>
            </div>

            <div class="rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-3 mb-4">
              <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                可在下方对已完成技能进行人工接管（重跑/调整），确认后自动编排将从
                <span class="font-semibold text-gray-900 dark:text-white">{{ PHASE_NAMES[resumeFromPhase] || resumeFromPhase }}</span>
                阶段继续执行。
              </p>
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton color="neutral" variant="soft" icon="i-lucide-square" @click="cancelPipeline">
                终止自动编排
              </UButton>
              <UButton color="primary" icon="i-lucide-play" @click="confirmContinue">
                确认并继续
              </UButton>
            </div>
          </div>
        </UModal>
        <!-- 阶段暂停确认结束 -->

        <!-- ══ 智能对话：调解技能库下方（常驻） ══ -->
        <div
          class="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg flex flex-col overflow-hidden"
        >
        <!-- 头部 -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <UIcon name="i-lucide-bot" class="w-5 h-5 text-blue-500 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-gray-900 dark:text-white">智能调解助手</div>
            <div class="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">DeepSeek · 基于本案件上下文，可以就本案争议焦点、法律依据、调解方案等向我提问。</div>
          </div>
        </div>

        <!-- 消息区 -->
        <div id="ai-chat-scroll" class="max-h-[300px] overflow-y-auto px-4 py-3 space-y-3">
          <div
            v-for="(msg, i) in chatMessages"
            :key="i"
            class="flex"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words"
              :class="msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-bl-md'"
            >
              {{ msg.content }}
            </div>
          </div>
          <div v-if="chatSending" class="flex justify-start">
            <div class="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md">
              <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0ms" />
              <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 150ms" />
              <span class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 300ms" />
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="p-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <div class="flex items-end gap-2">
            <UInput
              v-model="chatInput"
              class="flex-1"
              placeholder="输入问题，回车发送…"
              :disabled="chatSending"
              @keydown.enter.prevent="sendChat"
            />
            <button
              class="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              :disabled="chatSending || !chatInput.trim()"
              @click="sendChat"
            >
               <UIcon name="i-lucide-send" class="w-4 h-4" />
             </button>
           </div>
         </div>
       </div>
       </div>
     </div>
   </div>
 </template>

<style scoped>
.eval-md-body :deep(.eval-md-table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.5;
}
.eval-md-body :deep(.eval-md-table th),
.eval-md-body :deep(.eval-md-table td) {
  border: 1px solid #e5e7eb;
  padding: 0.4rem 0.6rem;
  text-align: left;
  vertical-align: top;
}
.dark .eval-md-body :deep(.eval-md-table th),
.dark .eval-md-body :deep(.eval-md-table td) {
  border-color: #374151;
}
.eval-md-body :deep(.eval-md-table th) {
  background-color: #f9fafb;
  font-weight: 600;
}
.dark .eval-md-body :deep(.eval-md-table th) {
  background-color: #111827;
}
.eval-md-body :deep(p) {
  margin: 0.35rem 0;
  white-space: pre-wrap;
}
</style>
