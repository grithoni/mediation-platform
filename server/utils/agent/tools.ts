// ============================================================
// Agent Tool System — Tool definitions + handlers
// Ported from GenericAgent (ga.py + tools_schema.json)
// ============================================================
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, access, readdir, stat } from 'node:fs/promises'
import { execSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
const _nodeRequire = createRequire(import.meta.url)
import { resolve, relative } from 'node:path'
import { getDb } from '../../database'
import { cases, messages, documents, caseDynamicFiles } from '../../database/schema'
import { eq, like } from 'drizzle-orm'
import type { ToolDefinition, ToolArgs, StepOutcome, AgentContext } from './types'
import { getWorkingCheckpoint, setWorkingCheckpoint, appendL2Fact, updateL1Index, getL1Index, getL2Facts } from './memory'

// ============================================================
// Tool schema definitions (OpenAI function-calling format)
// ============================================================
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: '读取文件或列出目录内容。传入目录路径列出其中所有文件，传入文件路径读取内容。修改文件前必须先读取获取内容。不要用code_read读取文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对或绝对）' },
          start: { type: 'integer', description: '起始行号（从1开始）' },
          count: { type: 'integer', description: '读取行数', default: 200 },
          keyword: { type: 'string', description: '[可选] 搜索关键词（不区分大小写），返回第一个匹配及其上下文' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_write',
      description: '创建/覆盖/追加文件。用于生成报告、提案、协议等文档。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' },
          mode: {
            type: 'string',
            enum: ['overwrite', 'append', 'prepend'],
            description: '写入模式',
            default: 'overwrite',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_docx',
      description: '读取docx/doc文件内容（仲裁申请书、证据等法律文书）。传入文件路径，提取纯文本内容。用于查看案件相关文书。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'docx/doc文件路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_run',
      description: '执行JavaScript/Python代码（用于数据分析、文本处理、计算）。支持require("fs")和require("path")。不要用此工具读取文件——请用file_read。',
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            enum: ['javascript', 'python'],
            description: '代码语言',
            default: 'javascript',
          },
          code: { type: 'string', description: '要执行的代码' },
          timeout: {
            type: 'integer',
            description: '超时时间（秒）',
            default: 30,
          },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_information',
      description: '搜索案件、消息、文档等信息。用于查找历史案例、证据材料、对话记录。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          type: {
            type: 'string',
            enum: ['cases', 'messages', 'documents', 'all'],
            description: '搜索类型',
            default: 'all',
          },
          caseId: {
            type: 'string',
            description: '[可选] 限定在特定案件内搜索',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: '暂停任务，向用户提问。当需要决策、额外信息或遇到无法解决的障碍时使用。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '向用户提出的问题' },
          candidates: {
            type: 'array',
            items: { type: 'string' },
            description: '[可选] 供用户快速选择的选项',
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_working_checkpoint',
      description:
        '短期工作记忆记事本，每轮自动注入，防止长任务中信息丢失。在以下时机调用：(1) 阅读SOP后记录用户需求和关键约束；(2) 切换到子任务前；(3) 重复失败后记录新发现；(4) 新任务时更新内容。不要在简单任务（1-2步）或任务完成时调用。',
      parameters: {
        type: 'object',
        properties: {
          keyInfo: {
            type: 'string',
            description:
              '替换当前记事本（<200 tokens）。增量更新：检查现有内容，保留有效部分，添加/删除/修改。记录：陷阱、用户需求、关键参数、发现、文件路径、进度、下一步。不要记录：临时信息、明显上下文、已切换任务的旧信息。',
          },
        },
        required: ['keyInfo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_legal_knowledge',
      description: '搜索相关法律法规知识。当需要引用具体法条或理解法律概念时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '法律问题或关键词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_patch',
      description: '精细化局部文件修改。在文件中寻找唯一的old_content块并替换为new_content。要求old_content必须在文件中唯一存在。修改文件前先用file_read确认内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          oldContent: { type: 'string', description: '需要被替换的原始文本块（必须唯一）' },
          newContent: { type: 'string', description: '替换后的新文本内容' },
        },
        required: ['path', 'oldContent', 'newContent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_long_term_update',
      description:
        '启动长期记忆提炼流程。当任务中发现了值得长期记忆的信息（环境事实、用户偏好、避坑经验）时调用。已记忆更新或在自主流程内时无需调用。超过15轮完成的任务自动触发。调用后需按L0记忆管理SOP提取关键信息并更新L1/L2。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_dynamic_file',
      description: '读取当前案件的动态分析文件。包含当事人特征分析、事实时间线、争议清单、立场、潜在利益、BATNA等标准化字段。每次分析案件前应先读取此文件以获取上下文。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_dynamic_file',
      description: '创建或更新案件的标准化动态分析文件。传入JSON格式的分析数据，覆盖或追加指定字段。变更结果会持久化存储。',
      parameters: {
        type: 'object',
        properties: {
          partyAnalysis: { type: 'string', description: '当事人特征分析：年龄、性别、背景、语言风格、情绪状态' },
          timeline: { type: 'string', description: '事实时间线。JSON数组 [{time,event,source}]' },
          disputeChecklist: { type: 'string', description: '争议清单。JSON数组 [{issue,category,partyAPosition,partyBPosition,priority}]' },
          positions: { type: 'string', description: '已识别的各方立场' },
          potentialInterests: { type: 'string', description: '已发现的潜在利益' },
          batna: { type: 'string', description: '各方最佳替代方案 (BATNA)' },
          agentLog: { type: 'string', description: '追加式分析日志。JSON数组 [{turn,action,result}]' },
          dialogEnded: { type: 'boolean', description: '是否标记对话已结束（设为true后前端显示选择调解员按钮）' },
        },
      },
    },
  },
]

// ============================================================
// Tool handler implementations
// ============================================================

/**
 * file_read — 读取文件内容
 */
export async function* do_file_read(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const filePath = resolve(ctx.workDir, String(args.path || ''))
  const start = (args.start as number) || 1
  const count = (args.count as number) || 200
  const keyword = args.keyword as string | undefined

  try {
    // Check if it's a directory first
    const stats = await stat(filePath).catch(() => null)
    if (stats?.isDirectory()) {
      const entries = await readdir(filePath, { withFileTypes: true })
      const listing = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`)
        .join('\n')
      return {
        data: `目录 ${relative(ctx.workDir, filePath) || filePath} 包含 ${entries.length} 个项目:\n${listing}`,
        nextPrompt: `目录内容已列出。选择要读取的文件继续分析。`,
      }
    }

    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    let result: string
    if (keyword) {
      const matchIdx = lines.findIndex((l) => l.toLowerCase().includes(keyword.toLowerCase()))
      if (matchIdx === -1) {
        return { data: `未找到关键词 "${keyword}"`, nextPrompt: `关键词 "${keyword}" 未在文件中找到。请尝试其他关键词或扩大搜索范围。` }
      }
      const ctxStart = Math.max(0, matchIdx - 3)
      const ctxEnd = Math.min(lines.length, matchIdx + 4)
      result = lines
        .slice(ctxStart, ctxEnd)
        .map((l, i) => `${ctxStart + i + 1}: ${l}`)
        .join('\n')
      result = `... 匹配 "${keyword}" 在第 ${matchIdx + 1} 行 (上下文 ${ctxStart + 1}-${ctxEnd}) ...\n${result}`
    } else {
      const endLine = Math.min(lines.length, start + count - 1)
      result = lines
        .slice(start - 1, endLine)
        .map((l, i) => `${start + i}: ${l}`)
        .join('\n')
      if (endLine < lines.length) {
        result += `\n... (共 ${lines.length} 行，已显示 ${start}-${endLine} 行)`
      }
    }

    yield `读取 ${filePath} (${result.split('\n').length} 行)\n`
    return {
      data: result,
      nextPrompt: `文件 ${filePath} 读取完成。继续分析或进行下一步操作。`,
    }
  } catch (err: any) {
    return {
      data: `读取失败: ${err.message}`,
      nextPrompt: `文件读取失败 (${err.message})。请确认路径是否正确，或尝试使用 search_information 工具查找文件。可用案例目录: uploads/cases/`,
    }
  }
}

/**
 * file_write — 创建/覆盖/追加文件
 */
export async function* do_file_write(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const filePath = resolve(ctx.workDir, String(args.path || ''))
  const content = String(args.content || '')
  const mode = (args.mode as string) || 'overwrite'

  try {
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    await mkdir(dir, { recursive: true })

    if (mode === 'append' && existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8')
      await writeFile(filePath, existing + '\n' + content, 'utf-8')
    } else if (mode === 'prepend' && existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8')
      await writeFile(filePath, content + '\n' + existing, 'utf-8')
    } else {
      await writeFile(filePath, content, 'utf-8')
    }

    const size = Buffer.byteLength(content, 'utf-8')
    yield `写入 ${filePath} (${(size / 1024).toFixed(1)} KB)\n`
    return {
      data: `已${mode === 'overwrite' ? '创建' : mode === 'append' ? '追加到' : '前置到'} ${filePath} (${content.length} 字符)`,
      nextPrompt: `文件已成功${mode === 'overwrite' ? '创建' : '更新'}。继续下一步操作。`,
    }
  } catch (err: any) {
    return {
      data: `写入失败: ${err.message}`,
      nextPrompt: `文件写入失败 (${err.message})。请检查路径和权限。`,
    }
  }
}

/**
 * read_docx — 读取 docx/doc 文件，提取纯文本内容
 */
export async function* do_read_docx(args: ToolArgs, _ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const filePath = resolve(String(args.path || ''))
  const exists = existsSync(filePath)
  if (!exists) {
    return { data: `文件不存在: ${filePath}`, nextPrompt: '文件路径不存在。请用 file_read 列出目录确认文件名。' }
  }
  yield `读取文档: ${relative('.', filePath)}\n`

  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  let result: ReturnType<typeof spawnSync>

  if (ext === '.docx') {
    result = spawnSync('python3', [
      '-c',
      'import sys, docx; d=docx.Document(sys.argv[1]); print("\\n".join(p.text for p in d.paragraphs if p.text.strip()))',
      filePath,
    ], { encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 15000 })
  } else if (ext === '.doc') {
    result = spawnSync('python3', [
      '-c',
      'import sys, subprocess, os; '
      + 'from pathlib import Path; p=Path(sys.argv[1]); '
      + 'result=subprocess.run(["textutil","-convert","txt","-stdout",str(p)],capture_output=True,text=True); '
      + 'print(result.stdout)',
      filePath,
    ], { encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 15000 })
  } else {
    return { data: `不支持的文件类型: ${ext}。请传入 .docx 或 .doc 文件。`, nextPrompt: '文件类型不正确，请确认路径。' }
  }

  const stdout = (result.stdout as string)?.trim() || ''
  const stderr = (result.stderr as string)?.trim() || ''
  if (stderr) {
    return { data: `读取失败: ${stderr}`, nextPrompt: '文件读取失败，请检查文件是否损坏或改用其他方式。' }
  }
  return {
    data: stdout || '(文档为空)',
    nextPrompt: '已读取文档内容。根据文档信息进行分析和后续操作。',
  }
}

/**
 * code_run — 执行代码（JS/TS eval 或 Python 子进程）
 */
export async function* do_code_run(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const language = (args.language as string) || 'javascript'
  const code = String(args.code || '')
  const timeout = ((args.timeout as number) || 30) * 1000

  try {
    if (language === 'python') {
      // Use spawnSync with direct binary to avoid shell dependency
      const result = spawnSync('python3', ['-c', code], {
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        cwd: ctx.workDir,
      })
      const output = [
        result.stdout ? result.stdout.trim() : '',
        result.stderr ? `[stderr] ${result.stderr.trim()}` : '',
      ].filter(Boolean).join('\n')
      return {
        data: output || '(无输出)',
        nextPrompt: '代码执行完成。根据结果决定下一步。',
      }
    } else {
      // JavaScript — sandboxed eval with fs access
      const startTime = Date.now()
      const logs: string[] = []
      let evalResult: unknown

      try {
        // Provide fs via a safe wrapper, require for built-in modules only
        const safeRequire = (mod: string) => {
          // Allow common Node.js built-in modules and docx parsing
          if (['fs', 'path', 'os', 'util', 'crypto', 'child_process', 'buffer', 'stream', 'url', 'querystring', 'zlib'].includes(mod)) {
            return _nodeRequire(mod)
          }
          throw new Error(`Module "${mod}" is not available in this sandbox. Available: fs, path, os, util, crypto, zlib`)
        }

        const fn = new Function(
          'console', 'require', 'process', 'setTimeout', 'setInterval',
          '__dirname', '__filename', 'result_holder', 'safeRequire',
          `
          const __start = Date.now();
          const __logs = [];
          const __console = {
            log: (...a) => __logs.push(a.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(' ')),
            error: (...a) => __logs.push('[ERROR] ' + a.map(v => String(v)).join(' ')),
            warn: (...a) => __logs.push('[WARN] ' + a.map(v => String(v)).join(' ')),
          };
          try {
            const __result = (function() {
              ${code}
            })();
            result_holder.value = __result;
          } catch(e) {
            result_holder.value = 'Error: ' + e.message;
          }
          result_holder.logs = __logs;
          `
        )

        const holder: { value: unknown; logs: string[] } = { value: undefined, logs: [] }
        fn(
          { log: (...a: unknown[]) => logs.push(a.map(String).join(' ')) },
          safeRequire,
          process,
          undefined, // setTimeout blocked
          undefined, // setInterval blocked
          ctx.workDir,
          '',
          holder,
          safeRequire
        )

        evalResult = holder.value
        logs.push(...(holder.logs || []))
      } catch (evalErr: any) {
        evalResult = `执行错误: ${evalErr.message}`
      }

      const output = [...logs, evalResult != null ? String(evalResult) : ''].filter(Boolean).join('\n')

      yield `代码执行 (${Date.now() - startTime}ms)\n`
      return {
        data: output || '(无输出)',
        nextPrompt: '代码执行完成。根据结果决定下一步。',
      }
    }
  } catch (err: any) {
    return {
      data: `执行失败: ${err.message}`,
      nextPrompt: `代码执行失败 (${err.message})。请检查代码并修正错误后重试。`,
    }
  }
}

/**
 * search_information — 搜索案件数据库
 */
export async function* do_search_information(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const query = String(args.query || '')
  const searchType = (args.type as string) || 'all'
  const targetCaseId = args.caseId as string | undefined

  try {
    const db = getDb()
    const results: string[] = []

    // Search cases
    if (searchType === 'cases' || searchType === 'all') {
      let caseRows
      if (targetCaseId) {
        caseRows = db
          .select()
          .from(cases)
          .where(eq(cases.id, targetCaseId))
          .all()
      } else {
        caseRows = db.select().from(cases).all()
        caseRows = caseRows.filter(
          (c) =>
            c.title.includes(query) ||
            c.description?.includes(query) ||
            c.partyAName.includes(query) ||
            c.partyBName.includes(query) ||
            false
        )
      }
      results.push(`=== 案件 (${caseRows.length}) ===`)
      for (const c of caseRows.slice(0, 5)) {
        results.push(
          `- ${c.id}: ${c.title} (${c.partyAName} vs ${c.partyBName}) 状态: ${c.status} 标的额: ${(c as any).amount || '未知'}`
        )
      }
    }

    // Search messages
    if ((searchType === 'messages' || searchType === 'all') && targetCaseId) {
      const msgRows = db
        .select()
        .from(messages)
        .where(eq(messages.caseId, targetCaseId))
        .all()
      const filtered = msgRows.filter((m) => m.content.includes(query))
      results.push(`=== 消息 (${filtered.length}) ===`)
      for (const m of filtered.slice(0, 3)) {
        results.push(`- [${m.senderName || m.senderType}] ${m.content.slice(0, 100)}...`)
      }
    }

    // Search documents
    if ((searchType === 'documents' || searchType === 'all') && targetCaseId) {
      const docRows = db
        .select()
        .from(documents)
        .where(eq(documents.caseId, targetCaseId))
        .all()
      results.push(`=== 文档 (${docRows.length}) ===`)
      for (const d of docRows.slice(0, 5)) {
        results.push(`- ${d.originalName} (${d.filename})`)
      }
    }

    const resultStr = results.join('\n\n') || `未找到与 "${query}" 相关的结果`

    if (!targetCaseId) {
      return {
        data: resultStr,
        nextPrompt: `搜索完成。请指定具体的案件编号 (caseId) 以查看详细信息和对话记录。当前案件: ${ctx.caseId}`,
      }
    }

    return {
      data: resultStr,
      nextPrompt: `搜索完成。基于以上信息继续分析。`,
    }
  } catch (err: any) {
    return {
      data: `搜索失败: ${err.message}`,
      nextPrompt: `搜索失败 (${err.message})。请尝试其他关键词。`,
    }
  }
}

/**
 * ask_user — 暂停并向用户提问
 */
export async function* do_ask_user(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const question = String(args.question || '')
  const candidates = (args.candidates as string[]) || []

  const prompt = candidates.length > 0
    ? `${question}\n\n选项：\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n请选择或输入您的回答。`
    : `${question}\n\n请回复您的决定。`

  return {
    data: { question, candidates },
    nextPrompt: prompt,
    shouldExit: true, // Exit agent loop to wait for user input
  }
}

/**
 * update_working_checkpoint — 更新工作记忆
 */
export async function* do_update_working_checkpoint(
  args: ToolArgs,
  ctx: AgentContext
): AsyncGenerator<string, StepOutcome> {
  const keyInfo = String(args.keyInfo || '')

  // Incremental update: merge with existing checkpoint
  if (ctx.workingCheckpoint) {
    const lines = ctx.workingCheckpoint.split('\n')
    const newLines = keyInfo.split('\n')
    const merged: string[] = []

    // Keep lines that don't conflict with new info
    for (const line of lines) {
      if (!newLines.some((nl) => nl.trim() && line.includes(nl.trim().slice(0, 20)))) {
        merged.push(line)
      }
    }
    merged.push(...newLines.filter(Boolean))
    ctx.workingCheckpoint = merged.filter(Boolean).slice(-20).join('\n') // Max 20 lines
  } else {
    ctx.workingCheckpoint = keyInfo
  }

  yield `📝 工作记忆已更新 (${ctx.workingCheckpoint.length} 字符)\n`

  return {
    data: `工作记忆已更新: ${ctx.workingCheckpoint.slice(0, 200)}`,
    nextPrompt: `工作记忆已更新。继续执行任务。`,
  }
}

/**
 * search_legal_knowledge — 搜索法律知识
 */
export async function* do_search_legal_knowledge(
  args: ToolArgs,
  _ctx: AgentContext
): AsyncGenerator<string, StepOutcome> {
  const query = String(args.query || '')

  // Built-in Chinese commercial law knowledge base (民法典, 商事调解条例 preview)
  const knowledge: Record<string, string> = {
    合同解除: `《民法典》第563条：有下列情形之一的，当事人可以解除合同：
(一) 因不可抗力致使不能实现合同目的；
(二) 在履行期限届满前，当事人一方明确表示或者以自己的行为表明不履行主要债务；
(三) 当事人一方迟延履行主要债务，经催告后在合理期限内仍未履行；
(四) 当事人一方迟延履行债务或者有其他违约行为致使不能实现合同目的；
(五) 法律规定的其他情形。`,
    格式条款: `《民法典》第496条：格式条款是当事人为了重复使用而预先拟定，并在订立合同时未与对方协商的条款。
采用格式条款订立合同的，提供格式条款的一方应当遵循公平原则确定当事人之间的权利和义务，并采取合理的方式提示对方注意免除或者减轻其责任等与对方有重大利害关系的条款，按照对方的要求，对该条款予以说明。
提供格式条款的一方未履行提示或者说明义务，致使对方没有注意或者理解与其有重大利害关系的条款的，对方可以主张该条款不成为合同的内容。`,
    违约金: `《民法典》第585条：当事人可以约定一方违约时应当根据违约情况向对方支付一定数额的违约金，也可以约定因违约产生的损失赔偿额的计算方法。
约定的违约金低于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以增加；约定的违约金过分高于造成的损失的，人民法院或者仲裁机构可以根据当事人的请求予以适当减少。
当事人就迟延履行约定违约金的，违约方支付违约金后，还应当履行债务。`,
    调解: `商事调解的特点：
1. 自愿原则：当事人自愿参与调解，自愿达成调解协议
2. 保密原则：调解过程不公开，调解信息不对外披露
3. 中立原则：调解员保持中立，不偏袒任何一方
4. 灵活原则：调解程序灵活，不受严格程序规则约束
5. 高效原则：调解期限较短，成本较低
6. 双赢导向：调解追求双方利益最大化，而非简单判定胜负
7. 调解协议具有民事合同性质，当事人应当自觉履行`,
    诉讼时效: `《民法典》第188条：向人民法院请求保护民事权利的诉讼时效期间为三年。法律另有规定的，依照其规定。
诉讼时效期间自权利人知道或者应当知道权利受到损害以及义务人之日起计算。`,
    违约责任: `《民法典》第577条：当事人一方不履行合同义务或者履行合同义务不符合约定的，应当承担继续履行、采取补救措施或者赔偿损失等违约责任。
第584条：当事人一方不履行合同义务或者履行合同义务不符合约定，造成对方损失的，损失赔偿额应当相当于因违约所造成的损失，包括合同履行后可以获得的利益；但是，不得超过违约方订立合同时预见到或者应当预见到的因违约可能造成的损失。`,
    消费者权益: `《消费者权益保护法》第55条：经营者提供商品或者服务有欺诈行为的，应当按照消费者的要求增加赔偿其受到的损失，增加赔偿的金额为消费者购买商品的价款或者接受服务的费用的三倍；增加赔偿的金额不足五百元的，为五百元。`,
    加盟特许: `《商业特许经营管理条例》：
第12条：特许人和被特许人应当在特许经营合同中约定，被特许人在特许经营合同订立后一定期限内可以单方解除合同。
第21条：特许人应当在订立特许经营合同之日前至少30日，以书面形式向被特许人提供本条例第22条规定的信息，并提供特许经营合同文本。
第23条：特许人隐瞒有关信息或者提供虚假信息的，被特许人可以解除特许经营合同。`,
  }

  const matchedKeys = Object.keys(knowledge).filter((k) => k.includes(query) || query.includes(k))
  const result = matchedKeys.length > 0
    ? matchedKeys.map((k) => `### ${k}\n\n${knowledge[k]}`).join('\n\n---\n\n')
    : `未找到与 "${query}" 直接相关的法律知识。基于一般商法原则：\n1. 合同自由原则（民法典第5条）\n2. 公平原则（民法典第6条）\n3. 诚实信用原则（民法典第7条）\n4. 遵守法律与公序良俗原则（民法典第8条）`

  yield `搜索法律知识: ${query}\n`
  return {
    data: result,
    nextPrompt: `法律知识查询完成。结合上述法律依据继续分析案件。`,
  }
}

/**
 * file_patch — 精细化局部文件替换（must be unique match）
 */
export async function* do_file_patch(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const filePath = resolve(ctx.workDir, String(args.path || ''))
  const oldContent = String(args.oldContent || '')
  const newContent = String(args.newContent || '')

  if (!oldContent) {
    return { data: 'oldContent 为空，无法执行替换。', nextPrompt: 'oldContent 参数为空。请先用 file_read 确认文件内容后提供需要替换的文本块。' }
  }

  try {
    const fullText = readFileSync(filePath, 'utf-8')
    const count = fullText.split(oldContent).length - 1

    if (count === 0) {
      return { data: `未找到匹配的旧文本块。文件: ${relative(ctx.workDir, filePath)}`, nextPrompt: '文件中未找到匹配的旧文本块。请先用 file_read 确认当前内容，再分小段进行 patch。若多次失败则询问用户。' }
    }
    if (count > 1) {
      return { data: `找到 ${count} 处匹配，无法确定唯一位置。`, nextPrompt: `找到 ${count} 处匹配。请提供更长、更具体的旧文本块以确保唯一性，或分小段逐个修改。` }
    }

    const updatedText = fullText.replace(oldContent, newContent)
    writeFileSync(filePath, updatedText, 'utf-8')
    yield `文件局部修改成功: ${relative(ctx.workDir, filePath)}\n`
    return {
      data: `文件局部修改成功 (${filePath})`,
      nextPrompt: '文件局部修改完成。继续下一步操作。',
    }
  } catch (err: any) {
    return {
      data: `修改失败: ${err.message}`,
      nextPrompt: `文件修改失败 (${err.message})。请检查文件路径和权限。`,
    }
  }
}

/**
 * start_long_term_update — 触发长期记忆提炼
 * Returns L0 memory management SOP for the model to read and apply.
 */
export async function* do_start_long_term_update(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  const checkpoint = getWorkingCheckpoint(ctx.workDir + '_ltm') || ctx.workingCheckpoint

  // Build the L0 memory management SOP (condensed version)
  const l0Sop = `# L0 记忆管理 SOP（核心公理）
  
## 0. 核心公理（最高优先级）
1. **行动验证原则**：任何写入 L1/L2 的信息，必须源自成功的工具调用结果。严禁将模型的固有知识、推理猜测、未执行的计划作为事实写入。
2. **神圣不可删改性**：凡是经过行动验证的有效配置、避坑指南、关键路径，在重构时严禁丢弃。可以压缩文字、迁移层级，但不能丢失信息准确性。
3. **禁止存储易变状态**：严禁存储时间戳、Session ID、PID、动态路径等高频变化数据。
4. **最小充分指针**：上层只留能定位下层的最短标识，多一词即冗余。

## 记忆层级架构
L1: global_mem_insight.txt（极简索引层，≤30行，<1k tokens）
  → 导航指向
L2: global_mem.txt（事实库层：路径、凭证、配置、环境知识）
  → 详细引用
L3: 调解经验库（任务级精简记录，只记多次重试才能成功的核心要点）

## 当前状态
- L1 索引: ${existsSync('.data/agent-memory/global_mem_insight.txt') ? '已存在' : '不存在（需创建）'}
- L2 事实库: ${existsSync('.data/agent-memory/global_mem.txt') ? '已存在' : '不存在（需创建）'}
- 工作记忆: ${checkpoint.slice(0, 300) || '(空)'}

## 提炼步骤
1. 检查是否有经过行动验证的值得长期记忆的信息
2. 如果没有，直接回复「无需更新长期记忆」并跳过后续步骤
3. 如果有，判断属于哪类：
   - **环境事实**（路径/凭证/配置）→ file_patch 更新 L2，同步 L1 索引
   - **调解经验**（避坑要点/前置条件）→ file_write 创建 L3 条目，同步 L1 索引
4. 用最少文字更新，严禁 overwrite 大量内容
5. 完成后输出「长期记忆已更新」

现在开始提炼本轮任务中的可长期记忆信息。`

  yield '🔍 启动长期记忆提炼...\n'
  return {
    data: l0Sop,
    nextPrompt: l0Sop,
  }
}

/**
 * read_dynamic_file — 读取案件动态分析文件
 */
export async function* do_read_dynamic_file(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  try {
    const db = getDb()
    const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, ctx.caseId)).get()

    if (!df) {
      return {
        data: '该案件暂无动态分析文件。请先完成案件材料分析后调用 update_dynamic_file 创建。',
        nextPrompt: '案件动态文件为空。先进行材料分析，然后调用 update_dynamic_file 创建初始版本。',
      }
    }

    const content = [
      df.partyAnalysis ? `## 当事人特征分析\n${df.partyAnalysis}` : '',
      df.timeline ? `## 事实时间线\n${df.timeline}` : '',
      df.disputeChecklist ? `## 争议清单\n${df.disputeChecklist}` : '',
      df.positions ? `## 已识别的立场\n${df.positions}` : '',
      df.potentialInterests ? `## 已发现的潜在利益\n${df.potentialInterests}` : '',
      df.batna ? `## 各方最佳替代方案\n${df.batna}` : '',
      df.agentLog ? `## 分析日志\n${df.agentLog}` : '',
      `\n对话状态: ${df.dialogTurnCount || 0} 轮 | ${df.dialogEnded ? '已结束' : '进行中'}`,
    ].filter(Boolean).join('\n\n')

    yield `读取案件动态文件: ${ctx.caseId}\n`
    return {
      data: content,
      nextPrompt: '案件动态文件已读取。基于以上分析继续工作。',
    }
  } catch (err: any) {
    return {
      data: `读取失败: ${err.message}`,
      nextPrompt: `读取动态文件失败 (${err.message})。`,
    }
  }
}

/**
 * update_dynamic_file — 创建或更新案件动态分析文件
 */
export async function* do_update_dynamic_file(args: ToolArgs, ctx: AgentContext): AsyncGenerator<string, StepOutcome> {
  try {
    const db = getDb()
    const now = new Date()
    const nowUnix = Math.floor(Date.now() / 1000)
    const existing = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, ctx.caseId)).get()

    // Build update data, preferring args but falling back to existing values
    const updateData: Record<string, unknown> = {
      caseId: ctx.caseId,
      updatedAt: now,
    }

    // Fields to set (from args if provided, else keep existing)
    const fields: string[] = ['partyAnalysis', 'timeline', 'disputeChecklist', 'positions', 'potentialInterests', 'batna']
    for (const f of fields) {
      if (args[f] !== undefined) {
        updateData[f] = String(args[f])
      }
    }

    // agentLog: append (not replace)
    if (args.agentLog) {
      const prev = existing?.agentLog ? JSON.parse(existing.agentLog) : []
      const incoming = typeof args.agentLog === 'string' ? JSON.parse(args.agentLog) : args.agentLog
      updateData.agentLog = JSON.stringify([...prev, ...incoming])
    }

    // dialogEnded
    if (args.dialogEnded === true || args.dialogEnded === 'true') {
      updateData.dialogEnded = true
      // Also update the cases table phase
      db.update(cases).set({ phase: 'mediator_selection' }).where(eq(cases.id, ctx.caseId)).run()
    }

    if (existing) {
      db.update(caseDynamicFiles).set(updateData as any).where(eq(caseDynamicFiles.caseId, ctx.caseId)).run()
      db.update(cases).set({ dynamicFileUpdatedAt: nowUnix } as any).where(eq(cases.id, ctx.caseId)).run()
    } else {
      updateData.id = ctx.caseId
      updateData.createdAt = now
      db.insert(caseDynamicFiles).values(updateData as any).run()
    }

    const updatedFields = Object.keys(updateData).filter(k => k !== 'caseId' && k !== 'updatedAt' && k !== 'id' && k !== 'createdAt')
    yield `更新案件动态文件: ${updatedFields.join(', ')}\n`
    return {
      data: `案件动态文件已更新 (${updatedFields.length} 个字段)`,
      nextPrompt: '动态文件已更新。继续执行任务。',
    }
  } catch (err: any) {
    return {
      data: `更新失败: ${err.message}`,
      nextPrompt: `更新动态文件失败 (${err.message})。请检查参数格式后重试。`,
    }
  }
}

// ============================================================
// Tool dispatch map
// ============================================================
export const TOOL_HANDLERS: Record<
  string,
  (args: ToolArgs, ctx: AgentContext) => AsyncGenerator<string, StepOutcome>
> = {
  file_read: do_file_read,
  file_write: do_file_write,
  read_docx: do_read_docx,
  code_run: do_code_run,
  file_patch: do_file_patch,
  search_information: do_search_information,
  ask_user: do_ask_user,
  update_working_checkpoint: do_update_working_checkpoint,
  search_legal_knowledge: do_search_legal_knowledge,
  start_long_term_update: do_start_long_term_update,
  read_dynamic_file: do_read_dynamic_file,
  update_dynamic_file: do_update_dynamic_file,
}
