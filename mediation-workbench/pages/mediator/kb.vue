<script setup lang="ts">
// 知识库 — 上传/删除/检索文档，供 AI 检索引用
const { user, isAuthenticated, fetchUser } = useAuth()
const checking = ref(true)
const roleOk = ref(false)

// ── 文档列表 ──
interface KbDoc {
  path: string
  rel_path: string
  chunks: number
}
const docs = ref<KbDoc[]>([])
const loadingDocs = ref(false)
const docError = ref('')
const showTree = ref(false)

// ── 上传（Dify 风格分段配置） ──
const uploadInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadMsg = ref('')
const uploadMsgType = ref<'success' | 'error'>('success')
const uploadModalOpen = ref(false)
const selectedFile = ref<File | null>(null)
// 分段配置
const chunkMode = ref<'auto' | 'custom'>('auto')
const customSeparator = ref('\\n\\n')
const chunkSize = ref(2000)
const chunkOverlap = ref(200)
const cleanRules = ref<string[]>(['clean_whitespace'])
// 分段预览
const previewing = ref(false)
const previewResult = ref<{ chunks: { index: number; content: string; token_count: number }[]; text_length: number; chunk_count: number } | null>(null)
const previewError = ref('')

// ── 删除 ──
const deletingPath = ref('')
const deleteError = ref('')

// ── 检索 ──
interface KbHit {
  path: string
  content: string
  score: number
}
const searchQuery = ref('')
const searching = ref(false)
const searchResults = ref<KbHit[]>([])
const searched = ref(false)
const searchError = ref('')
const searchMode = ref('rerank')

// ── 分类统计（基于真实文档路径计算） ──
const kbCategories = computed(() => {
  const cats = [
    { title: '调解规则与流程', match: ['mediation', 'guide', '02'], icon: 'i-lucide-book-marked', desc: '商事调解流程、立案受理规则、调解指引。' },
    { title: '机构与中立评估', match: ['institution', '01', 'neutral', '03', 'dispute', '04'], icon: 'i-lucide-building-2', desc: '机构介绍、中立评估（ENE）、争议评审（DRB）。' },
    { title: '服务与培训', match: ['consulting', '05', 'training', '06'], icon: 'i-lucide-graduation-cap', desc: '咨询服务范围、培训课程。' },
    { title: '常见问答', match: ['faq', '07'], icon: 'i-lucide-message-circle-question', desc: '高频咨询问题与标准答复。' },
  ]
  return cats.map((c) => ({
    ...c,
    count: docs.value.filter((d) => c.match.some((m) => d.path.toLowerCase().includes(m))).length,
  }))
})

async function loadDocs() {
  loadingDocs.value = true
  docError.value = ''
  try {
    const res = await $fetch('/api/kb/list', { query: { limit: 1000 } })
    docs.value = (res as any)?.documents || []
  } catch (e: any) {
    docError.value = e?.data?.message || e?.message || '加载文档列表失败'
  } finally {
    loadingDocs.value = false
  }
}

function openUploadModal() {
  uploadModalOpen.value = true
  uploadMsg.value = ''
  previewResult.value = null
  previewError.value = ''
  // 选择文件后由 onFileSelect 触发预览（自动模式）
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  selectedFile.value = file
  previewResult.value = null
  previewError.value = ''
  if (chunkMode.value === 'auto') previewUpload()
}

// 自定义分隔符：用户输入 \n\n 字面量，转为真实换行符
function resolvedSeparator() {
  if (chunkMode.value === 'custom') {
    return customSeparator.value.replace(/\\n/g, '\n')
  }
  return ''
}

async function previewUpload() {
  if (!selectedFile.value) return
  previewing.value = true
  previewError.value = ''
  previewResult.value = null
  try {
    const text = await selectedFile.value.text()
    const res = await $fetch('/api/kb/preview', {
      method: 'POST',
      body: {
        text,
        chunk_size: chunkSize.value,
        overlap: chunkOverlap.value,
        separator: resolvedSeparator(),
        clean_rules: cleanRules.value.join(','),
      },
    })
    previewResult.value = res as any
  } catch (e: any) {
    previewError.value = e?.data?.message || e?.message || '分段预览失败'
  } finally {
    previewing.value = false
  }
}

