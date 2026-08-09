/**
 * 案件状态目录
 *
 * 案件状态由调解员手动触发设置，不强制流转、均可跳过。
 * 以 VALUE 技能五阶段为主轴：
 *   intake(建案入口)
 *   reviewing(V 接案准备)
 *   accepted(A 开启过程)
 *   mediating(L 倾听理解)
 *   negotiating(U 方案验证)
 *   agreement_drafting(E 促成解决)
 *   withdrawn(撤回终态)
 */

// 案件状态枚举
export const CaseStatus = {
  INTAKE: 'intake',                    // 收案（建案入口）
  REVIEWING: 'reviewing',              // VALUE V 接案准备
  ACCEPTED: 'accepted',                // VALUE A 开启过程
  MEDIATING: 'mediating',              // VALUE L 倾听理解
  NEGOTIATING: 'negotiating',          // VALUE U 方案验证
  AGREEMENT_DRAFTING: 'agreement_drafting',  // VALUE E 促成解决
  WITHDRAWN: 'withdrawn',              // 撤回（终态）
} as const

export type CaseStatusType = typeof CaseStatus[keyof typeof CaseStatus]

// 状态中文标签
export const CaseStatusLabels: Record<CaseStatusType, string> = {
  [CaseStatus.INTAKE]: '收案',
  [CaseStatus.REVIEWING]: '接案准备',
  [CaseStatus.ACCEPTED]: '开启过程',
  [CaseStatus.MEDIATING]: '倾听理解',
  [CaseStatus.NEGOTIATING]: '方案验证',
  [CaseStatus.AGREEMENT_DRAFTING]: '促成解决',
  [CaseStatus.WITHDRAWN]: '撤回',
}

// 可供调解员手动设置的阶段（含顺序，用于前端下拉）
export const CaseStatusOptions: CaseStatusType[] = [
  CaseStatus.INTAKE,
  CaseStatus.REVIEWING,
  CaseStatus.ACCEPTED,
  CaseStatus.MEDIATING,
  CaseStatus.NEGOTIATING,
  CaseStatus.AGREEMENT_DRAFTING,
  CaseStatus.WITHDRAWN,
]
