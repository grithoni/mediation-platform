import { getDb } from '~/server/database'
import { cases, caseActivities } from '~/server/database/schema'
import { requireApiAuth } from '~/server/utils/api-auth'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  // API 认证
  const tenantId = await requireApiAuth(event)

  const body = await readBody(event)

  const {
    title,
    description,
    disputeType,
    amount,
    partyAName,
    partyBName,
    partyAContact,
    partyBContact,
    claimsSummary,
    evidenceSummary,
  } = body

  // 验证必填字段
  if (!title || !partyAName || !partyBName) {
    throw createError({
      statusCode: 400,
      message: '案件标题、申请人和被申请人为必填项',
    })
  }

  // 生成案件编号
  const year = new Date().getFullYear()
  const db = getDb()
  const countResult = await db
    .select({ count: db.fn.count() })
    .from(cases)
    .get()
  const caseNumber = `${year}-${(countResult?.count || 0) + 1}`

  // 生成访问码
  const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase()

  const now = new Date()

  // 创建案件
  await db.insert(cases).values({
    id: caseNumber,
    tenantId,
    title,
    description: description || null,
    disputeType: disputeType || null,
    amount: amount || null,
    partyAName,
    partyBName,
    partyAContact: partyAContact || null,
    partyBContact: partyBContact || null,
    claimsSummary: claimsSummary || null,
    evidenceSummary: evidenceSummary || null,
    phase: 'intake',
    status: 'pending',
    accessCode,
    createdAt: now,
    updatedAt: now,
  })

  // 记录活动日志
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId: caseNumber,
    tenantId,
    activityType: 'case_created',
    description: `案件 "${title}" 已通过 API 创建`,
    metadata: JSON.stringify({ source: 'api', title }),
    createdAt: now,
  })

  return {
    success: true,
    data: {
      caseId: caseNumber,
      title,
      phase: 'intake',
      status: 'pending',
      accessCode,
      createdAt: now,
    },
    message: '案件创建成功',
  }
})
