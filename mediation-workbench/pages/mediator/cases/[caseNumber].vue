<script setup lang="ts">
// 调解员工作台 — 案件详情
const route = useRoute()
const { getAuthHeaders, fetchUser } = useAuth()

const caseNumber = route.params.caseNumber as string
const caseData = ref<any>(null)
const loading = ref(true)
const error = ref('')

// ── VALUE 调解技能库（5 阶段 × 5 技能）──────────────────
interface SolvePhase { key: string; en: string; name: string; desc: string }
interface SolveSkill { id: string; phaseKey: string; name: string; prompt: string }

const solvePhases = ref<SolvePhase[]>([])
const solveSkills = ref<SolveSkill[]>([])
const solveStatus = ref<Record<string, { done: boolean; generatedAt?: number }>>({})
const selectedPhase = ref('V')
const selectedSolveSkill = ref<string | null>(null)
const solveResults = ref<Record<string, string>>({})
const solveCached = ref<Record<string, boolean>>({})
const solveLoading = ref<Record<string, boolean>>({})
const solveError = ref('')

const currentPhaseSkills = computed(() => solveSkills.value.filter((s) => s.phaseKey === selectedPhase.value))
const currentSolveSkill = computed(() => solveSkills.value.find((s) => s.id === selectedSolveSkill.value))

async function loadSolve() {
  try {
    const [catResp, statusResp] = await Promise.all([
      $fetch<{ success: boolean; data: any }>(`/api/solve`, { headers: getAuthHeaders() }),
      $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}/solve`, { headers: getAuthHeaders() }),
    ])
    solvePhases.value = catResp?.data?.phases || []
    solveSkills.value = catResp?.data?.skills || []
    solveStatus.value = statusResp?.data?.status || {}
    if (!selectedSolveSkill.value && currentPhaseSkills.value.length) {
      selectedSolveSkill.value = currentPhaseSkills.value[0].id
    }
  } catch {}
}

async function runSolve(skillId: string, force = false) {
  selectedSolveSkill.value = skillId
  if (!force && solveResults.value[skillId]) return
  if (solveLoading.value[skillId]) return
  solveLoading.value[skillId] = true
  solveError.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data: any }>(
      `/api/cases/${caseNumber}/solve/${skillId}${force ? '?force=1' : ''}`,
      { method: 'POST', headers: getAuthHeaders() },
    )
    if (resp?.success && resp.data) {
      solveResults.value[skillId] = resp.data.content || ''
      solveCached.value[skillId] = !!resp.data.cached
      solveStatus.value[skillId] = { done: true, generatedAt: Date.now() }
    } else {
      solveError.value = resp?.data?.message || '未返回结果'
    }
  } catch (err: any) {
    solveError.value = err?.data?.message || err?.message || '技能运行失败，请稍后重试'
  } finally {
    solveLoading.value[skillId] = false
  }
}

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

onMounted(async () => {
  try {
    // 硬刷新/直链访问时先恢复登录态，确保 getAuthHeaders 带上 token
    await fetchUser()
    const data = await $fetch<{ success: boolean; data: any }>(`/api/cases/${caseNumber}`, {
      headers: getAuthHeaders(),
    })
    caseData.value = data.data
    await loadSolve()
    // 支持从 agents 页跳转：?solve=skillId 预选并自动运行该技能
    const jumpSkill = route.query.solve as string | undefined
    if (jumpSkill && solveSkills.value.some((s) => s.id === jumpSkill)) {
      const skill = solveSkills.value.find((s) => s.id === jumpSkill)!
      selectedPhase.value = skill.phaseKey
      await runSolve(jumpSkill)
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
  
      </div>
      <!-- ══ 左栏结束 ══ -->

      <!-- ══ 右栏：VALUE 技能库（独立滚动） ══ -->
      <div class="min-w-0 space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <!-- VALUE 调解技能库卡 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
          <div class="p-5 sm:p-6 pb-4">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-lucide-wand-2" class="w-4 h-4 text-blue-500" />VALUE 调解技能库
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">5 阶段 × 5 技能，脱敏后逐项运行，结果缓存至本地</p>
          </div>

          <!-- 阶段切换 -->
          <div class="px-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex gap-2 flex-wrap">
            <button
              v-for="phase in solvePhases"
              :key="phase.key"
              class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              :class="selectedPhase === phase.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
              @click="selectedPhase = phase.key"
            >
              {{ phase.key }} · {{ phase.name }}
            </button>
          </div>

          <!-- 技能列表 -->
          <div class="px-3 py-3 border-b border-gray-100 dark:border-gray-800 space-y-1">
            <button
              v-for="skill in currentPhaseSkills"
              :key="skill.id"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
              :class="selectedSolveSkill === skill.id
                ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                : 'border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'"
              @click="runSolve(skill.id)"
            >
              <UIcon name="i-lucide-magic-wand" class="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
              <span class="flex-1 text-sm font-medium min-w-0 truncate text-gray-700 dark:text-gray-300">{{ skill.name }}</span>
              <span v-if="solveLoading[skill.id]" class="shrink-0 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />运行中
              </span>
              <UIcon v-else-if="solveStatus[skill.id]?.done" name="i-lucide-check-circle-2" class="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
              <UIcon v-else name="i-lucide-clock-3" class="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          <!-- 结果展示区 -->
          <div class="p-5 sm:p-6">
            <div v-if="solveLoading[selectedSolveSkill]" class="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 py-6">
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />正在运行技能，请稍候…
            </div>
            <UAlert v-else-if="solveError" color="error" variant="soft" :title="solveError" />
            <div v-else-if="solveResults[selectedSolveSkill]">
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ currentSolveSkill?.name }}</h3>
                <div class="flex-1" />
                <span v-if="solveCached[selectedSolveSkill]" class="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">缓存结果</span>
                <button
                  class="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title="重新生成"
                  @click="runSolve(selectedSolveSkill, true)"
                >
                  <UIcon name="i-lucide-refresh-cw" class="w-3.5 h-3.5" />重新生成
                </button>
              </div>
              <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed break-words">{{ solveResults[selectedSolveSkill] }}</p>
            </div>
            <div v-else class="text-sm text-gray-400 dark:text-gray-500">
              <UIcon name="i-lucide-inbox" class="w-4 h-4 inline mr-1 align-[-2px]" />点击上方技能开始运行。
            </div>
          </div>
        </div>
        <!-- VALUE 卡结束 -->

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
