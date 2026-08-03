import { getDb } from '~/server/database'
import { agreements, cases, caseActivities } from '~/server/database/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '~/server/middleware/auth'
import { v4 as uuidv4 } from 'uuid'
import { phaseAfterAgreementApproval } from '~/server/utils/agreement-workflow'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const agreementId = getRouterParam(event, 'id')

  if (!agreementId) {
    throw createError({ statusCode: 400, message: '协议ID不能为空' })
  }

  // 查询协议
  const db = getDb()
  const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get()
  if (!agreement) {
    throw createError({ statusCode: 404, message: '协议不存在' })
  }

  // 查询案件
  const caseData = await db.select().from(cases).where(eq(cases.id, agreement.caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 验证协议状态
  if (agreement.status !== 'draft' && agreement.status !== 'pending_approval') {
    throw createError({
      statusCode: 400,
      message: '当前协议状态不允许审批',
    })
  }

  // 确定审批方
  const isPartyA = caseData.partyAUserId === user.userId
  const isPartyB = caseData.partyBUserId === user.userId
  const isMediator = ['mediator', 'case_manager', 'admin'].includes(user.role)

  if (!isPartyA && !isPartyB && !isMediator) {
    throw createError({ statusCode: 403, message: '权限不足' })
  }

  const now = Date.now()
  const updateData: any = {
    updatedAt: now,
  }

  // 更新审批状态
  if (isPartyA) {
    updateData.approvedByPartyA = true
  } else if (isPartyB) {
    updateData.approvedByPartyB = true
  }

  // 检查是否双方都已审批
  const newApprovedByPartyA = isPartyA ? true : agreement.approvedByPartyA
  const newApprovedByPartyB = isPartyB ? true : agreement.approvedByPartyB

  if (newApprovedByPartyA && newApprovedByPartyB) {
    updateData.status = 'approved'
    updateData.approvedAt = now

    // 更新案件状态
    await db.update(cases).set({
      phase: phaseAfterAgreementApproval(true),
      updatedAt: now,
    }).where(eq(cases.id, agreement.caseId)).run()
  } else {
    updateData.status = 'pending_approval'
    await db.update(cases).set({
      phase: phaseAfterAgreementApproval(false),
      updatedAt: now,
    }).where(eq(cases.id, agreement.caseId)).run()
  }

  // 更新协议
  await db.update(agreements).set(updateData).where(eq(agreements.id, agreementId)).run()

  // 记录活动日志
  const partyName = isPartyA ? '申请人' : isPartyB ? '被申请人' : '调解员'
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId: agreement.caseId,
    activityType: 'agreement_approved',
    description: `${partyName}已确认协议 "${agreement.title}"`,
    performedBy: user.userId,
    performedByName: user.name,
    relatedId: agreementId,
    relatedType: 'agreement',
    metadata: JSON.stringify({
      agreementId,
      approvedBy: isPartyA ? 'party_a' : isPartyB ? 'party_b' : 'mediator',
      allApproved: newApprovedByPartyA && newApprovedByPartyB,
    }),
    createdAt: now,
  })

  return {
    success: true,
    data: {
      agreementId,
      status: updateData.status,
      approvedByPartyA: newApprovedByPartyA,
      approvedByPartyB: newApprovedByPartyB,
      allApproved: newApprovedByPartyA && newApprovedByPartyB,
    },
    message: newApprovedByPartyA && newApprovedByPartyB
      ? '协议已双方确认，可以进行电子签署'
      : '协议确认成功，等待对方确认',
  }
})
