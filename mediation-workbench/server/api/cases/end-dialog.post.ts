// ============================================================
// POST /api/cases/end-dialog — 结束当事人对话，切换到调解员选择
// ============================================================
import { endDialog } from '../../utils/dialog-manager'
import { requireAuth } from '../../middleware/auth'
import { verifyPartyAccess } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  // Auth: accept mediator JWT or party access code
  const user = event.context.user
  if (!user) {
    // Try party access via query/body
    const body = await readBody(event)
    const { caseId, accessCode } = body
    if (!caseId) {
      return { success: false, error: '缺少 caseId' }
    }
    if (accessCode) {
      const { valid } = verifyPartyAccess(caseId, accessCode)
      if (!valid) {
        throw createError({ statusCode: 403, message: '访问验证码无效' })
      }
    } else {
      throw createError({ statusCode: 401, message: '请提供认证信息' })
    }
    endDialog(caseId)
    return { success: true, data: { caseId, phase: 'mediator_selection' } }
  }

  const body = await readBody(event)
  const { caseId } = body

  if (!caseId) {
    return { success: false, error: '缺少 caseId' }
  }

  endDialog(caseId)

  return { success: true, data: { caseId, phase: 'mediator_selection' } }
})
