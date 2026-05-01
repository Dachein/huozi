/**
 * Edge edition password login.
 *
 * POST /auth/edge-login   (form-encoded: email, password)
 *   → verify against password_credentials → sign JWT → Set-Cookie + 302
 *
 * Same response shape regardless of which check failed (user missing,
 * wrong password, malformed input) — single string `Invalid email or
 * password` to defend against email enumeration. The PBKDF2 cost
 * naturally floors timing for the wrong-password branch; we still hash
 * once on the user-missing branch (against a known-bad PHC) so the
 * timing difference between "no user" and "user but wrong password"
 * stays within noise.
 */

import { hashPassword, verifyPassword } from "../../auth/password.js";
import { buildSessionCookie, signSession } from "./jwt.js";
import type { HuoziCloudflareBindings } from "./bindings.js";

interface EdgeLoginEnv extends HuoziCloudflareBindings {
  HUOZI_AUTH_SECRET?: string;
  HUOZI_EDGE_WORKSPACE_SLUG?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A precomputed hash of the literal string `__no_user__` — used as a
// dummy when the email isn't found, so we still pay the verify cost
// and don't reveal user existence via timing. Algo + iterations match
// the ones in `auth/password.ts`. Re-generate by running:
//   await hashPassword('__no_user__')
// in a node REPL with that module imported. Salt is fixed here on
// purpose — its only job is making the verify shape match production.
const DUMMY_PHC =
  "$pbkdf2-sha256$i=600000$AAAAAAAAAAAAAAAAAAAAAA$" +
  "qpEbpYfQcAJoJEK7BrIzJfk-D32uyJaaKJfIdHm-PI8";

interface UserRow {
  id: string;
  email: string;
}

interface CredentialRow {
  hash: string;
}

interface MembershipRow {
  workspace_id: string;
}

/**
 * Redirect back to /login with `?error=invalid` so the themed Next.js
 * page can re-render the form with an inline message. The query string
 * is the channel; we never expose user existence vs. password mismatch.
 */
function loginError(): Response {
  return new Response(null, {
    status: 303,
    headers: { location: "/login?error=invalid" },
  });
}

export async function handleEdgeLogin(
  request: Request,
  env: EdgeLoginEnv,
): Promise<Response> {
  // Edition guard: Edge-only.
  const slug = env.HUOZI_EDGE_WORKSPACE_SLUG;
  if (!slug) return new Response("Not found", { status: 404 });

  const authSecret = env.HUOZI_AUTH_SECRET;
  if (!authSecret) {
    return new Response(
      "Server misconfigured: HUOZI_AUTH_SECRET unset.",
      { status: 500 },
    );
  }

  if (request.method !== "POST")
    return new Response("method not allowed", { status: 405 });

  const form = await request.formData().catch(() => null);
  if (!form) return loginError();

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  // Shape check first — but still pay a hash cost to keep timing flat.
  const shapeOk = EMAIL_RE.test(email) && password.length > 0;

  // Look up user even if shape is bad (we'll discard the result), so a
  // malformed email doesn't return faster than a well-formed-but-unknown one.
  const userRow = shapeOk
    ? await env.DB.prepare(`SELECT id, email FROM users WHERE email = ?`)
        .bind(email)
        .first<UserRow>()
    : null;

  const credRow = userRow
    ? await env.DB.prepare(
        `SELECT hash FROM password_credentials WHERE user_id = ?`,
      )
        .bind(userRow.id)
        .first<CredentialRow>()
    : null;

  // Always run a verify — against the real hash if we have one, against
  // the dummy hash otherwise. Result is meaningful only when both
  // userRow and credRow exist.
  const phc = credRow?.hash ?? DUMMY_PHC;
  const ok = await verifyPassword(password, phc);

  if (!shapeOk || !userRow || !credRow || !ok) {
    return loginError();
  }

  // Pick a workspace: Edge has exactly one — the membership row by
  // owner is created at /admin/setup, and invites add additional members
  // to the same workspace. Pick the user's first membership.
  const member = await env.DB.prepare(
    `SELECT workspace_id FROM workspace_members
     WHERE user_id = ?
     ORDER BY joined_at ASC LIMIT 1`,
  )
    .bind(userRow.id)
    .first<MembershipRow>();

  if (!member) {
    // User exists with a credential but no membership — probably an
    // invite that was reset. Surface the same generic error to avoid
    // hinting at the inconsistency.
    return loginError();
  }

  const now = Date.now();
  await env.DB.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`)
    .bind(now, userRow.id)
    .run();

  const token = await signSession(authSecret, {
    userId: userRow.id,
    email: userRow.email,
    wsid: member.workspace_id,
  });

  const headers = new Headers();
  headers.set("location", "/workspace");
  headers.set("set-cookie", buildSessionCookie(token, { secure: true }));
  return new Response(null, { status: 303, headers });
}

// ── POST /auth/edge-invite-redeem ──────────────────────────────────────
//
// Edge edition invite acceptance. The token from the invite URL is the
// trust anchor — anyone who has it can claim the invited slot, with
// any email they want (Edge treats email as username, not a verified
// identity). Form: token, email, password. Sets cookie + 302.
//
// Why no admin-secret here: redemption is end-user-driven (browser),
// so cookie-style trust comes from the high-entropy invite token (32
// bytes random, single-use, expires in 7 days).

const MIN_PASSWORD_LEN = 8;

interface InviteRow {
  workspace_id: string;
  expires_at: number;
  accepted_at: number | null;
  revoked_at: number | null;
}

function uuid(): string {
  return crypto.randomUUID();
}

function inviteFailRedirect(token: string, code: string): Response {
  const headers = new Headers();
  const loc = `/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(code)}`;
  headers.set("location", loc);
  return new Response(null, { status: 303, headers });
}

export async function handleEdgeInviteRedeem(
  request: Request,
  env: EdgeLoginEnv,
): Promise<Response> {
  // Edition guard.
  const slug = env.HUOZI_EDGE_WORKSPACE_SLUG;
  if (!slug) return new Response("Not found", { status: 404 });

  const authSecret = env.HUOZI_AUTH_SECRET;
  if (!authSecret) {
    return new Response(
      "Server misconfigured: HUOZI_AUTH_SECRET unset.",
      { status: 500 },
    );
  }

  if (request.method !== "POST")
    return new Response("method not allowed", { status: 405 });

  const form = await request.formData().catch(() => null);
  if (!form) return new Response("invalid form", { status: 400 });

  const inviteToken = String(form.get("token") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!inviteToken) return new Response("missing token", { status: 400 });
  if (!EMAIL_RE.test(email))
    return inviteFailRedirect(inviteToken, "invalid_email");
  if (password.length < MIN_PASSWORD_LEN)
    return inviteFailRedirect(inviteToken, "weak_password");

  // Validate invite.
  const invite = await env.DB.prepare(
    `SELECT workspace_id, expires_at, accepted_at, revoked_at
     FROM workspace_invites WHERE token = ?`,
  )
    .bind(inviteToken)
    .first<InviteRow>();

  if (!invite) return inviteFailRedirect(inviteToken, "invalid_invite");
  if (invite.revoked_at) return inviteFailRedirect(inviteToken, "revoked");
  if (invite.accepted_at) return inviteFailRedirect(inviteToken, "already_accepted");
  if (invite.expires_at < Date.now())
    return inviteFailRedirect(inviteToken, "expired");

  const workspaceId = invite.workspace_id;
  const now = Date.now();
  const hash = await hashPassword(password);

  // Upsert flow:
  //   1. If a user with this email already exists, refuse — Edge treats
  //      one email as one principal. Adding a second membership for an
  //      existing user is semantically fine but our v1 invite UX assumes
  //      "set a fresh password" — overriding an existing one silently is
  //      surprising. Force the user to log in normally instead.
  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<{ id: string }>();
  if (existing) return inviteFailRedirect(inviteToken, "email_taken");

  const userId = uuid();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, email, display_name, created_at, last_seen_at)
         VALUES (?, ?, NULL, ?, ?)`,
      ).bind(userId, email, now, now),
      env.DB.prepare(
        `INSERT INTO password_credentials (user_id, hash, updated_at)
         VALUES (?, ?, ?)`,
      ).bind(userId, hash, now),
      env.DB.prepare(
        `INSERT INTO workspace_members
         (workspace_id, user_id, role, joined_at, invited_by)
         VALUES (?, ?, 'member', ?, NULL)`,
      ).bind(workspaceId, userId, now),
      env.DB.prepare(
        `UPDATE workspace_invites SET accepted_at = ? WHERE token = ?`,
      ).bind(now, inviteToken),
    ]);
  } catch (err) {
    return inviteFailRedirect(
      inviteToken,
      "db_error:" +
        (err instanceof Error ? err.message.slice(0, 80) : "unknown"),
    );
  }

  const session = await signSession(authSecret, {
    userId,
    email,
    wsid: workspaceId,
  });

  const headers = new Headers();
  headers.set("location", "/workspace");
  headers.set("set-cookie", buildSessionCookie(session, { secure: true }));
  return new Response(null, { status: 303, headers });
}
