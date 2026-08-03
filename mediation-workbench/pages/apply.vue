<script setup lang="ts">
import type { Ref } from 'vue'

// 与 layouts/party.vue 左侧栏共享的模式状态（case-entry / create-case）
// 左侧栏两个菜单项「进入我的案件」「创建新的案件」通过 setMenu 切换本页模式
const { activeMenu, setMenu } = useActiveMenu()

type ZoneKey = 'evidence' | 'identity' | 'auth'

interface ApplicationForm {
  applicant_name: string
  applicant_address: string
  applicant_postal_code: string
  applicant_phone: string
  applicant_mobile: string
  applicant_fax: string
  applicant_email: string
  applicant_other_contact: string
  respondent_name: string
  respondent_address: string
  respondent_postal_code: string
  respondent_phone: string
  respondent_mobile: string
  respondent_fax: string
  respondent_email: string
  respondent_other_contact: string
  mediation_willingness: string
  case_facts: string
  dispute_matters: string
  mediation_demands: string
  demands_basis: string
  evidence_confidential: boolean
  has_agent: boolean
  agent_name: string
  agent_duties: string
}

const EMPTY_FORM: ApplicationForm = {
  applicant_name: '',
  applicant_address: '',
  applicant_postal_code: '',
  applicant_phone: '',
  applicant_mobile: '',
  applicant_fax: '',
  applicant_email: '',
  applicant_other_contact: '',
  respondent_name: '',
  respondent_address: '',
  respondent_postal_code: '',
  respondent_phone: '',
  respondent_mobile: '',
  respondent_fax: '',
  respondent_email: '',
  respondent_other_contact: '',
  mediation_willingness: '',
  case_facts: '',
  dispute_matters: '',
  mediation_demands: '',
  demands_basis: '',
  evidence_confidential: false,
  has_agent: false,
  agent_name: '',
  agent_duties: '',
}

const form = reactive<ApplicationForm>({ ...EMPTY_FORM })

// ---- 文件上传（证据 / 身份证明 / 授权委托书） ----
const evidenceFiles = ref<File[]>([])
const identityFiles = ref<File[]>([])
const authFiles = ref<File[]>([])
const zoneFiles: Record<ZoneKey, Ref<File[]>> = {
  evidence: evidenceFiles,
  identity: identityFiles,
  auth: authFiles,
}
const dragOver = reactive<Record<ZoneKey, boolean>>({ evidence: false, identity: false, auth: false })
const fileInputs = reactive<Record<ZoneKey, HTMLInputElement | null>>({ evidence: null, identity: null, auth: null })

function setFileInputRef(zone: ZoneKey) {
  return (el: unknown) => { fileInputs[zone] = el as HTMLInputElement | null }
}

function addFilesTo(zone: ZoneKey, list: FileList | null) {
  if (!list) return
  const arr = zoneFiles[zone]
  for (const file of Array.from(list)) {
    if (file.size > 50 * 1024 * 1024) continue
    if (!arr.value.some(f => f.name === file.name && f.size === file.size)) {
      arr.value.push(file)
    }
  }
}

function removeFileAt(zone: ZoneKey, idx: number) {
  zoneFiles[zone].value.splice(idx, 1)
}

