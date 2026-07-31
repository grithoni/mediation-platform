<script setup lang="ts">
type CaseStatus =
  | 'intake'
  | 'reviewing'
  | 'screening'
  | 'accepted'
  | 'mediating'
  | 'caucus'
  | 'negotiating'
  | 'agreement_drafting'
  | 'agreement_pending'
  | 'signing'
  | 'closed_success'
  | 'closed_failed'
  | 'withdrawn'

interface Props {
  status: CaseStatus
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
})

const statusConfig: Record<CaseStatus, { label: string; color: string; icon?: string }> = {
  intake: { label: '收案', color: 'info', icon: 'i-lucide-inbox' },
  reviewing: { label: '审核中', color: 'warning', icon: 'i-lucide-clock' },
  screening: { label: '预评估', color: 'primary', icon: 'i-lucide-search' },
  accepted: { label: '受理', color: 'success', icon: 'i-lucide-check-circle' },
  mediating: { label: '调解中', color: 'primary', icon: 'i-lucide-users' },
  caucus: { label: '单独沟通', color: 'info', icon: 'i-lucide-message-circle' },
  negotiating: { label: '方案协商', color: 'primary', icon: 'i-lucide-git-branch' },
  agreement_drafting: { label: '协议生成', color: 'warning', icon: 'i-lucide-file-text' },
  agreement_pending: { label: '协议待确认', color: 'warning', icon: 'i-lucide-hourglass' },
  signing: { label: '电子签署', color: 'primary', icon: 'i-lucide-pen-tool' },
  closed_success: { label: '调解成功', color: 'success', icon: 'i-lucide-check-circle-2' },
  closed_failed: { label: '调解失败', color: 'error', icon: 'i-lucide-x-circle' },
  withdrawn: { label: '撤回', color: 'neutral', icon: 'i-lucide-undo-2' },
}

const config = computed(() => statusConfig[props.status] ?? statusConfig.intake)
</script>

<template>
  <UBadge
    :label="config.label"
    :color="config.color as any"
    :size="size"
    variant="subtle"
  >
    <template #leading>
      <UIcon v-if="config.icon" :name="config.icon" class="w-3.5 h-3.5" />
    </template>
  </UBadge>
</template>
