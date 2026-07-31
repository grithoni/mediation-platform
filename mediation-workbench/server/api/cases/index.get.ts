import { desc, eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases } from '../../database/schema'
import { requireAuth } from '../../middleware/auth'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const db = getDb()

  const allCases = db
    .select({
      id: cases.id, title: cases.title, description: cases.description,
      partyAName: cases.partyAName, partyBName: cases.partyBName,
      partyAContact: cases.partyAContact, partyBContact: cases.partyBContact,
      status: cases.status, phase: cases.phase, mediatorId: cases.mediatorId, mediatorRequestedAt: cases.mediatorRequestedAt, accessCode: cases.accessCode,
      createdAt: cases.createdAt, updatedAt: cases.updatedAt,
    })
    .from(cases)
    .orderBy(desc(cases.createdAt))
    .all()

  // Return all cases + current user ID for frontend filtering
  return {
    success: true,
    data: allCases,
    currentMediatorId: user.userId,
    currentMediatorRole: user.role,
  }
})
