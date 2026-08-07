# 代码修复计划 - 按优先级执行

## 🔴 **第一阶段：P0 关键安全修复（预计 12 小时）**

### 任务 1: 修复 traceId 双重生成问题 ✗
**优先级**: P0 | **风险**: 数据泄露、审计链断裂
**状态**: TODO
**文件**: 
- `server/utils/case-analysis-orchestrator.ts` (line 690, 198-202)

**变更内容**:
```diff
// desensitizeCaseMaterials 不再生成 traceId
export async function desensitizeCaseMaterials(...) {
  // ...
  return {
    maskedText,
-   traceId: `trace-${Date.now()}`,  // 删除这行
+   traceId: undefined,  // 改为 undefined
    mapping,
  }
}

// runDesensitizedSkillWorkflow 负责管理 traceId 生命周期
export async function runDesensitizedSkillWorkflow(options: WorkflowRunOptions) {
  const desensitized = await desensitize(options.materials)
  
  // 持久化映射并获取唯一的 traceId
  const traceId = persistDesensitization(
    (options as any).caseNumber || (options as any).caseId || 'TEXT',
    desensitized.mapping || {},
  )
  desensitized.traceId = traceId
  
  // ... 后续使用这个 traceId
}
```

**测试**:
```bash
npm run test -- --grep "traceId"
# 验证：
# 1. traceId 被正确分配一次
# 2. mapping 正确持久化与恢复
# 3. 无重复生成的 traceId
```

**验收标准**:
- [ ] desensitizeCaseMaterials 不再生成 traceId
- [ ] runDesensitizedSkillWorkflow 正确管理生命周期
- [ ] 所有调用路径（ai-welcome, dynamic-file, 结构化分析）都通过 test

---

### 任务 2: 提取文件读取模块（消除 3 处重复代码） ✗
**优先级**: P0 | **风险**: 维护困难、不一致的bug
**状态**: TODO
**文件**:
- 创建: `server/utils/file-extraction.ts`
- 更新: `ai-welcome.ts`, `case-analysis-orchestrator.ts`, `extract-info.post.ts`

**实现步骤**:
```bash
# 1. 创建统一的文件提取模块
cat > mediation-workbench/server/utils/file-extraction.ts << 'EOF'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const EXTRACT_TIMEOUT = 10000  // 10秒
const MAX_BUFFER_SIZE = 5 * 1024 * 1024  // 5MB

/**
 * 从文件提取文本内容
 * 支持: PDF (pdftotext), DOCX/DOC (textutil on macOS), 纯文本
 * 返回: 提取的文本或空字符串（失败时）
 */
export function extractFileText(
  filePath: string,
  filename: string,
  options: { maxLength?: number } = {}
): string {
  const lower = filename.toLowerCase()
  const maxLen = options.maxLength || 50000

  try {
    if (lower.endsWith('.pdf')) {
      return execSync(`pdftotext -layout "${filePath}" -`, {
        encoding: 'utf-8',
        timeout: EXTRACT_TIMEOUT,
        maxBuffer: MAX_BUFFER_SIZE,
      }).slice(0, maxLen)
    }
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      return execSync(`textutil -convert txt -stdout "${filePath}"`, {
        encoding: 'utf-8',
        timeout: EXTRACT_TIMEOUT,
        maxBuffer: MAX_BUFFER_SIZE,
      }).slice(0, maxLen)
    }
    // 默认当作纯文本
    return readFileSync(filePath, 'utf-8').slice(0, maxLen)
  } catch (error) {
    console.warn(`[extractFileText] Failed for ${filename}:`, error)
    return ''
  }
}
EOF

# 2. 在 ai-welcome.ts 中使用
# 替换 lines 28-40 为：
# const { extractFileText } = await import('./file-extraction')
# for (const doc of docs.slice(0, 2)) {
#   const text = extractFileText(doc.path, doc.originalName, { maxLength: 3000 })
#   fileContent += `\n【${doc.originalName}】\n${text}\n`
# }

# 3. 在 case-analysis-orchestrator.ts 中使用
# 替换 extractDocumentText 函数为导入 + 调用

# 4. 测试验证
npm run test -- --grep "file-extraction"
```

**验收标准**:
- [ ] `server/utils/file-extraction.ts` 存在且导出 `extractFileText`
- [ ] 三处重复代码已替换为导入调用
- [ ] 文件大小限制、超时等参数一致
- [ ] 单元测试覆盖 PDF/DOCX/TXT 三种类型

