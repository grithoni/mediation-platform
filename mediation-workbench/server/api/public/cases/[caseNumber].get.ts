import { eq } from 'drizzle-orm'
import { getDb } from '../../../database'
import { cases, caseApplications } from '../../../database/schema'

/**
 * 公开按案号查询（供官网 /mediation 页面查询案件进度用，无认证）。
 * 仅返回精简字段，不暴露联系方式等敏感信息。
 */
export default defineEventHandler(async (event) => {
  const caseNumber = getRouterParam(event, 'caseNumber')
  if (!caseNumber) {
    throw createError({ statusCode: 400, statusMessage: '缺少案号' })
  }

  const db = getDb()

  const c = db
    .select({
      id: cases.id,
      title: cases.title,
      partyAName: cases.partyAName,
      partyBName: cases.partyBName,
      status: cases.status,
      phase: cases.phase,
      createdAt: cases.createdAt,
    })
    .from(cases)
    .where(eq(cases.id, caseNumber))
    .get()

  if (!c) {
    throw createError({ statusCode: 404, statusMessage: `案号 ${caseNumber} 未找到` })
  }

  const app = db
    .select({
      mediationWillingness: caseApplications.mediationWillingness,
      applicantName: caseApplications.applicantName,
      respondentName: caseApplications.respondentName,
    })
    .from(caseApplications)
    .where(eq(caseApplications.caseId, caseNumber))
    .get()

  return {
    success: true,
    case_number: c.id,
    applicant_name: app?.applicantName || c.partyAName,
    respondent_name: app?.respondentName || c.partyBName,
    mediation_willingness: app?.mediationWillingness || '',
    status: c.status || 'pending',
    phase: c.phase,
    title: c.title,
    created_at: c.createdAt,
  }
})