async function confirmUpload() {
  if (!selectedFile.value) return
  uploading.value = true
  uploadMsg.value = ''
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    formData.append('chunk_size', String(chunkSize.value))
    formData.append('overlap', String(chunkOverlap.value))
    const sep = resolvedSeparator()
    if (sep) formData.append('separator', sep)
    formData.append('clean_rules', cleanRules.value.join(','))
    await $fetch('/api/kb/upload', { method: 'POST', body: formData })
    uploadMsgType.value = 'success'
    uploadMsg.value = `已上传 ${selectedFile.value.name} 并完成索引`
    await loadDocs()
    uploadModalOpen.value = false
    selectedFile.value = null
    previewResult.value = null
  } catch (e: any) {
    uploadMsgType.value = 'error'
    uploadMsg.value = e?.data?.message || e?.message || '上传失败'
  } finally {
    uploading.value = false
  }
}

async function deleteDoc(path: string) {
  if (!confirm(`确定删除该文档？\n${path.split('/').pop()}`)) return
  deletingPath.value = path
  deleteError.value = ''
  try {
    await $fetch('/api/kb/delete', { method: 'POST', body: { paths: [path] } })
    await loadDocs()
  } catch (e: any) {
    deleteError.value = e?.data?.message || e?.message || '删除失败'
  } finally {
    deletingPath.value = ''
  }
}

