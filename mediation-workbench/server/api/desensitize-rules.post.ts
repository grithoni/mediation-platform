// ============================================================
// POST /api/desensitize-rules
// 保存全局脱敏规则（调解员复核确认）。
// 全局单例：保存后对该账号下所有案件生效。
// ============================================================
import { readBody } from 'h3'
import { requireMediator } from '~/server/middleware/auth'
import { saveGlobalRules, type DesensitizeRule } from '~/server/utils/desensitize-rules'

export default defineEventHandler(async (event) => {
  requireMediator(event)
  const body = await readBody(event).catch(() => ({}))
  const rules = Array.isArray(body?.rules) ? (body.rules as DesensitizeRule[]) : []
  if (rules.length === 0) {
    return { success: false, message: '规则不能为空' }
  }
  const saved = saveGlobalRules(rules)
  return { success: true, data: { rules: saved } }
})
