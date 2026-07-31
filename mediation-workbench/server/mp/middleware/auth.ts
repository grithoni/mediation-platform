import { SignJWT, jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.MP_JWT_SECRET || 'mediation-mp-secret-change-in-prod!'
)
const TOKEN_EXPIRY = '7d'

export interface MpUserPayload {
  openid: string
  unionid?: string
  userId?: string
}

/**
 * Generate JWT token for mini-program user
 */
export async function signMpToken(payload: MpUserPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

/**
 * Verify JWT token and return payload, or null if invalid
 */
export async function verifyMpToken(token: string): Promise<MpUserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as MpUserPayload
  } catch {
    return null
  }
}
