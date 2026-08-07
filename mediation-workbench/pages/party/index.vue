<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- ================================================================== -->
    <!-- Mode: case-entry — 进入我的案件 -->
    <!-- ================================================================== -->
    <template v-if="activeMenu === 'case-entry'">
      <!-- Upper: Brand + Case Entry Form -->
      <div class="shrink-0 p-6 border-b border-gray-200 dark:border-gray-800">
        <div class="max-w-2xl mx-auto">
          <!-- Brand -->
          <div class="flex items-center gap-2 mb-4">
            <UIcon name="i-lucide-scale" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <div>
              <h1 class="text-4xl font-bold text-blue-600 dark:text-blue-400">努力为每一起纠纷提供最佳解决方案</h1>
              <p class="text-base text-blue-500 dark:text-blue-400 font-mono">The best solution for each dispute</p>
            </div>
          </div>

          <div class="flex items-center gap-2 mb-5">
            <div class="w-1 h-5 bg-blue-300 dark:bg-blue-600 rounded-full" />
            <span class="text-sm font-mono text-gray-400 dark:text-gray-500 uppercase tracking-widest">MEDIATION PLATFORM</span>
          </div>

          <!-- Case Entry Form -->
          <div class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-3">进入您的案件</h2>
            <form @submit.prevent="enterCase" class="flex items-end gap-3">
              <div class="flex-1 space-y-2">
                <UInput v-model="caseNumber" placeholder="案件编号" icon="i-lucide-file-text" :disabled="caseLoading" class="font-mono" />
                <UInput v-model="accessCode" placeholder="访问验证码" icon="i-lucide-lock" :disabled="caseLoading" />
              </div>
              <UButton
                type="submit"
                size="lg"
                :loading="caseLoading"
                :disabled="!caseNumber.trim() || !accessCode.trim()"
                class="shrink-0 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
              >
                进入案件
              </UButton>
            </form>
            <UAlert
              v-if="caseError"
              color="error"
              variant="soft"
              :title="caseError"
              class="mt-3"
              @update:model-value="() => caseError = ''"
            />
          </div>

          <!-- Features -->
          <div class="grid grid-cols-3 gap-4 mt-5">
            <div v-for="f in features" :key="f.label" class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                <UIcon :name="f.icon" class="w-4 h-4 text-blue-500 dark:text-blue-400" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">案由</label>
            <UInput v-model="caseType" placeholder="自动识别，可修改" class="w-full" />
          </div>
          <div>
                <div class="text-sm font-semibold text-gray-900 dark:text-white">{{ f.label }}</div>
                <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{{ f.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ================================================================== -->
    <!-- Mode: create-case — 创建新的案件 -->
    <!-- ================================================================== -->
    <template v-else-if="activeMenu === 'create-case'">
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Header -->
        <div class="shrink-0 p-6 border-b border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-plus-circle" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">创建新的案件</h2>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">请上传相关材料，系统将为您自动创建案件并推进调解流程</p>
        </div>

        <!-- Form Fields -->
        <div class="shrink-0 px-6 pb-2 space-y-3">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs text-blue-500 dark:text-blue-400">
              <UIcon v-if="extractingInfo" name="i-lucide-loader-2" class="w-3 h-3 inline animate-spin" />
              {{ extractingInfo ? 'AI 正在从文件中提取信息...' : 'AI 已自动识别，可手动修改' }}
            </span>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当事人姓名</label>
            <UInput v-model="partyName" placeholder="您的姓名" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">被申请人</label>
            <UInput v-model="respondentName" placeholder="对方名称" class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">案件描述</label>
            <UTextarea v-model="caseDescription" placeholder="简要描述争议内容（科目标额、纠纷起因、您的诉求）" :rows="3" class="w-full" />
          </div>
        </div>

        <!-- Upload Area or Success -->
        <template v-if="!createdCaseNumber">
          <div class="flex-1 p-6 overflow-y-auto">
            <!-- Drop Zone -->
            <div
              class="border-2 border-dashed rounded-lg p-12 text-center transition-colors"
              :class="isDragging
                ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950'
                : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <UIcon name="i-lucide-upload-cloud" class="w-10 h-10 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
              <p class="text-base text-gray-600 dark:text-gray-400 mb-1">拖拽文件到此处上传</p>
              <p class="text-xs text-gray-400 dark:text-gray-500">支持 PDF、Word、图片、文本文件，单文件最大 50MB</p>
              <label class="mt-4 inline-block cursor-pointer">
                <span class="text-sm text-blue-500 dark:text-blue-400 hover:underline">或点击选择文件</span>
                <input type="file" multiple class="hidden" @change="handleFileSelect" />
              </label>
            </div>

            <!-- Uploaded Files -->
            <div v-if="uploadedFiles.length" class="mt-4 space-y-2">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm text-gray-500 dark:text-gray-400">已上传 {{ uploadedFiles.length }} 个文件</span>
                <button class="text-xs text-red-500 hover:underline" @click="uploadedFiles = []">清空全部</button>
              </div>
              <div
                v-for="(file, i) in uploadedFiles"
                :key="i"
                class="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg"
              >
                <UIcon name="i-lucide-file" class="w-4 h-4 text-gray-400" />
                <span class="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{{ file.name }}</span>
                <span class="text-xs text-gray-400 font-mono">{{ formatFileSize(file.size) }}</span>
                <button class="text-gray-400 hover:text-red-500" @click="uploadedFiles.splice(i, 1)">
                  <UIcon name="i-lucide-x" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Error Display -->
          <div v-if="caseError" class="px-6">
            <UAlert
              color="error"
              variant="soft"
              :title="caseError"
              icon="i-lucide-alert-triangle"
            />
          </div>

          <!-- Create Case Button -->
          <div v-if="uploadedFiles.length > 0" class="shrink-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <UButton
              block
              size="lg"
              :loading="creatingCase"
              @click="createCase"
              class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
            >
              创建案件
            </UButton>
          </div>
        </template>

        <!-- Success State -->
        <template v-else>
          <div class="flex-1 flex items-center justify-center p-6">
            <div class="text-center max-w-md">
              <UIcon name="i-lucide-circle-check" class="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">案件创建成功</h3>
              <div class="space-y-2 bg-gray-50 dark:bg-gray-950 rounded-lg p-4 text-left">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-500">案件编号</span>
                  <span class="text-sm font-mono font-medium text-gray-900 dark:text-white">{{ createdCaseNumber }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-500">访问验证码</span>
                  <span class="text-sm font-mono font-medium text-gray-900 dark:text-white">{{ createdAccessCode }}</span>
                </div>
              </div>
              <UButton
                class="mt-6 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
                @click="goToCreatedCase"
              >
                进入案件
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
const { activeMenu } = useActiveMenu()
const router = useRouter()

// ---- Features ----
const features = [
  { icon: 'i-lucide-shield-check', label: '安全保密', desc: '全程加密传输，保护商业秘密和隐私' },
  { icon: 'i-lucide-brain', label: 'AI 智能辅助', desc: '人工智能辅助分析，提供专业调解建议' },
  { icon: 'i-lucide-users', label: '专业调解员', desc: '经验丰富的商事调解员，高效化解纠纷' },
]

// ---- Case Entry ----
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
    await $fetch(`/api/cases/${id}`, { query: { code } })
    router.push(`/party/case/${id}?code=${code}`)
  } catch {
    caseError.value = '案件编号或验证码错误'
  } finally {
    caseLoading.value = false
  }
}

// ---- File Upload ----
const uploadedFiles = ref<File[]>([])
const isDragging = ref(false)

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files) addFiles(target.files)
}