---

### 任务 3: 修复建案竞态与完整回滚 ✗
**优先级**: P0 | **风险**: 磁盘泄露、DB不一致
**状态**: TODO
**文件**: `server/api/cases/create.post.ts` (lines 260-340)

**变更逻辑**:
```diff
// 原顺序: 写文件 → 插DB → 成功
// 新顺序: 插DB(+ledger) → 写文件(+重试) → 清理异步处理

export function createCaseWithFiles(...) {
  // ... 前置验证 ...
  
  // 第1步: 保证 ledger + case 记录原子性
  if (ledgerAvailable) {
    insertLedgerEntry(db, requestId!, caseNumber)
  }
  db.insert(cases).values({...}).run()
  db.insert(caseApplications).values({...}).run()
  
  const writtenFiles: string[] = []
  
  try {
    // 第2步: 写文件（失败则回滚DB）
    const uploadDir = resolve(process.cwd(), 'uploads', 'cases', caseNumber)
    mkdirSync(uploadDir, { recursive: true })
    
    for (const file of files) {
      const filePath = resolve(uploadDir, safeFilename)
      writeFileSync(filePath, file.data)  // 成功才加入
      writtenFiles.push(filePath)
      
      db.insert(documents).values({...}).run()
    }
    
    return { result: {...}, created: true }
  } catch (err) {
    // 第3步: 失败回滚 DB（同步）
    for (const id of insertedDocIds) {
      db.delete(documents).where(...).run()
    }
    db.delete(caseApplications).where(...).run()
    db.delete(cases).where(...).run()
    if (ledgerClaimed) {
      deleteLedgerEntry(db, requestId!)
    }
    
    // 第4步: 异步后台清理磁盘（允许失败，重试机制）
    cleanupUploadedFilesAsync(caseNumber, writtenFiles)
      .catch(err => logger.warn(`[cleanup] ${caseNumber}: ${err.message}`))
    
    throw err
  }
}

/** 异步清理，可重试 */
async function cleanupUploadedFilesAsync(caseNumber: string, files: string[]) {
  for (const file of files) {
    try {
      await fs.promises.unlink(file)
      logger.debug(`[cleanup] Deleted ${file}`)
    } catch (err) {
      // 记录但不中断其他清理
      logger.warn(`[cleanup] Failed to delete ${file}: ${err}`)
    }
  }
}
```

**测试**:
```bash
# 模拟 DB 插入失败
npm run test -- --grep "create-case" 
# 验证磁盘文件已清理
```

**验收标准**:
- [ ] 建案成功时所有文件、DB 记录、ledger 一致
- [ ] DB 插入失败时 ledger 被清理、文件被异步清理
- [ ] 磁盘文件删除异常不导致回滚失败

---

### 任务 4: 强化 public/case-context 脱敏策略 ✗
**优先级**: P0 | **风险**: PII token 映射曝光
**状态**: TODO
**文件**: `server/api/public/case-context.post.ts`

**变更**:
```diff
// 当前: 返回脱敏摘要 + traceId
// 修复: 返回完全脱敏摘要，traceId 仅用于后端内部

export default defineEventHandler(async (event) => {
  // ... 验证 accessCode ...
  
  // 构建安全摘要（不含当事人姓名）
  const safeParts: string[] = []
  if (caseData.title) safeParts.push(`标题：${caseData.title}`)
  if (caseData.mediationWillingness) safeParts.push(`调解意向：${caseData.mediationWillingness}`)
  if (caseData.phase) safeParts.push(`当前阶段：${caseData.phase}`)
  
  if (caseData.description) {
    const desc = String(caseData.description).trim().replace(/\s+/g, ' ')
    safeParts.push(`案情摘要：${desc.length > 1200 ? desc.slice(0, 1200) + '...' : desc}`)
  }
  
  const summary = safeParts.join('\n')
  
  // 可选: 进行脱敏处理（针对摘要中可能的隐含PII）
  const des = await desensitizeCaseMaterials(summary, {
    partyNames: [],  // 不脱敏姓名（已排除）
    addresses: [],
    knownEntities: [],
  })
  
  return {
    success: true,
    summary: des.maskedText,
    // traceId 不返回给前端（仅后端用于还原）
  }
})
```

