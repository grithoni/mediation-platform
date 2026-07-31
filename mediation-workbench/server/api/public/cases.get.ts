import { desc } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, caseApplications } from '../../database/schema'

/**
 * 公开只读案件列表（供官网管理后台 admin.astro 展示用，无认证）。
 * 仅返回精简字段，不暴露联系方式等敏感信息。
 */
export default defineEventHandler(async () => {
  const db = getDb()

  const allCases = db
    .select({
      id: cases.id,
      title: cases.title,
      partyAName: cases.partyAName,
      partyBName: cases.partyBName,
      status: cases.status,
      phase: cases.phase,
      createdAt: cases.createdAt,
      updatedAt: cases.updatedAt,
    })
    .from(cases)
    .orderBy(desc(cases.createdAt))
    .all()

  // 补充申请详情（调解意愿等）
  const apps = db
    .select({
      caseId: caseApplications.caseId,
      mediationWillingness: caseApplications.mediationWillingness,
      applicantName: caseApplications.applicantName,
      respondentName: caseApplications.respondentName,
    })
    .from(caseApplications)
    .all()
  const appMap = new Map(apps.map((a) => [a.caseId, a]))

  const list = allCases.map((c) => {
    const app = appMap.get(c.id)
    return {
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

  return {
    success: true,
    applications: list,
    total: list.length,
  }
})
