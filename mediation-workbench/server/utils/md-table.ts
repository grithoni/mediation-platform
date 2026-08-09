// ============================================================
// Markdown 表格 → HTML 表格渲染（共享工具）
// 同时支持：
//  - 标准 Markdown 管道表格（| a | b |）
//  - 存量"全角空格平铺"表格（表头含常见列名时识别）
// 输出经 escapeHtml 转义，安全用于 v-html。
// 前后端共用（前端 vue 引入渲染，服务端可用于测试/导出）。
// ============================================================

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 全角空格分隔的行，若表头含常见表格列名则视为"存量平铺表格" */
export const FULLWIDTH_TABLE_HEADER_WORDS = [
  '时间', '事件', '信息来源', '角色', '信息', '项目', '内容', '名称', '金额', '数量',
  '状态', '类别', '优先级', '风险', '建议', '序号', '证据名称', '要点', '来源', '性质',
  '说明', '备注', '编号', '结果',
]

export function looksLikeFlatTable(lines: string[]): boolean {
  if (lines.length < 2) return false
  const header = lines[0]
  if (!header.includes('　')) return false
  const cells = header.split('　').map((c) => c.trim())
  if (cells.length < 2) return false
  return cells.some((c) => FULLWIDTH_TABLE_HEADER_WORDS.includes(c))
}

function parsePipeRow(l: string): string[] {
  return l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

function buildTableHtml(header: string[], body: string[][]): string {
  const colCount = Math.max(header.length, ...body.map((r) => r.length))
  const th = header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const trs = body.map((r) => {
    const cells = Array.from({ length: colCount }, (_, ci) => `<td>${escapeHtml(r[ci] ?? '')}</td>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `<table class="eval-md-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
}

/**
 * 将含 Markdown 表格的文本渲染为 HTML（表格转 <table>，其余转 <p>）。
 * @param raw 可能含 Markdown 表格的文本（支持管道表格与存量平铺表格）
 * @param stripPlain 对非表格段落的清理函数（默认仅保留换行；前端可传入其 stripValueMarkdown）
 */
export function renderRichText(raw: string, stripPlain?: (t: string) => string): string {
  if (!raw) return ''
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const strip = stripPlain || ((t: string) => t.trim())

  while (i < lines.length) {
    const isPipeRow = /^\s*\|.*\|\s*$/.test(lines[i]) || /^\s*\|.*\|\s*$/.test(lines[i] + '|')

    // 存量平铺表格：从表头行起，跳过空行收集后续含全角空格的数据行
    const flatMatch = !isPipeRow
      ? (() => {
          const block: string[] = []
          let j = i
          const first = lines[j]?.trim() || ''
          if (!first.includes('　') || first.startsWith('　')) return null
          block.push(first)
          j++
          while (j < lines.length) {
            const t = lines[j].trim()
            if (t === '') { j++; continue }
            if (t.includes('　') && !t.startsWith('　')) {
              block.push(t)
              j++
            } else {
              break
            }
          }
          return block.length >= 2 && looksLikeFlatTable(block) ? { block, next: j } : null
        })()
      : null

    if (!isPipeRow && !flatMatch) {
      // 非表格行：聚合连续非表格行
      const block: string[] = []
      while (i < lines.length && !(/^\s*\|.*\|\s*$/.test(lines[i]) || /^\s*\|.*\|\s*$/.test(lines[i] + '|'))) {
        block.push(lines[i])
        i++
      }
      const stripped = strip(block.join('\n'))
      if (stripped) out.push(`<p>${escapeHtml(stripped).replace(/\n/g, '<br/>')}</p>`)
      continue
    }

    if (flatMatch) {
      const flatBlock = flatMatch.block
      const header = flatBlock[0].split('　').map((c) => c.trim())
      const body = flatBlock.slice(1).map((l) => l.split('　').map((c) => c.trim()))
      out.push(buildTableHtml(header, body))
      i = flatMatch.next
      continue
    }

    // Markdown 管道表格
    const tableLines: string[] = []
    while (i < lines.length && (/^\s*\|.*\|\s*$/.test(lines[i]) || /^\s*\|.*\|\s*$/.test(lines[i] + '|'))) {
      tableLines.push(lines[i].trim())
      i++
    }
    const dataRows = tableLines.filter((l) => !parsePipeRow(l).every((c) => /^:?-{2,}:?$/.test(c)))
    if (dataRows.length === 0) continue
    const header = parsePipeRow(dataRows[0])
    const body = dataRows.slice(1).map(parsePipeRow)
    out.push(buildTableHtml(header, body))
  }
  return out.join('\n')
}
