/**
 * Open-token JWT helpers — HS256 over `HUOZI_AUTH_SECRET`.
 *
 * Used by `huozi_open` (MCP tool) + `/o/<token>` (HTTP route on this
 * Worker) + `/o/[token]/page.tsx` (Next.js SSR). The same secret signs
 * and verifies; the token is the only auth carried in the URL.
 *
 * Why a separate JWT family from the session cookie:
 *   - Different audience: session JWTs identify a logged-in human; open
 *     tokens grant **single-file read** to whoever holds the URL.
 *   - Different TTL: sessions are 7d; open tokens are ≤ 1h.
 *   - Different blast radius on leak: a leaked session = full workspace
 *     access; a leaked open token = one file, until exp.
 *   - The `iss: 'huozi-open'` claim is checked on verify to refuse
 *     accidental cross-family token use.
 *
 * Token shape:
 *   {
 *     iss: 'huozi-open',
 *     sub: <workspace_id>,
 *     fp:  <file_path>,
 *     scope: <scope_path | null>,   // preserves principal's scope
 *     kid: <principal_id>,           // audit trail
 *     iat, exp
 *   }
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export const OPEN_TOKEN_ISS = 'huozi-open'
export const OPEN_TOKEN_DEFAULT_TTL_SECONDS = 600 // 10 minutes
export const OPEN_TOKEN_MAX_TTL_SECONDS = 3600 // 1 hour cap

export interface OpenTokenClaims extends JWTPayload {
  iss: typeof OPEN_TOKEN_ISS
  sub: string // workspace_id
  fp: string // file_path (already scope-resolved or scope-relative — see signer)
  scope?: string | null
  kid?: string
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export interface SignOpenInput {
  workspaceId: string
  filePath: string
  scopePath?: string | null
  principalId?: string
  ttlSeconds: number
}

export async function signOpenToken(
  secret: string,
  input: SignOpenInput,
): Promise<{ token: string; expiresAt: number }> {
  const ttl = Math.max(
    1,
    Math.min(input.ttlSeconds, OPEN_TOKEN_MAX_TTL_SECONDS),
  )
  const payload: Record<string, unknown> = {
    fp: input.filePath,
  }
  if (input.scopePath !== undefined && input.scopePath !== null) {
    payload.scope = input.scopePath
  }
  if (input.principalId) {
    payload.kid = input.principalId
  }
  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttl
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(OPEN_TOKEN_ISS)
    .setSubject(input.workspaceId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey(secret))
  return { token, expiresAt: exp }
}

export async function verifyOpenToken(
  secret: string,
  token: string,
): Promise<OpenTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ['HS256'],
      issuer: OPEN_TOKEN_ISS,
    })
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.fp !== 'string' ||
      payload.iss !== OPEN_TOKEN_ISS
    ) {
      return null
    }
    return payload as OpenTokenClaims
  } catch {
    return null
  }
}
