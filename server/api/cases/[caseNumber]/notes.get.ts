import { getDb } from '~/server/database'
import { caseNotes, cases } from '~/server/database/schema'
import { eq, desc, and } from 'drizzle-orm'
import { requireAuth } from '~/server/middleware/auth'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const caseId = getRouterParam(event, 'caseNumber')

  if (!caseId) {
    throw createError({ statusCode: 400, message: '案件ID不能为空' })
  }

  // 验证案件存在
  const db = getDb()
  const caseData = await db.select().from(cases).where(eq(cases.id, caseId)).get()
  if (!caseData) {
    throw createError({ statusCode: 404, message: '案件不存在' })
  }

  // 权限检查
  const allowedRoles = ['admin', 'case_manager', 'mediator']
  if (!allowedRoles.includes(user.role)) {
    throw createError({ statusCode: 403, message: '权限不足' })
  }

  // 查询笔记
  // 调解员只能看到自己的私密笔记和所有公开笔记
  let notes
  if (user.role === 'mediator') {
    notes = await db
      .select()
      .from(caseNotes)
      .where(
        and(
          eq(caseNotes.caseId, caseId),
          // 公开笔记 或 自己的私密笔记
          eq(caseNotes.isPrivate, false)
        )
      )
      .orderBy(desc(caseNotes.createdAt))
      .all()

    // 添加自己的私密笔记
    const privateNotes = await db
      .select()
      .from(caseNotes)
      .where(
        and(
          eq(caseNotes.caseId, caseId),
          eq(caseNotes.isPrivate, true),
          eq(caseNotes.createdBy, user.userId)
        )
      )
      .orderBy(desc(caseNotes.createdAt))
      .all()

    notes = [...notes, ...privateNotes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  } else {
    // 管理员和案件管理员可以看到所有笔记
    notes = await db
      .select()
      .from(caseNotes)
      .where(eq(caseNotes.caseId, caseId))
      .orderBy(desc(caseNotes.createdAt))
      .all()
  }

  return {
    success: true,
    data: {
      caseId,
      notes: notes.map((note) => ({
        id: note.id,
        content: note.content,
        noteType: note.noteType,
        isPrivate: note.isPrivate,
        createdBy: note.createdBy,
        createdByName: note.createdByName,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
      total: notes.length,
    },
  }
})