function clearZone(zone: ZoneKey) {
  zoneFiles[zone].value = []
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ---- OCR 智能识别 ----
const ocrInput = ref<HTMLInputElement | null>(null)
const ocrLoading = ref(false)
const ocrStatus = ref('')
const ocrStatusTone = ref<'info' | 'success' | 'error'>('info')
const ocrFilename = ref('')

const FIELD_LABELS: Record<string, string> = {
  applicant_name: '申请人名称', applicant_address: '申请人地址', applicant_postal_code: '申请人邮编',
  applicant_phone: '申请人固话', applicant_mobile: '申请人手机', applicant_fax: '申请人传真',
  applicant_email: '申请人邮箱', applicant_other_contact: '申请人其他联系方式',
  respondent_name: '被申请人名称', respondent_address: '被申请人地址', respondent_postal_code: '被申请人邮编',
  respondent_phone: '被申请人固话', respondent_mobile: '被申请人手机', respondent_fax: '被申请人传真',
  respondent_email: '被申请人邮箱', respondent_other_contact: '被申请人其他联系方式',
  mediation_willingness: '调解意愿',
  case_facts: '案件事实', dispute_matters: '争议事项', mediation_demands: '调解诉求', demands_basis: '理据',
  agent_name: '代理人姓名', agent_duties: '代理人职责',
}

const ocrStatusClass = computed(() => ({
  info: 'text-blue-600 dark:text-blue-400',
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
})[ocrStatusTone.value])

function triggerOcr() {
  ocrInput.value?.click()
}

async function onOcrFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  ocrFilename.value = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`
  ocrLoading.value = true
  ocrStatus.value = '正在提取文本并识别字段，请稍候...'
  ocrStatusTone.value = 'info'

  try {
    const fd = new FormData()
    fd.append('file', file)
    const data = await $fetch<{ success: boolean; fields?: Record<string, string>; used_ocr?: boolean; error?: string; detail?: string }>('/api/ocr', {
      method: 'POST',
      body: fd,
    })

    if (!data?.success) {
      throw new Error(data?.error || data?.detail || '识别失败')
    }

    const fields = data.fields || {}
    let filled = 0
    const filledNames: string[] = []
    const target = form as unknown as Record<string, string | boolean>

    for (const key of Object.keys(FIELD_LABELS)) {
      const val = fields[key]
      if (!val) continue

      if (key === 'mediation_willingness') {
        if (val === 'mutual' || val === 'single_party') {
          target[key] = val
          filled++
          filledNames.push(FIELD_LABELS[key]!)
        }
        continue
      }

      if (key.startsWith('agent_')) {
        form.has_agent = true
      }

      target[key] = val
      filled++
      filledNames.push(FIELD_LABELS[key]!)
    }

    const methodLabel = data.used_ocr ? 'OCR识别' : '文本提取'
    const names = filledNames.length ? `：${filledNames.slice(0, 4).join('、')}${filledNames.length > 4 ? '等' : ''}` : ''
    ocrStatus.value = `✓ ${methodLabel}完成，已回填 ${filled} 个字段${names}`
    ocrStatusTone.value = 'success'
  } catch (err: any) {
    ocrStatus.value = `✗ ${err?.message || '识别失败'}`
    ocrStatusTone.value = 'error'
  } finally {
    ocrLoading.value = false
    input.value = ''
  }
}

// ---- 提交 ----
const formEl = ref<HTMLFormElement | null>(null)
const errorAnchor = ref<HTMLElement | null>(null)
const submitting = ref(false)
const errorMsg = ref('')
const successOpen = ref(false)
const successCaseNumber = ref('')
const successAccessCode = ref('')

const willingnessOptions = [
  { value: 'mutual', title: '各方当事人自愿接受调解', desc: '各方已达成一致，共同申请调解' },
  { value: 'single_party', title: '当事人单方请求调解', desc: '由一方提出申请，我院将联系另一方征询意愿' },
]

async function submitForm() {
  errorMsg.value = ''
  if (!formEl.value?.checkValidity()) {
    formEl.value?.reportValidity()
    return
  }

  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('caseType', 'mediation')
    for (const [key, value] of Object.entries(form)) {
      if (key === 'evidence_confidential' || key === 'has_agent') {
        if (value) fd.append(key, 'true')
        continue
      }
      if (value) fd.append(key, String(value))
    }
    for (const f of evidenceFiles.value) fd.append('evidence_files', f)
    for (const f of identityFiles.value) fd.append('identity_files', f)
    for (const f of authFiles.value) fd.append('authorization_files', f)

    const res = await $fetch<{ success: boolean; data: { caseNumber: string; accessCode: string; case_number?: string; password?: string } }>('/api/cases/create', {
      method: 'POST',
      body: fd,
    })

    if (!res?.success) {
      throw new Error('提交失败，请稍后重试')
    }

    const result = res.data || (res as unknown as Record<string, unknown>)
    successCaseNumber.value = String(result.caseNumber || (result as any).case_number || (result as any).id || '')
    successAccessCode.value = String(result.accessCode || (result as any).password || '123')
    successOpen.value = true
  } catch (err: any) {
    errorMsg.value = err?.data?.message || err?.message || '网络错误，请检查网络连接后重试'
    nextTick(() => errorAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  successOpen.value = false
  Object.assign(form, EMPTY_FORM)
  evidenceFiles.value = []
  identityFiles.value = []
  authFiles.value = []
  ocrStatus.value = ''
  ocrFilename.value = ''
  dragOver.evidence = false
  dragOver.identity = false
  dragOver.auth = false
}

// ---- 进入我的案件（与 pages/party/index.vue 的 enterCase 保持一致） ----
const router = useRouter()
const caseNumber = ref('')
const accessCode = ref('')
const caseLoading = ref(false)
const caseError = ref('')

async function enterCase() {
  caseError.value = ''
  caseLoading.value = true
  try {
    const id = caseNumber.value.trim()
    const code = accessCode.value.trim()
    // 与 party 页一致：先校验案件 + 访问验证码，通过后进入该案件的当事人页面
    await $fetch(`/api/cases/${id}`, { query: { code } })
    router.push(`/party/case/${id}?code=${code}`)
  } catch {
    caseError.value = '案件编号或验证码错误'
  } finally {
    caseLoading.value = false
  }
}

const features = [
  { icon: 'i-lucide-shield-check', label: '安全保密', desc: '全程加密传输，保护商业秘密和隐私' },
  { icon: 'i-lucide-brain', label: 'AI 智能辅助', desc: '人工智能辅助分析，提供专业调解建议' },
  { icon: 'i-lucide-users', label: '专业调解员', desc: '经验丰富的商事调解员，高效化解纠纷' },
]

// 提交成功弹窗「进入我的案件」→ 直达刚创建的案件（与 party 页 goToCreatedCase 一致，免重复输入验证码）
function goToCreatedCase() {
  router.push(`/party/case/${successCaseNumber.value}?code=${successAccessCode.value}`)
}

// 离开「创建新的案件」模式时收起提交成功弹窗，避免跨模式残留
watch(activeMenu, (menu) => {
  if (menu !== 'create-case' && successOpen.value) successOpen.value = false
})
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-y-auto bg-white dark:bg-gray-900">
    <!-- ═══ Hero ═══ -->
    <section class="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-gray-900 px-4 sm:px-6 py-10 lg:py-14">
      <div class="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
      <div class="absolute -bottom-32 -right-16 w-80 h-80 rounded-full bg-sky-400/10 blur-3xl pointer-events-none" />
      <div class="relative z-10 max-w-3xl mx-auto text-center">
        <nav class="inline-flex flex-wrap justify-center items-center gap-1 p-1 mb-6 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
          <button
            type="button"
            @click="setMenu('create-case')"
            class="px-3.5 py-1.5 rounded-full text-xs font-medium transition"
            :class="activeMenu === 'create-case' ? 'bg-white/25 text-white' : 'text-white/75 hover:text-white hover:bg-white/10'"
          >调解申请</button>
          <ULink to="/guide" class="px-3.5 py-1.5 rounded-full text-xs font-medium text-white/75 hover:text-white hover:bg-white/10 transition">流程指引</ULink>
          <button
            type="button"
            @click="setMenu('case-entry')"
            class="px-3.5 py-1.5 rounded-full text-xs font-medium transition"
            :class="activeMenu === 'case-entry' ? 'bg-white/25 text-white' : 'text-white/75 hover:text-white hover:bg-white/10'"
          >进入我的案件</button>
        </nav>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs text-white/80 mb-4">
          <UIcon :name="activeMenu === 'case-entry' ? 'i-lucide-folder-open' : 'i-lucide-file-text'" class="w-3.5 h-3.5" />
          <span>{{ activeMenu === 'case-entry' ? '案件查询' : '在线申请' }}</span>
        </div>
        <h1 class="text-3xl sm:text-4xl font-bold text-white">调解申请</h1>
        <p class="mt-3 text-base sm:text-lg text-blue-200 max-w-2xl mx-auto">{{ activeMenu === 'case-entry' ? '输入案件编号与访问验证码，查看案件进度、继续咨询或联系调解员' : '提交调解申请书及相关材料，我院将在3个工作日内与您联系' }}</p>
      </div>
    </section>

    <!-- ═══ Mode: 进入我的案件 ═══ -->
    <section v-if="activeMenu === 'case-entry'" class="flex-1 px-4 sm:px-6 py-8 lg:py-12">
      <div class="max-w-3xl mx-auto">
        <!-- Brand -->
        <div class="flex items-center gap-2 mb-4">
          <UIcon name="i-lucide-scale" class="w-6 h-6 text-blue-500 dark:text-blue-400 shrink-0" />
          <div>
            <h2 class="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 leading-tight">努力为每一起纠纷提供最佳解决方案</h2>
            <p class="text-sm text-blue-500 dark:text-blue-400 font-mono">The best solution for each dispute</p>
          </div>
        </div>

        <div class="flex items-center gap-2 mb-5">
          <div class="w-1 h-5 bg-blue-300 dark:bg-blue-600 rounded-full" />
          <span class="text-sm font-mono text-gray-400 dark:text-gray-500 uppercase tracking-widest">MEDIATION PLATFORM</span>
        </div>

        <!-- Case Entry Form -->
        <div class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-5 sm:p-6">
          <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">进入您的案件</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">输入提交申请后获得的案件编号与访问验证码，即可查看案件进度、继续与 AI 智能体对话或联系调解员。</p>
          <form @submit.prevent="enterCase" class="space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400">案件编号</label>
              <UInput v-model="caseNumber" placeholder="案件编号" icon="i-lucide-file-text" :disabled="caseLoading" class="font-mono" />
            </div>
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400">访问验证码</label>
              <UInput v-model="accessCode" placeholder="访问验证码" icon="i-lucide-lock" :disabled="caseLoading" />
            </div>
            <UButton
              type="submit"
              block
              size="lg"
              :loading="caseLoading"
              :disabled="!caseNumber.trim() || !accessCode.trim()"
              class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
            >
              进入案件
            </UButton>
            <UAlert
              v-if="caseError"
              color="error"
              variant="soft"
              icon="i-lucide-alert-triangle"
              :title="caseError"
              class="mt-1"
              @update:open="() => caseError = ''"
            />
          </form>
        </div>

        <!-- Features -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div v-for="f in features" :key="f.label" class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
              <UIcon :name="f.icon" class="w-4 h-4 text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <div class="text-sm font-semibold text-gray-900 dark:text-white">{{ f.label }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{{ f.desc }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ Mode: 创建新的案件（调解申请表单） ═══ -->
    <section v-else class="flex-1 px-4 sm:px-6 py-8 lg:py-12">
      <div class="max-w-3xl mx-auto">
        <div ref="errorAnchor">
          <UAlert
            v-if="errorMsg"
            color="error"
            variant="soft"
            icon="i-lucide-alert-triangle"
            :title="errorMsg"
            close
            class="mb-6"
            @update:open="errorMsg = ''"
          />
        </div>

        <form ref="formEl" class="space-y-8" @submit.prevent="submitForm">
          <!-- ─── Section 1: 调解申请书 ─── -->
          <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div class="px-5 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">1</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">调解申请书</h3>
              </div>
            </div>
            <div class="p-5 sm:p-6 space-y-6">
              <!-- 智能识别（OCR 自动回填） -->
              <div class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                <div class="flex items-start gap-3">
                  <div class="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                    <UIcon name="i-lucide-scan-search" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-gray-900 dark:text-white">智能识别 · 自动回填</div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">上传已填写的调解申请书（PDF / Word / 图片），系统将自动识别并回填下方表单字段，您可在此基础上修改。</p>
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                      <input ref="ocrInput" type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.bmp,.webp,.tiff" class="hidden" @change="onOcrFile" />
                      <UButton size="sm" color="primary" :loading="ocrLoading" @click="triggerOcr">
                        <template #leading>
                          <UIcon name="i-lucide-upload" class="w-3.5 h-3.5" />
                        </template>
                        {{ ocrLoading ? '识别中...' : '上传调解申请书识别' }}
                      </UButton>
                      <span v-if="ocrStatus" class="text-xs" :class="ocrStatusClass">{{ ocrStatus }}</span>
                    </div>
                    <div v-if="ocrFilename" class="mt-2 text-xs text-gray-600 dark:text-gray-400 truncate">已选择：{{ ocrFilename }}</div>
                  </div>
                </div>
              </div>

              <!-- 申请人 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                  <span class="w-1 h-4 bg-blue-600 rounded-full"></span>
                  申请人信息
                </h4>
                <div class="grid sm:grid-cols-2 gap-4">
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">名称 / 姓名 <span class="text-red-500">*</span></label>
                    <UInput v-model="form.applicant_name" name="applicant_name" required placeholder="请输入申请人全称" class="w-full" />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">住所 / 地址</label>
                    <UInput v-model="form.applicant_address" name="applicant_address" placeholder="详细通讯地址" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">邮政编码</label>
                    <UInput v-model="form.applicant_postal_code" name="applicant_postal_code" placeholder="如 510000" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">固定电话</label>
                    <UInput v-model="form.applicant_phone" name="applicant_phone" placeholder="如 020-83288530" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">移动电话</label>
                    <UInput v-model="form.applicant_mobile" name="applicant_mobile" placeholder="手机号码" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">传真</label>
                    <UInput v-model="form.applicant_fax" name="applicant_fax" placeholder="传真号码" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">电子邮箱</label>
                    <UInput v-model="form.applicant_email" name="applicant_email" type="email" placeholder="email@example.com" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">其他电子通讯方式</label>
                    <UInput v-model="form.applicant_other_contact" name="applicant_other_contact" placeholder="如微信号、QQ号等" class="w-full" />
                  </div>
                </div>
              </div>

              <!-- 被申请人 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                  <span class="w-1 h-4 bg-amber-500 rounded-full"></span>
                  被申请人信息
                </h4>
                <div class="grid sm:grid-cols-2 gap-4">
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">名称 / 姓名 <span class="text-red-500">*</span></label>
                    <UInput v-model="form.respondent_name" name="respondent_name" required placeholder="请输入被申请人全称" class="w-full" />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">住所 / 地址</label>
                    <UInput v-model="form.respondent_address" name="respondent_address" placeholder="详细通讯地址" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">邮政编码</label>
                    <UInput v-model="form.respondent_postal_code" name="respondent_postal_code" placeholder="如 510000" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">固定电话</label>
                    <UInput v-model="form.respondent_phone" name="respondent_phone" placeholder="如 020-83288530" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">移动电话</label>
                    <UInput v-model="form.respondent_mobile" name="respondent_mobile" placeholder="手机号码" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">传真</label>
                    <UInput v-model="form.respondent_fax" name="respondent_fax" placeholder="传真号码" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">电子邮箱</label>
                    <UInput v-model="form.respondent_email" name="respondent_email" type="email" placeholder="email@example.com" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">其他电子通讯方式</label>
                    <UInput v-model="form.respondent_other_contact" name="respondent_other_contact" placeholder="如微信号、QQ号等" class="w-full" />
                  </div>
                </div>
              </div>

              <!-- 调解意愿 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                  <span class="w-1 h-4 bg-green-500 rounded-full"></span>
                  调解意愿 <span class="text-red-500">*</span>
                </h4>
                <div class="space-y-2">
                  <label
                    v-for="opt in willingnessOptions"
                    :key="opt.value"
                    class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition"
                    :class="form.mediation_willingness === opt.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'"
                  >
                    <input v-model="form.mediation_willingness" type="radio" name="mediation_willingness" :value="opt.value" required class="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500" />
                    <div>
                      <div class="text-sm font-medium text-gray-900 dark:text-white">{{ opt.title }}</div>
                      <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ opt.desc }}</div>
                    </div>
                  </label>
                </div>
              </div>

              <!-- 案件信息 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
                  <span class="w-1 h-4 bg-purple-500 rounded-full"></span>
                  案件事实与诉求
                </h4>
                <div class="space-y-4">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">案件事实</label>
                    <UTextarea v-model="form.case_facts" name="case_facts" :rows="3" placeholder="简要陈述案件发生的事实经过" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">争议事项</label>
                    <UTextarea v-model="form.dispute_matters" name="dispute_matters" :rows="3" placeholder="说明各方争议的焦点" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">调解诉求</label>
                    <UTextarea v-model="form.mediation_demands" name="mediation_demands" :rows="3" placeholder="明确希望通过调解实现的具体诉求" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">理据</label>
                    <UTextarea v-model="form.demands_basis" name="demands_basis" :rows="3" placeholder="支持诉求的法律依据、合同条款或事实理由" class="w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ─── Section 2: 证据材料 ─── -->
          <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div class="px-5 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">2</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">证据材料</h3>
              </div>
            </div>
            <div class="p-5 sm:p-6 space-y-4">
              <p class="text-xs text-gray-500 dark:text-gray-400">上传合同、往来函件、票据、照片等相关证据材料及其他证明文件。支持 PDF、Word、图片、压缩包等格式，单文件最大 50MB。</p>

              <!-- Drop zone -->
              <div
                class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
                :class="dragOver.evidence
                  ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'"
                @click="fileInputs.evidence?.click()"
                @dragover.prevent="dragOver.evidence = true"
                @dragleave.prevent="dragOver.evidence = false"
                @drop.prevent="addFilesTo('evidence', $event.dataTransfer?.files ?? null); dragOver.evidence = false"
              >
                <input :ref="setFileInputRef('evidence')" type="file" name="evidence_files" multiple accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.zip,.rar,.7z,.xls,.xlsx,.csv,.md" class="hidden" @change="addFilesTo('evidence', ($event.target as HTMLInputElement).files)" />
                <UIcon name="i-lucide-upload-cloud" class="w-10 h-10 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
                <p class="text-sm text-gray-600 dark:text-gray-400">点击或拖拽文件到此处上传</p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">可多选</p>
              </div>

              <!-- File list -->
              <div v-if="evidenceFiles.length" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-500 dark:text-gray-400">已上传 {{ evidenceFiles.length }} 个文件</span>
                  <button type="button" class="text-xs text-red-500 hover:underline" @click="clearZone('evidence')">清空全部</button>
                </div>
                <div v-for="(f, i) in evidenceFiles" :key="`${f.name}-${f.size}`" class="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg">
                  <UIcon name="i-lucide-file" class="w-4 h-4 text-gray-400 shrink-0" />
                  <span class="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{{ f.name }}</span>
                  <span class="text-xs text-gray-400 font-mono">{{ formatFileSize(f.size) }}</span>
                  <button type="button" class="text-gray-400 hover:text-red-500" @click="removeFileAt('evidence', i)">
                    <UIcon name="i-lucide-x" class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Confidential checkbox -->
              <label
                class="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 cursor-pointer transition"
                :class="form.evidence_confidential ? 'border-amber-500' : ''"
              >
                <input v-model="form.evidence_confidential" type="checkbox" name="evidence_confidential" value="true" class="mt-0.5 w-4 h-4 text-amber-600 focus:ring-amber-500 rounded" />
                <div>
                  <div class="text-sm font-medium text-amber-800 dark:text-amber-300">声明保密</div>
                  <div class="text-xs text-amber-700 dark:text-amber-400 mt-0.5">声明该部分文件和证据材料仅供本院及调解员、专家查阅</div>
                </div>
              </label>
            </div>
          </div>

          <!-- ─── Section 3: 身份证明文件 ─── -->
          <div class="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div class="px-5 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">3</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">身份证明文件</h3>
              </div>
            </div>
            <div class="p-5 sm:p-6 space-y-4">
              <p class="text-xs text-gray-500 dark:text-gray-400">上传身份证、营业执照、组织机构代码证等身份证明文件。</p>

              <!-- Identity drop zone -->
              <div
                class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
                :class="dragOver.identity
                  ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'"
                @click="fileInputs.identity?.click()"
                @dragover.prevent="dragOver.identity = true"
                @dragleave.prevent="dragOver.identity = false"
                @drop.prevent="addFilesTo('identity', $event.dataTransfer?.files ?? null); dragOver.identity = false"
              >
                <input :ref="setFileInputRef('identity')" type="file" name="identity_files" multiple accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.zip,.rar,.7z,.xls,.xlsx,.csv,.md" class="hidden" @change="addFilesTo('identity', ($event.target as HTMLInputElement).files)" />
                <UIcon name="i-lucide-folder-open" class="w-10 h-10 text-gray-400 dark:text-gray-600 mx-auto mb-2" />
                <p class="text-sm text-gray-600 dark:text-gray-400">点击或拖拽文件到此处上传</p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">可多选</p>
              </div>

              <!-- Identity file list -->
              <div v-if="identityFiles.length" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-500 dark:text-gray-400">已上传 {{ identityFiles.length }} 个文件</span>
                  <button type="button" class="text-xs text-red-500 hover:underline" @click="clearZone('identity')">清空全部</button>
                </div>
                <div v-for="(f, i) in identityFiles" :key="`${f.name}-${f.size}`" class="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg">
                  <UIcon name="i-lucide-file" class="w-4 h-4 text-gray-400 shrink-0" />
                  <span class="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{{ f.name }}</span>
                  <span class="text-xs text-gray-400 font-mono">{{ formatFileSize(f.size) }}</span>
                  <button type="button" class="text-gray-400 hover:text-red-500" @click="removeFileAt('identity', i)">
                    <UIcon name="i-lucide-x" class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Agent toggle -->
              <label
                class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition"
                :class="form.has_agent
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'"
              >
                <input v-model="form.has_agent" type="checkbox" name="has_agent" value="true" class="w-4 h-4 text-blue-600 focus:ring-blue-500 rounded" />
                <div>
                  <div class="text-sm font-medium text-gray-900 dark:text-white">委托代理人或代表参与调解</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">如委托代理人，须提交授权委托书</div>
                </div>
              </label>

              <!-- Agent details (conditional) -->
              <div v-if="form.has_agent" class="space-y-4 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                <div class="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">代理人姓名</label>
                    <UInput v-model="form.agent_name" name="agent_name" placeholder="代理人或代表姓名" class="w-full" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">代理人职责</label>
                    <UInput v-model="form.agent_duties" name="agent_duties" placeholder="如：一般授权 / 特别授权" class="w-full" />
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">授权委托书</label>
                  <div
                    class="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
                    :class="dragOver.auth
                      ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'"
                    @click="fileInputs.auth?.click()"
                    @dragover.prevent="dragOver.auth = true"
                    @dragleave.prevent="dragOver.auth = false"
                    @drop.prevent="addFilesTo('auth', $event.dataTransfer?.files ?? null); dragOver.auth = false"
                  >
                    <input :ref="setFileInputRef('auth')" type="file" name="authorization_files" multiple accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.zip,.rar,.7z,.xls,.xlsx,.csv,.md" class="hidden" @change="addFilesTo('auth', ($event.target as HTMLInputElement).files)" />
                    <UIcon name="i-lucide-file-up" class="w-8 h-8 text-gray-400 dark:text-gray-600 mx-auto mb-1" />
                    <p class="text-sm text-gray-600 dark:text-gray-400">上传授权委托书</p>
                  </div>
                  <div v-if="authFiles.length" class="space-y-2 mt-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-gray-500 dark:text-gray-400">已上传 {{ authFiles.length }} 个文件</span>
                      <button type="button" class="text-xs text-red-500 hover:underline" @click="clearZone('auth')">清空全部</button>
                    </div>
                    <div v-for="(f, i) in authFiles" :key="`${f.name}-${f.size}`" class="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg">
                      <UIcon name="i-lucide-file" class="w-4 h-4 text-gray-400 shrink-0" />
                      <span class="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{{ f.name }}</span>
                      <span class="text-xs text-gray-400 font-mono">{{ formatFileSize(f.size) }}</span>
                      <button type="button" class="text-gray-400 hover:text-red-500" @click="removeFileAt('auth', i)">
                        <UIcon name="i-lucide-x" class="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Submit -->
          <div class="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <button type="button" class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition" @click="setMenu('case-entry')">取消 · 进入我的案件</button>
            <UButton
              type="submit"
              size="lg"
              :loading="submitting"
              class="w-full sm:w-auto"
            >
              <template #leading>
                <UIcon name="i-lucide-send" class="w-4 h-4" />
              </template>
              提交申请
            </UButton>
          </div>
        </form>
      </div>
    </section>

    <!-- ── 提交成功弹窗 ── -->
    <UModal v-model:open="successOpen" title="申请提交成功">
      <template #content>
        <div class="text-center p-6 sm:p-8">
          <div class="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
            <UIcon name="i-lucide-check" class="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">申请提交成功</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">请妥善保管以下信息，查询案件进度时需要使用。</p>

          <div class="space-y-3 mb-6 text-left">
            <div class="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-900 text-sm">
              <span class="text-gray-500 dark:text-gray-400">案件编号</span>
              <span class="font-mono font-bold text-blue-600 dark:text-blue-400">{{ successCaseNumber }}</span>
            </div>
            <div class="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-900 text-sm">
              <span class="text-gray-500 dark:text-gray-400">初始密码</span>
              <span class="font-mono font-bold text-amber-600 dark:text-amber-400">{{ successAccessCode }}</span>
            </div>
          </div>

          <p class="text-xs text-gray-400 dark:text-gray-500 mb-5">我院将在3个工作日内与您联系，请保持通讯畅通。</p>

          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <UButton size="lg" class="w-full sm:w-auto" @click="goToCreatedCase">
              <template #leading>
                <UIcon name="i-lucide-folder-open" class="w-4 h-4" />
              </template>
              进入我的案件
            </UButton>
            <UButton color="neutral" variant="soft" class="w-full sm:w-auto" @click="resetForm">再提交一份</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
