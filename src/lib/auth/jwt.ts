/**
 * Next.js-side session helpers — verify the JWT cookie minted by the
 * huozi-cloud Worker's /auth/otp/verify route.
 *
 * Sign-side lives in the Worker (`packages/huozi-cloud/.../jwt.ts`).
 * Both sides share the same `HUOZI_AUTH_SECRET` env var. We do NOT mint
 * tokens here — the Worker is the only signing surface — but verifying
 * locally avoids a roundtrip on every page render.
 */

import { jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "huozi_session";

export interface SessionClaims extends JWTPayload {
  sub: string;
  email: string;
  /** Currently-selected workspace UUID, or undefined if the user is
   *  signed in but hasn't selected one (multi-membership case). */
  wsid?: string;
}

function secret(): Uint8Array {
  const s = process.env.HUOZI_AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "HUOZI_AUTH_SECRET is not set or shorter than 32 chars; set it on the Next.js worker.",
    );
  }
  return new TextEncoder().encode(s);
}

export async function verifySession(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

/** Build a Set-Cookie header for the session JWT minted by the Worker. */
export function buildSessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${7 * 24 * 60 * 60}`,
  ].join("; ");
}

export function buildLogoutCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=0",
  ].join("; ");
}
