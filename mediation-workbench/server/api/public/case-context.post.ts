import { verifyPartyAccess } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const caseNumber = body?.caseNumber || body?.case_number
  const accessCode = body?.accessCode || body?.access_code

  if (!caseNumber || !accessCode) {
    throw createError({ statusCode: 400, statusMessage: '缺少案号或访问码' })
  }

  const { valid, caseData } = verifyPartyAccess(caseNumber, accessCode)
  if (!valid || !caseData) {
    throw createError({ statusCode: 403, statusMessage: '访问码错误或无权访问' })
  }

  // 构建简洁的案情摘要供智能咨询作为上下文使用（避免泄露敏感字段）
  const parts: string[] = []
  if (caseData.title) parts.push(`标题：${caseData.title}`)
  if (caseData.partyAName) parts.push(`申请人：${caseData.partyAName}`)
  if (caseData.partyBName) parts.push(`被申请人：${caseData.partyBName}`)
  if (caseData.mediationWillingness) parts.push(`调解意向：${caseData.mediationWillingness}`)
  if (caseData.phase) parts.push(`当前阶段：${caseData.phase}`)

  if (caseData.description) {
    const desc = String(caseData.description).trim().replace(/\s+/g, ' ')
    parts.push(`案情摘要：${desc.length > 1200 ? desc.slice(0, 1200) + '...' : desc}`)
  }

  const summary = parts.join('\n')

  return {
    success: true,
    summary,
  }
})
