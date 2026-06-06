import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ============================================================
// 案件表
// ============================================================
export const cases = sqliteTable('cases', {
  id: text('id').primaryKey(), // 案件编号 e.g. "2026-1"
  title: text('title').notNull(),
  description: text('description'),
  partyAName: text('party_a_name').notNull(), // 申请人
  partyBName: text('party_b_name').notNull(), // 被申请人
  partyAContact: text('party_a_contact'),
  partyBContact: text('party_b_contact'),
  claimsSummary: text('claims_summary'), // 请求和答辩（摘要）
  evidenceSummary: text('evidence_summary'), // 证据和质证（摘要）
  phase: text('phase').notNull().default('analysis'), // analysis | dialog | mediator_selection | active | resolved | closed
  dynamicFileUpdatedAt: integer('dynamic_file_updated_at'), // 动态文件最后更新时间（秒级时间戳）
  status: text('status').notNull().default('pending'), // pending | active | resolved | closed
  mediatorId: text('mediator_id').references(() => mediators.id),
  mediatorBoundAt: integer('mediator_bound_at'), // 调解员绑定时间
  accessCode: text('access_code').notNull(), // 当事人访问验证码（密码）
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// ============================================================
// 调解员表
// ============================================================
export const mediators = sqliteTable('mediators', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(), // 拼音用户名
  email: text('email'), // 可选，不再用于登录
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('mediator'), // mediator | admin
  avatar: text('avatar'),
  // === 调解员资料库字段 ===
  birthDate: text('birth_date'), // 出生年月 e.g. "1982年3月"
  gender: text('gender'), // 性别: 男/女
  nativePlace: text('native_place'), // 籍贯
  ethnicity: text('ethnicity'), // 民族
  politicalStatus: text('political_status'), // 政治面貌
  idNumber: text('id_number'), // 身份证号码
  phone: text('phone'), // 联系电话
  education: text('education'), // 最后学历
  degree: text('degree'), // 最高学位
  university: text('university'), // 毕业院校
  major: text('major'), // 专业
  specialties: text('specialties'), // JSON array: ["贸易","投资","金融","运输","房地产","工程建设","知识产权"]
  hasForeignCapability: integer('has_foreign_capability', { mode: 'boolean' }), // 具备涉外业务能力 (radio: 是/否)
  foreignLanguages: text('foreign_languages'), // 外语语种
  foreignLanguageLevel: text('foreign_language_level'), // 外语等级
  appointmentType: text('appointment_type'), // 任职类型 (radio: 专职/兼职)
  organization: text('organization'), // 单位
  position: text('position'), // 职务
  categoryTypes: text('category_types'), // JSON array: 所属类型多选项
  learningAndWorkExperience: text('learning_and_work_experience'), // 主要学习和工作经历
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// ============================================================
// 消息表 (AI对话 + 人工对话)
// ============================================================
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  senderType: text('sender_type').notNull(), // party | mediator | ai
  senderId: text('sender_id'), // party identifier or mediator id
  senderName: text('sender_name'),
  content: text('content').notNull(),
  metadata: text('metadata'), // JSON: AI settings, attachments, etc.
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
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
  uploadedBy: text('uploaded_by'), // mediator id
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// ============================================================
// 对话会话表 (一次当事人访问)
// ============================================================
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  partyIdentifier: text('party_identifier'), // 当事人标识
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
})

// ============================================================
// 案件动态分析文件表（Agent 自动生成 + 持续更新）
// ============================================================
export const savedConversations = sqliteTable('saved_conversations', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  mediatorId: text('mediator_id').notNull().references(() => mediators.id),
  title: text('title').notNull(),
  messagesJson: text('messages_json').notNull(),
  messageCount: integer('message_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const caseDynamicFiles = sqliteTable('case_dynamic_files', {
  id: text('id').primaryKey(), // same as case id
  caseId: text('case_id').notNull().references(() => cases.id),
  // 当事人特征分析
  partyAnalysis: text('party_analysis'),
  // 事实时间线（JSON array of {time,event,source}）
  timeline: text('timeline'),
  // 争议清单（JSON array of {issue,category,partyAPosition,partyBPosition,priority}）
  disputeChecklist: text('dispute_checklist'),
  // 已识别的立场
  positions: text('positions'),
  // 已发现的潜在利益
  potentialInterests: text('potential_interests'),
  // 各方最佳替代方案 (BATNA)
  batna: text('batna'),
  // 智能体分析日志（追加式，JSON array of {turn,action,result,timestamp}）
  agentLog: text('agent_log'),
  // 当事人对话轮次计数
  dialogTurnCount: integer('dialog_turn_count').default(0),
  // 对话是否已结束
  dialogEnded: integer('dialog_ended', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
