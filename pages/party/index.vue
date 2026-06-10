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
              <p class="text-base text-blue-500 dark:text-blue-400 font-mono">The best solution for every dispute</p>
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
          <div v-if="chatMessages.length === 0 && !chatLoading" class="flex items-center justify-center h-full">
            <div class="text-center">
              <UIcon name="i-lucide-message-circle" class="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p class="text-sm text-gray-400 dark:text-gray-500">AI助手：有什么可以帮您？</p>
            </div>
          </div>

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
              :rows="1" autoresize :maxrows="4"
              class="flex-1"
              @keydown.enter.exact.prevent="sendChat"
            />
            <UButton
              type="submit"
              icon="i-lucide-send"
              size="lg"
              :disabled="!chatInput.trim() || chatLoading"
              class="self-end bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-900 dark:text-blue-100"
            >
              发送
            </UButton>
          </form>
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

    <!-- ================================================================== -->
    <!-- Mode: guide — 流程指引 -->
    <!-- ================================================================== -->
    <template v-else-if="activeMenu === 'guide'">
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Header -->
        <div class="shrink-0 p-6 border-b border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-book-open" class="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">流程指引</h2>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">当事人使用本平台的操作指南</p>
        </div>

        <!-- Guide Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="max-w-3xl mx-auto space-y-8">

            <!-- Step 1 -->
            <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
              <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">1</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">AI 咨询</h3>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
                <p>在首页 <strong>进入我的案件</strong> 页面底部，您可以直接与 AI 助手对话，描述您遇到的商事纠纷。</p>
                <p>AI 会采用分阶段心理咨询模式（倾听 → 共情 → 重塑 → 协商），前 3-4 轮以倾听和了解情况为主，不会直接提供解决方案。</p>
                <p>当您确认需要正式申请调解时，点击左侧菜单 <strong>创建新的案件</strong> 上传材料。</p>
              </div>
            </section>

            <!-- Step 2 -->
            <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
              <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">2</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">上传材料并创建案件</h3>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
                <p>点击左侧菜单 <strong>创建新的案件</strong>，在右侧上传相关证据材料。</p>
                <p>支持 PDF、Word、图片、文本文件，单文件最大 50MB。可通过拖拽或点击选择文件。</p>
                <p>上传完成后点击 <strong>创建案件</strong> 按钮，系统将自动生成案件编号和访问验证码，请妥善保存。</p>
              </div>
            </section>

            <!-- Step 3 -->
            <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
              <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">3</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">查看案件</h3>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
                <p>点击左侧菜单 <strong>进入我的案件</strong>，输入案件编号和访问验证码即可进入案件详情页。</p>
                <p>在案件详情页，您可以查看案件信息、与 AI 智能体继续对话，或选择调解员进行人工调解。</p>
              </div>
            </section>

            <!-- Step 4 -->
            <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
              <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">4</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">选择调解员</h3>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
                <p>在案件详情页点击 <strong>与调解员对话</strong>，浏览可用的调解员信息（专长、学历、单位）。</p>
                <p>选择一位调解员后，案件状态将变为"进行中"，您可以与调解员实时交流。</p>
              </div>
            </section>

            <!-- Step 5 -->
            <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
              <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">5</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">AI 智能体对话</h3>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
                <p>在案件页面点击 <strong>与智能体对话</strong>，AI 会基于案件动态文件（争议焦点、时间线、立场等）提供专业的调解建议。</p>
                <p>AI 智能体的回答基于知识库中的法律条文进行检索增强，确保建议的专业性和准确性。</p>
              </div>
            </section>

            <!-- Step 6 -->
            <section class="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-5">
              <div class="flex items-center gap-2 mb-3">
                <span class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-bold">6</span>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">结束对话</h3>
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
                <p>在对话框中输入 "我要找调解员"、"结束"、"不用了" 等关键词，系统会自动转入调解员选择流程。</p>
                <p>连续对话 5 轮以上也会自动提示选择调解员，确保您的纠纷能够得到专业处理。</p>
              </div>
            </section>

            <!-- Privacy Notice -->
            <section class="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
              <div class="flex items-center gap-2 mb-3">
                <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-blue-500 dark:text-blue-400" />
                <h3 class="text-base font-semibold text-blue-900 dark:text-blue-100">隐私保护</h3>
              </div>
              <div class="text-sm text-blue-700 dark:text-blue-300 space-y-2 leading-relaxed">
                <p>您与 AI 的私聊内容对调解员不可见，只有您主动发送的消息和调解员的消息才会在调解员端显示。</p>
                <p>全程加密传输，保护您的商业秘密和隐私。</p>
              </div>
            </section>

          </div>
        </div>
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

// ---- AI Chat ----
const chatInput = ref('')
const chatMessages = ref<Array<{ role: string; content: string; time: string }>>([])
const chatLoading = ref(false)
const chatStreamContent = ref('')
const chatContainer = ref<HTMLElement | null>(null)

function fmtTime(d: Date) {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text) return
  chatInput.value = ''

  const now = new Date()
  chatMessages.value.push({ role: 'user', content: text, time: fmtTime(now) })

  chatLoading.value = true
  chatStreamContent.value = ''

  try {
    const data = await $fetch<{ success: boolean; data: { content: string } }>('/api/chat/ai', {
      method: 'POST',
      body: { caseId: 'demo', message: text, senderIdentifier: 'party', senderName: '当事人' },
    })
    if (data?.data?.content) {
      const full = data.data.content
      for (let i = 0; i < full.length; i++) {
        chatStreamContent.value = full.slice(0, i + 1)
        await new Promise(r => setTimeout(r, 15))
      }
      chatMessages.value.push({ role: 'ai', content: full, time: fmtTime(new Date()) })
    }
  } catch (err: any) {
    chatMessages.value.push({ role: 'ai', content: `抱歉，服务暂时不可用：${err?.message || '请稍后重试'}`, time: fmtTime(new Date()) })
  } finally {
    chatLoading.value = false
    chatStreamContent.value = ''
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    })
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

async function createCase() {
  creatingCase.value = true
  try {
    const formData = new FormData()
    formData.append('caseType', 'mediation')
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
