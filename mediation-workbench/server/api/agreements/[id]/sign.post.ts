import { getDb } from '~/server/database'
import { agreements, agreementSignatures, cases, users, caseActivities } from '~/server/database/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '~/server/middleware/auth'
import { createESignService } from '~/server/utils/e-signature'
import { v4 as uuidv4 } from 'uuid'
import { phaseAfterSigningStarted } from '~/server/utils/agreement-workflow'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const agreementId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!agreementId) {
    throw createError({ statusCode: 400, message: '协议ID不能为空' })
  }

  const { platform = 'fadada' } = body

  // 查询协议
  const db = getDb()
  const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get()
  if (!agreement) {
    throw createError({ statusCode: 404, message: '协议不存在' })
  }

  // 验证协议状态
  if (agreement.status !== 'approved') {
    throw createError({
      statusCode: 400,
      message: '协议尚未双方确认，无法发起签署',
    })
  }

  // 查询案件
  const caseData = await db.select().from(cases).where(eq(cases.id, agreement.caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 权限检查
  if (!['mediator', 'case_manager', 'admin'].includes(user.role)) {
    throw createError({ statusCode: 403, message: '只有调解员可以发起签署' })
  }

  // 查询申请人和被申请人信息
  const partyA = caseData.partyAUserId
    ? await db.select().from(users).where(eq(users.id, caseData.partyAUserId)).get()
    : null
  const partyB = caseData.partyBUserId
    ? await db.select().from(users).where(eq(users.id, caseData.partyBUserId)).get()
    : null

  const now = new Date()

  // 创建签署记录
  const signatures = []

  // 申请人签署
  if (partyA) {
    const signId = uuidv4()
    await db.insert(agreementSignatures).values({
      id: signId,
      agreementId,
      caseId: agreement.caseId,
      signerType: 'party_a',
      signerId: partyA.id,
      signerName: partyA.name,
      platform,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    signatures.push({ id: signId, type: 'party_a', name: partyA.name })
  }

  // 被申请人签署
  if (partyB) {
    const signId = uuidv4()
    await db.insert(agreementSignatures).values({
      id: signId,
      agreementId,
      caseId: agreement.caseId,
      signerType: 'party_b',
      signerId: partyB.id,
      signerName: partyB.name,
      platform,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    signatures.push({ id: signId, type: 'party_b', name: partyB.name })
  }

  // 调解员签署
  if (caseData.mediatorId) {
    const mediator = await db.select().from(users).where(eq(users.id, caseData.mediatorId)).get()
    if (mediator) {
      const signId = uuidv4()
      await db.insert(agreementSignatures).values({
        id: signId,
        agreementId,
        caseId: agreement.caseId,
        signerType: 'mediator',
        signerId: mediator.id,
        signerName: mediator.name,
        platform,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      signatures.push({ id: signId, type: 'mediator', name: mediator.name })
    }
  }

  // 更新协议状态
  await db.update(agreements).set({
    status: 'signing',
    updatedAt: now,
  }).where(eq(agreements.id, agreementId)).run()

  // 更新案件状态
  await db.update(cases).set({
    phase: phaseAfterSigningStarted(),
    updatedAt: now,
  }).where(eq(cases.id, agreement.caseId)).run()

  // 记录活动日志
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId: agreement.caseId,
    activityType: 'signing_initiated',
    description: `电子签署已发起，平台：${platform === 'fadada' ? '法大大' : '上上签'}`,
    performedBy: user.userId,
    performedByName: user.name,
    relatedId: agreementId,
    relatedType: 'agreement',
    metadata: JSON.stringify({ agreementId, platform, signatures }),
    createdAt: now,
  })

  // 注意：实际项目中需要调用电子签署平台 API 创建签署任务
  // 这里返回模拟数据
  return {
    success: true,
    data: {
      agreementId,
      platform,
      signatures,
      status: 'signing',
      message: '签署任务已创建，等待各方签署',
    },
    message: '电子签署已发起',
  }
})
