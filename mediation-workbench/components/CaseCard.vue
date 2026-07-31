<script setup lang="ts">
interface CaseData {
  id: string
  title: string
  partyAName: string
  partyBName: string
  status: 'pending' | 'active' | 'resolved' | 'closed'
  createdAt: string
  mediatorName?: string
}

interface Props {
  case: CaseData
}

const props = defineProps<Props>()
const emit = defineEmits<{
  click: []
}>()

const formattedDate = computed(() => {
  const date = new Date(props.case.createdAt)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
})
</script>

<template>
  <UCard
    class="cursor-pointer transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-600"
    @click="emit('click')"
  >
    <div class="flex flex-col gap-3">
      <!-- Header: case id + status -->
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">{{ case.id }}</span>
        <CaseStatusBadge :status="case.status" />
      </div>

      <!-- Title -->
      <h3 class="font-semibold text-gray-900 dark:text-white line-clamp-1">
        {{ case.title }}
      </h3>

      <!-- Parties -->
      <div class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
        <span>{{ case.partyAName }}</span>
        <UIcon name="i-lucide-arrow-right-left" class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        <span>{{ case.partyBName }}</span>
      </div>

      <!-- Footer: mediator + date -->
      <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
        <span v-if="case.mediatorName">调解员：{{ case.mediatorName }}</span>
        <span v-else>待分配调解员</span>
        <span>{{ formattedDate }}</span>
      </div>
    </div>
  </UCard>
</template>