function addFiles(fileList: FileList) {
  for (const file of fileList) {
    if (file.size > 50 * 1024 * 1024) continue
    if (!uploadedFiles.value.find(f => f.name === file.name && f.size === file.size)) {
      uploadedFiles.value.push(file)
    }
  }
  autoExtractInfo()
}

const extractingInfo = ref(false)

async function autoExtractInfo() {
  if (uploadedFiles.value.length === 0) return
  extractingInfo.value = true
  try {
    // 优先走 OCR 服务（本地模型结构化字段抽取，单文件）
    const ocrFile = uploadedFiles.value[0]
    const ocrForm = new FormData()
    ocrForm.append('file', ocrFile)
    const ocrResp = await $fetch<{ success: boolean; fields?: Record<string, string>; error?: string }>('/api/ocr', {
      method: 'POST',
      body: ocrForm,
    })
    if (ocrResp.success && ocrResp.fields) {
      const f = ocrResp.fields
      let filled = false
      if (f.applicant_name) { partyName.value = f.applicant_name; filled = true }
      if (f.respondent_name) { respondentName.value = f.respondent_name; filled = true }
      const descParts = [f.case_facts, f.dispute_matters, f.mediation_demands].filter(Boolean)
      if (descParts.length) { caseDescription.value = descParts.join('\n'); filled = true }
      if (filled) { extractingInfo.value = false; return }
    }
    console.warn('[party] OCR extraction failed or empty, falling back to extract-info:', ocrResp.error || 'no fields')
  } catch (err) {
    console.warn('[party] OCR extraction error, falling back to extract-info:', err)
  }
  // 回退：原有 AI 信息抽取
  try {
    const formData = new FormData()
    for (const file of uploadedFiles.value) {
      formData.append('files', file)
    }
    const resp = await $fetch<{ success: boolean; data: { partyName: string; respondentName: string; caseType: string; description: string } }>('/api/cases/extract-info', {
      method: 'POST',
      body: formData,
    })
    if (resp.data.partyName) partyName.value = resp.data.partyName
    if (resp.data.respondentName) respondentName.value = resp.data.respondentName
    if (resp.data.caseType) caseType.value = resp.data.caseType
    if (resp.data.description) caseDescription.value = resp.data.description
  } catch {} finally {
    extractingInfo.value = false
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ---- Create Case ----
const creatingCase = ref(false)
const createdCaseNumber = ref('')
const createdAccessCode = ref('')
const partyName = ref('')
const respondentName = ref('')
const caseType = ref('')
const caseDescription = ref('')

async function createCase() {
  creatingCase.value = true
  try {
    const formData = new FormData()
    formData.append('caseType', 'mediation')
    formData.append('partyName', partyName.value.trim())
    formData.append('respondentName', respondentName.value.trim())
    formData.append('disputeType', caseType.value.trim())
    formData.append('description', caseDescription.value.trim())
    for (const file of uploadedFiles.value) {
      formData.append('files', file)
    }
    const resp = await $fetch<{ success: boolean; data: { caseNumber: string; accessCode: string } }>('/api/cases/create', {
      method: 'POST',
      body: formData,
    })
    createdCaseNumber.value = resp.data.caseNumber
    createdAccessCode.value = resp.data.accessCode
  } catch {
    caseError.value = '创建案件失败，请重试'
  } finally {
    creatingCase.value = false
  }
}

function goToCreatedCase() {
  router.push(`/party/case/${createdCaseNumber.value}?code=${createdAccessCode.value}`)
}
</script>
