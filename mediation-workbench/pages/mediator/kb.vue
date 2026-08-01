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

// ── 上传 ──
const uploadInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadMsg = ref('')
const uploadMsgType = ref<'success' | 'error'>('success')

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

function pickFile() {
  uploadInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await uploadFile(file)
  input.value = ''
}

async function uploadFile(file: File) {
  uploading.value = true
  uploadMsg.value = ''
  try {
    const formData = new FormData()
    formData.append('file', file)
    await $fetch('/api/kb/upload', { method: 'POST', body: formData })
    uploadMsgType.value = 'success'
    uploadMsg.value = `已上传 ${file.name} 并完成索引`
    await loadDocs()
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
            <UButton icon="i-lucide-upload" color="gray" variant="soft" :loading="uploading" @click="pickFile">上传文档</UButton>
            <input ref="uploadInput" type="file" accept=".md,.txt,.pdf,.doc,.docx,.html,.json,.csv" class="hidden" @change="onFileChange" />
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
  </div>
</template>
