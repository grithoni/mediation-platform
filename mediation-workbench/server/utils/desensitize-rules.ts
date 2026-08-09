// ============================================================
// 案件脱敏规则复核
//
// 参照 /Users/honi/Desktop/skills/文档脱敏助手-1/SKILL.md 的规则表，
// 允许调解员按案件手动修改/确认脱敏规则；其余自动化流程不变。
//
// 规则模型：
//   { category, label, enabled, action }
//   - category: 脱敏类别（证件/电话/邮箱/银行卡/信用代码/姓名/地址/角色姓名/企业名称/金额/日期/案号）
//   - enabled:  是否启用该类别的脱敏
//   - action:   'mask'（替换为令牌并回填）| 'delete'（直接删除，不回填）| 'keep'（保留原样）
//
// 默认规则对齐 SKILL.md：强格式标识（证件/电话/邮箱/银行卡/信用代码）→ delete；
// 姓名/地址/角色姓名/企业名称/金额 → mask（保留令牌可回填）；案号 → mask；
// 日期 → keep（SKILL.md 注明日期按场景决定是否脱敏，默认保留以保证时间线分析质量）。
// 说明：为保持「其余自动化流程不变」，默认全部 enabled=true，
// 行为与现有引擎一致（mask 即当前令牌行为；delete 为 SKILL.md 的“直接删除”）。
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb } from '../database'
import { caseDesensitizeRules } from '../database/schema'

export type DesensitizeAction = 'mask' | 'delete' | 'keep'

export interface DesensitizeRule {
  category: string
  label: string
  enabled: boolean
  action: DesensitizeAction
}

/** 可复核的脱敏类别（与 case-analysis-orchestrator 的 span.category 对应）。 */
export const RULE_CATEGORIES: Array<{ category: string; label: string }> = [
  { category: '证件', label: '证件号码（身份证/护照等）' },
  { category: '电话', label: '联系电话' },
  { category: '邮箱', label: '电子邮箱' },
  { category: '银行卡', label: '银行账号' },
  { category: '信用代码', label: '统一社会信用代码' },
  { category: '姓名', label: '自然人姓名' },
  { category: '地址', label: '地址' },
  { category: '角色姓名', label: '当事人角色姓名（申请人/被申请人等）' },
  // 参照「文档脱敏助手」SKILL.md 规则表补充：
  { category: '企业名称', label: '企业名称' },
  { category: '金额', label: '金额（人民币/元/万元等）' },
  { category: '日期', label: '日期' },
  { category: '案号', label: '案号（如（2025）京01民初123号）' },
]

/** SKILL.md 默认规则。 */
export function defaultRules(): DesensitizeRule[] {
  return RULE_CATEGORIES.map(({ category, label }) => ({
    category,
    label,
    enabled: true,
    action: (category === '证件' || category === '电话' || category === '邮箱' || category === '银行卡' || category === '信用代码')
      ? 'delete'
      : category === '日期'
        ? 'keep' // SKILL.md：日期按场景决定，默认保留，避免破坏时间线分析
        : 'mask',
  }))
}

function normalizeRules(rules: unknown): DesensitizeRule[] {
  if (!Array.isArray(rules)) return defaultRules()
  const defaults = defaultRules()
  const byCategory = new Map(defaults.map((r) => [r.category, r]))
  for (const item of rules) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (typeof r.category !== 'string' || !byCategory.has(r.category)) continue
    const action = r.action === 'delete' || r.action === 'keep' || r.action === 'mask' ? r.action : byCategory.get(r.category)!.action
    byCategory.set(r.category, {
      category: r.category,
      label: byCategory.get(r.category)!.label,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      action,
    })
  }
  return [...byCategory.values()]
}

/** 读取案件规则；未保存过返回默认规则。 */
export function getCaseRules(caseId: string): DesensitizeRule[] {
  try {
    const db = getDb()
    const row = db.select().from(caseDesensitizeRules).where(eq(caseDesensitizeRules.caseId, caseId)).get()
    if (!row) return defaultRules()
    return normalizeRules(JSON.parse(row.rulesJson))
  } catch (err) {
    console.warn('[desensitize-rules] 读取规则失败，使用默认：', err)
    return defaultRules()
  }
}

/** 保存案件规则（覆盖式）。 */
export function saveCaseRules(caseId: string, rules: DesensitizeRule[]): DesensitizeRule[] {
  const normalized = normalizeRules(rules)
  const db = getDb()
  db.insert(caseDesensitizeRules)
    .values({ caseId, rulesJson: JSON.stringify(normalized), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: caseDesensitizeRules.caseId,
      set: { rulesJson: JSON.stringify(normalized), updatedAt: Date.now() },
    })
    .run()
  return normalized
}

/** 构建供引擎消费的规则索引：category → rule。 */
export function rulesIndex(rules: DesensitizeRule[]): Record<string, DesensitizeRule> {
  const index: Record<string, DesensitizeRule> = {}
  for (const rule of rules) index[rule.category] = rule
  return index
}
