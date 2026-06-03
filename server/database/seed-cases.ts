import { getDb } from './index'
import { cases } from './schema'
import { eq } from 'drizzle-orm'

const caseData = [
  {
    id: '2026-1',
    title: '加盟连锁合同纠纷',
    description: '申请人张丽与B连锁加盟有限公司因加盟合同虚假宣传、服务承诺未兑现产生争议，标的额50,000元。',
    partyAName: '张丽',
    partyBName: 'B连锁加盟有限公司',
    claimsSummary:
      '请求：解除《连锁门店加盟服务协议》；退还加盟费50,000元；被申请人承担仲裁费用。' +
      '事实：申请人签约并支付50,000元加盟费，被申请人存在虚假宣传，承诺的加盟扶持、运营指导、供应链支持均与实际不符，沟通退款无果。' +
      '法律依据：民法典第496条（格式条款提示说明义务）。',
    evidenceSummary:
      '证据1：合同编号BJM-20250320，加盟费50,000元，合作期2025-03-20至2028-03-19，格式合同未提示说明。' +
      '证据2：银行转账50,000元（2025-03-20）。' +
      '证据3：签约前微信聊天，招商经理王浩承诺全程一对一运营指导、免费选址、供应链低20%。' +
      '证据4：签约后聊天，王浩让申请人自行处理，售后拒绝退款。',
    accessCode: '123',
    status: 'active',
    folder: 'case1_加盟连锁',
  },
  {
    id: '2026-2',
    title: '情感咨询服务合同纠纷',
    description: '申请人陈芳与C情感咨询有限公司因情感挽回服务虚假宣传、咨询师资质不符产生争议，标的额12,800元。',
    partyAName: '陈芳',
    partyBName: 'C情感咨询有限公司',
    claimsSummary:
      '请求：解除《情感咨询服务协议》；退还服务费12,800元；被申请人承担仲裁费用。' +
      '事实：申请人签约并支付12,800元，被申请人虚假宣传、咨询师资质不符、服务内容缩水。沟通退款无果。' +
      '法律依据：民法典第496条。',
    evidenceSummary:
      '证据1：合同编号C-QG-20250510，服务期30天，配备国家二级心理咨询师，格式合同未提示说明。' +
      '证据2：微信支付12,800元（2025-05-10）。' +
      '证据3：签约前聊天，咨询师林雪承诺百分百挽回、无效退款。' +
      '证据4：签约后聊天，咨询师不回复、查不到资质，客服称费用不退。',
    accessCode: '123',
    status: 'active',
    folder: 'case2_情感咨询',
  },
  {
    id: '2026-3',
    title: '教育培训合同纠纷',
    description: '申请人罗强与A教育科技有限公司因成人硕士培训虚假宣传、服务质量不达标产生争议，标的额14,800元。',
    partyAName: '罗强',
    partyBName: 'A教育科技有限公司',
    claimsSummary:
      '请求：解除《网络培训服务协议》；退还14,800元；被申请人承担仲裁费用。' +
      '事实：申请人通过淘宝订单支付14,800元，被申请人虚假宣传、承诺与实际不符。沟通退款无果。' +
      '法律依据：民法典第496条。',
    evidenceSummary:
      '证据1：合同编号A-JP-20250415，提供成人硕士网络培训，格式合同未提示说明。' +
      '证据2：淘宝订单TB2025041568792，付款14,800元（2025-04-15）。' +
      '证据3：签约前聊天，招生老师刘思远承诺包过线、不过全额退费。' +
      '证据4：签约后聊天，课程未更新、答疑无人回复，客服称不予退费。',
    accessCode: '123',
    status: 'active',
    folder: 'case3_教育培训',
  },
  {
    id: '2026-4',
    title: '法律代理服务合同纠纷',
    description: '申请人刘洋与D法律咨询服务有限公司因法律代理服务虚假宣传、未安排律师出庭产生争议，标的额15,000元。',
    partyAName: '刘洋',
    partyBName: 'D法律咨询服务有限公司',
    claimsSummary:
      '请求：解除《法律代理服务合同》；退还诉讼代理费15,000元；被申请人承担仲裁费用。' +
      '事实：申请人支付15,000元代理费，被申请人未安排具备资质律师出庭，代理质量严重不达标。沟通退款无果。' +
      '法律依据：民法典第496条。',
    evidenceSummary:
      '证据1：合同编号DL-20250708，指派执业律师代理民事诉讼全流程，格式合同未提示说明。' +
      '证据2：银行转账15,000元（2025-07-08）。' +
      '证据3：签约前聊天，业务经理孙磊承诺专业律师团队全程代理。' +
      '证据4：签约后聊天，孙磊让申请人自行准备材料应诉，客服称代理费不退。',
    accessCode: '123',
    status: 'active',
    folder: 'case4_法律代理',
  },
  {
    id: '2026-5',
    title: '营销策划服务合同纠纷',
    description: '申请人林小芳与E营销策划有限公司因营销策划服务虚假宣传、未执行约定服务产生争议，标的额28,000元。',
    partyAName: '林小芳',
    partyBName: 'E营销策划有限公司',
    claimsSummary:
      '请求：解除《营销策划服务合同》；退还服务费28,000元；违约金5,600元（标的额20%）；被申请人承担仲裁费用。' +
      '事实：申请人支付28,000元，被申请人策划方案粗制滥造、推广活动未执行、质量严重不达标。沟通退款无果。' +
      '法律依据：民法典第496条。',
    evidenceSummary:
      '证据1：合同编号EYX-20250602，提供品牌策划、线上推广、活动执行等，服务期3个月，违约责任约定20%违约金。' +
      '证据2：银行转账28,000元（2025-06-02）。' +
      '证据3：签约前聊天，项目总监杨丽华承诺保证营业额提升30%以上。' +
      '证据4：签约后聊天，方案与餐饮店不匹配、推广和活动全未做，客服称服务费不退。',
    accessCode: '123',
    status: 'active',
    folder: 'case5_营销策划',
  },
  {
    id: '2026-6',
    title: '材料加工委托合同纠纷',
    description: '申请人吴建军与F材料加工有限公司因材料加工未按期交付、拒不退还预付款产生争议，标的额35,000元。',
    partyAName: '吴建军',
    partyBName: 'F材料加工有限公司',
    claimsSummary:
      '请求：解除《材料加工委托合同》；返还预付款35,000元；交付或赔偿原材料损失8,000元；违约金7,000元（标的额20%）；被申请人承担仲裁费用。' +
      '事实：申请人支付预付款35,000元并交付8,000元原材料，被申请人未按期完成加工、拒不交付。沟通无果。' +
      '法律依据：民法典第496条。',
    evidenceSummary:
      '证据1：合同编号FJG-20250812，加工期2025-08-12至09-25，违约责任约定返还预付款、赔偿原材料损失及20%违约金。' +
      '证据2：银行转账35,000元（2025-08-12）。' +
      '证据3：签约前后聊天，业务经理钱国强承诺15天交货、不合格免费返工。' +
      '证据4：签约后聊天，两个月后仍未交货，钱国强承认原材料已部分使用，客服称预付款不退。',
    accessCode: '123',
    status: 'active',
    folder: 'case6_材料加工',
  },
  {
    id: '2026-7',
    title: '设备采购合同纠纷',
    description: '申请人黄志远与G设备贸易有限公司因设备采购未按期交付、拒不退还预付款产生争议，标的额68,000元。',
    partyAName: '黄志远',
    partyBName: 'G设备贸易有限公司',
    claimsSummary:
      '请求：解除《设备采购合同》；退还预付款68,000元；违约金13,600元（标的额20%）；被申请人承担仲裁费用。' +
      '事实：申请人支付预付款68,000元，被申请人未按期交付设备、明确表示无法供货。沟通退款无果。' +
      '法律依据：民法典第496条。',
    evidenceSummary:
      '证据1：合同编号GC-20250920，交货期2025-10-05前，违约责任约定退还全部预付款及20%违约金。' +
      '证据2：银行转账68,000元（2025-09-20）。' +
      '证据3：签约前聊天，销售经理田光明承诺全新正品、7天内发货、质保两年。' +
      '证据4：签约后聊天，田光明以货源紧张推脱从未发货，客服称预付款暂时退不了。',
    accessCode: '123',
    status: 'active',
    folder: 'case7_设备采购',
  },
]

