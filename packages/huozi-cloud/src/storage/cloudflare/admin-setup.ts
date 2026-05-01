/**
 * Edge edition first-run admin setup.
 *
 * GET  /admin/setup?secret=$HUOZI_ADMIN_SECRET   →  HTML form
 * POST /admin/setup  (multipart form: secret, email, password)  →  cookie + 302
 *
 * One-shot guard: the GET form only renders, and POST only succeeds,
 * when the D1 `users` table is empty. After the first row exists this
 * endpoint 404s — preventing an attacker who later acquires the secret
 * from resetting the admin account. To rebootstrap, the deployer must
 * truncate `users` first (intentional friction).
 *
 * Edition guard: requires `HUOZI_EDGE_WORKSPACE_SLUG` env on the
 * Worker. Cloud deployments don't set it, so /admin/setup 404s there
 * regardless of the admin secret.
 *
 * Auth: secret is supplied via `?secret=` (GET) or hidden form field
 * (POST). All other admin endpoints use `X-Admin-Secret`; setup is the
 * one exception because it's hand-driven from a browser, not server-
 * to-server.
 *
 * Side effects on success:
 *   - INSERT users(id=uuid, email, display_name=null)
 *   - INSERT workspaces(id=uuid, slug=$EDGE_SLUG, name=$EDGE_NAME, owner=user_id)
 *   - INSERT workspace_members(role='owner')
 *   - INSERT password_credentials(user_id, hash, updated_at)
 *   - Sign session JWT for {sub:user_id, email, wsid:workspace_id}
 *   - 302 → /workspace with Set-Cookie
 */

import type { AdminEnv } from "./admin.js";
import { hashPassword } from "../../auth/password.js";
import { buildSessionCookie, signSession } from "./jwt.js";

