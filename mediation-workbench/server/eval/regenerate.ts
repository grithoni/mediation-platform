// ============================================================
// 批量重新生成某案件的全部 VALUE 技能结果
//
// 用途：一次把 25 个技能全部重跑，产出新的（表格化）结果，
//       避免逐个技能手动"重新生成"。
//
// 用法：
//   npm run value:regenerate -- 2026-1            # 重跑该案件全部技能
//   npm run value:regenerate -- 2026-1 V          # 只重跑 V 阶段
//   npm run value:regenerate -- 2026-1 v3         # 只重跑指定技能
// ============================================================
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VALUE_SKILLS, runValueSkill, getValueSkill } from '../utils/value-skills'

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

function parseArgs(): { caseNumber: string; filter?: string } {
  const argv = process.argv.slice(2)
  return { caseNumber: argv[0] || '', filter: argv[1] }
}

function selectSkills(filter?: string): string[] {
  if (!filter) return VALUE_SKILLS.map((s) => s.id)
  if (getValueSkill(filter)) return [filter]
  const upper = filter.toUpperCase()
  if (['V', 'A', 'L', 'U', 'E'].includes(upper)) {
    return VALUE_SKILLS.filter((s) => s.phaseKey === upper).map((s) => s.id)
  }
  return []
}

async function main() {
  const { caseNumber, filter } = parseArgs()
  if (!caseNumber) {
    console.error('用法: npm run value:regenerate -- <案号> [阶段|技能id]')
    process.exit(1)
  }

  const skillIds = selectSkills(filter)
  if (skillIds.length === 0) {
    console.error('无效的筛选条件:', filter)
    process.exit(1)
  }

  console.log(`\n🔄 批量重新生成案件 ${caseNumber} 的 ${skillIds.length} 个技能${filter ? `（筛选: ${filter}）` : ''}`)

  let ok = 0
  let fail = 0
  for (const skillId of skillIds) {
    const skill = getValueSkill(skillId)!
    process.stdout.write(`  [${skillId}] ${skill.name} ... `)
    try {
      const content = await runValueSkill(caseNumber, skillId, { awaitEval: true })
      const hasTable = content.includes('|')
      ok++
      console.log(`✅ ${content.length}字${hasTable ? '（含表格）' : ''}`)
    } catch (err: any) {
      fail++
      console.log(`❌ ${err.message?.slice(0, 60)}`)
    }
  }

  console.log(`\n📊 完成: ${ok} 成功 / ${fail} 失败`)
  if (fail > 0) console.log('⚠ 失败的技能请单独重试: npm run value:regenerate -- <案号> <技能id>')
}

main().catch((err) => {
  console.error('批量生成失败:', err)
  process.exit(1)
})