async function seedCases() {
  const db = getDb()

  // Remove old sample cases (CM-2025-*)
  const allCases = db.select().from(cases).all()
  for (const c of allCases) {
    if (c.id.startsWith('CM-')) {
      db.delete(cases).where(eq(cases.id, c.id)).run()
      console.log(`🗑 Removed old case ${c.id}`)
    }
  }

  let imported = 0
  for (const data of caseData) {
    const existing = db.select().from(cases).where(eq(cases.id, data.id)).all()
    if (existing.length > 0) {
      console.log(`⏭ ${data.id} already exists, skipping.`)
      continue
    }

    db.insert(cases)
      .values({
        id: data.id,
        title: data.title,
        description: data.description,
        partyAName: data.partyAName,
        partyBName: data.partyBName,
        claimsSummary: data.claimsSummary,
        evidenceSummary: data.evidenceSummary,
        accessCode: data.accessCode,
        status: data.status,
      })
      .run()

    console.log(`✓ ${data.id} — ${data.title} (${data.partyAName} vs ${data.partyBName})`)
    imported++
  }

  console.log(`\nDone! ${imported} cases imported.`)
  console.log('Access code for all cases: 123')
  console.log('Access via: http://localhost:3000/case/{案号}')
}

seedCases().catch(console.error)
