import test from 'node:test'
import assert from 'node:assert/strict'
import { renderRichText, looksLikeFlatTable, escapeHtml } from '../server/utils/md-table'
import { VALUE_SKILLS } from '../server/utils/value-skills'

// ============================================================
// Markdown 表格渲染 —— 覆盖全部表格化技能的列头格式
// 目标：一次验证 18 个表格化技能的输出格式都能正确渲染为 <table>
// ============================================================

/** 从技能 prompt 中提取"列为：xxx"表格列定义 */
function extractTableCols(prompt: string): string[][] {
  const cols: string[][] = []
  const re = /列为：([^。]+)/g
  let m
  while ((m = re.exec(prompt)) !== null) {
    // 可能含多个表格要求（v2 有三段），按"；"分隔后取含 | 的
    const parts = m[1].split('；')
    for (const p of parts) {
      if (p.includes('|')) {
        cols.push(p.split('|').map((c) => c.trim()))
      }
    }
  }
  return cols
}

test('渲染: 标准 Markdown 管道表格', () => {
  const md = '| 时间 | 事件 | 信息来源 |\n|---|---|---|\n| 2024-04-14 | 宣传 | 聊天记录 |\n| 2024-04-15 | 签约 | 合同 |'
  const html = renderRichText(md)
  assert.equal(html.includes('<table class="eval-md-table">'), true)
  assert.equal(html.includes('<th>时间</th>'), true)
  assert.equal(html.includes('<td>2024-04-14</td>'), true)
  assert.equal(html.includes('<tbody>'), true)
})

test('渲染: 全部表格化技能的真实列头格式都能渲染为表格', () => {
  const tableSkills = VALUE_SKILLS.filter((s) => s.prompt.includes('Markdown 表格'))
  assert.ok(tableSkills.length >= 18, `表格化技能应≥18，实际 ${tableSkills.length}`)

  const failures: string[] = []
  for (const skill of tableSkills) {
    const colSets = extractTableCols(skill.prompt)
    assert.ok(colSets.length > 0, `技能 ${skill.id} 应含表格列定义`)
    for (const cols of colSets) {
      // 构造含该列头的 markdown 表格（表头 + 分隔行 + 2 行数据）
      const header = `| ${cols.join(' | ')} |`
      const sep = `| ${cols.map(() => '---').join(' | ')} |`
      const row1 = `| ${cols.map((_, i) => `值${i + 1}`).join(' | ')} |`
      const md = `${header}\n${sep}\n${row1}\n${row1}`
      const html = renderRichText(md)
      if (!html.includes('<table class="eval-md-table">')) {
        failures.push(`${skill.id}(${cols.join('/')})`)
      }
      // 每个列名都应作为表头出现
      for (const col of cols) {
        if (!html.includes(`<th>${escapeHtml(col)}</th>`)) {
          failures.push(`${skill.id} 缺列: ${col}`)
        }
      }
    }
  }
  assert.deepEqual(failures, [], `失败的表格格式: ${failures.join('; ')}`)
})

test('渲染: 存量全角空格平铺表格', () => {
  const flat = '角色　信息　信息来源\n申请人　罗鹏，男　仲裁申请书\n被申请人　广州某公司　仲裁申请书'
  assert.equal(looksLikeFlatTable(flat.split('\n')), true)
  const html = renderRichText(flat)
  assert.equal(html.includes('<table class="eval-md-table">'), true)
  assert.equal(html.includes('<th>角色</th>'), true)
  assert.equal(html.includes('<td>申请人</td>'), true)
})

test('渲染: 表格与段落混合', () => {
  const md = '一、各方主体\n\n| 角色 | 信息 |\n|---|---|\n| 申请人 | 罗鹏 |\n\n二、结论\n案件可调解。'
  const html = renderRichText(md)
  assert.equal(html.includes('<table'), true)
  assert.equal(html.includes('<p>二、结论<br/>案件可调解。</p>'), true)
})

test('渲染: 空输入与纯文本', () => {
  assert.equal(renderRichText(''), '')
  const html = renderRichText('纯文本内容\n第二行')
  assert.equal(html.includes('<table'), false)
  assert.equal(html.includes('<p>'), true)
})

test('渲染: XSS 转义', () => {
  const md = '| 名称 |\n|---|\n| <script>alert(1)</script> |'
  const html = renderRichText(md)
  assert.equal(html.includes('<script>'), false)
  assert.equal(html.includes('&lt;script&gt;'), true)
})

test('渲染: 不规则行（列数不足补齐空单元格）', () => {
  const md = '| 序号 | 名称 | 备注 |\n|---|---|---|\n| 1 | 仅两列 |'
  const html = renderRichText(md)
  assert.equal(html.includes('<td>1</td>'), true)
  assert.equal(html.includes('<td></td>'), true)
})
