<script setup lang="ts">
// 智能体 — 调解技能与 AI 能力配置
const { user, isAuthenticated, fetchUser } = useAuth()
const checking = ref(true)
const roleOk = ref(false)

const skillCards = [
  {
    title: '案情概要生成',
    desc: '读取案件材料，把人物、金额、时间、争议点收拢成一张可读的案件底图。',
    state: '待启用',
    icon: 'i-lucide-file-text',
  },
  {
    title: '请求权基础分析',
    desc: '围绕调解主张拆解请求路径、成立要件和关键事实，输出法律依据清单。',
    state: '待启用',
    icon: 'i-lucide-scale',
  },
  {
    title: '证据清单与缺口',
    desc: '把现有材料映射到待证事实，指出证据缺口与补正方向。',
    state: '待启用',
    icon: 'i-lucide-list-checks',
  },
  {
    title: '调解建议生成',
    desc: '基于双方立场、争议焦点和材料强弱给出谈判抓手与调解方案。',
    state: '待启用',
    icon: 'i-lucide-lightbulb',
  },
]

onMounted(async () => {
  await fetchUser()
  checking.value = false
  roleOk.value = ['mediator', 'case_manager', 'admin'].includes(user.value?.role || '')
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
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">智能体</h1>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">调解技能与 AI 能力配置</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="card in skillCards"
            :key="card.title"
            class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5"
          >
            <div class="flex items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <UIcon :name="card.icon" class="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="text-base font-semibold text-gray-900 dark:text-white">{{ card.title }}</div>
              </div>
              <span class="px-2 py-1 rounded-full text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{{ card.state }}</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{{ card.desc }}</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
