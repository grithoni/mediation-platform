import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../database'
import { messages, cases, sessions } from '../database/schema'

// ============================================================
// In-memory store for connected peers (party only)
// ============================================================
interface PeerMeta {
  type: 'party'
  caseId: string
  name: string
  sessionToken?: string
}

const peerMap = new Map<string, PeerMeta>()

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url || '', 'http://localhost')
    const caseId = url.searchParams.get('caseId')

    if (!caseId) {
      peer.close(4000, '缺少 caseId 参数')
      return
    }

    const db = getDb()

    // Verify case exists
    const caseData = db.select().from(cases).where(eq(cases.id, caseId)).get()
    if (!caseData) {
      peer.close(4001, '案件不存在')
      return
    }

    let peerName = '当事人'
    const peerType: 'party' = 'party'

    // Party access via token param
    const token = url.searchParams.get('token')
    if (!token) {
      peerMap.set(peer.id, { type: 'party', caseId, name: peerName })
    } else {
      const session = db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, token), eq(sessions.caseId, caseId), eq(sessions.isActive, true)))
        .get()

      if (!session) {
        peer.close(4005, '会话无效或已过期')
        return
      }

      peerName = session.partyIdentifier || '当事人'
      peerMap.set(peer.id, { type: 'party', caseId, name: peerName, sessionToken: token })
    }

    // Subscribe to case room
    peer.subscribe(`case:${caseId}`)

    console.log(`[WS] ${peerName} (${peerType}) connected to case ${caseId}`)
  },

  message(peer, msg) {
    const meta = peerMap.get(peer.id)
    if (!meta) return

    let data: any
    try {
      data = typeof msg === 'string' ? JSON.parse(msg) : JSON.parse(msg.text())
    } catch {
      peer.send(JSON.stringify({ type: 'error', data: { message: '消息格式无效' } }))
      return
    }

    const room = `case:${meta.caseId}`

    switch (data.type) {
      case 'message': {
        // Frontend sends: { type: 'message', data: { content } }
        const content = data.data?.content
        if (!content || typeof content !== 'string') return

        const db = getDb()
        const msgId = uuidv4()
        const now = new Date()

        db.insert(messages)
          .values({
            id: msgId,
            caseId: meta.caseId,
            senderType: meta.type,
            senderId: meta.sessionToken || peer.id,
            senderName: meta.name,
            content,
            visibility: 'shared',
          })
          .run()

        // Broadcast format: { type: 'message', data: { id, caseId, senderType, ... } }
        const broadcast = {
          type: 'message',
          data: {
            id: msgId,
            caseId: meta.caseId,
            senderType: meta.type,
            senderId: meta.sessionToken || peer.id,
            senderName: meta.name,
            content,
            createdAt: now.toISOString(),
          },
        }

        peer.publish(room, JSON.stringify(broadcast))
        peer.send(JSON.stringify(broadcast))
        break
      }

      case 'typing': {
        peer.publish(room, JSON.stringify({
          type: 'typing',
          data: {
            senderType: meta.type,
            senderName: meta.name,
            senderId: meta.sessionToken || peer.id,
          },
        }))
        break
      }

      default:
        peer.send(JSON.stringify({ type: 'error', data: { message: `未知消息类型: ${data.type}` } }))
    }
  },

  close(peer) {
    const meta = peerMap.get(peer.id)
    if (meta) {
      const room = `case:${meta.caseId}`

      peer.unsubscribe(room)
      peerMap.delete(peer.id)
      console.log(`[WS] ${meta.name} (${meta.type}) disconnected from case ${meta.caseId}`)
    }
  },

  error(peer, error) {
    console.error(`[WS] Error for peer ${peer.id}:`, error)
    peerMap.delete(peer.id)
  },
})
