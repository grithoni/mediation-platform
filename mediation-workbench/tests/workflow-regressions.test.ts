import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
      'query_case_materials',
      'desensitize_case_materials',
      'analyze_with_mediation_skills',
      'restore_analysis_result',
      'writeback_case_analysis',
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

test('mediation agent tool catalog exposes MCP-oriented case analysis tools', async () => {
  const { buildMediationToolCatalog } = await import('../server/utils/mediation-agent')
  const tools = buildMediationToolCatalog()

  assert.equal(tools.some(tool => tool.function.name === 'query_case_materials'), true)
  assert.equal(tools.some(tool => tool.function.name === 'desensitize_case_materials'), true)
  assert.equal(tools.some(tool => tool.function.name === 'restore_analysis_result'), true)
})

test('mediation agent runner executes GA loop with desensitize and restore tool chain', async () => {
  const { runMediationAgentTask } = await import('../server/utils/mediation-agent')
  const seenMessages: string[] = []

  const result = await runMediationAgentTask({
    caseId: '2026-1',
    task: '请完成案件分析',
    llmCall: async function* (messages) {
      seenMessages.push(messages[messages.length - 1]?.content || '')
      if (messages.length === 2) {
        return {
          content: '',
          toolCalls: [
            { toolName: 'query_case_materials', args: {} },
            { toolName: 'desensitize_case_materials', args: {} },
          ],
        }
      }

      if (messages.length === 3) {
        return {
          content: '',
          toolCalls: [
            { toolName: 'restore_analysis_result', args: { maskedResult: '[申请人_1]要求返还货款。' } },
          ],
        }
      }

      return {
        content: '已完成分析。',
        toolCalls: [],
      }
    },
    handlers: {
      query_case_materials: async () => ({
        data: { materials: '张三与李四货款争议' },
        nextPrompt: '已读取案件材料。',
      }),
      desensitize_case_materials: async () => ({
        data: { maskedMaterials: '[申请人_1]与[被申请人_1]货款争议', traceId: 'trace-123' },
        nextPrompt: '已完成本地脱敏。',
      }),
      restore_analysis_result: async ({ maskedResult }) => ({
        data: { restored: String(maskedResult).replace('[申请人_1]', '张三') },
        nextPrompt: '已完成反脱敏，请输出最终结论。',
      }),
    },
  })

  assert.equal(result.executedTools.includes('query_case_materials'), true)
  assert.equal(result.executedTools.includes('desensitize_case_materials'), true)
  assert.equal(result.executedTools.includes('restore_analysis_result'), true)
  assert.equal(result.finalText.includes('已完成分析'), true)
  assert.equal(seenMessages.length >= 2, true)
})

test('mediation background analysis writes back agent analysis and checklist', async () => {
  await withTempProjectDir(async () => {
    const db = getDb()
    const now = Date.now()

    db.insert(cases).values({
      id: '2026-9',
      title: '货款争议',
      description: '申请人称被申请人拖欠货款。',
      partyAName: '张三',
      partyBName: '李四',
      accessCode: 'CODE9',
      phase: 'analysis',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }).run()

    db.insert(caseDynamicFiles).values({
      id: 'cdf-9',
      caseId: '2026-9',
      agentStatus: 'processing',
      createdAt: now,
      updatedAt: now,
    }).run()

    const { runMediationBackgroundAnalysis } = await import('../server/utils/mediation-agent')
    const result = await runMediationBackgroundAnalysis('2026-9', {
      handlers: {
        query_case_materials: async () => ({
          data: { materials: '张三要求李四支付货款。' },
          nextPrompt: '已读取案件材料。',
        }),
        desensitize_case_materials: async () => ({
          data: { maskedMaterials: '[申请人_1]要求[被申请人_1]支付货款。', traceId: 'trace-bg' },
          nextPrompt: '已完成本地脱敏。',
        }),
        analyze_with_mediation_skills: async ({ analysisType }) => ({
          data: {
            analysisType,
            content: analysisType === 'claim_basis'
              ? '[申请人_1]对[被申请人_1]享有货款请求权。'
              : '请补充付款凭证与对账单。',
          },
          nextPrompt: '已生成脱敏分析。',
        }),
        restore_analysis_result: async ({ maskedResult }) => ({
          data: {
            restored: String(maskedResult)
              .replaceAll('[申请人_1]', '张三')
              .replaceAll('[被申请人_1]', '李四'),
          },
          nextPrompt: '已完成反脱敏。',
        }),
      },
    })

    assert.equal(result.agentAnalysis.includes('张三'), true)
    assert.equal(result.materialChecklist.includes('付款凭证'), true)

    const updated = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, '2026-9')).get()
    assert.equal(updated?.agentStatus, 'done')
    assert.equal(updated?.agentAnalysis?.includes('请求权'), true)
    assert.equal(updated?.materialChecklist?.includes('对账单'), true)
  })
})
