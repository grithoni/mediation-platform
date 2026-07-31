import type { Router } from 'h3'
import { defineEventHandler, readBody, createError } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../database'
import { cases } from '../../database/schema'
import { signMpToken } from '../middleware/auth'

/**
 * POST /api/mp/auth/login — Login with wx code or caseNumber+accessCode
 * GET  /api/mp/auth/me    — Get current user
 */
export function authRoutes(router: Router) {
  router.post('/api/mp/auth/login', defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { code, caseNumber, accessCode } = body || {}

    if (!code && !caseNumber) {
      throw createError({ statusCode: 400, message: '请提供 code 或 caseNumber' })
    }

    let openid: string

    if (code) {
      const appId = process.env.WX_APPID || ''
      const appSecret = process.env.WX_APP_SECRET || ''
      if (!appId || !appSecret) {
        throw createError({ statusCode: 500, message: '微信登录未配置' })
      }
      const wxUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`
      const wxResp = await fetch(wxUrl).then(r => r.json()) as any
      if (wxResp.errcode) throw createError({ statusCode: 400, message: `微信登录失败: ${wxResp.errmsg}` })
      openid = wxResp.openid
      if (!openid) throw createError({ statusCode: 400, message: '微信登录未返回 openid' })
    } else {
      const db = getDb()
      const caseRow = db.select().from(cases).where(eq(cases.id, caseNumber!)).get()
      if (!caseRow || caseRow.accessCode !== accessCode) {
        throw createError({ statusCode: 401, message: '案件编号或验证码错误' })
      }
      openid = `demo_${caseNumber}`
    }

    const token = await signMpToken({ openid })
    return { success: true, data: { token, openid } }
  }))

  router.get('/api/mp/auth/me', defineEventHandler(async (event) => {
    const user = (event as any).context.mpUser
    if (!user) throw createError({ statusCode: 401, message: '未登录' })
    return { success: true, data: { openid: user.openid } }
  }))
}
