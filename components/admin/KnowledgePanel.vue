<template>
  <div class="flex-1 flex flex-col bg-white dark:bg-gray-900">
    <!-- KB Upload -->
    <template v-if="mode === 'kb-upload'">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-upload" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">上传文档</span>
        <span class="text-xs text-gray-400 ml-auto">仅支持 .md 格式</span>
      </div>
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <div class="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center bg-gray-50 dark:bg-gray-950">
          <UIcon name="i-lucide-file-up" class="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">点击下方按钮选择 .md 文档</p>
          <input ref="fileInput" type="file" accept=".md,text/markdown" class="hidden" @change="onFileSelected" />
          <UButton icon="i-lucide-folder-open" color="primary" @click="fileInput?.click()">选择 .md 文件</UButton>
        </div>
        <div v-if="uploadFile" class="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <UIcon name="i-lucide-file-text" class="w-5 h-5 text-blue-500" />
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ uploadFile.name }}</div>
            <div class="text-xs text-gray-500">{{ (uploadFile.size / 1024).toFixed(1) }} KB</div>
          </div>
          <UButton size="sm" :loading="uploading" @click="emit('upload', uploadFile)">上传</UButton>
        </div>
        <UAlert v-if="uploadMsg" :color="uploadOk ? 'success' : 'error'" variant="soft" :title="uploadMsg" />
      </div>
    </template>

    <!-- KB View -->
    <template v-else-if="mode === 'kb-view'">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-library" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">知识库列表</span>
        <span class="text-xs text-gray-400 ml-auto">{{ kbList.length }} 个文档 · {{ kbStats }}</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="kbListLoading" class="flex items-center justify-center py-12 gap-2 text-sm text-blue-500">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 加载中...
        </div>
        <div v-else-if="kbList.length">
          <div v-for="doc in kbList" :key="doc.path" class="bg-gray-50 dark:bg-gray-950 rounded-lg p-3 border border-gray-200 dark:border-gray-800 flex items-center gap-3">
            <UIcon name="i-lucide-file-text" class="w-5 h-5 text-blue-500 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ doc.path.split('/').pop() }}</div>
              <div class="text-xs text-gray-400 font-mono truncate">{{ doc.path }}</div>
            </div>
            <div class="text-xs text-gray-500 shrink-0">{{ doc.chunks }} 块</div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-sm text-gray-400">知识库为空</p>
        </div>
      </div>
    </template>

    <!-- KB Search -->
    <template v-else-if="mode === 'kb-search'">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-search" class="w-5 h-5 text-blue-600" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">知识库检索</span>
        <span class="text-xs text-gray-400 ml-auto">{{ results.length }} 条结果</span>
      </div>
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 space-y-2">
        <form @submit.prevent="doSearch" class="flex gap-2">
          <UInput v-model="query" placeholder="输入关键词或法条编号搜索..." icon="i-lucide-search" size="md" class="flex-1" />
          <UButton type="submit" :loading="searching" :disabled="!query.trim()" icon="i-lucide-search">搜索</UButton>
        </form>
        <div class="flex items-center gap-1">
          <button v-for="m in searchModes" :key="m.value"
            class="px-2.5 py-1 text-xs rounded-md transition-colors"
            :class="searchMode === m.value
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
            @click="searchMode = m.value"
          >{{ m.label }}</button>
          <span class="text-xs text-gray-400 ml-auto">{{ searchModes.find(m => m.value === searchMode)?.desc }}</span>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <div v-if="searching" class="flex items-center justify-center py-12 gap-2 text-sm text-blue-500">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> 搜索中...
        </div>
        <div v-else-if="results.length">
          <div v-for="(r, i) in results" :key="i" class="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-mono text-blue-600 dark:text-blue-400">{{ r.path.split('/').pop()?.replace('.md','') }}</span>
              <span class="text-xs text-gray-400">相关度: {{ (r.score * 100).toFixed(0) }}%</span>
            </div>
            <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{{ r.content }}</div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-sm text-gray-400">输入关键词搜索法律知识库（{{ kbStats }}）</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface KbDoc { path: string; rel_path: string; chunks: number }
interface KbResult { path: string; content: string; score: number }

const props = defineProps<{
  mode: string
  kbList: KbDoc[]
  kbListLoading: boolean
  kbStats: string
  results: KbResult[]
  searching: boolean
  uploading: boolean
  uploadMsg: string
  uploadOk: boolean
}>()

const emit = defineEmits<{
  search: [query: string, mode: string]
  upload: [file: File]
}>()

const query = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const uploadFile = ref<File | null>(null)

const searchMode = ref('hybrid')
const searchModes = [
  { value: 'hybrid', label: '混合', desc: '语义 + 关键词，推荐' },
  { value: 'vector', label: '语义', desc: '理解同义词、近义表达' },
  { value: 'keyword', label: '关键词', desc: '精确匹配法条编号' },
]

function doSearch() {
  if (query.value.trim()) {
    emit('search', query.value, searchMode.value)
  }
}

function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const f = target.files?.[0]
  if (!f) return
  if (!f.name.endsWith('.md')) {
    // Let parent handle error via uploadMsg prop
    return
  }
  uploadFile.value = f
}
</script>
