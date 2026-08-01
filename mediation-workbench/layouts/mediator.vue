<script setup lang="ts">
// 调解员工作台布局（左侧边栏）
const colorMode = useColorMode()
const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (v) => { colorMode.preference = v ? 'dark' : 'light' },
})

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

const { user, logout } = useAuth()
const router = useRouter()
const route = useRoute()

const navItems = [
  { key: 'cases', icon: 'i-lucide-folder-open', label: '我的案件', to: '/mediator' },
  { key: 'agents', icon: 'i-lucide-bot', label: '智能体', to: '/mediator/agents' },
  { key: 'kb', icon: 'i-lucide-book-open', label: '知识库', to: '/mediator/kb' },
  { key: 'settings', icon: 'i-lucide-settings', label: '设置', to: '/mediator/settings' },
]

async function handleLogout() {
  await logout()
  await navigateTo('/mediator')
}
</script>

<template>
  <div class="min-h-screen flex bg-gray-50 dark:bg-gray-950">
    <!-- ── 左侧边栏 ── -->
    <aside class="shrink-0 w-60 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
      <!-- Brand -->
      <div class="h-14 px-4 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800">
        <UIcon name="i-lucide-scale" class="w-5 h-5 text-blue-500 dark:text-blue-400" />
        <div>
          <div class="text-base font-bold text-gray-900 dark:text-white leading-tight">调解员工作台</div>
          <div class="text-[11px] text-gray-400 dark:text-gray-500 font-mono leading-tight">Mediator Console</div>
        </div>
      </div>

      <!-- Nav Menu -->
      <nav class="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <NuxtLink
          v-for="item in navItems"
          :key="item.key"
          :to="item.to"
          class="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
          :class="route.path === item.to
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >
          <UIcon :name="item.icon" class="w-4.5 h-4.5" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <!-- User Area -->
      <div class="border-t border-gray-100 dark:border-gray-800 p-3 space-y-2">
        <template v-if="user">
          <div class="flex items-center gap-2.5 px-1">
            <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {{ (user.name || user.username || 'M').slice(0, 1) }}
            </div>
            <div class="min-w-0">
              <div class="text-sm font-medium text-gray-900 dark:text-white leading-tight truncate">{{ user.name }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 leading-tight truncate">{{ user.role }}</div>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="flex-1 px-2.5 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              @click="toggleTheme"
            >
              <span class="flex items-center justify-center gap-1">
                <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-3.5 h-3.5" />
                {{ isDark ? '浅色' : '深色' }}
              </span>
            </button>
            <button
              class="flex-1 px-2.5 py-1.5 rounded-md text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
              @click="handleLogout"
            >
              退出
            </button>
          </div>
        </template>
        <NuxtLink
          v-else
          to="/mediator"
          class="block text-center px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          登录
        </NuxtLink>
      </div>
    </aside>

    <!-- ── 右侧内容区 ── -->
    <main class="flex-1 min-w-0 flex flex-col">
      <slot />
    </main>
  </div>
</template>
