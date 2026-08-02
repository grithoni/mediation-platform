import { verifyPartyAccess } from '../../utils/auth'
import { desensitizeCaseMaterials } from '../../utils/case-analysis-orchestrator'

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

  // 构建简洁的案情摘要
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

  // 对摘要进行本地脱敏，确保返回给前端的内容安全（不含真实 PII）
  try {
    const des = await desensitizeCaseMaterials(summary, {
      knownEntities: [],
      partyNames: [caseData.partyAName, caseData.partyBName].filter(Boolean),
      addresses: [],
    })

    return {
      success: true,
      summary: des.maskedText || summary,
      traceId: des.traceId,
    }
  } catch (e) {
    // 如果脱敏过程失败，退回到不包含个人姓名的最小摘要
    const safeParts = parts.filter(p => !/^申请人：|^被申请人：/.test(p))
    return {
      success: true,
      summary: safeParts.join('\n'),
    }
  }
})
