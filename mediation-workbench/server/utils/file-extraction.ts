// ============================================================
// server/utils/file-extraction.ts
// 统一的文档文本提取模块（PDF/DOCX/TXT）
// 替代 ai-welcome.ts, orchestrator.ts, extract-info.ts 中的重复逻辑
// ============================================================
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export interface ExtractTextOptions {
  encoding?: 'utf-8' | 'latin1'
  timeout?: number
  maxBuffer?: number
  fallbackEncoding?: boolean
}

const DEFAULT_OPTIONS: Required<ExtractTextOptions> = {
  encoding: 'utf-8',
  timeout: 10000,
  maxBuffer: 5 * 1024 * 1024,
  fallbackEncoding: true,
}

/**
 * 从文件路径提取文本内容（支持 PDF、DOCX/DOC、纯文本）
 * @param filePath - 文件绝对路径
 * @param originalName - 原始文件名（用于后缀判断）
 * @param options - 提取选项
 * @returns 提取的文本，失败返回空字符串
 */
export function extractDocumentText(
  filePath: string,
  originalName: string,
  options?: Partial<ExtractTextOptions>,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const lower = originalName.toLowerCase()

  try {
    if (lower.endsWith('.pdf')) {
      return execSync(`pdftotext -layout "${filePath}" -`, {
        encoding: opts.encoding,
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
      })
    }

    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      return execSync(`textutil -convert txt -stdout "${filePath}"`, {
        encoding: opts.encoding,
        timeout: opts.timeout,
        maxBuffer: opts.maxBuffer,
      })
    }

    // 纯文本格式（含 .txt）
    return extractPlainText(filePath, opts)
  } catch (err) {
    return ''
  }
}

/**
 * 从 Buffer 提取文本内容（用于上传的文件）
 * @param filename - 原始文件名
 * @param buffer - 文件内容 Buffer
 * @param tempPath - 临时文件路径（可选，若提供则用于提取）
 * @param options - 提取选项
 * @returns 提取的文本
 */
export function extractDocumentTextFromBuffer(
  filename: string,
  buffer: Buffer,
  tempPath?: string,
  options?: Partial<ExtractTextOptions>,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const lower = filename.toLowerCase()

  try {
    // 如果提供了临时路径，优先使用文件路径提取（保持工具兼容）
    if (tempPath) {
      return extractDocumentText(tempPath, filename, options)
    }

    // 不提供临时路径时，直接从 Buffer 提取
    return extractPlainText(undefined, opts, buffer)
  } catch (err) {
    return ''
  }
}

function extractPlainText(
  filePath?: string,
  options: Required<ExtractTextOptions> = DEFAULT_OPTIONS,
  buffer?: Buffer,
): string {
  try {
    let text: string
    if (buffer) {
      text = buffer.toString(options.encoding)
    } else if (filePath) {
      text = readFileSync(filePath, options.encoding)
    } else {
      return ''
    }

    // 检查是否包含无效字符（表示编码错误）
    if (options.fallbackEncoding && text.includes('\ufffd') && buffer) {
      return buffer.toString('latin1')
    }

    return text
  } catch {
    return ''
  }
}
