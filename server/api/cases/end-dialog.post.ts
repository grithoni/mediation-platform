// ============================================================
// POST /api/cases/end-dialog — 结束当事人对话，切换到调解员选择
// ============================================================
import { endDialog } from '../../utils/dialog-manager'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { caseId } = body

  if (!caseId) {
    return { success: false, error: '缺少 caseId' }
  }

  endDialog(caseId)

  return { success: true, data: { caseId, phase: 'mediator_selection' } }
})
