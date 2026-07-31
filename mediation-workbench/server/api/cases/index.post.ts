import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../../database'
import { cases } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)
  const body = await readBody(event)

  if (!body?.title || !body?.partyAName || !body?.partyBName) {
    throw createError({ statusCode: 400, message: '案件标题、甲方名称和乙方名称不能为空' })
  }

  const db = getDb()

  const newCase = {
    id: body.id || `CM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    tenantId: mediator.tenantId || 'tenant-default',
    title: body.title,
    description: body.description || null,
    partyAName: body.partyAName,
    partyBName: body.partyBName,
    partyAContact: body.partyAContact || null,
    partyBContact: body.partyBContact || null,
    status: 'pending' as const,
    mediatorId: body.mediatorId || mediator.id,
    accessCode: body.accessCode || uuidv4().slice(0, 8).toUpperCase(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  db.insert(cases).values(newCase).run()

  return { success: true, data: newCase }
})
