/**
 * Secret scanner for write-time content.
 *
 * Implements SPEC §7.5 — simplified v1. ~15 hardcoded patterns for
 * "obvious" secrets (AWS/OpenAI/Anthropic/GitHub/Slack/JWT/SSH key headers).
 * No per-workspace allowlist (v1 keeps it simple). A built-in allowlist
 * skips obvious test / placeholder strings.
 *
 * Hit → hard reject with errorCode ERR.SECRET_DETECTED (102).
 *
 * What this is NOT (intentional non-goals for v1):
 *   - gitleaks full ruleset (200+ rules) — extension for v2
 *   - trufflehog-style verified detection (API calls to prove a key works)
 *   - per-workspace / per-path allowlist configuration
 */

// ── Rules ────────────────────────────────────────────────────────────────

export interface SecretRule {
  name: string
  re: RegExp
}

/**
 * Each rule's regex is anchored to word/line boundaries where possible.
 * We run them against individual lines (see `scanForSecrets`) so multiline
 * content scales linearly.
 */
export const SECRET_RULES: SecretRule[] = [
  // AWS
  {
    name: 'aws-access-key-id',
    re: /\bAKIA[0-9A-Z]{16}\b/,
  },

  // Anthropic — MUST come before the openai rule, because the `sk-` prefix
  // of the OpenAI rule would also match `sk-ant-...`. First match wins in
  // scanForSecrets, so order matters for disambiguation.
  {
    name: 'anthropic-api-key',
    re: /\bsk-ant-(?:api\d+-|oat\d+-)?[A-Za-z0-9_-]{20,}\b/,
  },

  // OpenAI — covers sk-, sk-proj-, sk-svcacct-, sk-admin- etc.
  // Allowlist further down catches "sk-test-", "sk-example-" placeholders.
  {
    name: 'openai-api-key',
    re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\b/,
  },

  // GitHub
  {
    name: 'github-classic-pat',
    re: /\bghp_[A-Za-z0-9]{36}\b/,
  },
  {
    name: 'github-fine-grained-pat',
    re: /\bgithub_pat_[A-Za-z0-9_]{70,}\b/,
  },
  {
    name: 'github-oauth-token',
    re: /\bgho_[A-Za-z0-9]{36}\b/,
  },

  // Slack
  {
    name: 'slack-token',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },

  // Google
  {
    name: 'google-api-key',
    re: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },

  // Stripe
  {
    name: 'stripe-live-secret-key',
    re: /\bsk_live_[A-Za-z0-9]{24,}\b/,
  },

  // JWT
  {
    name: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },

  // Private keys — by header, not body
  {
    name: 'pem-private-key-header',
    re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/,
  },

  // Bearer-like long tokens in Authorization header style
  {
    name: 'bearer-long-token',
    re: /\bBearer\s+[A-Za-z0-9_-]{32,}/,
  },

  // Postgres / MongoDB URI with password
  {
    name: 'db-connection-string-with-password',
    re: /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|mssql):\/\/[^:\s]+:[^@\s]{6,}@[A-Za-z0-9.-]+/,
  },
]

// ── Allowlist ────────────────────────────────────────────────────────────

const ALLOWLIST_CASE_INSENSITIVE = [
  '-test-',
  '-example-',
  '-placeholder-',
  '-xxx-',
  '-dummy-',
  '-fake-',
  '-demo-',
  '-sample-',
] as const

const ALLOWLIST_CASE_SENSITIVE = [
  'EXAMPLE', // AWS standard AKIA...EXAMPLE
  'YOUR_',
  'SAMPLE',
  'FAKE',
  'DUMMY',
  'PLACEHOLDER',
  'REPLACEME',
] as const

/**
 * Also skip when the match is ENTIRELY composed of a single repeated char
 * (e.g. "sk-xxxxxxxxxxxxxxxxxxxx") — these are obvious placeholders that
 * developers write in docs.
 */
function isRepeatedChar(s: string): boolean {
  if (s.length < 10) return false
  // Strip the well-known prefixes so we test the body, not the prefix.
  const body = s.replace(/^(sk-(?:proj-|ant-)?|AKIA|ghp_|gho_|github_pat_|xox[a-z]-|AIza|sk_live_)/, '')
  if (body.length < 10) return false
  const first = body[0]
  return [...body].every((c) => c === first)
}

export function isAllowlisted(match: string): boolean {
  const lower = match.toLowerCase()
  if (ALLOWLIST_CASE_INSENSITIVE.some((s) => lower.includes(s))) return true
  if (ALLOWLIST_CASE_SENSITIVE.some((s) => match.includes(s))) return true
  if (isRepeatedChar(match)) return true
  return false
}

// ── Scanner ──────────────────────────────────────────────────────────────

export interface SecretMatch {
  rule: string
  match: string // redacted for logging
  lineNumber: number // 1-indexed
  column: number // 1-indexed
}

/**
 * Redact a matched secret for safe logging / error messages.
 * Keep the first 4 chars + 3 asterisks + last 2 chars.
 */
export function redactSecret(s: string): string {
  if (s.length <= 8) return '***'
  return `${s.slice(0, 4)}***${s.slice(-2)}`
}

/**
 * Scan content for secrets. Returns the FIRST match found (so error
 * messages stay short); callers treat any non-null as a hard reject.
 *
 * Complexity: O(lines × rules × lineLength). For typical source content
 * (<100KB, ~12 rules) this runs in <1 ms per file.
 */
export function scanForSecrets(content: string): SecretMatch | null {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    for (const rule of SECRET_RULES) {
      // Use exec with a fresh index (rules are not global-flagged).
      const m = rule.re.exec(line)
      if (!m) continue
      if (isAllowlisted(m[0])) continue
      return {
        rule: rule.name,
        match: redactSecret(m[0]),
        lineNumber: i + 1,
        column: (m.index ?? 0) + 1,
      }
    }
  }
  return null
}

/**
 * Format a SecretMatch as a user-facing error message.
 * Example: 'detected secret-like pattern "aws-access-key-id" at line 42:17 (AKIA***A3)'
 */
export function formatSecretError(m: SecretMatch): string {
  return `detected secret-like pattern "${m.rule}" at line ${m.lineNumber}:${m.column} (${m.match}). If this is a real secret, use env vars or a secret manager. If this is a placeholder, use a test prefix like "sk-test-..." or a template like "<YOUR_API_KEY>".`
}
