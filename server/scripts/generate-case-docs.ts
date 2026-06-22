import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import * as fs from 'fs'
import * as path from 'path'

// 案件数据
const cases = [
  {
    id: '2026-8',
    title: '房屋买卖合同纠纷',
    type: '合同',
    applicant: '张先生',
    respondent: '李女士',
    amount: 3500000,
    description: '甲乙双方签订房屋买卖合同，因房价波动，卖方拒绝履行合同义务，买方要求继续履行或赔偿损失。',
    claims: '1. 判令被申请人继续履行合同，交付房屋并办理过户手续；\n2. 判令被申请人支付违约金70万元；\n3. 本案仲裁费用由被申请人承担。',
    facts: '2025年3月15日，申请人与被申请人签订《房屋买卖合同》，约定被申请人将其名下位于广州市天河区某小区房屋出售给申请人，总价款350万元。申请人已按约支付定金70万元。然而，因近期房价上涨，被申请人以各种理由拒绝履行合同义务。',
    evidence: '1. 《房屋买卖合同》原件\n2. 定金支付凭证\n3. 银行转账记录\n4. 双方沟通记录\n5. 房屋评估报告'
  },
  {
    id: '2026-9',
    title: '网购商品质量纠纷',
    type: '消费',
    applicant: '消费者王女士',
    respondent: '某电商平台',
    amount: 8999,
    description: '消费者在电商平台购买电子产品，收到货后发现存在质量问题，要求退款赔偿。',
    claims: '1. 判令被申请人退货退款8999元；\n2. 判令被申请人三倍赔偿26997元；\n3. 本案仲裁费用由被申请人承担。',
    facts: '2025年5月10日，申请人在被申请人经营的电商平台购买某品牌笔记本电脑一台，支付价款8999元。收货后发现电脑存在严重质量问题，多次蓝屏死机。经官方售后检测，确认为硬件故障。申请人要求退货退款并赔偿，被申请人拒绝。',
    evidence: '1. 购买订单截图\n2. 商品照片\n3. 官方售后检测报告\n4. 与客服沟通记录\n5. 付款凭证'
  },
  {
    id: '2026-10',
    title: '物业服务质量纠纷',
    type: '物业',
    applicant: '某物业公司',
    respondent: '业主委员会',
    amount: 36000,
    description: '业主因小区物业服务质量差，公共区域卫生差、安保不到位等问题，拒缴物业费。',
    claims: '1. 判令被申请人支付拖欠的物业费36000元；\n2. 判令被申请人支付滞纳金3600元；\n3. 本案仲裁费用由被申请人承担。',
    facts: '申请人与被申请人于2023年1月签订《物业服务合同》，约定由申请人提供物业服务，被申请人按月缴纳物业费。自2024年1月起，被申请人以物业服务质量差为由拒缴物业费，至今累计拖欠36000元。',
    evidence: '1. 《物业服务合同》\n2. 缴费通知\n3. 现场照片\n4. 业主投诉记录\n5. 物业服务记录'
  },
  {
    id: '2026-11',
    title: '软件著作权侵权纠纷',
    type: '知识产权',
    applicant: '科技公司A',
    respondent: '科技公司B',
    amount: 500000,
    description: '某公司未经授权使用另一公司的软件著作权，被要求停止侵权并赔偿损失。',
    claims: '1. 判令被申请人停止侵权行为；\n2. 判令被申请人销毁侵权复制品；\n3. 判令被申请人赔偿经济损失50万元；\n4. 本案仲裁费用由被申请人承担。',
    facts: '申请人是某管理软件的著作权人，已取得软件著作权登记证书。被申请人未经授权，擅自复制、修改并商业使用申请人的软件，侵犯了申请人的著作权。',
    evidence: '1. 软件著作权登记证书\n2. 源代码对比报告\n3. 侵权证据公证书\n4. 损失计算依据\n5. 被申请人使用侵权软件的证据'
  },
  {
    id: '2026-12',
    title: '民间借贷纠纷',
    type: '金融',
    applicant: '王先生',
    respondent: '刘先生',
    amount: 1000000,
    description: '借款人向出借人借款100万元，约定还款期限届满后未能按时还款。',
    claims: '1. 判令被申请人偿还借款本金100万元；\n2. 判令被申请人支付利息12万元；\n3. 本案仲裁费用由被申请人承担。',
    facts: '2024年6月1日，被申请人向申请人借款100万元，约定借款期限一年，年利率12%。申请人通过银行转账方式支付了借款。借款到期后，被申请人未能按时还款，经多次催要无果。',
    evidence: '1. 借款合同\n2. 银行转账记录\n3. 催款记录\n4. 微信聊天记录\n5. 利息计算表'
  },
  {
    id: '2026-13',
    title: '货物运输损坏纠纷',
    type: '民商事',
    applicant: '某贸易公司',
    respondent: '某物流公司',
    amount: 25000,
    description: '物流公司运输过程中导致货物损坏，托运人要求赔偿损失。',
    claims: '1. 判令被申请人赔偿货物损失25000元；\n2. 判令被申请人退还运费2000元；\n3. 本案仲裁费用由被申请人承担。',
    facts: '2025年4月15日，申请人委托被申请人运输一批电子产品，支付运费2000元。运输过程中，因被申请人操作不当，导致货物严重损坏，经评估损失25000元。',
    evidence: '1. 运输合同\n2. 货物清单\n3. 损坏照片\n4. 损失评估报告\n5. 运费支付凭证'
  }
]

// 生成申请书
async function generateApplication(caseData: typeof cases[0]) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: '仲裁申请书',
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: '申请人：', bold: true }),
            new TextRun({ text: caseData.applicant }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: '被申请人：', bold: true }),
            new TextRun({ text: caseData.respondent }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: '仲裁请求：', bold: true }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: caseData.claims }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: '事实与理由：', bold: true }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: caseData.facts }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: '证据清单：', bold: true }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: caseData.evidence }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: `申请人：${caseData.applicant}` }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: '2025年6月20日' }),
          ],
        }),
      ],
    }],
  })

  return Packer.toBuffer(doc)
}

// 生成证据材料
async function generateEvidence(caseData: typeof cases[0]) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: '证据材料',
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: `案件编号：${caseData.id}`, bold: true }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `案件名称：${caseData.title}` }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `申请人：${caseData.applicant}` }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `被申请人：${caseData.respondent}` }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [
            new TextRun({ text: '证据清单：', bold: true }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({ text: caseData.evidence }),
          ],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: `申请人：${caseData.applicant}` }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: '2025年6月20日' }),
          ],
        }),
      ],
    }],
  })

  return Packer.toBuffer(doc)
}

// 主函数
async function main() {
  const baseDir = path.join(process.cwd(), 'uploads', 'cases')

  for (const caseData of cases) {
    const caseDir = path.join(baseDir, caseData.id)

    // 创建目录
    if (!fs.existsSync(caseDir)) {
      fs.mkdirSync(caseDir, { recursive: true })
    }

    // 生成申请书
    const appBuffer = await generateApplication(caseData)
    const appPath = path.join(caseDir, `仲裁申请书（${caseData.type}-测试）.docx`)
    fs.writeFileSync(appPath, appBuffer)
    console.log(`✓ 生成申请书: ${appPath}`)

    // 生成证据材料
    const eviBuffer = await generateEvidence(caseData)
    const eviPath = path.join(caseDir, `证据（${caseData.type}-测试）.docx`)
    fs.writeFileSync(eviPath, eviBuffer)
    console.log(`✓ 生成证据材料: ${eviPath}`)
  }

  console.log('\n✅ 所有案件文档生成完成！')
}

main().catch(console.error)
