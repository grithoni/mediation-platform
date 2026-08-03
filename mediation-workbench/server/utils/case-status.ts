/**
 * 案件状态机管理
 *
 * 状态流转：
 * INTAKE -> REVIEWING -> SCREENING -> ACCEPTED -> MEDIATING
 *   -> CAUCUS -> NEGOTIATING -> AGREEMENT_DRAFTING -> AGREEMENT_PENDING
 *   -> SIGNING -> CLOSED_SUCCESS / CLOSED_FAILED / WITHDRAWN
 */

// 案件状态枚举
export const CaseStatus = {
  INTAKE: 'intake',                    // 收案
  ANALYSIS: 'analysis',                // AI分析（当事人对话）
  REVIEWING: 'reviewing',              // 审核中
  SCREENING: 'screening',              // 预评估（AI评估）
  ACCEPTED: 'accepted',                // 受理
  MEDIATOR_SELECTION: 'mediator_selection', // 选择调解员
  MEDIATING: 'mediating',              // 调解中
  CAUCUS: 'caucus',                    // 单独沟通
  NEGOTIATING: 'negotiating',          // 方案协商
  AGREEMENT_DRAFTING: 'agreement_drafting',  // 协议生成
  AGREEMENT_PENDING: 'agreement_pending',    // 协议待确认
  SIGNING: 'signing',                  // 电子签署
  CLOSED_SUCCESS: 'closed_success',    // 调解成功
  CLOSED_FAILED: 'closed_failed',      // 调解失败
  WITHDRAWN: 'withdrawn',              // 撤回
} as const

export type CaseStatusType = typeof CaseStatus[keyof typeof CaseStatus]

// 状态中文标签
export const CaseStatusLabels: Record<CaseStatusType, string> = {
  [CaseStatus.INTAKE]: '收案',
  [CaseStatus.ANALYSIS]: 'AI分析',
  [CaseStatus.REVIEWING]: '审核中',
  [CaseStatus.SCREENING]: '预评估',
  [CaseStatus.ACCEPTED]: '受理',
  [CaseStatus.MEDIATOR_SELECTION]: '选择调解员',
  [CaseStatus.MEDIATING]: '调解中',
  [CaseStatus.CAUCUS]: '单独沟通',
  [CaseStatus.NEGOTIATING]: '方案协商',
  [CaseStatus.AGREEMENT_DRAFTING]: '协议生成',
  [CaseStatus.AGREEMENT_PENDING]: '协议待确认',
  [CaseStatus.SIGNING]: '电子签署',
  [CaseStatus.CLOSED_SUCCESS]: '调解成功',
  [CaseStatus.CLOSED_FAILED]: '调解失败',
  [CaseStatus.WITHDRAWN]: '撤回',
}

// 状态颜色（用于 UI）
export const CaseStatusColors: Record<CaseStatusType, string> = {
  [CaseStatus.INTAKE]: 'blue',
  [CaseStatus.ANALYSIS]: 'sky',
  [CaseStatus.REVIEWING]: 'yellow',
  [CaseStatus.SCREENING]: 'purple',
  [CaseStatus.ACCEPTED]: 'green',
  [CaseStatus.MEDIATOR_SELECTION]: 'pink',
  [CaseStatus.MEDIATING]: 'orange',
  [CaseStatus.CAUCUS]: 'cyan',
  [CaseStatus.NEGOTIATING]: 'indigo',
  [CaseStatus.AGREEMENT_DRAFTING]: 'violet',
  [CaseStatus.AGREEMENT_PENDING]: 'amber',
  [CaseStatus.SIGNING]: 'teal',
  [CaseStatus.CLOSED_SUCCESS]: 'emerald',
  [CaseStatus.CLOSED_FAILED]: 'red',
  [CaseStatus.WITHDRAWN]: 'gray',
}

