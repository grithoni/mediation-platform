import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getDb, initTestDb, resetDb } from '../server/database'
import { cases, sessions } from '../server/database/schema'
import {
  classifyMessageActor,
  resolvePartySessionToken,
} from '../server/utils/chat-workflow'
import {
  buildSkillCatalog,
  runDesensitizedSkillWorkflow,
} from '../server/utils/case-analysis-orchestrator'

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

test('desensitized skill workflow masks outbound materials and restores final output', async () => {
  const events: string[] = []

  const result = await runDesensitizedSkillWorkflow({
    analysisType: 'dynamic_file',
    materials: '申请人张三主张被申请人李四支付货款，联系电话 13800138000。',
    partyNames: ['张三', '李四'],
    addresses: [],
    skillCatalog: [
      {
        id: 'timeline-skill',
        name: '时间线梳理',
        description: '抽取关键时间线与争议节点',
        source: 'builtin',
      },
    ],
    desensitize: async (materials) => {
      events.push('desensitize')
      assert.equal(materials.includes('张三'), true)
      return {
        maskedText: '申请人[申请人_1]主张被申请人[被申请人_1]支付货款，联系电话 [电话_1]。',
        traceId: 'trace-1',
        mapping: {
          '[申请人_1]': '张三',
          '[被申请人_1]': '李四',
          '[电话_1]': '13800138000',
        },
      }
    },
    analyzeWithCloudSkills: async ({ maskedMaterials, skillPrompt, analysisType }) => {
      events.push('cloud')
      assert.equal(analysisType, 'dynamic_file')
      assert.equal(maskedMaterials.includes('张三'), false)
      assert.equal(maskedMaterials.includes('[申请人_1]'), true)
      assert.equal(skillPrompt.includes('时间线梳理'), true)
      return JSON.stringify({
        timeline: '[申请人_1]于2026年1月催款，[被申请人_1]未付款，可联系电话 [电话_1]。',
        disputeChecklist: '货款支付争议',
      })
    },
    restore: async ({ traceId, text, mapping }) => {
      events.push('restore')
      assert.equal(traceId, 'trace-1')
      let restored = text
      for (const [token, value] of Object.entries(mapping)) {
        restored = restored.replaceAll(token, value)
      }
      return restored
    },
  })

  assert.deepEqual(events, ['desensitize', 'cloud', 'restore'])
  assert.equal(result.maskedMaterials.includes('张三'), false)
  assert.equal(result.restoredOutput.includes('张三'), true)
  assert.equal(result.restoredOutput.includes('13800138000'), true)
})

test('skill catalog includes uploaded enabled skills ahead of builtin defaults', () => {
  return withTempProjectDir(() => {
    mkdirSync(join(process.cwd(), 'uploads', 'skills', 'custom-skill'), { recursive: true })
    writeFileSync(
      join(process.cwd(), 'uploads', 'skills', '.skills.json'),
      JSON.stringify([
        {
          id: 'custom-1',
          name: '证据核验',
          version: '1.0.0',
          description: '检查证据链完整性',
          dirName: 'custom-skill',
          fileCount: 1,
          installedAt: new Date().toISOString(),
          installedBy: 'tester',
          enabled: true,
        },
      ]),
    )
    writeFileSync(
      join(process.cwd(), 'uploads', 'skills', 'custom-skill', 'manifest.json'),
      JSON.stringify({
        name: '证据核验',
        description: '检查证据链完整性',
        prompt: '重点检查证据原件、来源和证明目的是否一致。',
      }),
    )

    const catalog = buildSkillCatalog()
    assert.equal(catalog[0]?.name, '证据核验')
    assert.equal(catalog.some(skill => skill.source === 'builtin'), true)
    assert.equal(catalog[0]?.prompt?.includes('证据原件'), true)
  })
})

test('desensitization does not treat verb phrases after role words as names', async () => {
  await withTempProjectDir(async () => {
    const { desensitizeCaseMaterials } = await import('../server/utils/case-analysis-orchestrator')
    const result = await desensitizeCaseMaterials('乙方签订合同，甲方付款。被申请人主张违约金过高，乙方与甲方签订补充协议。', {
      knownEntities: [],
      partyNames: [],
      addresses: [],
    })

    // 纯动词/术语短语不应被当作角色姓名掩掉
    assert.equal(result.maskedText.includes('签订合同'), true)
    assert.equal(result.maskedText.includes('付款'), true)
    assert.equal(result.maskedText.includes('主张违约金'), true)
    assert.equal(result.maskedText.includes('与甲方签订'), true)
    assert.equal(result.mapping['[被申请人_1]'], undefined)
  })
})

test('desensitization recognizes new roles (上诉人/被上诉人/第三人/当事人) and masks them', async () => {
  await withTempProjectDir(async () => {
    const { desensitizeCaseMaterials } = await import('../server/utils/case-analysis-orchestrator')
    const text = '上诉人王五不服一审判决提出上诉，被上诉人张三应诉，第三人赵六到庭。'
    const result = await desensitizeCaseMaterials(text, {
      knownEntities: [],
      partyNames: [],
      addresses: [],
    })

    // 新角色下的姓名都被掩掉
    assert.equal(result.maskedText.includes('王五'), false)
    assert.equal(result.maskedText.includes('张三'), false)
    assert.equal(result.maskedText.includes('赵六'), false)
    assert.equal(result.maskedText.includes('[上诉人_1]'), true)
    assert.equal(result.maskedText.includes('[被上诉人_1]'), true)
    assert.equal(result.maskedText.includes('[第三人_1]'), true)
  })
})

test('residual PII scan detects leaks and passes clean text', async () => {
  const { scanForResidualPii } = await import('../server/utils/case-analysis-orchestrator')

  // 漏网的正则 PII（模拟脱敏层漏掩）
  const leaky = scanForResidualPii('双方协商未果，电话13800138000。', {
    partyNames: [],
    addresses: [],
    knownEntities: [],
  })
  assert.equal(leaky.includes('13800138000'), true)

  // 残留的已知实体子串
  const nameLeak = scanForResidualPii('申请人李明已到庭', {
    partyNames: ['李明'],
    addresses: [],
    knownEntities: [],
  })
  assert.equal(nameLeak.includes('李明'), true)

  // 干净文本不误报
  const clean = scanForResidualPii('[申请人_1]要求[被申请人_1]支付货款', {
    partyNames: ['张三', '李四'],
    addresses: ['北京市朝阳区'],
    knownEntities: [],
  })
  assert.equal(clean.length, 0)
})

test('desensitization mapping persists encrypted and round-trips via traceId', async () => {
  await withTempProjectDir(async () => {
    const { desensitizeCaseMaterials } = await import('../server/utils/case-analysis-orchestrator')
    const { persistDesensitization, loadDesensitization } = await import('../server/utils/desensitization-store')

    const result = await desensitizeCaseMaterials('张三与李四货款争议，张三次日付款。', {
      knownEntities: [],
      partyNames: ['张三', '李四'],
      addresses: [],
    })

    // desensitize 本身不再合成 traceId
    assert.equal(result.traceId, undefined)

    const traceId = persistDesensitization('2026-1', result.mapping)
    assert.match(traceId, /^2026-1-\d+$/)

    const restored = loadDesensitization(traceId)
    assert.deepEqual(restored, result.mapping)

    // 未知 traceId 返回空
    assert.deepEqual(loadDesensitization('2026-1-9999999999999'), {})
  })
})
