// ============================================================
// GET /api/desensitize-rules
// 读取全局脱敏规则（调解员复核用）；未保存过返回默认规则。
// 全局单例：保存后对该账号下所有案件生效。
// ============================================================
import { requireMediator } from '~/server/middleware/auth'
import { defaultRules, getGlobalRules } from '~/server/utils/desensitize-rules'

export default defineEventHandler(async (event) => {
  requireMediator(event)
  const rules = getGlobalRules()
  return { success: true, data: { rules } }
})

export { defaultRules }
