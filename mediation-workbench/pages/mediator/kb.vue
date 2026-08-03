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
const docListOpen = ref(false)

// ── 上传（Dify 风格分段配置） ──
const uploadInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadMsg = ref('')
const uploadMsgType = ref<'success' | 'error' | 'warning'>('success')
const uploadModalOpen = ref(false)
const selectedFiles = ref<File[]>([])
// 分段配置
const chunkMode = ref<'auto' | 'custom'>('auto')
const customSeparator = ref('\\n\\n')
const chunkSize = ref(2000)
const chunkOverlap = ref(200)
const cleanRules = ref<string[]>(['clean_whitespace'])

// ── 删除 ──
const deletingPath = ref('')
const deleteError = ref('')

// ── 查看原文（仅 .md） ──
const viewDocOpen = ref(false)
const viewingDoc = ref<{ fileName: string; content: string } | null>(null)
const viewing = ref(false)
const viewError = ref('')
// inline-expanded docs: path -> content
const expandedDocs = ref<Record<string, string>>({})

async function viewDoc(path: string) {
  // Toggle inline expansion: collapse if already expanded
  viewError.value = ''
  if (expandedDocs.value[path]) {
    delete expandedDocs.value[path]
    // ensure reactivity
    expandedDocs.value = { ...expandedDocs.value }
    return
  }
  viewing.value = true
  try {
    const content = await $fetch<string>('/api/kb/file', { query: { path }, method: 'GET', responseType: 'text', timeout: 15000 }) as string
    expandedDocs.value = { ...expandedDocs.value, [path]: content }
  } catch (e: any) {
    viewError.value = e?.data?.message || e?.message || '无法读取文件'
    expandedDocs.value = { ...expandedDocs.value, [path]: '' }
  } finally {
    viewing.value = false
  }
}

function isMd(path: string) {
  return path.toLowerCase().endsWith('.md')
}

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

// ── 分类分组（按文档路径归类） ──
const CATEGORY_RULES: { title: string; icon: string; match: string[] }[] = [
  { title: '调解规则与流程', icon: 'i-lucide-book-marked', match: ['mediation', 'guide', '02'] },
  { title: '机构与中立评估', icon: 'i-lucide-building-2', match: ['institution', '01', 'neutral', '03', 'dispute', '04'] },
  { title: '服务与培训', icon: 'i-lucide-graduation-cap', match: ['consulting', '05', 'training', '06'] },
  { title: '常见问答', icon: 'i-lucide-message-circle-question', match: ['faq', '07'] },
]

function categorize(doc: KbDoc): { title: string; icon: string } {
  const p = doc.path.toLowerCase()
  for (const c of CATEGORY_RULES) {
    if (c.match.some((m) => p.includes(m))) return { title: c.title, icon: c.icon }
  }
  return { title: '其他文档', icon: 'i-lucide-folder' }
}

