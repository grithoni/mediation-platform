// ============================================================
// 脱敏映射加密持久化存储
//
// 对齐已退役 case-mcp-server/mapping_store.py 的能力：
//   - AES-256-GCM 加密 mapping（key 文件 .data/.mapping_key，0600，不存在则生成）
//   - TTL 7200s：写时 purge 过期行、读时跳过过期行
//   - trace_id = `${case_id}-${epoch_ms}`（与 Python 版一致）
//
// 密文格式：base64(iv(12B) || authTag(16B) || ciphertext)
// ============================================================
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { eq, lt } from 'drizzle-orm'
import { getDb } from '../database'
import { desensitizationMappings } from '../database/schema'

const TTL_MS = 7200 * 1000 // 2 小时，对齐 MAPPING_TTL_SECONDS=7200

function keyFilePath(): string {
  // 与 getDb() 一致：相对 process.cwd() 的 .data 目录（测试时落在临时目录）
  return resolve(process.cwd(), '.data', '.mapping_key')
}

function loadOrCreateKey(): Buffer {
  const file = keyFilePath()
  if (existsSync(file)) {
    return readFileSync(file)
  }
  const key = randomBytes(32)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, key, { mode: 0o600 })
  chmodSync(file, 0o600)
  return key
}

function encryptMapping(plain: string): string {
  const key = loadOrCreateKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

function decryptMapping(payload: string): string {
  const key = loadOrCreateKey()
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/**
 * 持久化脱敏映射，返回真 trace_id（供 restore / 审计关联）。
 * 写时顺带 purge 过期行（对齐 Python MappingStore.save）。
 */
export function persistDesensitization(
  caseId: string,
  mapping: Record<string, string>,
  categories?: Record<string, string>,
): string {
  const db = getDb()
  const now = Date.now()

  db.delete(desensitizationMappings).where(lt(desensitizationMappings.expiresAt, now)).run()

  const traceId = `${caseId}-${now}`
  db.insert(desensitizationMappings)
    .values({
      traceId,
      caseId,
      mappingEnc: encryptMapping(JSON.stringify(mapping)),
      categories: categories && Object.keys(categories).length > 0 ? JSON.stringify(categories) : null,
      createdAt: now,
      expiresAt: now + TTL_MS,
    })
    .run()

  return traceId
}

/**
 * 按 trace_id 读取映射；不存在或已过期返回空对象（对齐 Python MappingStore.load）。
 */
export function loadDesensitization(traceId: string): Record<string, string> {
  const db = getDb()
  const row = db
    .select()
    .from(desensitizationMappings)
    .where(eq(desensitizationMappings.traceId, traceId))
    .get()
  if (!row) return {}
  if (row.expiresAt && Date.now() > row.expiresAt) return {}
  return JSON.parse(decryptMapping(row.mappingEnc)) as Record<string, string>
}

/** 供测试 / 调试使用：清理指定案件的过期映射。 */
export function cleanupExpiredDesensitizations(): void {
  const db = getDb()
  db.delete(desensitizationMappings).where(lt(desensitizationMappings.expiresAt, Date.now())).run()
}