async function doSearch() {
  const q = searchQuery.value.trim()
  if (!q) return
  searching.value = true
  searchError.value = ''
  searched.value = true
  try {
    const res = await $fetch('/api/kb/search', {
      method: 'POST',
      body: { query: q, top_k: 5, mode: searchMode.value },
    })
    searchResults.value = (res as any)?.results || []
  } catch (e: any) {
    searchError.value = e?.data?.message || e?.message || '检索失败'
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

function fileName(path: string) {
  return path.split('/').pop() || path
}

function fileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return 'i-lucide-file-text'
  if (['doc', 'docx'].includes(ext)) return 'i-lucide-file-text'
  if (['md', 'txt'].includes(ext)) return 'i-lucide-file-text'
  return 'i-lucide-file'
}

onMounted(async () => {
  await fetchUser()
  checking.value = false
  roleOk.value = ['mediator', 'case_manager', 'admin'].includes(user.value?.role || '')
  if (roleOk.value) await loadDocs()
})
</script>

<template>
  <div class="flex-1 min-w-0 overflow-y-auto p-6">
    <div class="max-w-7xl mx-auto">
      <div v-if="checking" class="flex items-center justify-center py-32">
        <UIcon name="i-lucide-loader-2" class="w-8 h-8 text-blue-500 animate-spin" />
      </div>

      <div v-else-if="!isAuthenticated || !roleOk" class="flex items-center justify-center py-32">
        <p class="text-gray-400 dark:text-gray-500 text-sm">请先以调解员身份登录</p>
      </div>

      <template v-else>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">知识库</h1>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">调解业务知识 · 支持上传、删除与检索</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton icon="i-lucide-refresh-cw" color="gray" variant="ghost" size="sm" title="刷新列表" :loading="loadingDocs" @click="loadDocs" />
            <UButton icon="i-lucide-upload" color="primary" variant="soft" :loading="uploading" @click="openUploadModal">上传文档</UButton>
            <input ref="uploadInput" type="file" accept=".md,.txt,.pdf,.doc,.docx,.html,.json,.csv" class="hidden" @change="onFileSelect" />
          </div>
        </div>

        <!-- 上传提示 -->
        <div v-if="uploadMsg" class="mb-4">
          <UAlert
            :title="uploadMsg"
            :color="uploadMsgType === 'success' ? 'success' : 'error'"
            variant="soft"
            @close="uploadMsg = ''"
          />
        </div>

        <!-- 检索区 -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-6">
          <div class="flex items-center gap-3">
            <UInput
              v-model="searchQuery"
              placeholder="输入关键词检索知识库，如：调解收费、中立评估…"
              class="flex-1"
              @keyup.enter="doSearch"
            />
            <USelect v-model="searchMode" :options="[
              { label: '混合检索（推荐）', value: 'rerank' },
              { label: '语义向量', value: 'vector' },
              { label: '关键词', value: 'keyword' },
            ]" class="w-40 shrink-0" size="sm" />
            <UButton icon="i-lucide-search" color="primary" :loading="searching" @click="doSearch">检索</UButton>
          </div>

          <div v-if="searchError" class="mt-3">
            <UAlert :title="searchError" color="error" variant="soft" />
          </div>

          <div v-if="searched && !searching" class="mt-4 space-y-3">
            <p class="text-xs text-gray-400 dark:text-gray-500">
              共 {{ searchResults.length }} 条结果（模式：{{ searchMode }}）
            </p>
            <div
              v-for="(hit, i) in searchResults"
              :key="i"
              class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <div class="flex items-center justify-between gap-2 mb-1">
                <div class="flex items-center gap-1.5 min-w-0 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <UIcon :name="fileIcon(hit.path)" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span class="truncate">{{ fileName(hit.path) }}</span>
                </div>
                <span class="shrink-0 text-[11px] font-mono text-gray-400">{{ hit.score?.toFixed(3) }}</span>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3 whitespace-pre-line">{{ hit.content }}</p>
            </div>
            <p v-if="searchResults.length === 0" class="text-sm text-gray-400 dark:text-gray-500">未检索到相关内容</p>
          </div>
        </div>

        <!-- 分类统计 -->
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">分类统计</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div
            v-for="item in kbCategories"
            :key="item.title"
            class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <UIcon :name="item.icon" class="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div class="min-w-0">
                  <div class="text-base font-semibold text-gray-900 dark:text-white">{{ item.title }}</div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{{ item.desc }}</p>
                </div>
              </div>
              <span class="px-2 py-1 rounded-full text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">{{ item.count }} 篇</span>
            </div>
          </div>
        </div>

        <!-- 文档列表 -->
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">文档列表（{{ docs.length }}）</h2>
          <button class="text-xs text-blue-600 dark:text-blue-400 hover:underline" @click="showTree = !showTree">
            {{ showTree ? '按文档列表显示' : '查看分类树' }}
          </button>
        </div>

        <div v-if="docError" class="mb-4">
          <UAlert :title="docError" color="error" variant="soft" />
        </div>
        <div v-if="deleteError" class="mb-4">
          <UAlert :title="deleteError" color="error" variant="soft" @close="deleteError = ''" />
        </div>

        <div v-if="loadingDocs" class="flex items-center justify-center py-16">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-blue-500 animate-spin" />
        </div>

        <div v-else-if="docs.length === 0" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-10 text-center">
          <UIcon name="i-lucide-folder-open" class="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p class="text-sm text-gray-400 dark:text-gray-500">知识库暂无文档，点击右上角「上传文档」添加</p>
        </div>

        <div v-else class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                <th class="px-4 py-3 font-medium">文档名称</th>
                <th class="px-4 py-3 font-medium w-24">分块数</th>
                <th class="px-4 py-3 font-medium w-24 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="doc in docs"
                :key="doc.path"
                class="border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
              >
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <UIcon :name="fileIcon(doc.path)" class="w-4 h-4 text-blue-500 shrink-0" />
                    <span class="truncate text-gray-700 dark:text-gray-300" :title="doc.path">{{ fileName(doc.path) }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ doc.chunks }}</td>
                <td class="px-4 py-3 text-right">
                  <UButton
                    icon="i-lucide-trash-2"
                    size="xs"
                    color="red"
                    variant="ghost"
                    :loading="deletingPath === doc.path"
                    title="删除文档"
                    @click="deleteDoc(doc.path)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- 上传文档弹窗（Dify 风格分段配置） -->
    <UModal v-model="uploadModalOpen" :ui="{ width: 'max-w-2xl' }">
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">上传文档</h3>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">设置分段与清洗规则后建立索引</p>
          </div>
          <UButton icon="i-lucide-x" color="gray" variant="ghost" size="sm" @click="uploadModalOpen = false" />
        </div>

        <!-- 1. 选择文件 -->
        <div class="mb-5">
          <label class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">① 选择文件</label>
          <button
            class="w-full border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl px-4 py-6 text-center hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
            @click="uploadInput?.click()"
          >
            <UIcon name="i-lucide-file-up" class="w-7 h-7 text-gray-400 mx-auto mb-2" />
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ selectedFile ? selectedFile.name : '点击选择文件（支持 .md/.txt/.pdf/.doc/.docx/.html/.json/.csv）' }}
            </p>
          </button>
          <input ref="uploadInput" type="file" accept=".md,.txt,.pdf,.doc,.docx,.html,.json,.csv" class="hidden" @change="onFileSelect" />
        </div>

        <!-- 2. 分段设置 -->
        <div class="mb-5">
          <label class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">② 分段设置</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="text-[11px] text-gray-400 mb-1 block">分段方式</label>
              <USelect
                v-model="chunkMode"
                :options="[
                  { label: '自动分段', value: 'auto' },
                  { label: '自定义分隔符', value: 'custom' },
                ]"
                size="sm"
              />
            </div>
            <div v-if="chunkMode === 'custom'">
              <label class="text-[11px] text-gray-400 mb-1 block">分隔符</label>
              <UInput v-model="customSeparator" placeholder="如：\\n\\n" size="sm" />
            </div>
            <div>
              <label class="text-[11px] text-gray-400 mb-1 block">分段最大长度（字符）</label>
              <UInput v-model.number="chunkSize" type="number" min="50" max="10000" size="sm" />
            </div>
            <div>
              <label class="text-[11px] text-gray-400 mb-1 block">分段重叠（字符）</label>
              <UInput v-model.number="chunkOverlap" type="number" min="0" max="2000" size="sm" />
            </div>
          </div>
        </div>

        <!-- 3. 清洗规则 -->
        <div class="mb-5">
          <label class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">③ 文本预处理（清洗规则）</label>
          <div class="flex flex-wrap gap-2">
            <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
              <input type="checkbox" v-model="cleanRules" value="clean_whitespace" class="accent-blue-600" />
              <span class="text-xs text-gray-600 dark:text-gray-300">替换连续空格/换行/制表符</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
              <input type="checkbox" v-model="cleanRules" value="remove_urls" class="accent-blue-600" />
              <span class="text-xs text-gray-600 dark:text-gray-300">删除所有 URL</span>
            </label>
            <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
              <input type="checkbox" v-model="cleanRules" value="remove_emails" class="accent-blue-600" />
              <span class="text-xs text-gray-600 dark:text-gray-300">删除电子邮件地址</span>
            </label>
          </div>
        </div>

        <!-- 4. 分段预览 -->
        <div class="mb-5">
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-gray-500 dark:text-gray-400">④ 分段预览</label>
            <UButton size="xs" color="gray" variant="soft" icon="i-lucide-eye" :loading="previewing" :disabled="!selectedFile" @click="previewUpload">
              预览分段
            </UButton>
          </div>

          <div v-if="previewError" class="mb-2">
            <UAlert :title="previewError" color="error" variant="soft" />
          </div>

          <div
            v-if="previewResult"
            class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-64 overflow-y-auto"
          >
            <div class="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              共 {{ previewResult.chunk_count }} 个分段（原文 {{ previewResult.text_length }} 字符）
            </div>
            <div
              v-for="chunk in previewResult.chunks.slice(0, 10)"
              :key="chunk.index"
              class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-[11px] font-mono">#{{ chunk.index + 1 }}</span>
                <span class="text-[11px] text-gray-400">{{ chunk.token_count }} 字符</span>
              </div>
              <p class="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line line-clamp-4">{{ chunk.content }}</p>
            </div>
            <div v-if="previewResult.chunks.length > 10" class="px-4 py-2 text-center text-[11px] text-gray-400">
              仅显示前 10 个分段，共 {{ previewResult.chunks.length }} 个
            </div>
          </div>
          <p v-else-if="!previewResult && !previewing" class="text-xs text-gray-400 dark:text-gray-500">
            选择文件后点击「预览分段」，查看内容如何被拆分。
          </p>
        </div>

        <!-- 5. 操作按钮 -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <UButton color="gray" variant="ghost" @click="uploadModalOpen = false">取消</UButton>
          <UButton color="primary" :loading="uploading" :disabled="!selectedFile" @click="confirmUpload">
            <UIcon name="i-lucide-upload" class="w-4 h-4" /> 确认上传
          </UButton>
        </div>
      </div>
    </UModal>
  </div>
</template>
