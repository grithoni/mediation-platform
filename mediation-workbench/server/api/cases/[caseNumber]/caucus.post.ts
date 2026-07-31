import { getDb } from '~/server/database'
import { cases, messages, caseActivities } from '~/server/database/schema'
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

  const { targetParty, message: messageContent } = body

  // 验证目标方
  if (!targetParty || !['party_a', 'party_b'].includes(targetParty)) {
    throw createError({ statusCode: 400, message: '目标方无效，必须为 party_a 或 party_b' })
  }

  // 查询案件
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 验证案件状态
  if (caseData.phase !== 'mediating' && caseData.phase !== 'caucus') {
    throw createError({
      statusCode: 400,
      message: '当前案件状态不支持单独沟通',
    })
  }

  // 生成 Caucus 会话 ID
  const caucusSessionId = `caucus_${caseId}_${targetParty}_${Date.now()}`
  const now = new Date()

  // 更新案件状态为 caucus
  await db.update(cases).set({
    phase: 'caucus',
    updatedAt: now,
  }).where(eq(cases.id, caseId)).run()

  // 如果有消息，发送到 Caucus 通道
  if (messageContent) {
    await db.insert(messages).values({
      id: uuidv4(),
      caseId,
      senderType: 'mediator',
      senderId: user.userId,
      senderName: user.name,
      content: messageContent,
      channelType: 'caucus',
      caucusSessionId,
      visibility: 'private',
      createdAt: now,
    })
  }

  // 记录活动日志
  await db.insert(caseActivities).values({
    id: uuidv4(),
    caseId,
    activityType: 'caucus_started',
    description: `调解员发起与${targetParty === 'party_a' ? '申请人' : '被申请人'}的单独沟通`,
    performedBy: user.userId,
    performedByName: user.name,
    metadata: JSON.stringify({ targetParty, caucusSessionId }),
    createdAt: now,
  })

  return {
    success: true,
    data: {
      caucusSessionId,
      caseId,
      targetParty,
      mediatorId: user.userId,
      mediatorName: user.name,
      createdAt: now,
    },
    message: '单独沟通会话已创建',
  }
})
