<script setup lang="ts">
// 智能体 — 调解技能与 AI 能力配置
const { user, isAuthenticated, fetchUser, getAuthHeaders } = useAuth()
const checking = ref(true)
const roleOk = ref(false)

// ── VALUE 调解技能库（5 阶段 × 5 技能，浏览 + 跳转案件运行）──
interface ValuePhase { key: string; en: string; name: string; desc: string }
interface ValueSkill { id: string; phaseKey: string; name: string; prompt: string }

const valuePhases = ref<ValuePhase[]>([])
const valueSkills = ref<ValueSkill[]>([])
const selectedPhase = ref('V')
const valueLoaded = ref(false)

const currentPhaseSkills = computed(() => valueSkills.value.filter((s) => s.phaseKey === selectedPhase.value))

// 案件选择弹窗
interface CaseItem { id: string; title: string; partyAName: string; partyBName: string; status: string; phase: string; mediatorId: string | null }
const showCasePicker = ref(false)
const pickingSkill = ref<ValueSkill | null>(null)
const caseList = ref<CaseItem[]>([])
const caseLoading = ref(false)
const caseError = ref('')

/** 技能卡片描述：取 prompt 首句（截断到第一个句号，最多 60 字） */
function skillDesc(skill: ValueSkill): string {
  const first = skill.prompt.split(/[。！？]/)[0] || ''
  return first.length > 60 ? first.slice(0, 60) + '…' : first
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

/** 点击技能卡片 → 拉取案件列表并弹出选择器 */
async function openCasePicker(skill: ValueSkill) {
  pickingSkill.value = skill
  showCasePicker.value = true
  caseLoading.value = true
  caseError.value = ''
  caseList.value = []
  try {
    const resp = await $fetch<{ success: boolean; data: CaseItem[] }>('/api/cases', {
      headers: getAuthHeaders(),
    })
    caseList.value = resp?.data || []
  } catch (err: any) {
    caseError.value = err?.data?.message || err?.message || '案件列表加载失败'
  } finally {
    caseLoading.value = false
  }
}

/** 选中案件 → 跳转到该案件详情页并自动运行该技能 */
function runOnCase(caseItem: CaseItem) {
  if (!pickingSkill.value) return
  showCasePicker.value = false
  navigateTo(`/mediator/cases/${caseItem.id}?value=${pickingSkill.value.id}`)
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
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-0.5">调解技能与 AI 能力配置</p>
          </div>
        </div>

        <!-- ══ VALUE 调解技能库 ══ -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <UIcon name="i-lucide-wand-2" class="w-5 h-5 text-blue-500" />
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">VALUE 调解技能库</h2>
          </div>
          <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">5 阶段 × 5 技能 · 选择技能后跳转至案件运行</p>

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

          <!-- 技能卡片网格 -->
          <div v-if="valueLoaded" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              v-for="skill in currentPhaseSkills"
              :key="skill.id"
              class="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 text-left transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm"
              @click="openCasePicker(skill)"
            >
              <div class="flex items-center gap-3 mb-2">
                <div class="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <UIcon name="i-lucide-magic-wand" class="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="text-base font-semibold text-gray-900 dark:text-white">{{ skill.name }}</div>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">{{ skillDesc(skill) }}</p>
              <div class="mt-3 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                <UIcon name="i-lucide-play" class="w-3.5 h-3.5" />运行 <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
          <div v-else class="text-sm text-gray-400 dark:text-gray-500 py-8">
            <UIcon name="i-lucide-inbox" class="w-4 h-4 inline mr-1 align-[-2px]" />技能库暂不可用。
          </div>
        </div>

        <!-- 案件选择弹窗 -->
        <UModal v-model="showCasePicker" :ui="{ width: 'sm:max-w-lg' }">
          <div class="p-5 sm:p-6">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <UIcon name="i-lucide-magic-wand" class="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">在哪个案件运行「{{ pickingSkill?.name }}」？</h3>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">选择案件后将跳转并在该案件上运行此技能</p>
              </div>
            </div>

            <div v-if="caseLoading" class="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
              <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />正在加载案件…
            </div>
            <UAlert v-else-if="caseError" color="error" variant="soft" :title="caseError" class="mb-3" />
            <div v-else-if="caseList.length === 0" class="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
              <UIcon name="i-lucide-inbox" class="w-5 h-5 mx-auto mb-2" />暂无可分配的案件，请先在案件工作台创建或分配案件。
            </div>
            <div v-else class="space-y-2 max-h-80 overflow-y-auto pr-1">
              <button
                v-for="c in caseList"
                :key="c.id"
                class="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                @click="runOnCase(c)"
              >
                <div class="min-w-0">
                  <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ c.title }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    <span class="font-mono">{{ c.id }}</span> · {{ c.partyAName }} vs {{ c.partyBName }}
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 shrink-0 text-gray-400" />
              </button>
            </div>
          </div>
        </UModal>
      </template>
    </div>
  </div>
</template>
