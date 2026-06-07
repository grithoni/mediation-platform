<template>
  <div class="w-72 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Section 1: Cases -->
    <div class="border-b border-gray-200 dark:border-gray-800">
      <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="toggleSection('cases')">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <UIcon name="i-lucide-folder-open" class="w-4 h-4 text-blue-500" />
          案件列表
        </span>
        <UIcon :name="sidebarOpen.cases ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
      </button>
      <div v-if="sidebarOpen.cases" class="px-2 pb-2 space-y-1">
        <UInput v-model="searchQuery" placeholder="搜索案件编号..." icon="i-lucide-search" size="sm" class="mb-2" />
        <div v-if="casesLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="w-5 h-5 text-blue-400 animate-spin" />
        </div>
        <template v-else>
          <button v-for="c in filteredCases" :key="c.id"
            class="w-full text-left px-3 py-2 rounded-md transition-colors border text-sm"
            :class="selectedCaseId === c.id ? 'bg-blue-50 dark:bg-blue-950 border-blue-200' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50'"
            @click="emit('selectCase', c.id)">
            <div class="font-mono text-xs text-gray-400 mb-0.5">{{ c.id }}</div>
            <div class="font-medium text-gray-900 dark:text-white truncate">{{ c.title }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ c.partyAName }} vs {{ c.partyBName }}</div>
          </button>
          <div v-if="filteredCases.length === 0" class="py-8 text-center">
            <p class="text-xs text-gray-400">暂无案件</p>
          </div>
        </template>
      </div>
    </div>

    <!-- Section 2: Knowledge Base -->
    <div class="border-b border-gray-200 dark:border-gray-800">
      <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="toggleSection('kb')">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <UIcon name="i-lucide-library" class="w-4 h-4 text-emerald-500" />
          知识库
        </span>
        <UIcon :name="sidebarOpen.kb ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
      </button>
      <div v-if="sidebarOpen.kb" class="px-2 pb-2 grid grid-cols-3 gap-1">
        <button v-for="item in kbButtons" :key="item.mode"
          class="flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded border transition-colors"
          :class="rightMode === item.mode ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 text-blue-700' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 hover:bg-gray-50'"
          @click="emit('changeMode', item.mode)">
          <UIcon :name="item.icon" class="w-3 h-3" />
          {{ item.label }}
        </button>
      </div>
    </div>

    <!-- Section 3: Recent Conversations -->
    <div class="border-b border-gray-200 dark:border-gray-800">
      <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="toggleSection('history')">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <UIcon name="i-lucide-message-square" class="w-4 h-4 text-violet-500" />
          近期对话
        </span>
        <UIcon :name="sidebarOpen.history ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
      </button>
      <div v-if="sidebarOpen.history" class="px-2 pb-2 space-y-1">
        <div v-if="savedConversations.length === 0" class="text-xs text-gray-400 py-3 text-center">暂无保存的对话</div>
        <button v-for="c in savedConversations" :key="c.id"
          class="w-full text-left px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click="emit('openConversation', c.id)">
          <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ c.title }}</div>
          <div class="text-xs text-gray-500 mt-0.5">{{ c.caseId }} · {{ c.caseTitle }}</div>
          <div class="text-xs text-gray-400 mt-0.5">{{ c.messageCount }} 条消息 · {{ formatDateTime(c.createdAt) }}</div>
        </button>
      </div>
    </div>

    <!-- Section 4: Settings -->
    <div class="border-b border-gray-200 dark:border-gray-800">
      <button class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="toggleSection('settings')">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <UIcon name="i-lucide-settings" class="w-4 h-4 text-gray-500" />
          设置
        </span>
        <UIcon :name="sidebarOpen.settings ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="w-4 h-4 text-gray-400" />
      </button>
      <div v-if="sidebarOpen.settings" class="px-4 py-3 text-xs text-gray-500 space-y-1.5">
        <button class="w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-left text-gray-700 dark:text-gray-300 transition-colors"
          :class="rightMode === 'skills' ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : ''"
          @click="emit('changeMode', 'skills')">
          <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5" /> 技能
          <span v-if="skillCount" class="ml-auto text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">{{ skillCount }}</span>
        </button>
        <button class="w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-left text-gray-700 dark:text-gray-300 transition-colors"
          :class="rightMode === 'tools' ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : ''"
          @click="emit('changeMode', 'tools')">
          <UIcon name="i-lucide-wrench" class="w-3.5 h-3.5" /> 工具 (MCP)
          <span v-if="toolCount" class="ml-auto text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">{{ toolCount }}</span>
        </button>
        <div class="pt-2 mt-2 border-t border-gray-200 dark:border-gray-800 space-y-1">
          <div>{{ userName }}</div>
          <div>角色：{{ userRole === 'admin' ? '管理员' : '调解员' }}</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-auto p-3 border-t border-gray-200 dark:border-gray-800">
      <UButton icon="i-lucide-log-out" size="sm" block variant="ghost" @click="emit('logout')">登出</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CaseItem {
  id: string; title: string; partyAName: string; partyBName: string; status: string; phase: string
}
interface SavedConversation {
  id: string; caseId: string; caseTitle?: string; title: string; messageCount: number; createdAt: string
}

const props = defineProps<{
  cases: CaseItem[]
  casesLoading: boolean
  selectedCaseId: string | null
  rightMode: string
  savedConversations: SavedConversation[]
  skillCount: number
  toolCount: number
  userName: string
  userRole: string
}>()

const emit = defineEmits<{
  selectCase: [id: string]
  changeMode: [mode: string]
  openConversation: [id: string]
  logout: []
}>()

const searchQuery = ref('')
const sidebarOpen = reactive({ cases: true, history: false, settings: false, kb: false })

const kbButtons = [
  { mode: 'kb-upload', icon: 'i-lucide-upload', label: '上传' },
  { mode: 'kb-view', icon: 'i-lucide-eye', label: '查看' },
  { mode: 'kb-search', icon: 'i-lucide-search', label: '搜索' },
]

const filteredCases = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.cases
  return props.cases.filter(c => c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
})

function toggleSection(key: 'cases' | 'kb' | 'history' | 'settings') {
  sidebarOpen[key] = !sidebarOpen[key]
  if (key === 'cases' && sidebarOpen.cases) emit('changeMode', 'cases-list')
  if (key === 'history' && sidebarOpen.history) emit('changeMode', 'history')
}

function formatDateTime(iso: string) {
  try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }) } catch { return iso }
}
</script>