**前端调整** (`ChatWidget.astro`):
```diff
// 不需要处理 traceId
const caseContext = await fetch('/api/public/case-context', {...})
const { summary } = await caseContext.json()
// 直接拼接已脱敏的 summary
```

**验收标准**:
- [ ] case-context 不返回 traceId 给前端
- [ ] 返回的摘要不包含当事人姓名
- [ ] 前端正确使用脱敏摘要

---

## 🟡 **第二阶段：P1 架构整洁（预计 6 小时）**

### 任务 5: 统一数据库 schema 定义 ✗
**优先级**: P1 | **风险**: 部署失败、数据不一致
**状态**: TODO
**文件**: `server/database/index.ts` & `schema.ts`

**变更**:
```bash
# 清理 initTestDb 中的冗余 SQL，使用 Drizzle migrations
# 1. 保留 schema.ts 为唯一源
# 2. 创建 migrations/ 目录
# 3. 使用 drizzle-kit generate 自动生成迁移

npm install -D drizzle-kit
npx drizzle-kit generate:sqlite --config=drizzle.config.ts
```

**验收标准**:
- [ ] schema.ts 是唯一的表结构定义源
- [ ] 移除 initTestDb 中的原始 SQL CREATE TABLE
- [ ] migrations 目录存在并包含版本化迁移

---

### 任务 6: JSON 字段类型支持与元数据规范化 ✗
**优先级**: P1 | **风险**: 类型错误、脏数据
**状态**: TODO
**文件**: `schema.ts` + `chat/ai.post.ts`

**变更**:
```diff
// 定义 metadata 的严格 schema
import { z } from 'zod'

export const MessageMetadataSchema = z.object({
  traceId: z.string().optional(),
  skillVersion: z.string().optional(),
  keywords: z.array(z.string()).optional(),
}).passthrough()

// 在 schema.ts 中添加类型注解
export const messages = sqliteTable('messages', {
  // ... 其他字段 ...
  metadata: text('metadata').$type<z.infer<typeof MessageMetadataSchema>>(),
})

// 在 chat/ai.post.ts 中使用验证
const meta = MessageMetadataSchema.parse(body.meta || {})
db.insert(messages).values({
  metadata: JSON.stringify(meta),
})
```

**验收标准**:
- [ ] MessageMetadata schema 定义完整
- [ ] 所有 metadata 使用处都进行验证
- [ ] 测试覆盖脏数据拒绝

---

### 任务 7: 增加可观测性（RAG 命中率、错误日志） ✗
**优先级**: P1 | **风险**: 无法诊断质量
**状态**: TODO
**文件**: `server/utils/case-analysis-orchestrator.ts`

**变更**:
```ts
// 添加指标收集
const RAG_METRICS = {
  totalQueries: 0,
  successfulHits: 0,
  failedQueries: 0,
}

async function withRagSupport(system: string, query: string): Promise<{ system: string, ragUsed: boolean }> {
  RAG_METRICS.totalQueries++
  try {
    const kbResults = await searchKb(query, 3)
    if (kbResults.length > 0) {
      RAG_METRICS.successfulHits++
      return { 
        system: system + '\n## 可参考知识库\n' + formatKbResultsForPrompt(kbResults),
        ragUsed: true 
      }
    }
  } catch (err) {
    RAG_METRICS.failedQueries++
    console.warn(`[RAG] Query failed: ${query.slice(0, 50)}...`, err)
  }
  return { system, ragUsed: false }
}

// 暴露指标端点
export function getRagMetrics() {
  return {
    ...RAG_METRICS,
    hitRate: RAG_METRICS.totalQueries > 0 
      ? (RAG_METRICS.successfulHits / RAG_METRICS.totalQueries * 100).toFixed(2) + '%'
      : 'N/A',
  }
}
```

**验收标准**:
- [ ] RAG 命中率可查看
- [ ] 失败的查询记录到日志
- [ ] /api/metrics/rag 端点可用

---

## 🟢 **第三阶段：P2 代码质量（预计 7 小时）**

### 任务 8: 常量枚举化 ✗
**优先级**: P2 | **风险**: 代码可维护性
**状态**: TODO
**文件**: 创建 `server/constants/enums.ts`

