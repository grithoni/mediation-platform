<script setup lang="ts">
// 知识库 — RAG 检索与文档管理
const { user, isAuthenticated, fetchUser } = useAuth()
const checking = ref(true)
const roleOk = ref(false)

const kbItems = [
  {
    title: '调解规则与流程',
    desc: '商事调解六步流程、立案受理规则、调解指引。',
    count: 2,
    icon: 'i-lucide-book-marked',
  },
  {
    title: '费用标准',
    desc: '调解收费标准、仲裁费用对比、退费指引。',
    count: 1,
    icon: 'i-lucide-coins',
  },
  {
    title: '常用法规',
    desc: '民法典相关条款、格式条款提示说明义务等。',
    count: 1,
    icon: 'i-lucide-library',
  },
  {
    title: '常见问答',
    desc: '当事人高频咨询问题与标准答复。',
    count: 3,
    icon: 'i-lucide-message-circle-question',
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
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">知识库</h1>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">调解业务知识 · 供 AI 检索引用</p>
          </div>
          <UButton icon="i-lucide-upload" color="gray" variant="soft">上传文档</UButton>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="item in kbItems"
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
      </template>
    </div>
  </div>
</template>
