// ============================================================
// POST /api/cases/[caseNumber]/desensitize-rules
// 保存案件脱敏规则（调解员复核确认）。
// ============================================================
import { getRouterParam, readBody } from 'h3'
import { requireMediator } from '~/server/middleware/auth'
import { saveCaseRules, type DesensitizeRule } from '~/server/utils/desensitize-rules'

export default defineEventHandler(async (event) => {
  requireMediator(event)
  const caseNumber = getRouterParam(event, 'caseNumber')
  const body = await readBody(event).catch(() => ({}))
  const rules = Array.isArray(body?.rules) ? (body.rules as DesensitizeRule[]) : []
  if (rules.length === 0) {
    return { success: false, message: '规则不能为空' }
  }
  const saved = saveCaseRules(caseNumber, rules)
  return { success: true, data: { caseId: caseNumber, rules: saved } }
})
