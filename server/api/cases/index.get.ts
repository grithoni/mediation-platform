import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases, mediators } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const mediator = requireAuth(event)
  const db = getDb()

  const allCases = db
    .select({
      id: cases.id, title: cases.title, description: cases.description,
      partyAName: cases.partyAName, partyBName: cases.partyBName,
      partyAContact: cases.partyAContact, partyBContact: cases.partyBContact,
      status: cases.status, phase: cases.phase, mediatorId: cases.mediatorId, mediatorRequestedAt: cases.mediatorRequestedAt, accessCode: cases.accessCode,
      createdAt: cases.createdAt, updatedAt: cases.updatedAt,
      mediatorName: mediators.name,
    })
    .from(cases)
    .leftJoin(mediators, eq(cases.mediatorId, mediators.id))
    .orderBy(desc(cases.createdAt))
    .all()

  // Return all cases + current mediator ID for frontend filtering
  return {
    success: true,
    data: allCases,
    currentMediatorId: mediator.userId,
    currentMediatorRole: mediator.role,
  }
})
