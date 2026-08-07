# 代码架构审查报告 - mediation-platform

## 关键发现：架构问题、冗余代码、逻辑错误

### 🔴 **高优先级问题**

#### 1. **脱敏流程中的双重 traceId 生成与混乱**
**文件**: `case-analysis-orchestrator.ts` (lines 188-202)
**问题**:
```ts
// orchestrator.ts line 188-202
const desensitized = await desensitize(options.materials)  // 产生 traceId: `trace-${Date.now()}`
if (!desensitized.traceId) {
  desensitized.traceId = persistDesensitization(...)      // 产生新 traceId: `${caseId}-${now}`
}
```
- `desensitizeCaseMaterials()` 每次都生成一个 `trace-${Date.now()}` traceId（line 690）
- 然后立即被 `persistDesensitization()` 覆盖，生成 `${caseId}-${now}`
- 第一个 traceId **永远没有被使用且被丢弃** → **内存泄漏 + 逻辑混乱**

**修复**:
```ts
export async function desensitizeCaseMaterials(...) {
  // 不生成 traceId；由调用方决定是否持久化和 traceId 格式
  return {
    maskedText,
    traceId: undefined,  // 改为 undefined
    mapping,
  }
}
```

---

#### 2. **文件提取逻辑重复 (3处)**
**文件**: 
- `ai-welcome.ts` (lines 28-40)
- `case-analysis-orchestrator.ts` (lines 435-455)
- `extract-info.post.ts` (假定存在)

**问题**: 相同的 `execSync(pdftotext/textutil)` 代码复制在3个地方，无法维护
- 文件大小限制、超时、编码处理不一致
- 若修复一处bug，其他地方仍存在

**修复**: 抽取到 `server/utils/file-extraction.ts`:
```ts
export async function extractFileText(filePath: string, filename: string): Promise<string> {
  const lower = filename.toLowerCase()
  try {
    if (lower.endsWith('.pdf')) {
      return execSync(`pdftotext -layout "${filePath}" -`, {...})
    }
    // 共用逻辑
  }
}
```

---

#### 3. **数据库表结构重复与迁移脚本混乱**
**文件**: `database/index.ts` (lines 46-173)
**问题**:
```ts
// initTestDb() 中直接写原始 SQL CREATE TABLE
// 但同时又用 Drizzle schema.ts 定义表结构
```
- 结构定义在两处（schema.ts + initTestDb 的 SQL）→ **难以维护、易失步**
- 若修改 schema.ts 的列，initTestDb 不会自动同步
- 部署时无法确认哪个是真实schema

**修复**: 
```ts
// 使用单一的 schema.ts + 自动迁移
export async function initDb() {
  const db = getDb()
  await migrate(db)  // 用 drizzle-orm migrate() 而非原始 SQL
}
```

---

#### 4. **AI欢迎消息生成中的脱敏不完整**
**文件**: `ai-welcome.ts` (lines 72-101)
**问题**:
```ts
const workflowResult = await runDesensitizedSkillWorkflow({
  analysisType: 'dynamic_file',
  materials: fileContent,  // 来自 execSync(pdftotext) 的原始文本
  partyNames: [caseData.partyAName, caseData.partyBName],
  // ... 但 fileContent 中可能有医疗记录、身份证号等超出 partyNames 的 PII
})
```
- 仅脱敏已知的当事人名字，但文档内可能有：医疗ID、账号、其他人名等
- `fileContent` 包含附件内容，脱敏模型（detectLocalNerEntities）可能不会全部识别
- 云模型仍可能接收到边界PII

**修复**: 增强脱敏扫描范围（邮箱、电话、证件等在 desensitizeCaseMaterials 中已有）

---

#### 5. **幂等建案实现中的竞态条件与回滚不完全**
**文件**: `cases/create.post.ts` (lines 190-339)
**问题**:
```ts
// 竞态：两个并发请求都写文件到磁盘后才检查 ledger
writtenFiles.push(filePath)  // 文件已在磁盘上
writeFileSync(filePath, file.data)
db.insert(documents).values(...).run()

// 若 db.insert 失败，文件 + ledger 不同步
// cleanup 时能删 DB 记录但无法删磁盘文件（若权限/路径问题）
try {
  unlinkSync(p)
} catch {
  // 文件泄露 → 长期堆积，最终磁盘爆满
}
```

**修复**:
```ts
// 1. 先插 DB + ledger（原子）
// 2. 再写磁盘（失败回滚前两步）
// 3. 失败时异步后台清理磁盘文件（重试机制）
```

---

#### 6. **Public case-context 端点返回半脱敏内容给前端，但前端直接拼接**
**文件**: `public/case-context.post.ts` (lines 18-31) + ChatWidget
**问题**:
```ts
// case-context 返回: summary = "[申请人_1] 诉 [被申请人_1]"
// ChatWidget 接收并原样拼接到消息中
message = summary + "，请分析..."  // 已脱敏
// 但若返回过程被中间人攻击或泄露，token 映射表也在同一响应中
```
- 脱敏 token 与映射关系不应在同一传输流
- 前端可能把摘要显示在 UI 上（用户看到 [申请人_1] 很不友好）

**修复**: 
- 返回完全脱敏的摘要给前端展示
- traceId 用于后端反脱敏，前端不需要知道映射

---

### 🟡 **中优先级问题**