**实现**:
```ts
export enum SenderType {
  AI = 'ai',
  PARTY = 'party',
  SYSTEM = 'system',
  MEDIATOR = 'mediator',
}

export enum CasePhase {
  INTAKE = 'intake',
  REVIEWING = 'reviewing',
  SCREENING = 'screening',
  ACCEPTED = 'accepted',
  MEDIATING = 'mediating',
  CAUCUS = 'caucus',
  NEGOTIATING = 'negotiating',
  AGREEMENT_DRAFTING = 'agreement_drafting',
  AGREEMENT_PENDING = 'agreement_pending',
  SIGNING = 'signing',
  CLOSED_SUCCESS = 'closed_success',
  CLOSED_FAILED = 'closed_failed',
  WITHDRAWN = 'withdrawn',
}

export enum CaseStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

// ... 其他枚举
```

**验收标准**:
- [ ] 所有 magic string 已替换为枚举
- [ ] 枚举导入覆盖所有相关文件
- [ ] 类型检查无误

---

### 任务 9: 输入验证层（Zod）✗
**优先级**: P2 | **风险**: 注入攻击
**状态**: TODO
**文件**: 创建 `server/schemas/validation.ts`

**实现**:
```ts
import { z } from 'zod'

export const CreateCaseInputSchema = z.object({
  caseType: z.enum(['mediation', 'evaluation', 'review']),
  partyName: z.string().min(1).max(200),
  respondentName: z.string().min(1).max(200),
  disputeType: z.string().max(100).optional(),
  description: z.string().max(5000).optional(),
  appFields: z.record(z.string()).optional(),
  requestId: z.string().uuid().optional(),
})

export const CreateCaseResult = z.object({
  caseNumber: z.string(),
  accessCode: z.string(),
  fileCount: z.number(),
  applicantName: z.string(),
})
```

**使用**:
```ts
// 在 create.post.ts 中
const validated = CreateCaseInputSchema.parse({...})
```

**验收标准**:
- [ ] 所有 API input 有 Zod schema
- [ ] 出错返回 422 + 错误详情
- [ ] 测试覆盖 invalid input

---

### 任务 10: 并发建案冲突修复（数据库序列）✗
**优先级**: P2 | **风险**: 边界场景bug
**状态**: TODO
**文件**: `server/api/cases/create.post.ts` (line 166-184)

**方案**:
```ts
// 使用 SQLite AUTOINCREMENT
export const caseSequence = sqliteTable('case_sequence', {
  year: integer('year').primaryKey(),
  nextSeq: integer('next_seq').notNull().default(1),
})

function getNextCaseNumber(): string {
  const db = getDb()
  const year = new Date().getFullYear()
  
  // 原子增量
  const result = db
    .update(caseSequence)
    .set({ nextSeq: sql`next_seq + 1` })
    .where(eq(caseSequence.year, year))
    .returning({ nextSeq: caseSequence.nextSeq })
    .get()
  
  if (!result) {
    db.insert(caseSequence).values({ year, nextSeq: 2 }).run()
    return `${year}-1`
  }
  
  return `${year}-${result.nextSeq}`
}
```

**验收标准**:
- [ ] 并发建案不产生重复序列号
- [ ] 100+ 并发测试通过
- [ ] case_sequence 表已迁移

---

## 执行检查清单

- [ ] 所有 P0 任务完成 + 通过测试
- [ ] 所有 P1 任务完成 + 文档更新
- [ ] 所有 P2 任务完成
- [ ] 运行 `npm run build` 无错误
- [ ] 运行 `npm run test` 所有测试通过
- [ ] 代码审查通过 (linting, security)
- [ ] 性能基准未下降 > 5%
- [ ] 提交 git 并推送远程

---

## 风险评估

| 任务 | 影响范围 | 回滚难度 | 建议做法 |
|------|--------|--------|---------|
| 1. traceId | 脱敏/审计 | 易 | 早期完成，影响最小 |
| 2. 文件提取 | 3个模块 | 中 | 完整测试覆盖 |
| 3. 建案回滚 | 核心流程 | 难 | 分阶段测试，灰度上线 |
| 4. case-context | 公开API | 易 | 兼容旧客户端 |
| 5. schema 统一 | 数据库 | 难 | 创建迁移脚本 |

---

## 成功指标

- ✅ 无重复代码（DRY）
- ✅ 脱敏链路完整（无PII外泄）
- ✅ 并发安全（无数据竞态）
- ✅ 代码覆盖率 > 80%
- ✅ 0 个 lint/security 告警
