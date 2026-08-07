// ============================================================
// GET /api/cases/[caseNumber]/desensitize-rules
// 读取案件脱敏规则（调解员复核用）；未保存过返回默认规则。
// ============================================================
import { getRouterParam } from 'h3'
import { requireMediator } from '~/server/middleware/auth'
import { defaultRules, getCaseRules } from '~/server/utils/desensitize-rules'

export default defineEventHandler(async (event) => {
  requireMediator(event)
  const caseNumber = getRouterParam(event, 'caseNumber')
  const rules = getCaseRules(caseNumber)
  return { success: true, data: { caseId: caseNumber, rules } }
})

export { defaultRules }
