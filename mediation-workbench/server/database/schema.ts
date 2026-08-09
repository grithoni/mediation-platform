import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ============================================================
// 租户表 (SaaS 多租户)
// ============================================================
export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // 租户名称
  slug: text('slug').notNull().unique(), // URL 友好的标识符
  logo: text('logo'), // Logo URL
  primaryColor: text('primary_color').default('#3B82F6'), // 品牌主色
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  address: text('address'),
  // 配额限制
  maxCases: integer('max_cases').default(100), // 最大案件数
  maxStorageMb: integer('max_storage_mb').default(1024), // 最大存储空间(MB)
  maxApiCalls: integer('max_api_calls').default(10000), // 月 API 调用上限
  // AI 配置
  aiModel: text('ai_model').default('gpt-4o-mini'), // 默认 AI 模型
  aiEnabled: integer('ai_enabled', { mode: 'boolean' }).default(true),
  // 状态
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 统一用户表
// ============================================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id),
  // 角色: claimant | respondent | mediator | case_manager | admin
  role: text('role').notNull(),
  // 基本信息
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  email: text('email'),
  phone: text('phone'),
  passwordHash: text('password_hash'),
  avatar: text('avatar'),
  // 微信小程序
  wxOpenId: text('wx_open_id'),
  wxUnionId: text('wx_union_id'),
  // 状态
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: integer('last_login_at', { mode: 'number' }),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 案件表 (扩展版)
// ============================================================
export const cases = sqliteTable('cases', {
  id: text('id').primaryKey(), // 案件编号 e.g. "2026-1"
  tenantId: text('tenant_id').references(() => tenants.id),
  title: text('title').notNull(),
  description: text('description'),
  // 纠纷类型: contract | consumer | property | ip | finance | civil
  disputeType: text('dispute_type'),
  // 争议金额(元)
  amount: real('amount'),
  // 当事人信息
  partyAName: text('party_a_name').notNull(), // 申请人
  partyBName: text('party_b_name').notNull(), // 被申请人
  partyAContact: text('party_a_contact'),
  partyBContact: text('party_b_contact'),
  partyAUserId: text('party_a_user_id').references(() => users.id), // 申请人用户ID
  partyBUserId: text('party_b_user_id').references(() => users.id), // 被申请人用户ID
  // 案件摘要
  claimsSummary: text('claims_summary'), // 请求和答辩（摘要）
  evidenceSummary: text('evidence_summary'), // 证据和质证（摘要）
  // 状态机: 以 VALUE 技能五阶段为主轴（详见 server/utils/case-status.ts）
  // intake -> reviewing(V) -> accepted(A) -> mediating(L)
  //   -> negotiating(U) -> agreement_drafting(E) -> withdrawn
  phase: text('phase').notNull().default('intake'),
  status: text('status').notNull().default('pending'), // pending | active | resolved | closed
  // 调解员
  mediatorId: text('mediator_id').references(() => users.id),
  mediatorBoundAt: integer('mediator_bound_at'), // 调解员绑定时间
  mediatorRequestedAt: integer('mediator_requested_at'), // 当事人请求调解员介入时间
  // 访问码（保留兼容）
  accessCode: text('access_code').notNull(),
  // 审核信息
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: integer('reviewed_at', { mode: 'number' }),
  reviewNote: text('review_note'),
  // 结案信息
  closedAt: integer('closed_at', { mode: 'number' }),
  closeReason: text('close_reason'),
  // 时间戳
  dynamicFileUpdatedAt: integer('dynamic_file_updated_at'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 消息表 (扩展版)
// ============================================================
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  senderType: text('sender_type').notNull(), // party | mediator | ai | system
  senderId: text('sender_id'),
  senderName: text('sender_name'),
  content: text('content').notNull(),
  metadata: text('metadata'), // JSON
  // 消息通道: shared(多方) | caucus(单独沟通) | private(当事人-AI)
  channelType: text('channel_type').notNull().default('shared'),
  // Caucus 会话ID（用于单独沟通）
  caucusSessionId: text('caucus_session_id'),
  visibility: text('visibility').notNull().default('shared'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 文件表
// ============================================================
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  path: text('path').notNull(),
  mimeType: text('mime_type'),
  size: integer('size'),
  uploadedBy: text('uploaded_by'),
  // 材料分类: application(调解申请书) | evidence(证据) | identity(身份证明) | authorization(授权委托书)
  category: text('category').default('application'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 调解申请详情表 (1:1 关联 cases；申请表单已迁入工作台，原 3006 服务已退役)
// ============================================================
export const caseApplications = sqliteTable('case_applications', {
  id: text('id').primaryKey(), // 与 caseId 相同（案件号）
  caseId: text('case_id').notNull().references(() => cases.id),
  // 申请人信息
  applicantName: text('applicant_name'),
  applicantAddress: text('applicant_address'),
  applicantPostalCode: text('applicant_postal_code'),
  applicantPhone: text('applicant_phone'),
  applicantMobile: text('applicant_mobile'),
  applicantFax: text('applicant_fax'),
  applicantEmail: text('applicant_email'),
  applicantOtherContact: text('applicant_other_contact'),
  // 被申请人信息
  respondentName: text('respondent_name'),
  respondentAddress: text('respondent_address'),
  respondentPostalCode: text('respondent_postal_code'),
  respondentPhone: text('respondent_phone'),
  respondentMobile: text('respondent_mobile'),
  respondentFax: text('respondent_fax'),
  respondentEmail: text('respondent_email'),
  respondentOtherContact: text('respondent_other_contact'),
  // 调解意愿: mutual(各方自愿) | single_party(单方请求)
  mediationWillingness: text('mediation_willingness'),
  // 案件信息
  caseFacts: text('case_facts'),
  disputeMatters: text('dispute_matters'),
  mediationDemands: text('mediation_demands'),
  demandsBasis: text('demands_basis'),
  // 证据保密声明
  evidenceConfidential: integer('evidence_confidential', { mode: 'boolean' }).default(false),
  // 代理人
  hasAgent: integer('has_agent', { mode: 'boolean' }).default(false),
  agentName: text('agent_name'),
  agentDuties: text('agent_duties'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 对话会话表
// ============================================================
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  partyIdentifier: text('party_identifier'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  endedAt: integer('ended_at', { mode: 'number' }),
})

// ============================================================
// 已保存对话表
// ============================================================
export const savedConversations = sqliteTable('saved_conversations', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  mediatorId: text('mediator_id'),
  title: text('title').notNull(),
  messagesJson: text('messages_json').notNull(),
  messageCount: integer('message_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 案件动态分析文件表
// ============================================================
export const caseDynamicFiles = sqliteTable('case_dynamic_files', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  partyAnalysis: text('party_analysis'),
  timeline: text('timeline'),
  disputeChecklist: text('dispute_checklist'),
  positions: text('positions'),
  potentialInterests: text('potential_interests'),
  batna: text('batna'),
  // AI 分析扩展字段
  issues: text('issues'), // 争点提取 JSON
  sentiment: text('sentiment'), // 情绪分析 JSON
  settlementSuggestions: text('settlement_suggestions'), // 和解方案建议 JSON
  agentLog: text('agent_log'),
  dialogTurnCount: integer('dialog_turn_count').default(0),
  dialogEnded: integer('dialog_ended', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// AI 分析缓存表 — 存储请求权/抗辩/证据/重构方案的结果，避免重复分析
// ============================================================
export const caseAnalyses = sqliteTable('case_analyses', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  analysisType: text('analysis_type').notNull(), // claim_basis | anticipate_defense | evidence_checklist | recommend_solution
  content: text('content').notNull(),
  generatedAt: integer('generated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// MCP 工具配置表
// ============================================================
export const mcpTools = sqliteTable('mcp_tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  transport: text('transport').notNull(),
  command: text('command'),
  url: text('url'),
  envJson: text('env_json'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 调解协议表
// ============================================================
export const agreements = sqliteTable('agreements', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  tenantId: text('tenant_id').references(() => tenants.id),
  // 协议内容
  title: text('title').notNull(),
  content: text('content').notNull(), // 协议正文（Markdown/HTML）
  // 履行计划
  performancePlan: text('performance_plan'), // JSON: 履行计划
  // 违约条款
  breachClauses: text('breach_clauses'), // JSON: 违约条款
  // 状态: draft | pending_approval | approved | signing | signed | completed
  status: text('status').notNull().default('draft'),
  // 版本控制
  version: integer('version').notNull().default(1),
  previousVersionId: text('previous_version_id'),
  // 审批
  approvedByPartyA: integer('approved_by_party_a', { mode: 'boolean' }).default(false),
  approvedByPartyB: integer('approved_by_party_b', { mode: 'boolean' }).default(false),
  approvedAt: integer('approved_at', { mode: 'number' }),
  // 创建者
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 电子签署记录表
// ============================================================
export const agreementSignatures = sqliteTable('agreement_signatures', {
  id: text('id').primaryKey(),
  agreementId: text('agreement_id').notNull().references(() => agreements.id),
  caseId: text('case_id').notNull().references(() => cases.id),
  // 签署方
  signerType: text('signer_type').notNull(), // party_a | party_b | mediator
  signerId: text('signer_id').notNull(),
  signerName: text('signer_name').notNull(),
  // 电子签署平台
  platform: text('platform').notNull(), // fadada | signyun
  // 签署任务ID（第三方平台）
  externalTaskId: text('external_task_id'),
  externalSignId: text('external_sign_id'),
  // 签署状态: pending | signing | signed | failed
  status: text('status').notNull().default('pending'),
  // 签署信息
  signedAt: integer('signed_at', { mode: 'number' }),
  signUrl: text('sign_url'), // 签署链接
  certificateId: text('certificate_id'), // 签署证书ID
  // 时间戳
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 案件活动日志表（全流程留痕）
// ============================================================
export const caseActivities = sqliteTable('case_activities', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  tenantId: text('tenant_id').references(() => tenants.id),
  // 活动类型
  // case_created | status_changed | document_uploaded | mediator_assigned
  // message_sent | agreement_created | agreement_approved | agreement_signed
  // session_started | session_ended | note_added | review_completed
  activityType: text('activity_type').notNull(),
  // 活动描述
  description: text('description').notNull(),
  // 操作者
  performedBy: text('performed_by').references(() => users.id),
  performedByName: text('performed_by_name'),
  // 关联数据
  relatedId: text('related_id'), // 关联的文档/协议/消息ID
  relatedType: text('related_type'), // document | agreement | message | session
  // 元数据
  metadata: text('metadata'), // JSON: 额外数据
  // 时间戳
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 调解员笔记表
// ============================================================
export const caseNotes = sqliteTable('case_notes', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  // 笔记内容
  content: text('content').notNull(),
  // 笔记类型: general | observation | strategy | risk
  noteType: text('note_type').notNull().default('general'),
  // 是否私密（仅自己可见）
  isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
  // 创建者
  createdBy: text('created_by').notNull().references(() => users.id),
  createdByName: text('created_by_name'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 和解方案表
// ============================================================
export const settlementProposals = sqliteTable('settlement_proposals', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  tenantId: text('tenant_id').references(() => tenants.id),
  // 方案内容
  title: text('title').notNull(),
  description: text('description'),
  // 方案详情 JSON
  terms: text('terms').notNull(), // JSON: 和解条款
  // 金额
  amount: real('amount'),
  // 履行方式
  performanceMethod: text('performance_method'),
  performanceDeadline: text('performance_deadline'),
  // 状态: draft | proposed | negotiating | accepted | rejected
  status: text('status').notNull().default('draft'),
  // 提出者
  proposedBy: text('proposed_by').references(() => users.id),
  proposedByName: text('proposed_by_name'),
  // 各方态度
  partyAAttitude: text('party_a_attitude'), // accept | reject | negotiate
  partyBAttitude: text('party_b_attitude'),
  // AI 生成标记
  isAiGenerated: integer('is_ai_generated', { mode: 'boolean' }).default(false),
  aiConfidence: real('ai_confidence'), // AI 建议置信度
  // 时间戳
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// Webhook 配置表
// ============================================================
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id),
  // Webhook 配置
  url: text('url').notNull(),
  secret: text('secret'), // 签名密钥
  // 事件类型: case.created, case.status_changed, agreement.signed, case.closed
  events: text('events').notNull(), // JSON array
  // 状态
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // 统计
  lastTriggeredAt: integer('last_triggered_at', { mode: 'number' }),
  failureCount: integer('failure_count').default(0),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// Webhook 调用日志表
// ============================================================
export const desensitizationMappings = sqliteTable('desensitization_mappings', {
  traceId: text('trace_id').primaryKey(),
  caseId: text('case_id').notNull(),
  mappingEnc: text('mapping_enc').notNull(), // AES-256-GCM 加密后的 mapping JSON（base64）
  categories: text('categories'), // 令牌类别映射 JSON（可选）
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(), // TTL 7200s
})

// ============================================================
// ============================================================
// 脱敏规则表（全局单例：保存后对该账号下所有案件生效）
// ============================================================
export const desensitizeRules = sqliteTable('desensitize_rules', {
  id: text('id').primaryKey(), // 固定 'global'
  rulesJson: text('rules_json').notNull(), // JSON: Array<{category, enabled, action}>
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const webhookLogs = sqliteTable('webhook_logs', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id').notNull().references(() => webhooks.id),
  // 事件信息
  eventType: text('event_type').notNull(),
  payload: text('payload').notNull(), // JSON
  // 响应信息
  statusCode: integer('status_code'),
  responseBody: text('response_body'),
  // 状态
  success: integer('success', { mode: 'boolean' }),
  errorMessage: text('error_message'),
  // 重试
  retryCount: integer('retry_count').default(0),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 案件状态流转日志表（case_events）
// 记录每一次案件 phase/status 变化，用于审计与复盘
// ============================================================
export const caseEvents = sqliteTable('case_events', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  tenantId: text('tenant_id').references(() => tenants.id),
  // 事件类型: phase_changed | status_changed | case_created | case_closed
  eventType: text('event_type').notNull(),
  // 流转前后
  fromPhase: text('from_phase'),
  toPhase: text('to_phase'),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  // 触发者
  actorId: text('actor_id').references(() => users.id),
  actorName: text('actor_name'),
  // 触发方式: manual(调解员手动) | system(系统自动) | agent(代理执行)
  source: text('source').notNull().default('system'),
  // 备注
  reason: text('reason'),
  metadata: text('metadata'), // JSON
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 代理执行记录表（agent_run）
// 记录一次代理执行的全过程：计划、步骤、工具调用、结果，可回放
// ============================================================
export const caseTaskRuns = sqliteTable('case_task_runs', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  tenantId: text('tenant_id').references(() => tenants.id),
  taskId: text('task_id'),
  // 代理类型: value_skill | case_analysis | chat | workflow
  agentType: text('agent_type').notNull(),
  // 运行状态: pending | running | done | failed | cancelled
  status: text('status').notNull().default('running'),
  // 计划 JSON（Plan 阶段产物）
  planJson: text('plan_json'),
  // 输入上下文摘要
  inputContext: text('input_context'),
  // 检索引用（Research 阶段产物，JSON 数组）
  retrievalRefs: text('retrieval_refs'),
  // 工具调用记录（Work 阶段产物，JSON 数组）
  toolCalls: text('tool_calls'),
  // 输出产物
  outputContent: text('output_content'),
  // 人工接管/复核标记
  reviewState: text('review_state').notNull().default('none'), // none | pending | approved | rejected
  // 重试与超时
  retryCount: integer('retry_count').default(0),
  timeoutMs: integer('timeout_ms'),
  // 错误信息
  errorMessage: text('error_message'),
  startedAt: integer('started_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  finishedAt: integer('finished_at', { mode: 'number' }),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})

// ============================================================
// 案件任务表（case_tasks）
// 承载人工任务与代理任务，挂在案件上，供待办聚合与 SLA 追踪
// ============================================================
export const caseTasks = sqliteTable('case_tasks', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  tenantId: text('tenant_id').references(() => tenants.id),
  // 任务类型: triage | analysis | strategy | agreement | review | followup
  taskType: text('task_type').notNull(),
  // 任务状态: pending | running | done | failed | cancelled
  status: text('status').notNull().default('pending'),
  // 标题与描述
  title: text('title').notNull(),
  description: text('description'),
  // 指派
  assigneeId: text('assignee_id').references(() => users.id),
  assigneeName: text('assignee_name'),
  // 关联的代理运行
  agentRunId: text('agent_run_id').references(() => caseTaskRuns.id),
  // 截止时间（SLA）
  dueAt: integer('due_at', { mode: 'number' }),
  doneAt: integer('done_at', { mode: 'number' }),
  // 结果
  outputSummary: text('output_summary'),
  createdAt: integer('created_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull().$defaultFn(() => Date.now()),
})
