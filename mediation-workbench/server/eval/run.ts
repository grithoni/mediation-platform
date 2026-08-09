// ============================================================
// Eval 运行器（CLI）
//
// 用法：
//   npm run eval                     # 全量跑并追加到 .data/eval-results.jsonl
//   npm run eval -- --skill v2       # 只跑某个技能
//   npm run eval -- --baseline       # 生成/更新基线（baseline.json）
//   npm run eval -- --compare        # 对比当前结果与基线，输出回退告警
//
// 数据目录：.data/eval-results.jsonl（每次运行的逐条结果）
//           .data/eval-baseline.json（最近一次基线快照）
// ============================================================
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { EVAL_DATASET, getRubricFor } from './dataset'
import { judgeOutput } from './judge'

// CLI 独立进程不经过 Nuxt，需手动加载 .env（轻量解析，无额外依赖）
function loadEnvFile(): void {
  try {
    const envPath = resolve(process.cwd(), '.env')
    if (!existsSync(envPath)) return
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const idx = trimmed.indexOf('=')
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    /* ignore */
  }
}
loadEnvFile()

const DATA_DIR = resolve(process.cwd(), '.data')
const RESULTS_FILE = resolve(DATA_DIR, 'eval-results.jsonl')
const BASELINE_FILE = resolve(DATA_DIR, 'eval-baseline.json')

function parseArgs(): { skill?: string; baseline: boolean; compare: boolean } {
  const argv = process.argv.slice(2)
  const out: { skill?: string; baseline: boolean; compare: boolean } = { baseline: false, compare: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--skill' && argv[i + 1]) out.skill = argv[i + 1]
    if (argv[i] === '--baseline') out.baseline = true
    if (argv[i] === '--compare') out.compare = true
  }
  return out
}

async function main() {
  const args = parseArgs()
  mkdirSync(DATA_DIR, { recursive: true })

  const samples = args.skill
    ? EVAL_DATASET.filter((s) => s.skillId === args.skill)
    : EVAL_DATASET

  console.log(`\n🔍 Eval 运行器 — ${samples.length} 个样本${args.skill ? `（skill=${args.skill}）` : ''}`)

  const results: Awaited<ReturnType<typeof judgeOutput>>[] = []
  let failed = 0

  for (const sample of samples) {
    const rubric = getRubricFor(sample.skillId)
    if (!rubric) {
      console.warn(`⚠ 跳过 ${sample.id}: 无 rubric`)
      continue
    }
    try {
      // 注意：CLI 模式下用真实技能跑需要案件上下文；这里默认用"标准答案占位"，
      // 供基线/回退对比。实际接入时可在 runValueSkill 后调用 judgeOutput 打分。
      const output = sample.expectedPoints.join('；') // TODO: 接入真实技能输出
      const result = await judgeOutput({ sample, rubric, output })
      results.push(result)
      appendFileSync(RESULTS_FILE, JSON.stringify({ at: Date.now(), ...result }) + '\n')
      console.log(
        `  ✓ ${result.sampleId} [${result.skillId}] ${result.totalScore}/${result.maxTotal} (${(result.normalized * 100).toFixed(0)}%) 置信 ${result.confidence.toFixed(2)}` +
          (result.hallucinations.length ? ` ⚠幻觉:${result.hallucinations.length}` : '') +
          (result.missingPoints.length ? ` 缺失:${result.missingPoints.length}` : ''),
      )
    } catch (err: any) {
      failed++
      console.error(`  ✗ ${sample.id} 评估失败: ${err.message}`)
    }
  }

  const avg = results.length ? results.reduce((s, r) => s + r.normalized, 0) / results.length : 0
  console.log(`\n📊 汇总: ${results.length} 成功 / ${failed} 失败 | 平均归一化分 ${(avg * 100).toFixed(1)}%`)

  if (args.baseline || args.compare) {
    const snapshot = { at: Date.now(), skill: args.skill || 'all', avg, results }
    if (args.baseline) {
      writeFileSync(BASELINE_FILE, JSON.stringify(snapshot, null, 2))
      console.log(`💾 基线已保存 → ${BASELINE_FILE}`)
    }
    if (args.compare && existsSync(BASELINE_FILE)) {
      const prev = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'))
      const delta = (avg - (prev.avg || 0)) * 100
      const verdict = delta < -3 ? '⛔ 回退！请检查最近的 prompt/模型改动' : delta < 0 ? '⚠ 轻微下降，建议关注' : '✅ 达标或无回退'
      console.log(`📈 对比基线: ${(prev.avg * 100).toFixed(1)}% → ${(avg * 100).toFixed(1)}% (Δ${delta.toFixed(1)}pp) ${verdict}`)
    }
  }
}

main().catch((err) => {
  console.error('Eval 运行失败:', err)
  process.exit(1)
})
