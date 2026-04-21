/**
 * Unit tests for security/secrets.ts.
 *
 * Goals:
 *   - Each rule detects its intended pattern on a realistic sample
 *   - Placeholder allowlist works (sk-test-*, EXAMPLE, YOUR_, repeated chars)
 *   - Clean content returns null (zero false positives on reasonable code)
 */

import { describe, expect, it } from 'vitest'
import {
  formatSecretError,
  isAllowlisted,
  redactSecret,
  scanForSecrets,
} from '../secrets.js'

describe('redactSecret', () => {
  it('fully masks short strings', () => {
    expect(redactSecret('abc')).toBe('***')
    expect(redactSecret('12345678')).toBe('***')
  })
  it('keeps head and tail on longer strings', () => {
    expect(redactSecret('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA***LE')
  })
})

describe('isAllowlisted', () => {
  it('allows sk-test-*', () => {
    expect(isAllowlisted('sk-test-abc12345')).toBe(true)
  })
  it('allows sk-example-*', () => {
    expect(isAllowlisted('sk-example-abc12345')).toBe(true)
  })
  it('allows AWS EXAMPLE key', () => {
    expect(isAllowlisted('AKIAIOSFODNN7EXAMPLE')).toBe(true)
  })
  it('allows YOUR_API_KEY-style placeholders', () => {
    expect(isAllowlisted('YOUR_API_KEY_HERE')).toBe(true)
  })
  it('allows repeated-char bodies (sk-xxxxxxxxxxxxxxx)', () => {
    expect(isAllowlisted('sk-xxxxxxxxxxxxxxxxxxxx')).toBe(true)
  })
  it('does NOT allow real-looking keys', () => {
    expect(isAllowlisted('sk-proj-abc123realkey7z9xQyZ')).toBe(false)
    expect(isAllowlisted('AKIAIOSFODNN7EXAMPZ')).toBe(false) // EXAMPZ, not EXAMPLE
  })
})

describe('scanForSecrets — positive (detection) cases', () => {
  it('detects AWS access key', () => {
    const r = scanForSecrets('AWS_KEY = "AKIAIOSFODNN7REAL12Z"\n')
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('aws-access-key-id')
  })

  it('detects OpenAI-style key', () => {
    const r = scanForSecrets('const key = "sk-proj-realLooking1234567890abcdefgh"')
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('openai-api-key')
  })

  it('detects Anthropic key', () => {
    const r = scanForSecrets(
      'export ANTHROPIC_KEY=sk-ant-api01-realABCDEFGhijklmnopqrs12345',
    )
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('anthropic-api-key')
  })

  it('detects GitHub classic PAT', () => {
    // ghp_ + exactly 36 alphanum
    const r = scanForSecrets('TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890')
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('github-classic-pat')
  })

  it('detects Slack token', () => {
    const r = scanForSecrets('SLACK=xoxb-1234567890-abcdef123456')
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('slack-token')
  })

  it('detects Google API key', () => {
    const r = scanForSecrets('GOOGLE_API_KEY=AIzaSyD1234567890abcdefghijklmnopqrstuv')
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('google-api-key')
  })

  it('detects Stripe live key', () => {
    // sk_live_ + 24+ alphanum
    const r = scanForSecrets('STRIPE_KEY=sk_live_abcdefghijklmnopqrstuvwx')
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('stripe-live-secret-key')
  })

  it('detects JWT', () => {
    const r = scanForSecrets(
      'Authorization: eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY3OA.SflKxwRJSMeKK',
    )
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('jwt')
  })

  it('detects PEM private key header', () => {
    const r = scanForSecrets(
      'config:\n  key: |\n    -----BEGIN RSA PRIVATE KEY-----\n    MIIEpAIB...',
    )
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('pem-private-key-header')
  })

  it('detects long Bearer token', () => {
    const r = scanForSecrets(
      'Authorization: Bearer ABC123def456ghi789jkl012mno345pqrs',
    )
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('bearer-long-token')
  })

  it('detects postgres URI with password', () => {
    const r = scanForSecrets(
      'DATABASE_URL=postgres://user:real_p@ssw0rd@db.example.com:5432/prod',
    )
    expect(r).not.toBeNull()
    expect(r?.rule).toBe('db-connection-string-with-password')
  })

  it('reports line number correctly (1-indexed)', () => {
    const content =
      'line 1\nline 2\nTOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890\nline 4'
    const r = scanForSecrets(content)
    expect(r?.lineNumber).toBe(3)
  })
})

describe('scanForSecrets — negative (allowlist / clean) cases', () => {
  it('skips sk-test-* keys', () => {
    const r = scanForSecrets('const key = "sk-test-realLooking1234567890abc"')
    expect(r).toBeNull()
  })
  it('skips sk-example-* keys', () => {
    const r = scanForSecrets('EXAMPLE_KEY=sk-example-abcdef1234567890abcdef')
    expect(r).toBeNull()
  })
  it('skips AWS AKIA...EXAMPLE', () => {
    const r = scanForSecrets('aws_access_key = "AKIAIOSFODNN7EXAMPLE"')
    expect(r).toBeNull()
  })
  it('skips YOUR_API_KEY-style templates', () => {
    const r = scanForSecrets('ghp_YOUR_GITHUB_TOKEN_HEREYYYYYYYYYYYY')
    expect(r).toBeNull()
  })
  it('skips repeated-char placeholders', () => {
    const r = scanForSecrets('sk-xxxxxxxxxxxxxxxxxxxxxxxx')
    expect(r).toBeNull()
  })
  it('clean code returns null', () => {
    const r = scanForSecrets(
      `export function greet(name: string): string {
  return \`hello \${name}\`
}
`,
    )
    expect(r).toBeNull()
  })
  it('a markdown doc with fenced placeholder is clean', () => {
    const r = scanForSecrets(
      `# Setup\n\nSet your API key:\n\n\`\`\`\nexport OPENAI_API_KEY="sk-..."\n\`\`\`\n`,
    )
    expect(r).toBeNull()
  })
  it('JSON config with <YOUR_*> templates is clean', () => {
    const r = scanForSecrets('{"apiKey": "<YOUR_OPENAI_KEY>"}')
    expect(r).toBeNull()
  })
  it('template syntax with ${} is clean (no pattern match)', () => {
    const r = scanForSecrets('key = "${OPENAI_API_KEY}"')
    expect(r).toBeNull()
  })
})

describe('formatSecretError', () => {
  it('produces human-readable error with rule name, location, redacted match', () => {
    const msg = formatSecretError({
      rule: 'openai-api-key',
      match: 'sk-p***z9',
      lineNumber: 42,
      column: 17,
    })
    expect(msg).toContain('openai-api-key')
    expect(msg).toContain('42:17')
    expect(msg).toContain('sk-p***z9')
    expect(msg).toContain('env vars')
  })
})
