<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- ============================================================ -->
    <!-- Mode 1: 进入我的案件 -->
    <!-- ============================================================ -->
    <template v-if="activeMenu === 'case-entry'">
      <!-- Upper: Brand + Case Entry Form -->
      <div class="shrink-0 p-8 border-b border-gray-200 dark:border-gray-800">
        <div class="max-w-2xl">
          <div class="flex items-center gap-2 mb-3">
            <UIcon name="i-lucide-scale" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <div>
              <h1 class="text-4xl font-bold text-gray-900 dark:text-white">全时在线的争议解决专家</h1>
              <p class="text-sm text-gray-400 dark:text-gray-500 font-mono leading-tight">Always Online Dispute Resolution Expert</p>
            </div>
          </div>

          <div class="flex items-center gap-2 mb-6">
            <div class="w-1 h-5 bg-blue-300 dark:bg-blue-600 rounded-full" />
            <span class="text-xs font-mono text-gray-400 dark:text-gray-500 uppercase tracking-widest">DISPUTE RESOLUTION</span>
          </div>

          <!-- Case Entry Form -->
          <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-3">进入您的案件</h2>
            <form @submit.prevent="enterCase" class="space-y-3">
              <UInput
                v-model="caseNumber"
                placeholder="案件编号"
                icon="i-lucide-file-text"
                size="md"
                :disabled="caseEntryLoading"
                class="font-mono"
              />
              <UInput
                v-model="accessCode"
                placeholder="访问验证码"
                icon="i-lucide-lock"
                size="md"
                :disabled="caseEntryLoading"
              />
              <UAlert v-if="caseEntryError" color="error" variant="soft" :title="caseEntryError" class="text-left" />
              <UButton
                type="submit"
                block
                size="lg"
                :loading="caseEntryLoading"
                :disabled="!caseNumber.trim() || !accessCode.trim()"
                class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
              >
                进入案件
              </UButton>
            </form>
          </div>

          <!-- Features -->
          <div class="grid grid-cols-3 gap-6 mt-6">
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
      </div>

      <!-- Lower: AI Chat -->
      <div class="flex-1 flex flex-col min-h-0">
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
          <template v-if="chatMessages.length === 0 && !chatLoading">
            <div class="flex items-center justify-center h-full">
              <div class="text-center">
                <UIcon name="i-lucide-message-circle" class="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                <p class="text-sm text-gray-400 dark:text-gray-500 font-mono">我是您的智能调解助手，有什么可以帮您？</p>
              </div>
            </div>
          </template>

          <div v-for="(msg, i) in chatMessages" :key="i" class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
            <div
              class="max-w-[70%] rounded-lg px-3 py-2"
              :class="msg.role === 'user'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'"
            >
              <div v-if="msg.role === 'ai'" class="text-xs font-medium mb-1 opacity-60 text-blue-600 dark:text-blue-400">AI助手</div>
              <div class="text-base whitespace-pre-wrap leading-relaxed">{{ msg.content }}</div>
              <div class="text-xs mt-1 opacity-40 text-right font-mono">{{ msg.time }}</div>
            </div>
          </div>

          <div v-if="chatLoading" class="flex justify-start">
            <div class="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 max-w-[70%]">
              <div class="text-xs font-medium mb-1 opacity-60 text-blue-600 dark:text-blue-400">AI助手</div>
              <div class="text-base whitespace-pre-wrap leading-relaxed text-gray-800 dark:text-gray-200">
                {{ chatStreamContent || '思考中...' }}
                <span class="animate-pulse text-blue-500 dark:text-blue-400">▌</span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-gray-200 dark:border-gray-800 p-3 shrink-0 bg-white dark:bg-gray-900">
          <form @submit.prevent="sendChat" class="flex gap-2">
            <UTextarea
              v-model="chatInput"
              placeholder="向AI助手提问..."
              :rows="1"
              autoresize
              :maxrows="4"
              class="flex-1"
              @keydown.enter.exact.prevent="sendChat"
            />
            <UButton
              type="submit"
              icon="i-lucide-send"
              size="sm"
              :disabled="!chatInput.trim() || chatLoading"
              class="self-end bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
            />
          </form>
        </div>
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- Mode 2/3/4: 申请调解 / 申请中立评估 / 申请争议评审 -->
    <!-- ============================================================ -->
    <template v-else>
      <!-- Header -->
      <div class="shrink-0 p-6 border-b border-gray-200 dark:border-gray-800">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ currentModeLabel }}</h1>
        <p class="text-sm text-gray-400 dark:text-gray-500 font-mono mt-1">上传相关材料后创建案件，系统将为您生成案件编号和访问验证码</p>
      </div>

      <!-- Upload Area -->
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-2xl mx-auto p-6 space-y-6">
          <!-- File Upload Zone -->
          <div
            class="border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer"
            :class="isDragging
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
              : 'border-gray-300 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'"
            @click="triggerFileInput"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
          >
            <UIcon name="i-lucide-upload-cloud" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p class="text-base text-gray-600 dark:text-gray-400 mb-1">点击上传或拖拽文件到此处</p>
            <p class="text-xs text-gray-400 dark:text-gray-500 font-mono">
              支持 PDF、Word、图片、文本等格式，单文件不超过 50MB
            </p>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.txt,.xls,.xlsx"
              class="hidden"
              @change="handleFileSelect"
            >
          </div>

          <!-- Uploaded Files List -->
          <div v-if="uploadedFiles.length > 0" class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-600 dark:text-gray-400">已选择 {{ uploadedFiles.length }} 个文件</span>
              <button
                class="text-xs text-gray-400 hover:text-red-500 transition-colors"
                @click="clearFiles"
              >
                清空
              </button>
            </div>

            <div
              v-for="(file, i) in uploadedFiles"
              :key="i"
              class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700"
            >
              <UIcon name="i-lucide-file" class="w-5 h-5 text-blue-400 shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="text-sm text-gray-800 dark:text-gray-200 truncate">{{ file.name }}</p>
                <p class="text-xs text-gray-400 font-mono">{{ formatFileSize(file.size) }}</p>
              </div>
              <button
                class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors"
                @click="removeFile(i)"
              >
                <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Create Case Button -->
          <div v-if="uploadedFiles.length > 0" class="pt-4">
            <UButton
              block
              size="lg"
              :loading="creating"
              class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100 text-base"
              @click="createCase"
            >
              <UIcon name="i-lucide-plus-circle" class="w-5 h-5 mr-2" />
              创建案件
            </UButton>
            <p class="text-xs text-gray-400 dark:text-gray-500 font-mono text-center mt-2">
              案件创建后将自动生成案件编号和访问验证码
            </p>
          </div>

          <UAlert v-if="createError" color="error" variant="soft" :title="createError" />

          <!-- Success Result -->
          <div v-if="createResult" class="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 space-y-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-green-500" />
              <span class="text-sm font-semibold text-green-700 dark:text-green-400">案件创建成功</span>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span class="text-gray-400 text-xs font-mono">案件编号</span>
                <p class="text-gray-900 dark:text-white font-mono font-semibold">{{ createResult.caseNumber }}</p>
              </div>
              <div>
                <span class="text-gray-400 text-xs font-mono">访问验证码</span>
                <p class="text-gray-900 dark:text-white font-mono font-semibold">{{ createResult.accessCode }}</p>
              </div>
            </div>
            <UButton
              block
              size="lg"
              class="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
              @click="goToCase(createResult.caseNumber, createResult.accessCode)"
            >
              进入案件
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const activeMenu = useActiveMenu()
import type { ActiveMenu } from '~/composables/useActiveMenu'