// 状态分组
export const CaseStatusGroups: Record<'OPEN' | 'ACTIVE' | 'AGREEMENT' | 'CLOSED', CaseStatusType[]> = {
  OPEN: [CaseStatus.INTAKE, CaseStatus.ANALYSIS, CaseStatus.REVIEWING, CaseStatus.SCREENING, CaseStatus.ACCEPTED, CaseStatus.MEDIATOR_SELECTION],
  ACTIVE: [CaseStatus.MEDIATING, CaseStatus.CAUCUS, CaseStatus.NEGOTIATING],
  AGREEMENT: [CaseStatus.AGREEMENT_DRAFTING, CaseStatus.AGREEMENT_PENDING, CaseStatus.SIGNING],
  CLOSED: [CaseStatus.CLOSED_SUCCESS, CaseStatus.CLOSED_FAILED, CaseStatus.WITHDRAWN],
}

// 允许的状态流转
export const AllowedTransitions: Record<CaseStatusType, CaseStatusType[]> = {
  [CaseStatus.INTAKE]: [CaseStatus.ANALYSIS, CaseStatus.REVIEWING, CaseStatus.WITHDRAWN],
  [CaseStatus.ANALYSIS]: [CaseStatus.MEDIATOR_SELECTION, CaseStatus.REVIEWING, CaseStatus.WITHDRAWN],
  [CaseStatus.REVIEWING]: [CaseStatus.SCREENING, CaseStatus.ACCEPTED, CaseStatus.ANALYSIS, CaseStatus.WITHDRAWN],
  [CaseStatus.SCREENING]: [CaseStatus.ACCEPTED, CaseStatus.WITHDRAWN],
  [CaseStatus.ACCEPTED]: [CaseStatus.MEDIATING, CaseStatus.MEDIATOR_SELECTION, CaseStatus.WITHDRAWN],
  [CaseStatus.MEDIATOR_SELECTION]: [CaseStatus.MEDIATING, CaseStatus.WITHDRAWN],
  [CaseStatus.MEDIATING]: [CaseStatus.CAUCUS, CaseStatus.NEGOTIATING, CaseStatus.CLOSED_FAILED, CaseStatus.WITHDRAWN],
  [CaseStatus.CAUCUS]: [CaseStatus.MEDIATING, CaseStatus.NEGOTIATING, CaseStatus.CLOSED_FAILED],
  [CaseStatus.NEGOTIATING]: [CaseStatus.AGREEMENT_DRAFTING, CaseStatus.MEDIATING, CaseStatus.CLOSED_FAILED],
  [CaseStatus.AGREEMENT_DRAFTING]: [CaseStatus.AGREEMENT_PENDING, CaseStatus.NEGOTIATING],
  [CaseStatus.AGREEMENT_PENDING]: [CaseStatus.SIGNING, CaseStatus.NEGOTIATING, CaseStatus.CLOSED_FAILED],
  [CaseStatus.SIGNING]: [CaseStatus.CLOSED_SUCCESS, CaseStatus.CLOSED_FAILED],
  [CaseStatus.CLOSED_SUCCESS]: [],
  [CaseStatus.CLOSED_FAILED]: [],
  [CaseStatus.WITHDRAWN]: [],
}

/**
 * 验证状态流转是否合法
 */
export function isValidTransition(from: CaseStatusType, to: CaseStatusType): boolean {
  return AllowedTransitions[from]?.includes(to) ?? false
}

/**
 * 获取下一个可能的状态
 */
export function getNextStatuses(current: CaseStatusType): CaseStatusType[] {
  return AllowedTransitions[current] || []
}

/**
 * 判断案件是否已结案
 */
export function isClosedStatus(status: CaseStatusType): boolean {
  return CaseStatusGroups.CLOSED.includes(status)
}

/**
 * 判断案件是否正在进行中
 */
export function isActiveStatus(status: CaseStatusType): boolean {
  return CaseStatusGroups.ACTIVE.includes(status)
}

/**
 * 判断案件是否处于协议阶段
 */
export function isAgreementStatus(status: CaseStatusType): boolean {
  return CaseStatusGroups.AGREEMENT.includes(status)
}

/**
 * 根据 phase 自动推导对应的 status（保持 phase/status 同步）
 */
export function deriveStatusFromPhase(phase: CaseStatusType): 'pending' | 'active' | 'resolved' | 'closed' {
  if (isClosedStatus(phase)) return 'closed'
  if (isActiveStatus(phase)) return 'active'
  if (isAgreementStatus(phase)) return 'active'
  if (phase === CaseStatus.ACCEPTED || phase === CaseStatus.MEDIATOR_SELECTION) return 'active'
  return 'pending'
}
