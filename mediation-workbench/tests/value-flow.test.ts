import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getDb, resetDb } from '../server/database'
import { caseApplications, caseAnalyses, caseDynamicFiles, cases, documents } from '../server/database/schema'

const { runMigrations } = await import('../server/database/migrate')

async function withTempProjectDir<T>(fn: () => T | Promise<T>) {
  const previousCwd = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'mediation-value-flow-test-'))
  process.chdir(dir)
  resetDb()
  getDb()
  runMigrations((getDb().$client as any))
  return Promise.resolve(fn()).finally(() => {
    resetDb()
    process.chdir(previousCwd)
    rmSync(dir, { recursive: true, force: true })
  })
}

test('initial VALUE pipeline writes summary, checklist and advances case flow', async () => {
  const { runInitialValuePipeline, getValueStatus } = await import('../server/utils/value-skills')

  await withTempProjectDir(async () => {
    const db = getDb()
    const now = Date.now()
    db.insert(cases).values({
      id: '2026-1',
      title: '货款纠纷',
      description: '申请人主张被申请人拖欠货款',
      partyAName: '甲公司',
      partyBName: '乙公司',
      accessCode: '123',
      phase: 'intake',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }).run()
    db.insert(caseApplications).values({
      id: '2026-1',
      caseId: '2026-1',
      applicantName: '甲公司',
      respondentName: '乙公司',
      caseFacts: '双方签有供货合同，乙公司尚欠货款。',
      disputeMatters: '是否应支付剩余货款及违约金',
      mediationDemands: '支付货款与违约金',
      demandsBasis: '合同约定与对账单',
      createdAt: now,
      updatedAt: now,
    }).run()

    await runInitialValuePipeline('2026-1', {
      runSkill: async (_caseId, skillId) => `VALUE-${skillId}-RESULT`,
    })

    const flowCase = db.select().from(cases).all().find((row) => row.id === '2026-1')
    assert.equal(flowCase?.phase, 'reviewing')
    assert.equal(flowCase?.status, 'active')

    const analyses = db.select().from(caseAnalyses).all()
    assert.equal(analyses.some((row) => row.analysisType === 'value_v2'), true)
    assert.equal(analyses.some((row) => row.analysisType === 'value_v4'), true)

    const status = getValueStatus('2026-1')
    assert.equal(status.v2?.done, true)
    assert.equal(status.v4?.done, true)
  })
})

test('public case analysis materials include uploaded attachment text', async () => {
  const { buildPublicCaseAnalysisMaterials } = await import('../server/utils/public-case-analysis')

  await withTempProjectDir(async () => {
    const db = getDb()
    const now = Date.now()
    const uploadDir = join(process.cwd(), 'uploads', 'cases', '2026-1')
    mkdirSync(uploadDir, { recursive: true })
    writeFileSync(join(uploadDir, 'evidence.txt'), '附件写明：2026年1月10日已完成对账，剩余货款20万元。')

    db.insert(cases).values({
      id: '2026-1',
      title: '买卖合同纠纷',
      description: '争议焦点围绕货款结算',
      partyAName: '甲公司',
      partyBName: '乙公司',
      accessCode: '123',
      phase: 'intake',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }).run()
    db.insert(caseApplications).values({
      id: '2026-1',
      caseId: '2026-1',
      applicantName: '甲公司',
      respondentName: '乙公司',
      caseFacts: '双方存在供货与对账事实。',
      disputeMatters: '剩余货款是否应支付',
      createdAt: now,
      updatedAt: now,
    }).run()
    db.insert(documents).values({
      id: 'doc-1',
      caseId: '2026-1',
      filename: 'evidence.txt',
      originalName: 'evidence.txt',
      path: 'uploads/cases/2026-1/evidence.txt',
      mimeType: 'text/plain',
      size: 64,
      category: 'evidence',
      createdAt: now,
    }).run()

    const materials = await buildPublicCaseAnalysisMaterials('2026-1')
    assert.equal(materials.includes('剩余货款20万元'), true)
    assert.equal(materials.includes('附件材料'), true)
  })
})

test('VALUE workflow no longer exposes legacy solve entrypoints', () => {
  const projectRoot = process.cwd()

  assert.equal(existsSync(join(projectRoot, 'server', 'api', 'solve', 'index.get.ts')), false)
  assert.equal(existsSync(join(projectRoot, 'server', 'api', 'cases', '[caseNumber]', 'solve', 'index.get.ts')), false)
  assert.equal(existsSync(join(projectRoot, 'server', 'api', 'cases', '[caseNumber]', 'solve', '[skillId].post.ts')), false)
  assert.equal(existsSync(join(projectRoot, 'server', 'utils', 'solve-skills.ts')), false)

  const agentsPage = readFileSync(join(projectRoot, 'pages', 'mediator', 'agents.vue'), 'utf8')
  assert.equal(agentsPage.includes('/api/solve'), false)
  assert.equal(agentsPage.includes('?solve='), false)
})

test('VALUE phases keep acronym alignment and match mediation workflow intent', async () => {
  const { VALUE_PHASES } = await import('../server/utils/value-skills')

  assert.deepEqual(
    VALUE_PHASES.map((phase) => [phase.key, phase.en]),
    [
      ['V', 'Verify the Case'],
      ['A', 'Activate the Process'],
      ['L', 'Listen'],
      ['U', 'Unify the Options'],
      ['E', 'Execute the Resolution'],
    ],
  )
})
