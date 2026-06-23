import { getDb } from '~/server/database'
import { cases, agreements, caseActivities } from '~/server/database/schema'
import { eq } from 'drizzle-orm'
import { requireMediator } from '~/server/middleware/auth'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  const user = requireMediator(event)
  const caseId = getRouterParam(event, 'caseNumber')
  const body = await readBody(event)

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const { title, content, performancePlan, breachClauses, isAiGenerated = false } = body

  if (!title || !content) {
    throw createError({ statusCode: 400, message: '协议标题和内容不能为空' })
  }

  // 查询案件
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 验证案件状态
  const allowedPhases = ['negotiating', 'agreement_drafting', 'agreement_pending']
  if (!allowedPhases.includes(caseData.phase)) {
    throw createError({
      statusCode: 400,
      message: '当前案件状态不支持创建协议',
    })
  }

  const agreementId = uuidv4()
  const now = new Date()

  // 创建协议
  await db.insert(agreements).values({
    id: agreementId,
    caseId,
    tenantId: caseData.tenantId,
    title,
    content,
    performancePlan: performancePlan ? JSON.stringify(performancePlan) : null,
    breachClauses: breachClauses ? JSON.stringify(breachClauses) : null,
    status: 'draft',
    version: 1,
    isAiGenerated,
    createdBy: user.userId,
    createdAt: now,
    updatedAt: now,
  })

  // 更新案件状态
  await db.update(cases).set({
    phase: 'agreement_drafting',
    updatedAt: now,
  }).where(eq(cases.id, caseId)).run()

  // 记录活动日志
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId,
    activityType: 'agreement_created',
    description: `调解协议 "${title}" 已创建${isAiGenerated ? '（AI辅助生成）' : ''}`,
    performedBy: user.userId,
    performedByName: user.name,
    relatedId: agreementId,
    relatedType: 'agreement',
    metadata: JSON.stringify({ agreementId, title, isAiGenerated }),
    createdAt: now,
  })

  return {
    success: true,
    data: {
      agreement: {
        id: agreementId,
        caseId,
        title,
        content,
        performancePlan,
        breachClauses,
        status: 'draft',
        version: 1,
        isAiGenerated,
        createdBy: user.userId,
        createdAt: now,
      },
    },
    message: '协议创建成功',
  }
})