const config = useRuntimeConfig()
if (config.public.appMode === 'mediator') {
  navigateTo('/admin', { replace: true })
}

const router = useRouter()

// ============================================================
// Features
// ============================================================
const features = [
  { icon: 'i-lucide-shield-check', label: '安全保密', desc: '全程加密传输，保护商业秘密和隐私' },
  { icon: 'i-lucide-brain', label: 'AI 智能辅助', desc: '人工智能辅助分析，提供专业调解建议' },
  { icon: 'i-lucide-users', label: '专业调解员', desc: '经验丰富的商事调解员，高效化解纠纷' },
]

// ============================================================
// Mode labels
// ============================================================
const modeLabels: Record<Exclude<ActiveMenu, 'case-entry'>, string> = {
  mediation: '申请调解',
  evaluation: '申请中立评估',
  review: '申请争议评审',
}
const currentModeLabel = computed(() => modeLabels[activeMenu.value as Exclude<ActiveMenu, 'case-entry'>] || '')

// ============================================================
// Case Entry Form (进入我的案件)
// ============================================================
const caseNumber = ref('')
const accessCode = ref('')
const caseEntryLoading = ref(false)
const caseEntryError = ref('')

async function enterCase() {
  caseEntryError.value = ''
  caseEntryLoading.value = true
  try {
    const id = caseNumber.value.trim()
    const code = accessCode.value.trim()
    await $fetch(`/api/cases/${id}`, { query: { code } })
    router.push(`/case/${id}?code=${code}`)
  } catch {
    caseEntryError.value = '案件编号或验证码错误，请检查后重试'
  } finally {
    caseEntryLoading.value = false
  }
}

