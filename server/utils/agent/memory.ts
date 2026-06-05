// ============================================================
// Agent Memory System — Working checkpoint + L1/L2 memory
// Ported from GenericAgent memory/memory_management_sop.md
// ============================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const MEMORY_DIR = join(process.cwd(), '.data', 'agent-memory')
const L1_INDEX_FILE = join(MEMORY_DIR, 'global_mem_insight.txt')
const L2_FACTS_FILE = join(MEMORY_DIR, 'global_mem.txt')

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true })
  }
}

// ============================================================
// Working checkpoints (per-session, in-memory)
// ============================================================
const workingCheckpoints = new Map<string, string>()

export function getWorkingCheckpoint(sessionId: string): string {
  return workingCheckpoints.get(sessionId) || ''
}

export function setWorkingCheckpoint(sessionId: string, content: string): void {
  workingCheckpoints.set(sessionId, content.slice(0, 2000))
}

export function clearWorkingCheckpoint(sessionId: string): void {
  workingCheckpoints.delete(sessionId)
}

// ============================================================
// L1: Memory insight index (ultra-compact, <30 lines)
// ============================================================
export function getL1Index(): string {
  ensureMemoryDir()
  try {
    if (existsSync(L1_INDEX_FILE)) {
      return readFileSync(L1_INDEX_FILE, 'utf-8')
    }
  } catch {}
  return ''
}

export function updateL1Index(content: string): void {
  ensureMemoryDir()
  writeFileSync(L1_INDEX_FILE, content.slice(0, 1000), 'utf-8')
}

// ============================================================
// L2: Global facts (paths, configs, environment knowledge)
// ============================================================
export function getL2Facts(): string {
  ensureMemoryDir()
  try {
    if (existsSync(L2_FACTS_FILE)) {
      return readFileSync(L2_FACTS_FILE, 'utf-8')
    }
  } catch {}
  return ''
}

export function appendL2Fact(fact: string): void {
  ensureMemoryDir()
  const current = existsSync(L2_FACTS_FILE) ? readFileSync(L2_FACTS_FILE, 'utf-8') : ''
  const newFact = `- ${fact}\n`
  if (!current.includes(fact)) {
    writeFileSync(L2_FACTS_FILE, current + newFact, 'utf-8')
  }
}

// ============================================================
// Build full memory context for injection into system prompt
// ============================================================
export function buildMemoryContext(sessionId: string): string {
  const checkpoint = getWorkingCheckpoint(sessionId)
  const l1Index = getL1Index()
  const l2Facts = getL2Facts()

  let context = ''

  if (checkpoint) {
    context += `\n## 工作记忆 (当前任务)\n${checkpoint}\n`
  }

  if (l1Index) {
    context += `\n## 全局记忆索引\n${l1Index}\n`
  }

  if (l2Facts) {
    context += `\n## 平台知识\n${l2Facts}\n`
  }

  return context
}
