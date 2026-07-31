import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'

import { getDb, initTestDb, resetDb } from '../server/database'
import { cases, caseDynamicFiles, sessions } from '../server/database/schema'
import {
  getAgentEnabledToolNames,
  claimPendingAgentCases,
} from '../server/utils/agent/capabilities'
import {
  classifyMessageActor,
  resolvePartySessionToken,
} from '../server/utils/chat-workflow'
import {
  phaseAfterAgreementApproval,
  phaseAfterSigningStarted,
} from '../server/utils/agreement-workflow'

function withTempProjectDir<T>(fn: () => T | Promise<T>) {
  const previousCwd = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'mediation-workbench-test-'))
  process.chdir(dir)
  resetDb()
  initTestDb()
  return Promise.resolve(fn()).finally(() => {
    resetDb()
    process.chdir(previousCwd)
    rmSync(dir, { recursive: true, force: true })
  })
}

test('party session tokens resolve from session id for follow-up messaging', async () => {
  await withTempProjectDir(() => {
    const db = getDb()
    db.insert(cases).values({
      id: '2026-1',
      title: '测试案件',
      partyAName: '甲',
      partyBName: '乙',
      accessCode: 'CODE1',
      phase: 'intake',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run()

    db.insert(sessions).values({
      id: 'session-123',
      caseId: '2026-1',
      partyIdentifier: 'party-a',
      isActive: true,
      createdAt: Date.now(),
    }).run()

    const resolved = resolvePartySessionToken(db, {
      caseId: '2026-1',
      sessionToken: 'session-123',
    })

    assert.equal(resolved?.id, 'session-123')
    assert.equal(resolved?.partyIdentifier, 'party-a')
  })
})

test('authenticated mediator users are classified as mediator actors in main auth flow', () => {
  const actor = classifyMessageActor({
    user: {
      userId: 'med-1',
      username: 'mediator',
      role: 'mediator',
      name: '调解员',
    },
    mediator: null,
  })

  assert.equal(actor.kind, 'mediator')
  assert.equal(actor.userId, 'med-1')
})

test('agent capability list keeps document-reading and search tools enabled', () => {
  const toolNames = getAgentEnabledToolNames()

  assert.deepEqual(
    toolNames,
    [
      'ask_user',
      'update_working_checkpoint',
      'search_legal_knowledge',
      'read_dynamic_file',
      'update_dynamic_file',
      'search_information',
      'file_read',
      'read_docx',
      'file_patch',
      'file_write',
    ],
  )
})

test('pending external agent cases can be claimed and transition to processing', async () => {
  await withTempProjectDir(() => {
    const db = getDb()
    const now = Date.now()

    db.insert(cases).values({
      id: '2026-2',
      title: '待分析案件',
      partyAName: '甲',
      partyBName: '乙',
      accessCode: 'CODE2',
      phase: 'analysis',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }).run()

    db.insert(caseDynamicFiles).values({
      id: 'cdf-1',
      caseId: '2026-2',
      agentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    }).run()

    const claimed = claimPendingAgentCases(db, { limit: 10, now: now + 1000 })

    assert.equal(claimed.length, 1)
    assert.equal(claimed[0]?.caseId, '2026-2')

    const updated = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, '2026-2')).get()
    assert.equal(updated?.agentStatus, 'processing')
    assert.equal(updated?.agentUpdatedAt, now + 1000)
  })
})

test('agreement approval and signing use distinct workflow phases', () => {
  assert.equal(phaseAfterAgreementApproval(false), 'agreement_pending')
  assert.equal(phaseAfterAgreementApproval(true), 'agreement_pending')
  assert.equal(phaseAfterSigningStarted(), 'signing')
})