// ============================================================
// AI Chat (for case-entry mode)
// ============================================================
const chatInput = ref('')
const chatMessages = ref<Array<{ role: string; content: string; time: string }>>([])
const chatLoading = ref(false)
const chatStreamContent = ref('')
const chatContainer = ref<HTMLElement | null>(null)

function formatTime(d: Date) {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text) return
  chatInput.value = ''

  const now = new Date()
  chatMessages.value.push({ role: 'user', content: text, time: formatTime(now) })

  chatLoading.value = true
  chatStreamContent.value = ''

  try {
    const data = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/ai', {
      method: 'POST',
      body: {
        caseId: 'demo',
        message: text,
        senderIdentifier: 'party',
        senderName: '当事人',
      },
    })

    if (data?.data?.content) {
      const full = data.data.content
      for (let i = 0; i < full.length; i++) {
        chatStreamContent.value = full.slice(0, i + 1)
        await new Promise(r => setTimeout(r, 15))
      }
      chatMessages.value.push({ role: 'ai', content: full, time: formatTime(new Date()) })
    }
  } catch (err: any) {
    chatMessages.value.push({ role: 'ai', content: `抱歉，服务暂时不可用：${err?.message || '请稍后重试'}`, time: formatTime(new Date()) })
  } finally {
    chatLoading.value = false
    chatStreamContent.value = ''
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    })
  }
}

// ============================================================
// File Upload (for mediation/evaluation/review modes)
// ============================================================
const fileInput = ref<HTMLInputElement | null>(null)
const uploadedFiles = ref<File[]>([])
const isDragging = ref(false)
const creating = ref(false)
const createError = ref('')
const createResult = ref<{ caseNumber: string; accessCode: string } | null>(null)

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    for (let i = 0; i < input.files.length; i++) {
      // avoid duplicates
      if (!uploadedFiles.value.find(f => f.name === input.files![i].name && f.size === input.files![i].size)) {
        uploadedFiles.value.push(input.files![i])
      }
    }
  }
  input.value = '' // reset so same file can be re-selected
  createResult.value = null
  createError.value = ''
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files) {
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      if (!uploadedFiles.value.find(f => f.name === e.dataTransfer!.files[i].name && f.size === e.dataTransfer!.files[i].size)) {
        uploadedFiles.value.push(e.dataTransfer!.files[i])
      }
    }
  }
  createResult.value = null
  createError.value = ''
}

function removeFile(index: number) {
  uploadedFiles.value.splice(index, 1)
  createResult.value = null
}

function clearFiles() {
  uploadedFiles.value = []
  createResult.value = null
  createError.value = ''
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function createCase() {
  if (uploadedFiles.value.length === 0) return

  creating.value = true
  createError.value = ''
  createResult.value = null

  try {
    const formData = new FormData()
    formData.append('caseType', activeMenu.value)
    for (const file of uploadedFiles.value) {
      formData.append('files', file)
    }

    const rsp = await $fetch<{ success: boolean; caseNumber: string; accessCode: string; error?: string }>('/api/cases/create', {
      method: 'POST',
      body: formData,
    })

    if (rsp.success) {
      createResult.value = { caseNumber: rsp.caseNumber, accessCode: rsp.accessCode }
    } else {
      createError.value = rsp.error || '案件创建失败，请重试'
    }
  } catch (err: any) {
    createError.value = err?.data?.error || err?.message || '案件创建失败，请重试'
  } finally {
    creating.value = false
  }
}

function goToCase(caseNumber: string, accessCode: string) {
  router.push(`/case/${caseNumber}?code=${accessCode}`)
}
</script>
