import { getDb } from '~/server/database'
import { caseNotes, cases } from '~/server/database/schema'
import { eq } from 'drizzle-orm'
import { requireMediator } from '~/server/middleware/auth'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  // 只有调解员、案件管理员和管理员可以添加笔记
  const user = requireMediator(event)
  const caseId = getRouterParam(event, 'caseNumber')
  const body = await readBody(event)

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  const { content, noteType = 'general', isPrivate = false } = body

  if (!content || content.trim().length === 0) {
    throw createError({ statusCode: 400, message: '笔记内容不能为空' })
  }

  // 验证案件存在
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 验证笔记类型
  const validNoteTypes = ['general', 'observation', 'strategy', 'risk']
  if (!validNoteTypes.includes(noteType)) {
    throw createError({ statusCode: 400, message: '笔记类型无效' })
  }

  const noteId = uuidv4()
  const now = new Date()

  // 创建笔记
  await db.insert(caseNotes).values({
    id: noteId,
    caseId,
    content: content.trim(),
    noteType,
    isPrivate,
    createdBy: user.userId,
    createdByName: user.name,
    createdAt: now,
    updatedAt: now,
  })

  return {
    success: true,
    data: {
      id: noteId,
      caseId,
      content: content.trim(),
      noteType,
      isPrivate,
      createdBy: user.userId,
      createdByName: user.name,
      createdAt: now,
    },
    message: '笔记添加成功',
  }
})