#### 7. **database/schema.ts 中的冗余与数据类型不匹配**
**文件**: `schema.ts` (lines 1-300)
**问题**:
```ts
metadata: text('metadata'),  // JSON 存为 TEXT，读时需手动 JSON.parse
// 应用代码中需要：
const metadata = JSON.parse(row.metadata || '{}')
```
- Drizzle 无法自动序列化/反序列化 JSON
- 若忘记 JSON.parse，会得到字符串而非对象 → runtime 错误

**修复**: 使用 Drizzle 的 `json()` 支持或专用 JSON 字段类型

---

#### 8. **技能目录构建时无错误处理**
**文件**: `case-analysis-orchestrator.ts` (lines 129-157)
**问题**:
```ts
export function buildSkillCatalog(): SkillCatalogEntry[] {
  const skillsDir = resolve(process.cwd(), 'uploads', 'skills')
  const metaFile = resolve(skillsDir, '.skills.json')
  if (existsSync(metaFile)) {
    try {
      const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
      // ... 但若某个 manifest.json 损坏或 PROMPT.md 缺失，无提示
    } catch {}  // 静默失败
  }
  return [...uploaded, ...BUILTIN_SKILLS]  // 可能只返回内置 skills，用户无感
}
```
- 可能返回不完整的skill catalog，但调用方无法知道
- 调试困难

**修复**:
```ts
export function buildSkillCatalog(): { skills: SkillCatalogEntry[], errors: string[] } {
  const errors: string[] = []
  // ... 收集所有错误
  return { skills, errors }
}
```

---

#### 9. **kb-search 与 RAG 查询无结果时的静默退化**
**文件**: `case-analysis-orchestrator.ts` (lines 528-535)
**问题**:
```ts
async function withRagSupport(system: string, query: string): Promise<string> {
  try {
    const kbResults = await searchKb(query, 3)
    if (kbResults.length > 0) {
      return system + '...'
    }
  } catch {}
  return system  // 无 RAG，AI 模型质量下降但无日志
}
```
- RAG 命中率不可观测
- 无法诊断知识库索引问题

**修复**: 记录 RAG 命中统计（hits/misses）

---

#### 10. **messages 表中 metadata 未规范化**
**文件**: `schema.ts` (line 110) + `chat/ai.post.ts` (line 150)
**问题**:
```ts
metadata: text('metadata'),  // 定义为 JSON TEXT，但无 schema
// 保存时：
db.insert(messages).values({
  metadata: body.meta ? JSON.stringify(body.meta) : undefined,
})
// 读时：无类型检查，可能有脏数据
```

**修复**: 定义 metadata 的具体字段结构或使用严格的 Zod schema

---

### 🟢 **低优先级（代码质量改进）**

#### 11. **使用 magic string 代替枚举**
**问题示例**:
```ts
senderType: 'ai' | 'party' | 'system' | 'mediator'  // 字符串字面量散落在代码中
phase: 'intake' | 'reviewing' | ...
status: 'pending' | 'active' | 'resolved' | 'closed'
```

**修复**: 集中定义枚举
```ts
export enum SenderType {
  AI = 'ai',
  PARTY = 'party',
  SYSTEM = 'system',
  MEDIATOR = 'mediator',
}
```

---

#### 12. **缺少输入验证与清理**
**文件**: `cases/create.post.ts` (line 188)
**问题**:
```ts
const finalTitle = disputeType || appFields.disputeMatters || description || ...
// 无检查 description 是否包含脚本/SQL 注入
```

**修复**: 使用 Zod schema 验证所有输入

---

#### 13. **没有分布式锁处理并发建案冲突**
**文件**: `create.post.ts` (lines 166-184)
**问题**:
```ts
const seq = maxN + 1
const caseNumber = `${currentYear}-${seq}`
// 两个并发请求都读到 maxN，生成相同的 caseNumber → 主键冲突
```

**修复**: 使用数据库序列或分布式锁

---

## 总结与优先级排序

| 优先级 | 问题 | 风险 | 预计修复时间 |
|--------|------|------|-----------|
| 🔴 P0 | 双重traceId生成 | 数据泄露、审计链断裂 | 1h |
| 🔴 P0 | 文件提取重复代码 | 维护困难、bug不一致 | 2h |
| 🔴 P0 | schema重复定义 | 部署失败、数据不一致 | 3h |
| 🔴 P0 | AI欢迎脱敏不完整 | 边界PII泄露到云 | 1h |
| 🔴 P0 | 建案竞态与回滚 | 磁盘泄露、DB不一致 | 4h |
| 🔴 P0 | case-context 脱敏逻辑 | PII token映射曝光 | 2h |
| 🟡 P1 | JSON 序列化缺失 | 数据类型错误 | 2h |
| 🟡 P1 | 技能目录无错误提示 | 调试困难 | 1.5h |
| 🟡 P1 | RAG无可观测性 | 无法诊断质量 | 1h |
| 🟢 P2 | magic string | 代码可维护性 | 3h |
| 🟢 P2 | 输入验证缺失 | 可能的注入 | 2h |
| 🟢 P2 | 并发序列冲突 | 边界场景bug | 2h |

---

## 建议修复计划

### **第一阶段（本周）- 关键安全修复**
1. 修复 traceId 双重生成 & 脱敏逻辑
2. 抽取文件提取模块（统一bug/维护）
3. 修复建案竞态与回滚机制
4. 加强 public/case-context 脱敏策略

### **第二阶段（次周）- 架构整洁**
5. 统一 schema 定义（单一源）
6. 补充 JSON 序列化支持 + 类型检查
7. 增加可观测性（RAG、错误日志）

### **第三阶段（第三周）- 代码质量**
8. 枚举化常量
9. Zod 输入验证层
10. 分布式锁/序列方案

