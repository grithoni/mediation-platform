// ============================================================
// server/utils/ai-engine-manager.ts
// 项目内置 nanobot AI 引擎的生命周期管理（单一 owner）。
//
// 职责：
//   - 健康检查 127.0.0.1:8900 /health
//   - 无健康实例时启动 .venv-ai/bin/python -m nanobot serve
//   - 等待 /health、记录 PID/日志、退出时 SIGTERM 清理
//   - 用 single-flight Promise 串行化启动，避免并发双重 spawn
//   - adopt 已健康实例（含无 PID 的外部 8900 实例）
//   - stale PID 只有命令行明确属于本项目 nanobot serve 才可终止，
//     绝不误杀被复用 PID 的外部进程
//
// Nitro plugin（server/plugins/ai-engine.ts）是唯一允许 spawn 的调用方；
// 独立 MP 进程只能 probeOnly=true 探测并报告，避免双重 spawn。
// ============================================================

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
  createWriteStream,
  type WriteStream,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export interface AiEngineSettings {
  /** Bind host of the engine API */
  host: string
  /** API port (default 8900) */
  port: number
  /** Path to the venv python, relative to project root */
  pythonPath: string
  /** nanobot config file, relative to project root */
  configPath: string
  /** PID file, relative to project root */
  pidFile: string
  /** Engine log file, relative to project root */
  logFile: string
  /** How long to wait for /health after spawning */
  startTimeoutMs: number
}

export interface EngineHealth {
  healthy: boolean
  status: string
  detail?: string
}

const DEFAULT_SETTINGS: AiEngineSettings = {
  host: '127.0.0.1',
  port: 8900,
  pythonPath: '.venv-ai/bin/python',
  configPath: '.data/ai/config.json',
  pidFile: '.data/ai/engine.pid',
  logFile: '.data/ai/engine.log',
  startTimeoutMs: 40_000,
}

let settings: AiEngineSettings = DEFAULT_SETTINGS
let proc: ChildProcess | null = null
let logStream: WriteStream | null = null
let stopping = false

// single-flight：启动承诺。并发调用共享同一次启动，
// 取代旧的 boolean `starting` + 轮询等待（存在双重 spawn 竞态）。
let startPromise: Promise<EngineHealth> | null = null

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Project root = cwd (same assumption as .data/mediation.db). */
export function projectRoot(): string {
  return process.cwd()
}

function abs(p: string): string {
  return join(projectRoot(), p)
}

function healthUrl(): string {
  return `http://${settings.host}:${settings.port}/health`
}

/** 显式创建 .data/ai 及父目录（runtime，不依赖外部脚本先建目录）。 */
function ensureDataDirs(): void {
  for (const p of [settings.configPath, settings.pidFile, settings.logFile]) {
    const dir = dirname(abs(p))
    try {
      mkdirSync(dir, { recursive: true })
    } catch (err) {
      console.warn(`[ai-engine] 无法创建目录 ${dir}: ${(err as Error).message}`)
    }
  }
}

