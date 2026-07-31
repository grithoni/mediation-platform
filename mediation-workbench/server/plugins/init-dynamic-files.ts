// ============================================================
// server/plugins/init-dynamic-files.ts
// 服务启动时，为没有动态文件的案件自动生成分析
// 为没有 AI 欢迎消息的案件自动生成欢迎
// ============================================================
import { getDb } from '../database'
import { cases, caseDynamicFiles, messages } from '../database/schema'
import { eq } from 'drizzle-orm'

export default defineNitroPlugin(() => {
  // 延迟执行，不阻塞服务启动
  setTimeout(async () => {
    try {
      const db = getDb()
      const allCases = db.select().from(cases).all()

      // 找出没有动态文件或动态文件内容为空的案件
      const casesNeedingDf = allCases.filter(c => {
        const df = db.select().from(caseDynamicFiles).where(eq(caseDynamicFiles.caseId, c.id)).get()
        if (!df) return true
        // 至少有 description 才值得分析
        if (!c.description || c.description.length < 30) return false
        // 检查是否有至少2个非空字段
        const fields = [df.positions, df.potentialInterests, df.batna, df.partyAnalysis, df.disputeChecklist, df.timeline]
        const filled = fields.filter(f => f && String(f).trim().length > 30).length
        return filled < 2
      })

      if (casesNeedingDf.length === 0) {
        console.log('[init-df] 所有案件已有动态文件，跳过')
      } else {
        console.log(`[init-df] 发现 ${casesNeedingDf.length} 个案件需要生成动态文件`)

        // 动态导入（避免循环依赖）
        const { generateDynamicFile } = await import('../utils/generate-dynamic-file')

        // 逐个生成（避免并发过多导致 AI API 限流）
        for (const c of casesNeedingDf) {
          try {
            const result = await generateDynamicFile(c.id)
            if (result.generated.length > 0) {
              console.log(`[init-df] ${c.id}: 已生成 ${result.generated.join(', ')}`)
            }
          } catch (err: any) {
            console.warn(`[init-df] ${c.id}: 生成失败 — ${err.message}`)
          }
        }
        console.log('[init-df] 动态文件初始化完成')
      }

      // ============================================================
      // 找出没有 AI 欢迎消息的案件，自动生成欢迎
      // ============================================================
      const casesNeedingWelcome = allCases.filter(c => {
        const msgs = db.select().from(messages).where(eq(messages.caseId, c.id)).all()
        const hasAI = msgs.some(m => m.senderType === 'ai' && m.content && m.content.length > 50)
        return !hasAI
      })

      if (casesNeedingWelcome.length === 0) {
        console.log('[init-welcome] 所有案件已有 AI 欢迎消息，跳过')
      } else {
        console.log(`[init-welcome] 发现 ${casesNeedingWelcome.length} 个案件需要 AI 欢迎消息`)

        // 动态导入 triggerAiWelcome（来自 utils/ai-welcome.ts）
        const { createAiWelcomeForCase } = await import('../utils/ai-welcome')

        for (const c of casesNeedingWelcome) {
          try {
            await createAiWelcomeForCase(c.id)
            console.log(`[init-welcome] ${c.id}: AI欢迎消息已生成`)
          } catch (err: any) {
            console.warn(`[init-welcome] ${c.id}: 生成失败 — ${err.message}`)
          }
        }
        console.log('[init-welcome] AI 欢迎消息初始化完成')
      }
    } catch (err: any) {
      console.warn('[init-df] 初始化失败:', err.message)
    }
  }, 5000) // 延迟 5 秒，等服务完全启动
})
