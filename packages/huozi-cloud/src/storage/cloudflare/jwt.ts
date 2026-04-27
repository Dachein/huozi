/**
 * Session JWT helpers — HS256 over `HUOZI_AUTH_SECRET`.
 *
 * Both the Worker (signs at /auth/otp/verify) and Next.js (verifies on
 * every server request) use these. The same secret must be set on both
 * deployments. `jose` is isomorphic — works in Workers via Web Crypto and
 * in Node ≥ 16 via the same surface.
 *
 * Token shape:
 *   { sub: <user_id>, email, iat, exp }
 *
 * TTL: 7 days. Sliding window is implemented at the route layer
 * (re-issue on /auth/me when the token has < 24h left).
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export const JWT_TTL_SECONDS = 7 * 24 * 60 * 60
export const JWT_REISSUE_THRESHOLD_SECONDS = 24 * 60 * 60
export const SESSION_COOKIE_NAME = 'huozi_session'

export interface SessionClaims extends JWTPayload {
  sub: string
  email: string
  /** Currently-selected workspace UUID. Null/absent means the user is
   *  signed in but hasn't picked a workspace yet — UI should bounce them
   *  to /select-workspace (or /onboard if they have zero memberships). */
  wsid?: string
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signSession(
  secret: string,
  claims: { userId: string; email: string; wsid?: string | null },
): Promise<string> {
  const payload: Record<string, unknown> = { email: claims.email }
  if (claims.wsid) payload.wsid = claims.wsid
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${JWT_TTL_SECONDS}s`)
    .sign(secretKey(secret))
}

export async function verifySession(
  secret: string,
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ['HS256'],
    })
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      return null
    }
    return payload as SessionClaims
  } catch {
    return null
  }
}

/**
 * Build a Set-Cookie header for the session token. Server-side rendering
 * paths use this to persist the JWT after /auth/otp/verify.
 */
export function buildSessionCookie(
  token: string,
  opts?: { secure?: boolean; domain?: string },
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${JWT_TTL_SECONDS}`,
  ]
  if (opts?.secure !== false) parts.push('Secure')
  if (opts?.domain) parts.push(`Domain=${opts.domain}`)
  return parts.join('; ')
}

export function buildLogoutCookie(opts?: { domain?: string }): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Secure',
  ]
  if (opts?.domain) parts.push(`Domain=${opts.domain}`)
  return parts.join('; ')
}