async function isHealthy(): Promise<boolean> {
  try {
    const res = await fetch(healthUrl(), {
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return false
    const body: unknown = await res.json()
    return (
      typeof body === 'object' &&
      body !== null &&
      (body as Record<string, unknown>).status === 'ok'
    )
  } catch {
    return false
  }
}

function log(line: string): void {
  const ts = new Date().toISOString()
  const message = `[${ts}] [ai-engine] ${line}\n`
  // eslint-disable-next-line no-console
  console.log(`[ai-engine] ${line}`)
  if (!logStream) {
    try {
      ensureDataDirs()
      logStream = createWriteStream(abs(settings.logFile), { flags: 'a' })
    } catch {
      return
    }
  }
  logStream.write(message)
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readPidFile(): number | null {
  try {
    if (!existsSync(abs(settings.pidFile))) return null
    const raw = readFileSync(abs(settings.pidFile), 'utf8').trim()
    const pid = Number.parseInt(raw, 10)
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function writePidFile(pid: number): void {
  ensureDataDirs()
  writeFileSync(abs(settings.pidFile), String(pid) + '\n', 'utf8')
}

function removePidFile(): void {
  try {
    if (existsSync(abs(settings.pidFile))) unlinkSync(abs(settings.pidFile))
  } catch {
    /* best effort */
  }
}

/** 读取进程命令行（Linux 用 /proc，其它平台用 ps）。 */
function readProcessCmdline(pid: number): string | null {
  if (process.platform === 'linux') {
    try {
      const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      const line = raw.replace(/\0/g, ' ').trim()
      if (line) return line
    } catch {
      /* fall back to ps */
    }
  }
  try {
    const res = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 3000,
    })
    if (res.status === 0 && res.stdout) {
      const line = res.stdout.split('\n').map((l) => l.trim()).find(Boolean)
      if (line) return line
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * 判断 PID 是否属于本项目内置 nanobot serve 实例。
 *
 * 依据（三者必须同时满足才视为「明确属于本项目」）：
 *   - 命令行包含 `-m nanobot serve`（项目 vendored 引擎的启动形态）
 *   - 命令行包含本项目专属的 --config 绝对路径（.data/ai/config.json），
 *     或包含 .venv-ai 标记
 *
 * 注意：macOS 上 .venv-ai/bin/python 是符号链接，python 进程启动后
 * argv[0] 会被改写为解析后的真实解释器路径（如 /opt/homebrew/.../Python），
 * 因此不能依赖 venv 路径唯一判定，必须以本项目 --config 绝对路径为准。
 * 这样即使 PID 被外部进程复用，也不会误杀。
 */
function pidBelongsToEngine(pid: number): boolean {
  const cmdline = readProcessCmdline(pid)
  if (!cmdline) return false
  const isNanobotServe =
    /(^|\s)-m\s+nanobot\s+serve(\s|$)/.test(cmdline) ||
    cmdline.includes('nanobot serve')
  if (!isNanobotServe) return false
  const configMarker = cmdline.includes(abs(settings.configPath))
  const venvMarker = cmdline.includes('.venv-ai')
  return configMarker || venvMarker
}

function terminate(pid: number, force = false): Promise<void> {
  return new Promise((resolve) => {
    if (!pidAlive(pid)) {
      resolve()
      return
    }
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
    } catch {
      resolve()
      return
    }
    if (force) {
      resolve()
      return
    }
    // wait for graceful exit, then escalate
    const deadline = Date.now() + 8000
    const timer = setInterval(() => {
      if (!pidAlive(pid) || Date.now() > deadline) {
        clearInterval(timer)
        if (pidAlive(pid)) {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {
            /* ignore */
          }
        }
        resolve()
      }
    }, 200)
  })
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

/** Read the engine log tail for diagnostics. */
export function engineLogTail(lines = 30): string {
  try {
    const raw = readFileSync(abs(settings.logFile), 'utf8')
    return raw.split('\n').slice(-lines).join('\n')
  } catch {
    return '(no engine log yet)'
  }
}

/** Probe-only status — never spawns. Safe from any process. */
export async function aiEngineStatus(): Promise<EngineHealth> {
  if (await isHealthy()) {
    const pid = readPidFile()
    return { healthy: true, status: 'running', detail: pid ? `pid ${pid}` : 'adopted external instance' }
  }
  if (stopping) {
    return { healthy: false, status: 'stopped' }
  }
  if (startPromise) {
    return { healthy: false, status: 'starting' }
  }
  return { healthy: false, status: 'stopped' }
}

/**
 * Ensure the engine is available.
 *
 * - probeOnly: never spawn; used by the standalone MP process to avoid
 *   double-spawn (the Nitro plugin is the single spawn owner).
 * - 并发调用共享同一个 single-flight 启动承诺，避免双重 spawn。
 */
export async function ensureAiEngine(opts: { probeOnly?: boolean } = {}): Promise<EngineHealth> {
  if (stopping) {
    return { healthy: false, status: 'stopped' }
  }
  if (await isHealthy()) {
    const pid = readPidFile()
    log('healthy instance found — adopting' + (pid ? ` (pid ${pid})` : ' (external)'))
    return { healthy: true, status: 'running', detail: pid ? `pid ${pid}` : 'adopted external instance' }
  }
  if (opts.probeOnly) {
    log('engine not healthy (probe-only, not spawning)')
    return { healthy: false, status: 'stopped' }
  }
  if (!startPromise) {
    const attempt = startEngine()
    startPromise = attempt
    void attempt.finally(() => {
      if (startPromise === attempt) startPromise = null
    })
  }
  return startPromise
}

async function startEngine(): Promise<EngineHealth> {
  // 运行时确保 .data/ai 及父目录存在
  ensureDataDirs()

  // 清理已记录但失联的 stale PID —— 仅当命令行明确属于本项目引擎才终止。
  // 若 PID 已被外部进程复用，绝不误杀，只清理过期的 PID 文件。
  const stalePid = readPidFile()
  if (stalePid && pidAlive(stalePid)) {
    if (pidBelongsToEngine(stalePid)) {
      log(`previous engine pid ${stalePid} is alive but unhealthy — stopping it`)
      await terminate(stalePid)
    } else {
      log(`pid file ${stalePid} is alive but NOT a project-owned engine — leaving it untouched`)
    }
  }
  removePidFile()

  const python = abs(settings.pythonPath)
  const config = abs(settings.configPath)
  if (!existsSync(python)) {
    const message =
      `venv python not found: ${python}. ` +
      `Run the one-time setup: bash python/ai-engine/scripts/setup.sh`
    log(message)
    return { healthy: false, status: 'missing-deps', detail: message }
  }
  if (!existsSync(config)) {
    const message =
      `engine config not found: ${config}. ` +
      `Run the one-time setup: bash python/ai-engine/scripts/setup.sh`
    log(message)
    return { healthy: false, status: 'missing-config', detail: message }
  }

  const args = [
    '-m',
    'nanobot',
    'serve',
    '--config',
    config,
    '--host',
    settings.host,
    '--port',
    String(settings.port),
  ]
  log(`spawning: ${python} ${args.join(' ')}`)

  let child: ChildProcess
  try {
    child = spawn(python, args, {
      cwd: projectRoot(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc = child
  } catch (err) {
    const message = `failed to spawn engine: ${(err as Error).message}`
    log(message)
    return { healthy: false, status: 'spawn-failed', detail: message }
  }

  child.stdout?.on('data', (d: Buffer) => log(`  ${String(d).trimEnd()}`))
  child.stderr?.on('data', (d: Buffer) => log(`  ${String(d).trimEnd()}`))
  child.on('error', (err) => {
    const message = `engine process error: ${err.message}`
    log(message)
    if (err.message.includes('ENOENT')) {
      log(`python not found — run: bash python/ai-engine/scripts/setup.sh`)
    }
    if (proc === child) {
      proc = null
      removePidFile()
    }
  })
  child.on('exit', (code, signal) => {
    if (!stopping) {
      log(`engine exited unexpectedly code=${code} signal=${signal ?? ''}`)
    }
    if (proc === child) {
      proc = null
      removePidFile()
    }
  })

  if (child.pid) writePidFile(child.pid)

  // Wait for /health
  const deadline = Date.now() + settings.startTimeoutMs
  while (Date.now() < deadline) {
    if (await isHealthy()) {
      log(`engine is healthy at ${healthUrl()} (pid ${child.pid})`)
      return { healthy: true, status: 'running', detail: `pid ${child.pid}` }
    }
    // If the process died while waiting, report immediately.
    if (child.exitCode !== null || child.signalCode !== null) {
      const message =
        `engine exited during startup (code ${child.exitCode}).\n` +
        `--- engine log tail ---\n${engineLogTail()}`
      log(message)
      return { healthy: false, status: 'start-failed', detail: message }
    }
    await sleep(500)
  }

  // Timed out waiting for health — stop it so the port is not blocked next boot.
  // 这是我们刚 spawn 的子进程（proc === child），必然属于本项目，直接终止；
  // 若 PID 已被复用/命令行不匹配则不动。
  if (proc === child && child.pid) {
    log(`engine did not become healthy within ${settings.startTimeoutMs / 1000}s — stopping`)
    await terminate(child.pid)
  }
  if (proc === child) {
    proc = null
    removePidFile()
  }
  const message = `engine start timed out.\n--- engine log tail ---\n${engineLogTail()}`
  log(message)
  return { healthy: false, status: 'timeout', detail: message }
}

/**
 * Graceful shutdown of the project-owned engine (called by Nitro on close).
 *
 * 只终止「本项目 spawn 且命令行明确属于本项目 nanobot serve」的进程；
 * 被 adopt 的健康外部实例（无本项目 PID 记录）绝不被杀。
 */
export async function stopAiEngine(): Promise<void> {
  if (stopping) return
  stopping = true
  try {
    // 若启动仍在进行，先等它落地，避免在 spawn 过程中误判 PID
    const inflight = startPromise
    if (inflight) {
      try {
        await inflight
      } catch {
        /* ignore */
      }
    }
    const ownPid = proc?.pid ?? null
    const filePid = readPidFile()
    const pid = ownPid ?? filePid
    if (pid && pidAlive(pid)) {
      // 自己 spawn 的子进程（proc 引用）必然属于本项目，无需命令行校验；
      // 从 PID 文件读到的 PID 必须通过命令行校验，防止 PID 被外部进程
      // 复用后误杀（ps 偶发不可用时 fail-safe：宁可不杀也不误杀）。
      const owned = ownPid === pid || pidBelongsToEngine(pid)
      if (owned) {
        log(`shutting down engine (pid ${pid})`)
        await terminate(pid)
      } else {
        log(`pid ${pid} is NOT a project-owned engine — leaving it untouched`)
      }
    }
    removePidFile()
    proc = null
    log('engine stopped')
  } finally {
    // 关闭日志流：先写完最后一条日志，再 flush 并等待真正关闭
    const stream = logStream
    logStream = null
    if (stream) {
      try {
        await new Promise<void>((resolve) => {
          stream.once('close', () => resolve())
          stream.end()
        })
      } catch {
        /* ignore */
      }
    }
    stopping = false
  }
}

/** Configure (must be called once by the Nitro plugin at boot). */
export function initAiEngine(cfg: Partial<AiEngineSettings> = {}): void {
  settings = { ...DEFAULT_SETTINGS, ...cfg }
  ensureDataDirs()
}