interface SetupEnv extends AdminEnv {
  HUOZI_AUTH_SECRET?: string;
  HUOZI_EDGE_WORKSPACE_SLUG?: string;
  HUOZI_EDGE_WORKSPACE_NAME?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Constant-time-ish equality. Same shape as admin.ts's `secureEquals`
 * but local to avoid widening that module's exports.
 */
function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

async function isFirstRun(env: SetupEnv): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT 1 FROM users LIMIT 1`).first();
  return row === null;
}

interface SetupConfig {
  slug: string;
  name: string;
  authSecret: string;
}

/**
 * Validate that we're in Edge edition with everything configured. On
 * any failure return null and let the caller 404 — we don't leak which
 * specific check failed.
 */
function readSetupConfig(env: SetupEnv): SetupConfig | null {
  const slug = env.HUOZI_EDGE_WORKSPACE_SLUG?.trim();
  if (!slug || !SLUG_RE.test(slug)) return null;
  const name = (env.HUOZI_EDGE_WORKSPACE_NAME ?? slug).trim();
  if (!name) return null;
  const authSecret = env.HUOZI_AUTH_SECRET;
  if (!authSecret) return null;
  return { slug, name, authSecret };
}

function readSecret(env: SetupEnv): string | null {
  const s = env.HUOZI_ADMIN_SECRET;
  return s && s.length > 0 ? s : null;
}

// ── GET /admin/setup ────────────────────────────────────────────────────

export async function handleAdminSetupForm(
  request: Request,
  env: SetupEnv,
): Promise<Response> {
  const expected = readSecret(env);
  const cfg = readSetupConfig(env);
  if (!expected || !cfg) return notFound();

  const url = new URL(request.url);
  const provided = url.searchParams.get("secret") ?? "";
  if (!eq(provided, expected)) return notFound();

  if (!(await isFirstRun(env))) return notFound();

  return new Response(renderSetupHtml(provided, cfg), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// ── POST /admin/setup ───────────────────────────────────────────────────

export async function handleAdminSetupSubmit(
  request: Request,
  env: SetupEnv,
): Promise<Response> {
  const expected = readSecret(env);
  const cfg = readSetupConfig(env);
  if (!expected || !cfg) return notFound();

  if (request.method !== "POST")
    return new Response("method not allowed", { status: 405 });

  const form = await request.formData().catch(() => null);
  if (!form) return errorPage(400, "Invalid form submission.");

  const secret = String(form.get("secret") ?? "");
  if (!eq(secret, expected)) return notFound();

  if (!(await isFirstRun(env))) return notFound();

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email))
    return errorPage(400, "Please enter a valid email address.", { secret, email });
  if (password.length < MIN_PASSWORD_LEN)
    return errorPage(
      400,
      `Password must be at least ${MIN_PASSWORD_LEN} characters.`,
      { secret, email },
    );

  const userId = uuid();
  const workspaceId = uuid();
  const now = Date.now();
  const hash = await hashPassword(password);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, email, display_name, created_at, last_seen_at)
         VALUES (?, ?, NULL, ?, ?)`,
      ).bind(userId, email, now, now),
      env.DB.prepare(
        `INSERT INTO workspaces (id, slug, name, owner_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(workspaceId, cfg.slug, cfg.name, userId, now),
      env.DB.prepare(
        `INSERT INTO workspace_members (workspace_id, user_id, role, joined_at, invited_by)
         VALUES (?, ?, 'owner', ?, NULL)`,
      ).bind(workspaceId, userId, now),
      env.DB.prepare(
        `INSERT INTO password_credentials (user_id, hash, updated_at)
         VALUES (?, ?, ?)`,
      ).bind(userId, hash, now),
    ]);
  } catch (err) {
    return errorPage(
      500,
      `Database write failed: ${err instanceof Error ? err.message : String(err)}`,
      { secret, email },
    );
  }

  const token = await signSession(cfg.authSecret, {
    userId,
    email,
    wsid: workspaceId,
  });

  // Cookie domain unset → defaults to the current host, which is what
  // we want for Edge (single host per deployment).
  const cookie = buildSessionCookie(token, { secure: true });

  const headers = new Headers();
  headers.set("location", "/workspace");
  headers.set("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

// ── HTML rendering ─────────────────────────────────────────────────────

function renderSetupHtml(secret: string, cfg: SetupConfig): string {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Set up your huozi Edge admin</title>
<style>
  :root { color-scheme: light dark; --fg: #111; --bg: #fafafa; --muted: #666; --border: #e0e0e0; --accent: #c2410c; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #f5f5f5; --bg: #0f0f0f; --muted: #999; --border: #2a2a2a; --accent: #fb923c; }
  }
  body { font-family: ui-sans-serif, -apple-system, "Helvetica Neue", system-ui; margin: 0; background: var(--bg); color: var(--fg); }
  .wrap { max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; font-weight: 600; }
  .sub { color: var(--muted); font-size: 0.9rem; margin: 0 0 2rem; line-height: 1.5; }
  form { display: flex; flex-direction: column; gap: 1rem; }
  label { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85rem; }
  input { padding: 0.6rem 0.75rem; font-size: 0.95rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg); font-family: inherit; }
  input:focus { outline: none; border-color: var(--accent); }
  .ws { padding: 0.75rem 1rem; background: var(--border); border-radius: 8px; font-size: 0.85rem; color: var(--muted); }
  button { margin-top: 0.5rem; padding: 0.7rem 1rem; font-size: 0.95rem; border: 0; border-radius: 8px; background: var(--fg); color: var(--bg); cursor: pointer; font-family: inherit; }
  button:hover { opacity: 0.9; }
  .note { font-size: 0.8rem; color: var(--muted); margin-top: 1.5rem; line-height: 1.5; }
  code { font-family: ui-monospace, "JetBrains Mono", Menlo, monospace; font-size: 0.85em; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Set up your admin account</h1>
  <p class="sub">
    First-run setup for this huozi Edge deployment. Pick the email + password you'll use to log in. This page only works once — after the first admin is created it disappears.
  </p>

  <form method="POST" action="/admin/setup" autocomplete="off">
    <input type="hidden" name="secret" value="${escapeHtml(secret)}" />

    <div class="ws">
      <strong>Workspace:</strong> ${escapeHtml(cfg.name)} <code>(${escapeHtml(cfg.slug)})</code><br />
      <span style="font-size:0.75rem">Set at deploy time via <code>HUOZI_EDGE_WORKSPACE_SLUG</code>. To rename later, edit the env and redeploy.</span>
    </div>

    <label>
      Email
      <input type="email" name="email" required autocomplete="off" />
    </label>

    <label>
      Password
      <input type="password" name="password" required minlength="${MIN_PASSWORD_LEN}" autocomplete="new-password" />
    </label>

    <button type="submit">Create admin and sign in</button>
  </form>

  <p class="note">
    The password is hashed with PBKDF2-SHA-256 (600,000 iterations) before it lands in D1. The setup secret you used in this URL never gets stored.
  </p>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function errorPage(
  status: number,
  message: string,
  preserve?: { secret?: string; email?: string },
): Response {
  const html = /* html */ `<!doctype html>
<html><head><meta charset="utf-8" /><title>Setup error</title>
<style>body{font-family:ui-sans-serif,system-ui;margin:4rem auto;max-width:32rem;padding:0 1.5rem;color:#111}a{color:#c2410c}</style>
</head><body>
<h1>Setup failed</h1>
<p>${escapeHtml(message)}</p>
${
    preserve?.secret
      ? `<p><a href="/admin/setup?secret=${encodeURIComponent(preserve.secret)}">Try again</a></p>`
      : ""
  }
</body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
