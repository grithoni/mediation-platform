<template>
  <div>
    <!-- Directory -->
    <div v-if="node.type === 'dir'">
      <button
        class="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
        :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
        @click="expanded = !expanded"
      >
        <UIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="w-4 h-4 text-gray-400 shrink-0 transition-transform"
        />
        <UIcon name="i-lucide-folder" class="w-5 h-5 text-amber-500 shrink-0" />
        <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ node.name }}</span>
        <span class="text-xs text-gray-400 ml-auto shrink-0">{{ node.file_count }} 文件 · {{ node.chunk_count }} 块</span>
      </button>
      <div v-if="expanded && node.children" class="border-l border-gray-200 dark:border-gray-700 ml-4">
        <KbTreeNode v-for="child in node.children" :key="child.path" :node="child" :depth="depth + 1" />
      </div>
    </div>

    <!-- File -->
    <div
      v-else
      class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
    >
      <UIcon name="i-lucide-file-text" class="w-4 h-4 text-blue-500 shrink-0" />
      <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ node.name }}</span>
      <span class="text-xs text-gray-400 ml-auto shrink-0">{{ node.chunks }} 块</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import KbTreeNode from './KbTreeNode.vue'

interface KbTreeNodeType {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: KbTreeNodeType[]
  file_count?: number
  chunk_count?: number
  rel_path?: string
  chunks?: number
}

defineProps<{
  node: KbTreeNodeType
  depth: number
}>()

const expanded = ref(true)
</script>