// 按分类分组（保持分类顺序，未匹配归"其他文档"）
const docGroups = computed(() => {
  const order = [...CATEGORY_RULES.map((c) => c.title), '其他文档']
  const groups: Record<string, KbDoc[]> = {}
  for (const d of docs.value) {
    const title = categorize(d).title
    if (!groups[title]) groups[title] = []
    groups[title].push(d)
  }
  return order
    .filter((t) => groups[t])
    .map((title) => ({
      title,
      icon: CATEGORY_RULES.find((c) => c.title === title)?.icon || 'i-lucide-folder',
      docs: groups[title] ?? [],
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
  selectedFiles.value = []
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  selectedFiles.value = Array.from(files)
}

// 自定义分隔符：用户输入 \n\n 字面量，转为真实换行符
function resolvedSeparator() {
  if (chunkMode.value === 'custom') {
    return customSeparator.value.replace(/\\n/g, '\n')
  }
  return ''
}

async function confirmUpload() {
  if (selectedFiles.value.length === 0) return
  uploading.value = true
  uploadMsg.value = ''
  try {
    const sep = resolvedSeparator()
    const failed: string[] = []
    let uploadedCount = 0
    for (const file of selectedFiles.value) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('chunk_size', String(chunkSize.value))
      formData.append('overlap', String(chunkOverlap.value))
      if (sep) formData.append('separator', sep)
      formData.append('clean_rules', cleanRules.value.join(','))
      try {
        await $fetch('/api/kb/upload', { method: 'POST', body: formData })
        uploadedCount++
      } catch (e: any) {
        failed.push(file.name)
      }
    }
    uploadMsgType.value = failed.length ? 'warning' : 'success'
    uploadMsg.value = `已上传 ${uploadedCount} 个文件并完成索引` + (failed.length ? `，${failed.length} 个失败：${failed.join('、')}` : '')
    await loadDocs()
    uploadModalOpen.value = false
    selectedFiles.value = []
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
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" title="刷新列表" :loading="loadingDocs" @click="loadDocs" />
            <UButton icon="i-lucide-upload" color="primary" variant="soft" size="sm" title="上传文档" :loading="uploading" @click="openUploadModal" />
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

        <!-- 文档列表（默认折叠，点击展开按分类显示） -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <button
            class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
            @click="docListOpen = !docListOpen"
          >
            <div class="flex items-center gap-2">
              <UIcon :name="docListOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
              <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">文档列表（{{ docs.length }}）</h2>
            </div>
            <span class="text-xs text-gray-400 shrink-0">{{ docListOpen ? '点击折叠' : '点击展开' }}</span>
          </button>

          <div v-if="docListOpen" class="border-t border-gray-100 dark:border-gray-800">
            <div v-if="docError" class="px-4 py-3">
              <UAlert :title="docError" color="error" variant="soft" />
            </div>
            <div v-if="deleteError" class="px-4 py-3">
              <UAlert :title="deleteError" color="error" variant="soft" @close="deleteError = ''" />
            </div>

            <div v-if="loadingDocs" class="flex items-center justify-center py-16">
              <UIcon name="i-lucide-loader-2" class="w-6 h-6 text-blue-500 animate-spin" />
            </div>

            <div v-else-if="docs.length === 0" class="p-10 text-center">
              <UIcon name="i-lucide-folder-open" class="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p class="text-sm text-gray-400 dark:text-gray-500">知识库暂无文档，点击右上角「上传文档」添加</p>
            </div>

            <template v-else>
              <div v-for="group in docGroups" :key="group.title" class="border-b border-gray-100 dark:border-gray-800 last:border-0">
                <!-- 分类头 -->
                <div class="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/40">
                  <UIcon :name="group.icon" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">{{ group.title }}</span>
                  <span class="px-1.5 py-px rounded-full text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{{ group.docs.length }} 篇</span>
                </div>
                <!-- 分类内文档 -->
                <table class="w-full text-sm">
                  <tbody>
                    <template v-for="doc in group.docs" :key="doc.path">
                      <tr
                        class="border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <td class="px-4 py-2.5 pl-8">
                          <div class="flex items-center gap-2 min-w-0">
                            <UIcon :name="fileIcon(doc.path)" class="w-4 h-4 text-blue-500 shrink-0" />
                            <button
                              v-if="isMd(doc.path)"
                              class="truncate text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left min-w-0"
                              :title="'查看原文：' + fileName(doc.path)"
                              @click="viewDoc(doc.path)"
                            >
                              {{ fileName(doc.path) }}
                            </button>
                            <span v-else class="truncate text-gray-700 dark:text-gray-300" :title="doc.path">{{ fileName(doc.path) }}</span>
                          </div>
                        </td>
                        <td class="px-4 py-2.5 w-20 text-gray-500 dark:text-gray-400">{{ doc.chunks }} 块</td>
                        <td class="px-4 py-2.5 w-24 text-right">
                          <UButton
                            v-if="isMd(doc.path)"
                            icon="i-lucide-eye"
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            :loading="viewing"
                            title="查看原文"
                            @click="viewDoc(doc.path)"
                          />
                          <UButton
                            icon="i-lucide-trash-2"
                            size="xs"
                            color="error"
                            variant="ghost"
                            :loading="deletingPath === doc.path"
                            title="删除文档"
                            @click="deleteDoc(doc.path)"
                          />
                        </td>
                      </tr>
                      <tr v-if="expandedDocs[doc.path]" class="bg-white dark:bg-gray-900/70">
                        <td colspan="3" class="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
                          <div class="max-h-[40vh] overflow-y-auto rounded-md bg-gray-50 dark:bg-gray-800/60 p-3">
                            <pre class="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300 font-mono">{{ expandedDocs[doc.path] }}</pre>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- 上传文档弹窗（Dify 风格分段配置） -->
    <UModal v-model="uploadModalOpen" :ui="{ content: 'max-w-2xl' }">
      <div class="p-6">
        <div class="flex items-center justify-between mb-5">
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">上传文档</h3>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">设置分段与清洗规则后建立索引</p>
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="() => { uploadModalOpen = false }" />
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
              {{ selectedFiles.length ? `已选择 ${selectedFiles.length} 个文件，点击可继续添加` : '点击选择文件（支持多选 .md/.txt/.pdf/.doc/.docx/.html/.json/.csv）' }}
            </p>
          </button>
          <input ref="uploadInput" type="file" multiple accept=".md,.txt,.pdf,.doc,.docx,.html,.json,.csv" class="hidden" @change="onFileSelect" />
          <ul v-if="selectedFiles.length" class="mt-2 space-y-1">
            <li v-for="(f, i) in selectedFiles" :key="i" class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-600 dark:text-gray-300">
              <span class="flex items-center gap-1.5 min-w-0">
                <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5 shrink-0" />
                <span class="truncate">{{ f.name }}</span>
              </span>
              <span class="text-gray-400 shrink-0">{{ (f.size / 1024).toFixed(1) }} KB</span>
            </li>
          </ul>
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

        <!-- 4. 操作按钮 -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <UButton color="neutral" variant="ghost" @click="() => { uploadModalOpen = false }">取消</UButton>
          <UButton color="primary" :loading="uploading" :disabled="selectedFiles.length === 0" @click="confirmUpload">
            <UIcon name="i-lucide-upload" class="w-4 h-4" /> 确认上传
          </UButton>
        </div>
      </div>
    </UModal>

    <!-- 查看原文弹窗（仅 .md） -->
    <UModal v-model="viewDocOpen" :ui="{ content: 'max-w-3xl' }">
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon name="i-lucide-file-text" class="w-5 h-5 text-blue-500 shrink-0" />
            <h3 class="text-lg font-bold text-gray-900 dark:text-white truncate">{{ viewingDoc?.fileName }}</h3>
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="() => { viewDocOpen = false }" />
        </div>
        <p v-if="viewError" class="mb-3">
          <UAlert color="error" :title="viewError" icon="i-lucide-alert-circle" />
        </p>
        <div
          v-if="viewingDoc"
          class="max-h-[60vh] overflow-y-auto rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-4"
        >
          <pre class="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300 font-mono">{{ viewingDoc.content }}</pre>
        </div>
      </div>
    </UModal>
  </div>
</template>
