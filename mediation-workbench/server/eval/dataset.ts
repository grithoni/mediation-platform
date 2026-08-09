// ============================================================
// Eval 评估数据集（golden dataset）
//
// 用法：对某个技能/提示词/模型的输出，用 LLM-as-judge 按 rubric 打分，
// 与本数据集标注的"期望要点"对比，度量回答质量是否达标、是否回退。
//
// 新增样本规则：
//  - 必须脱敏（无真实姓名/手机号/地址，用 甲方/乙方 等占位）
//  - 标注期望要点：正确回答应当覆盖的事实/结论/风险点
//  - 标注易错点：常见幻觉/遗漏，judge 需重点检查
// ============================================================

export interface EvalSample {
  id: string
  /** 被测技能/能力 id，如 value_v2(案件摘要)、value_v3(争点识别) */
  skillId: string
  /** 输入材料（脱敏后） */
  materials: string
  /** 期望回答覆盖的要点（judge 逐条检查） */
  expectedPoints: string[]
  /** 易错点：模型容易幻觉或遗漏的地方 */
  pitfallPoints: string[]
  /** 期望的输出形态（如：结构、是否用表格、是否标注来源） */
  expectedForm?: string
}

export const EVAL_DATASET: EvalSample[] = [
  {
    id: 'summary-001',
    skillId: 'v2',
    materials:
      '甲方（申请人）诉称：2025年3月与乙方签订《购销合同》，约定甲方向乙方供应钢材100吨，单价3800元/吨，货到后30日内付款。甲方于2025年4月15日交付全部货物，乙方至今未付货款38万元。甲方主张：支付货款38万元及逾期利息。乙方（被申请人）辩称：部分钢材存在质量问题，已向甲方提出书面异议但甲方未处理，故拒绝付款。证据：购销合同复印件、送货单、质量异议函。',
    expectedPoints: [
      '识别双方主体（甲方为供货方、乙方为购货方）',
      '金额准确（货款38万元，单价3800元/吨，100吨）',
      '争议焦点包含"货物质量异议是否成立"',
      '时间线（2025年3月签约、4月交付）',
      '不虚构双方未主张的事实',
    ],
    pitfallPoints: [
      '不要将质量异议单方面认定为事实（乙方主张未证实）',
      '不要遗漏逾期利息请求',
      '金额计算错误（3800×100=38万）',
    ],
    expectedForm: '分节结构：双方主体 / 事实背景 / 核心争点 / 时间线 / 证据清单',
  },
  {
    id: 'dispute-001',
    skillId: 'v3',
    materials:
      '甲方与乙方签订房屋租赁合同，租期3年。现乙方拖欠租金6个月共18万元，甲方要求解除合同并收回房屋。乙方称因经营困难无力支付，希望协商减免部分租金并分期支付。双方无其他争议。',
    expectedPoints: [
      '显性争点：是否解除合同、拖欠租金如何支付',
      '潜在争点：租金减免幅度、分期期限、违约后果',
      '区分要求（甲方要解除合同）与利益（甲方要回笼资金/收回房屋，乙方要维持经营）',
      '按重要性排序',
    ],
    pitfallPoints: [
      '不要把"拖欠租金"直接等同于"应解除合同"（解除权需审查合同约定）',
      '忽略乙方"分期支付"方案的可能性',
    ],
    expectedForm: '争点清单：名称 / 涉及方 / 类型 / 优先级 / 是否可调解',
  },
  {
    id: 'risk-001',
    skillId: 'u4',
    materials:
      '拟议方案：甲方在收到乙方首期付款10万元后5日内交付货物，乙方余款28万元分6个月付清。若乙方逾期付款超过30日，甲方可解除合同并追讨全部欠款。乙方要求：若甲方迟延交货，应按日支付违约金。',
    expectedPoints: [
      '识别履约风险：乙方逾期付款、甲方迟延交货',
      '识别金额风险：分期付款的坏账风险',
      '缓释措施：违约金、担保、解除权',
      '区分高概率风险与低概率高影响风险',
    ],
    pitfallPoints: [
      '遗漏甲方迟延交货时的乙方救济',
      '把解除权表述为无条件（实际有30日宽限期条件）',
    ],
  },
  {
    id: 'closure-001',
    skillId: 'e3',
    materials:
      '和解协议草案：一、乙方于2026年1月15日前向甲方支付20万元；二、余款8万元于2026年3月31日前支付；三、甲方收到全部款项后3日内向法院申请撤诉。',
    expectedPoints: [
      '检查金额一致性（20万+8万=28万，与欠款总额对应）',
      '检查日期逻辑（1月15日早于3月31日，合理）',
      '检查"撤诉"与"全部款项"的履行顺序绑定',
      '识别遗漏：未约定逾期付款违约责任',
    ],
    pitfallPoints: [
      '忽略"撤诉"与"收款"的顺序风险（若甲方先撤诉后乙方不付余款）',
      '未提示补充逾期条款',
    ],
    expectedForm: '问题清单：问题 / 修改建议 / 需人工确认事项',
  },
]

export interface EvalRubric {
  skillId: string
  /** 维度与满分 */
  dimensions: { key: string; name: string; maxScore: number }[]
}

/** 按技能定义 rubric 维度 */
export const EVAL_RUBRICS: EvalRubric[] = [
  {
    skillId: 'v2',
    dimensions: [
      { key: 'completeness', name: '要点覆盖完整度', maxScore: 5 },
      { key: 'accuracy', name: '事实与数字准确性', maxScore: 5 },
      { key: 'structure', name: '结构清晰度', maxScore: 3 },
      { key: 'grounding', name: '不虚构/不臆断', maxScore: 4 },
    ],
  },
  {
    skillId: 'v3',
    dimensions: [
      { key: 'completeness', name: '争点识别完整度', maxScore: 5 },
      { key: 'insight', name: '区分要求与利益', maxScore: 4 },
      { key: 'priority', name: '优先级排序合理', maxScore: 3 },
      { key: 'grounding', name: '不虚构/不臆断', maxScore: 4 },
    ],
  },
  {
    skillId: 'u4',
    dimensions: [
      { key: 'completeness', name: '风险识别完整度', maxScore: 5 },
      { key: 'severity', name: '风险分级准确', maxScore: 3 },
      { key: 'mitigation', name: '缓释措施可行性', maxScore: 4 },
      { key: 'grounding', name: '基于材料不臆断', maxScore: 4 },
    ],
  },
  {
    skillId: 'e3',
    dimensions: [
      { key: 'completeness', name: '问题发现完整度', maxScore: 5 },
      { key: 'consistency', name: '金额/日期/条件一致性检查', maxScore: 4 },
      { key: 'actionable', name: '修改建议可执行性', maxScore: 4 },
      { key: 'grounding', name: '基于材料不臆断', maxScore: 3 },
    ],
  },
]

export function getRubricFor(skillId: string): EvalRubric | undefined {
  return EVAL_RUBRICS.find((r) => r.skillId === skillId)
}

export function getSamplesFor(skillId: string): EvalSample[] {
  return EVAL_DATASET.filter((s) => s.skillId === skillId)
}
