<script setup lang="ts">
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const activeMenu = useActiveMenu()

const menuItems = [
  { id: 'case-entry', icon: 'i-lucide-folder-open', label: '进入我的案件' },
  { id: 'mediation', icon: 'i-lucide-handshake', label: '申请调解' },
  { id: 'evaluation', icon: 'i-lucide-target', label: '申请中立评估' },
  { id: 'review', icon: 'i-lucide-clipboard-check', label: '申请争议评审' },
]
</script>

<template>
  <div class="h-screen flex overflow-hidden bg-white dark:bg-gray-950">
    <!-- Left Panel: Navigation -->
    <aside class="w-[280px] shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
      <!-- Header -->
      <div class="p-5 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-scale" class="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0" />
            <div class="min-w-0">
              <div class="text-lg font-semibold text-gray-900 dark:text-white truncate">全时在线的争议解决专家</div>
              <div class="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate">Always Online Dispute Resolution Expert</div>
            </div>
          </div>
          <button
            class="p-1 rounded-md text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors shrink-0"
            @click="toggleTheme"
          >
            <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Menu Items -->
      <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
        <button
          v-for="item in menuItems"
          :key="item.id"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
          :class="activeMenu === item.id
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50'"
          @click="activeMenu = item.id"
        >
          <UIcon :name="item.icon" class="w-4 h-4 shrink-0" />
          <span class="text-sm font-medium">{{ item.label }}</span>
        </button>
      </nav>

      <!-- Footer -->
      <div class="p-3 border-t border-gray-200 dark:border-gray-800">
        <p class="text-[10px] text-gray-400 dark:text-gray-500 font-mono text-center">
          商事调解平台 v1.0
        </p>
      </div>
    </aside>

    <!-- Right Panel: Page Content -->
    <main class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
      <slot />
    </main>
  </div>
</template>
