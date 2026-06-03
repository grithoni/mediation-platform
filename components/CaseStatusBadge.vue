<script setup lang="ts">
type CaseStatus = 'pending' | 'active' | 'resolved' | 'closed'

interface Props {
  status: CaseStatus
}

const props = defineProps<Props>()

const statusConfig: Record<CaseStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'warning' },
  active: { label: '调解中', color: 'primary' },
  resolved: { label: '已和解', color: 'success' },
  closed: { label: '已结案', color: 'neutral' },
}

const config = computed(() => statusConfig[props.status] ?? statusConfig.pending)
</script>

<template>
  <UBadge :label="config.label" :color="config.color" variant="subtle" />
</template>
