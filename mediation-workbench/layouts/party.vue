<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (v) => { colorMode.preference = v ? 'dark' : 'light' },
})

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const { activeMenu, setMenu } = useActiveMenu()

const menuItems: Array<{
  key: ActiveMenu
  icon: string
  label: string
}> = [
  { key: 'case-entry', icon: 'i-lucide-folder-open', label: '进入我的案件' },
  { key: 'create-case', icon: 'i-lucide-plus-circle', label: '创建新的案件' },
]
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-white dark:bg-gray-950">
    <!-- Left Panel: Navigation -->
    <aside class="w-[280px] shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <!-- Brand Header -->
      <div class="p-4 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-scale" class="w-5 h-5 text-blue-500 dark:text-blue-400" />
            <div>
              <div class="text-xl font-bold text-gray-900 dark:text-white">全时在线的纠纷解决专家</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 font-mono">Always Online Dispute Resolution Expert</div>
            </div>
          </div>
          <button
            class="p-1 rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            @click="toggleTheme"
          >
            <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Navigation Menu -->
      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
        <button
          v-for="item in menuItems"
          :key="item.key"
          @click="setMenu(item.key)"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
          :class="activeMenu === item.key
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <UIcon :name="item.icon" class="w-4 h-4 shrink-0" />
          <span class="text-sm">{{ item.label }}</span>
        </button>
      </nav>

      <!-- Footer -->
      <div class="p-3 border-t border-gray-200 dark:border-gray-800">
        <p class="text-xs text-gray-400 dark:text-gray-600 font-mono text-center">商事调解平台 v1.0</p>
      </div>
    </aside>

    <!-- Right Panel: Slot for child pages -->
    <main class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
      <slot />
    </main>
  </div>
</template>
