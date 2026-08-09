<script setup lang="ts">
// 智能体 — 技能库详情（只查看技能定义，运行功能在「我的案件」中）
const { user, isAuthenticated, fetchUser, getAuthHeaders } = useAuth()
const checking = ref(true)
const roleOk = ref(false)

// ── VALUE 调解技能库（5 阶段 × 5 技能，浏览详情）──
interface ValuePhase { key: string; en: string; name: string; desc: string }
interface ValueSkill { id: string; phaseKey: string; name: string; prompt: string }

const valuePhases = ref<ValuePhase[]>([])
const valueSkills = ref<ValueSkill[]>([])
const selectedPhase = ref('V')
const valueLoaded = ref(false)
const expandedSkill = ref<string | null>(null)

const currentPhaseSkills = computed(() => valueSkills.value.filter((s) => s.phaseKey === selectedPhase.value))

/** 技能卡片描述：取 prompt 首句（截断到第一个句号，最多 60 字） */
function skillDesc(skill: ValueSkill): string {
  const first = skill.prompt.split(/[。！？]/)[0] || ''
  return first.length > 60 ? first.slice(0, 60) + '…' : first
}

/** 技能 prompt 结构化拆分：按输出要求分段展示 */
function promptSections(skill: ValueSkill): Array<{ title: string; text: string }> {
  const parts = skill.prompt.split(/。/)
  const sections: Array<{ title: string; text: string }> = []
  let current = ''
  for (const p of parts) {
    const t = p.trim()
    if (!t) continue
    if (/输出|要求|任务/.test(t.slice(0, 2))) {
      if (current) sections.push({ title: '', text: current })
      current = ''
      sections.push({ title: t, text: '' })
    } else if (current) {
      current += '。' + t
    } else {
      current = t
    }
  }
  if (current) sections.push({ title: '', text: current })
  return sections.filter((s) => s.text)
}

async function loadValueCatalog() {
  try {
    const resp = await $fetch<{ success: boolean; data: { phases: ValuePhase[]; skills: ValueSkill[] } }>('/api/value', {
      headers: getAuthHeaders(),
    })
    if (resp?.success) {
      valuePhases.value = resp.data.phases || []
      valueSkills.value = resp.data.skills || []
      valueLoaded.value = true
    }
  } catch {
    // 静默失败，展示空态
  }
}

function toggleSkill(id: string) {
  expandedSkill.value = expandedSkill.value === id ? null : id
}

onMounted(async () => {
  await fetchUser()
  checking.value = false
  roleOk.value = ['mediator', 'case_manager', 'admin'].includes(user.value?.role || '')
  if (roleOk.value) {
    await loadValueCatalog()
  }
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
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">VALUE 调解技能库 · 查看技能详情，运行请在「我的案件」中操作</p>
          </div>
        </div>

        <!-- ══ VALUE 调解技能库 ══ -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <UIcon name="i-lucide-wand-2" class="w-5 h-5 text-blue-500" />
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">VALUE 调解技能库</h2>
          </div>
          <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">5 阶段 × 5 技能 · 点击技能卡片查看完整详情</p>

          <!-- 阶段切换 -->
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-1.5 mb-4">
            <button
              v-for="phase in valuePhases"
              :key="phase.key"
              class="w-full rounded-xl border px-2 py-1.5 text-left transition-colors"
              :class="selectedPhase === phase.key
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-800 dark:hover:bg-gray-800'"
              @click="selectedPhase = phase.key"
            >
              <div class="text-[11px] font-semibold leading-tight">{{ phase.key }} · {{ phase.name }}</div>
              <div
                class="mt-0.5 text-[9px] uppercase tracking-[0.08em] leading-tight"
                :class="selectedPhase === phase.key ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'"
              >
                {{ phase.en }}
              </div>
            </button>
          </div>

          <!-- 技能卡片网格：点击展开详情 -->
          <div v-if="valueLoaded" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="skill in currentPhaseSkills"
              :key="skill.id"
              class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl transition-colors"
              :class="expandedSkill === skill.id ? 'border-blue-300 dark:border-blue-700' : ''"
            >
              <button
                class="w-full text-left p-5 flex items-start gap-3"
                @click="toggleSkill(skill.id)"
              >
                <div class="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-magic-wand" class="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-base font-semibold text-gray-900 dark:text-white">{{ skill.name }}</div>
                    <UIcon
                      name="i-lucide-chevron-down"
                      class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
                      :class="expandedSkill === skill.id ? 'rotate-180' : ''"
                    />
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-2 mt-1">{{ skillDesc(skill) }}</p>
                </div>
              </button>

              <!-- 展开的完整详情 -->
              <div v-if="expandedSkill === skill.id" class="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-3">
                <div class="text-xs text-gray-400 dark:text-gray-500 font-mono mb-2">{{ skill.id }}</div>
                <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{{ skill.prompt }}</div>
                <div class="mt-3 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                  <UIcon name="i-lucide-info" class="w-3.5 h-3.5" />
                  运行此技能请前往「我的案件」选择对应案件
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-sm text-gray-400 dark:text-gray-500 py-8">
            <UIcon name="i-lucide-inbox" class="w-4 h-4 inline mr-1 align-[-2px]" />技能库暂不可用。
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
