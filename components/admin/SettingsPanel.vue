<template>
  <div class="flex-1 flex flex-col bg-white dark:bg-gray-900">
    <!-- Skills -->
    <template v-if="mode === 'skills'">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-sparkles" class="w-5 h-5 text-amber-500" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">技能管理</span>
        <span class="text-xs text-gray-400 ml-auto">{{ skills.length }} 个技能包</span>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        <!-- Upload zone -->
        <div class="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center hover:border-amber-400 transition-colors">
          <UIcon name="i-lucide-upload-cloud" class="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">上传技能包</div>
          <div class="text-xs text-gray-400 mb-3">支持 .zip 格式，文件应包含 manifest.json (name, description, version)</div>
          <input ref="skillFileInput" type="file" accept=".zip" class="hidden" @change="emit('uploadSkill', $event)" />
          <button class="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50" :disabled="skillUploading" @click="(skillFileInput as HTMLInputElement)?.click()">
            <UIcon v-if="skillUploading" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
            <UIcon v-else name="i-lucide-package-plus" class="w-4 h-4" />
            {{ skillUploading ? '上传中...' : '选择文件' }}
          </button>
          <div v-if="skillUploadMsg" class="mt-2 text-xs" :class="skillUploadOk ? 'text-emerald-500' : 'text-red-500'">{{ skillUploadMsg }}</div>
        </div>

        <div v-if="skills.length === 0" class="text-center py-8 text-sm text-gray-400">尚未安装任何技能</div>
        <div v-else class="space-y-2">
          <div v-for="s in skills" :key="s.id" class="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-amber-500 shrink-0" />
                  <span class="font-medium text-gray-900 dark:text-white truncate">{{ s.name }}</span>
                  <span class="text-[10px] text-gray-400 font-mono">v{{ s.version }}</span>
                </div>
                <p class="text-xs text-gray-500 mt-1 line-clamp-2">{{ s.description }}</p>
                <div class="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                  <span><UIcon name="i-lucide-file" class="w-3 h-3 inline -mt-0.5" /> {{ s.fileCount }} 个文件</span>
                  <span><UIcon name="i-lucide-calendar" class="w-3 h-3 inline -mt-0.5" /> {{ s.installedAt }}</span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button class="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors" title="启用/禁用" @click="emit('toggleSkill', s.id)">
                  <UIcon :name="s.enabled ? 'i-lucide-toggle-right' : 'i-lucide-toggle-left'" class="w-4 h-4" :class="s.enabled ? 'text-emerald-500' : ''" />
                </button>
                <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors" title="卸载" @click="emit('deleteSkill', s.id)">
                  <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- MCP Tools -->
    <template v-else-if="mode === 'tools'">
      <div class="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2">
        <UIcon name="i-lucide-wrench" class="w-5 h-5 text-violet-500" />
        <span class="text-sm font-medium text-gray-900 dark:text-white">工具管理 (MCP)</span>
        <span class="text-xs text-gray-400 ml-auto">{{ mcpTools.length }} 个工具</span>
        <button class="px-2.5 py-1 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-md transition-colors flex items-center gap-1" @click="emit('addTool')">
          <UIcon name="i-lucide-plus" class="w-3.5 h-3.5" /> 新增
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        <div v-if="mcpTools.length === 0" class="text-center py-12 text-sm text-gray-400">
          尚未配置任何 MCP 工具<br/>
          <span class="text-xs">点击右上角"新增"配置 stdio 或 http 传输</span>
        </div>
        <div v-for="t in mcpTools" :key="t.id" class="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <UIcon :name="t.transport === 'stdio' ? 'i-lucide-terminal' : 'i-lucide-globe'" class="w-4 h-4 text-violet-500 shrink-0" />
                <span class="font-medium text-gray-900 dark:text-white truncate">{{ t.name }}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded font-mono" :class="t.transport === 'stdio' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'">{{ t.transport }}</span>
                <span v-if="!t.enabled" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">已禁用</span>
              </div>
              <div class="text-xs text-gray-500 mt-1 font-mono truncate">{{ t.transport === 'stdio' ? t.command : t.url }}</div>
              <div v-if="t.description" class="text-xs text-gray-400 mt-1 line-clamp-2">{{ t.description }}</div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button class="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors" title="编辑" @click="emit('editTool', t)">
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button class="p-1.5 text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded transition-colors" :title="t.enabled ? '禁用' : '启用'" @click="emit('toggleTool', t.id)">
                <UIcon :name="t.enabled ? 'i-lucide-toggle-right' : 'i-lucide-toggle-left'" class="w-4 h-4" :class="t.enabled ? 'text-emerald-500' : ''" />
              </button>
              <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors" title="删除" @click="emit('deleteTool', t.id)">
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface Skill { id: string; name: string; version: string; description: string; fileCount: number; installedAt: string; enabled: boolean }
interface McpTool { id: string; name: string; description: string; transport: 'stdio' | 'http'; command?: string; url?: string; enabled: boolean }

defineProps<{
  mode: string
  skills: Skill[]
  skillUploading: boolean
  skillUploadMsg: string
  skillUploadOk: boolean
  mcpTools: McpTool[]
}>()

const emit = defineEmits<{
  uploadSkill: [ev: Event]
  toggleSkill: [id: string]
  deleteSkill: [id: string]
  addTool: []
  editTool: [tool: McpTool]
  toggleTool: [id: string]
  deleteTool: [id: string]
}>()

const skillFileInput = ref<HTMLInputElement | null>(null)
</script>
