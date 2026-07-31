import { v4 as uuid } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDb } from './index'
import {
  tenants, users, cases, messages,
  caseActivities, caseNotes
} from './schema'

export async function seed() {
  const db = getDb()

  // Check if already seeded
  const existing = db.select().from(users).all()
  if (existing.length > 0) {
    console.log('Database already seeded, skipping.')
    return
  }

  const passwordHash = await bcrypt.hash('123', 10)
  const nowTimestamp = Date.now()

  // ============================================================
  // 1. 创建默认租户
  // ============================================================
  const tenantId = 'tenant-default'
  db.insert(tenants).values({
    id: tenantId,
    name: '广州仲裁委员会',
    slug: 'gzac',
    primaryColor: '#1e3a5f',
    contactEmail: 'admin@gzac.org',
    contactPhone: '020-12345678',
    address: '广州市天河区',
    maxCases: 1000,
    maxStorageMb: 10240,
    maxApiCalls: 100000,
    aiModel: 'gpt-4o-mini',
    aiEnabled: true,
    isActive: true,
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
  }).run()
  console.log('✓ Created default tenant')

  // ============================================================
  // 2. 创建用户（保持原有账号密码）
  // ============================================================

  // 系统管理员
  const adminUserId = 'user-admin'
  db.insert(users).values({
    id: adminUserId,
    tenantId,
    role: 'admin',
    name: '系统管理员',
    username: 'admin',
    email: 'admin@gzac.org',
    phone: '13800000000',
    passwordHash,
    isActive: true,
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
  }).run()

  // 案件管理员
  const caseManagerId = 'user-case-manager'
  db.insert(users).values({
    id: caseManagerId,
    tenantId,
    role: 'case_manager',
    name: '王主任',
    username: 'wangzhuren',
    email: 'wang@gzac.org',
    phone: '13800000001',
    passwordHash,
    isActive: true,
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
  }).run()

  // 调解员用户已迁移至 med-717，此处不再创建

  // 申请人
  const claimant1Id = 'user-claimant-1'
  const claimant2Id = 'user-claimant-2'
  const claimant3Id = 'user-claimant-3'

  db.insert(users).values([
    {
      id: claimant1Id,
      tenantId,
      role: 'claimant',
      name: '张三',
      username: 'zhangsan',
      email: 'zhangsan@example.com',
      phone: '13900000001',
      passwordHash,
      isActive: true,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: claimant2Id,
      tenantId,
      role: 'claimant',
      name: '李四',
      username: 'lisi',
      email: 'lisi@example.com',
      phone: '13900000002',
      passwordHash,
      isActive: true,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: claimant3Id,
      tenantId,
      role: 'claimant',
      name: '周七',
      username: 'zhouqi',
      email: 'zhouqi@example.com',
      phone: '13900000005',
      passwordHash,
      isActive: true,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
  ]).run()

  // 被申请人
  const respondent1Id = 'user-respondent-1'
  const respondent2Id = 'user-respondent-2'
  const respondent3Id = 'user-respondent-3'

  db.insert(users).values([
    {
      id: respondent1Id,
      tenantId,
      role: 'respondent',
      name: '王五',
      username: 'wangwu',
      email: 'wangwu@example.com',
      phone: '13900000003',
      passwordHash,
      isActive: true,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: respondent2Id,
      tenantId,
      role: 'respondent',
      name: '赵六',
      username: 'zhaoliu',
      email: 'zhaoliu@example.com',
      phone: '13900000004',
      passwordHash,
      isActive: true,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: respondent3Id,
      tenantId,
      role: 'respondent',
      name: '吴八',
      username: 'wuba',
      email: 'wuba@example.com',
      phone: '13900000006',
      passwordHash,
      isActive: true,
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
  ]).run()

  console.log('✓ Created users')

  // ============================================================
  // 3. 创建案件（原有7个 + 新增6个）
  // ============================================================
  const sampleCases = [
    // 原有7个案件
    {
      id: '2026-1',
      tenantId,
      title: '加盟连锁合同纠纷',
      description: '加盟商与连锁总部因加盟费退还、经营区域保护等问题产生争议。',
      disputeType: 'contract',
      amount: 200000,
      partyAName: '王先生',
      partyBName: '某连锁品牌',
      partyAContact: 'zhangsan@example.com',
      partyBContact: 'wangwu@example.com',
      partyAUserId: claimant1Id,
      partyBUserId: respondent1Id,
      claimsSummary: '申请人要求被申请人退还加盟费20万元，并赔偿损失。',
      evidenceSummary: '加盟合同、付款凭证、沟通记录。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-2',
      tenantId,
      title: '情感咨询服务纠纷',
      description: '消费者因情感咨询服务质量不满意，要求退款。',
      disputeType: 'consumer',
      amount: 15000,
      partyAName: '李女士',
      partyBName: '某情感咨询公司',
      partyAContact: 'lisi@example.com',
      partyBContact: 'zhaoliu@example.com',
      partyAUserId: claimant2Id,
      partyBUserId: respondent2Id,
      claimsSummary: '申请人要求被申请人退还咨询费15000元。',
      evidenceSummary: '服务合同、付款凭证、沟通记录。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-3',
      tenantId,
      title: '教育培训合同纠纷',
      description: '学员因培训机构未兑现承诺，要求退还未消费的培训费用。',
      disputeType: 'consumer',
      amount: 25000,
      partyAName: '张先生',
      partyBName: '某培训机构',
      partyAContact: 'zhouqi@example.com',
      partyBContact: 'wuba@example.com',
      partyAUserId: claimant3Id,
      partyBUserId: respondent3Id,
      claimsSummary: '申请人要求被申请人退还培训费25000元。',
      evidenceSummary: '培训合同、付款凭证、课程记录。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-4',
      tenantId,
      title: '法律代理合同纠纷',
      description: '当事人因律师未尽职代理，要求退还部分律师费。',
      disputeType: 'contract',
      amount: 50000,
      partyAName: '陈先生',
      partyBName: '某律师事务所',
      partyAContact: 'zhangsan@example.com',
      partyBContact: 'wangwu@example.com',
      partyAUserId: claimant1Id,
      partyBUserId: respondent1Id,
      claimsSummary: '申请人要求被申请人退还律师费5万元。',
      evidenceSummary: '委托代理合同、付款凭证、案件材料。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-5',
      tenantId,
      title: '营销策划服务纠纷',
      description: '企业因营销策划公司未达到约定效果，拒绝支付尾款。',
      disputeType: 'contract',
      amount: 80000,
      partyAName: '某营销公司',
      partyBName: '某科技公司',
      partyAContact: 'lisi@example.com',
      partyBContact: 'zhaoliu@example.com',
      partyAUserId: claimant2Id,
      partyBUserId: respondent2Id,
      claimsSummary: '申请人要求被申请人支付营销策划服务尾款8万元。',
      evidenceSummary: '服务合同、策划方案、效果报告。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-6',
      tenantId,
      title: '材料加工合同纠纷',
      description: '委托方因加工方交付的材料不符合质量要求，要求赔偿损失。',
      disputeType: 'contract',
      amount: 120000,
      partyAName: '某制造公司',
      partyBName: '某加工厂',
      partyAContact: 'zhouqi@example.com',
      partyBContact: 'wuba@example.com',
      partyAUserId: claimant3Id,
      partyBUserId: respondent3Id,
      claimsSummary: '申请人要求被申请人赔偿材料损失12万元。',
      evidenceSummary: '加工合同、材料规格书、质检报告。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-7',
      tenantId,
      title: '设备采购合同纠纷',
      description: '买方因设备存在质量问题，要求卖方维修或更换。',
      disputeType: 'contract',
      amount: 350000,
      partyAName: '某工厂',
      partyBName: '某设备公司',
      partyAContact: 'zhangsan@example.com',
      partyBContact: 'wangwu@example.com',
      partyAUserId: claimant1Id,
      partyBUserId: respondent1Id,
      claimsSummary: '申请人要求被申请人维修或更换设备，并赔偿停工损失。',
      evidenceSummary: '采购合同、设备验收报告、维修记录。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    // 新增6个案件
    {
      id: '2026-8',
      tenantId,
      title: '房屋买卖合同纠纷',
      description: '甲乙双方签订房屋买卖合同，因房价波动，卖方拒绝履行合同义务，买方要求继续履行或赔偿损失。',
      disputeType: 'contract',
      amount: 3500000,
      partyAName: '张先生',
      partyBName: '李女士',
      partyAContact: 'zhangsan@example.com',
      partyBContact: 'wangwu@example.com',
      partyAUserId: claimant1Id,
      partyBUserId: respondent1Id,
      claimsSummary: '申请人要求被申请人继续履行合同，交付房屋并办理过户手续；或赔偿违约金70万元。',
      evidenceSummary: '房屋买卖合同、付款凭证、沟通记录、房屋评估报告。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-9',
      tenantId,
      title: '网购商品质量纠纷',
      description: '消费者在电商平台购买电子产品，收到货后发现存在质量问题，要求退款赔偿。',
      disputeType: 'consumer',
      amount: 8999,
      partyAName: '消费者王女士',
      partyBName: '某电商平台',
      partyAContact: 'lisi@example.com',
      partyBContact: 'zhaoliu@example.com',
      partyAUserId: claimant2Id,
      partyBUserId: respondent2Id,
      claimsSummary: '申请人要求退货退款，并三倍赔偿26997元。',
      evidenceSummary: '购买订单截图、商品照片、检测报告、与客服沟通记录。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-10',
      tenantId,
      title: '物业服务质量纠纷',
      description: '业主因小区物业服务质量差，公共区域卫生差、安保不到位等问题，拒缴物业费。',
      disputeType: 'property',
      amount: 36000,
      partyAName: '某物业公司',
      partyBName: '业主委员会',
      partyAContact: 'zhouqi@example.com',
      partyBContact: 'wuba@example.com',
      partyAUserId: claimant3Id,
      partyBUserId: respondent3Id,
      claimsSummary: '申请人要求业主支付拖欠的物业费36000元及滞纳金。',
      evidenceSummary: '物业服务合同、缴费通知、现场照片、业主投诉记录。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-11',
      tenantId,
      title: '软件著作权侵权纠纷',
      description: '某公司未经授权使用另一公司的软件著作权，被要求停止侵权并赔偿损失。',
      disputeType: 'ip',
      amount: 500000,
      partyAName: '科技公司A',
      partyBName: '科技公司B',
      partyAContact: 'zhangsan@example.com',
      partyBContact: 'wangwu@example.com',
      partyAUserId: claimant1Id,
      partyBUserId: respondent1Id,
      claimsSummary: '申请人要求被申请人停止侵权行为，销毁侵权复制品，并赔偿经济损失50万元。',
      evidenceSummary: '软件著作权登记证书、源代码对比报告、侵权证据公证书。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-12',
      tenantId,
      title: '民间借贷纠纷',
      description: '借款人向出借人借款100万元，约定还款期限届满后未能按时还款。',
      disputeType: 'finance',
      amount: 1000000,
      partyAName: '王先生',
      partyBName: '刘先生',
      partyAContact: 'lisi@example.com',
      partyBContact: 'zhaoliu@example.com',
      partyAUserId: claimant2Id,
      partyBUserId: respondent2Id,
      claimsSummary: '申请人要求被申请人偿还借款本金100万元及利息12万元。',
      evidenceSummary: '借款合同、银行转账记录、催款记录、微信聊天记录。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
    {
      id: '2026-13',
      tenantId,
      title: '货物运输损坏纠纷',
      description: '物流公司运输过程中导致货物损坏，托运人要求赔偿损失。',
      disputeType: 'civil',
      amount: 25000,
      partyAName: '某贸易公司',
      partyBName: '某物流公司',
      partyAContact: 'zhouqi@example.com',
      partyBContact: 'wuba@example.com',
      partyAUserId: claimant3Id,
      partyBUserId: respondent3Id,
      claimsSummary: '申请人要求被申请人赔偿货物损失25000元及运费损失。',
      evidenceSummary: '运输合同、货物清单、损坏照片、损失评估报告。',
      phase: 'intake',
      status: 'pending',
      accessCode: '123',
      createdAt: nowTimestamp,
      updatedAt: nowTimestamp,
    },
  ]

  for (const c of sampleCases) {
    db.insert(cases).values(c).run()
  }

  console.log('✓ Created cases')

  // ============================================================
  // 5. 创建案件活动日志
  // ============================================================
  const caseIds = ['2026-1', '2026-2', '2026-3', '2026-4', '2026-5', '2026-6', '2026-7', '2026-8', '2026-9', '2026-10', '2026-11', '2026-12', '2026-13']
  const caseNames = ['加盟连锁合同纠纷', '情感咨询服务纠纷', '教育培训合同纠纷', '法律代理合同纠纷', '营销策划服务纠纷', '材料加工合同纠纷', '设备采购合同纠纷', '房屋买卖合同纠纷', '网购商品质量纠纷', '物业服务质量纠纷', '软件著作权侵权纠纷', '民间借贷纠纷', '货物运输损坏纠纷']

  const activities = caseIds.map((caseId, index) => ({
    id: uuid(),
    caseId,
    tenantId,
    activityType: 'case_created',
    description: `案件 "${caseNames[index]}" 已提交`,
    performedByName: '系统',
    createdAt: nowTimestamp,
  }))

  for (const a of activities) {
    db.insert(caseActivities).values(a).run()
  }

  console.log('✓ Created case activities')

  console.log('\n✅ Seed data created successfully!')
  console.log('\n📋 测试账号:')
  console.log('─'.repeat(50))
  console.log('系统管理员: admin / 123')
  console.log('案件管理员: wangzhuren / 123')
  console.log('申请人: zhangsan / 123')
  console.log('申请人: lisi / 123')
  console.log('申请人: zhouqi / 123')
  console.log('被申请人: wangwu / 123')
  console.log('被申请人: zhaoliu / 123')
  console.log('被申请人: wuba / 123')
  console.log('─'.repeat(50))
  console.log('\n📁 测试案件 (状态: 已提交，密码均为 123):')
  console.log('─'.repeat(50))
  console.log('原有案件:')
  console.log('  2026-1: 加盟连锁合同纠纷')
  console.log('  2026-2: 情感咨询服务纠纷')
  console.log('  2026-3: 教育培训合同纠纷')
  console.log('  2026-4: 法律代理合同纠纷')
  console.log('  2026-5: 营销策划服务纠纷')
  console.log('  2026-6: 材料加工合同纠纷')
  console.log('  2026-7: 设备采购合同纠纷')
  console.log('新增案件:')
  console.log('  2026-8: 房屋买卖合同纠纷 (合同纠纷)')
  console.log('  2026-9: 网购商品质量纠纷 (消费纠纷)')
  console.log('  2026-10: 物业服务质量纠纷 (物业纠纷)')
  console.log('  2026-11: 软件著作权侵权纠纷 (知识产权)')
  console.log('  2026-12: 民间借贷纠纷 (金融纠纷)')
  console.log('  2026-13: 货物运输损坏纠纷 (小额民商事)')
  console.log('─'.repeat(50))
}

// Run directly
seed().catch(console.error)
