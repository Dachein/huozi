import { requireEnv } from './utils/env.js'
/**
 * CF-wire smoke for secret scanner (SPEC §7.5).
 *
 * Verifies the scanner blocks writes containing real-looking secrets and
 * doesn't false-fire on placeholder / templated content.
 *
 * Scenarios:
 *   1. Clean content via huozi_write → succeeds
 *   2. Write with OpenAI key → rejected, errorCode 102
 *   3. Write with AWS AKIA...EXAMPLE → succeeds (allowlisted)
 *   4. Write with <YOUR_API_KEY> placeholder → succeeds
 *   5. Write with Anthropic key → rejected (specific rule name)
 *   6. Edit: seed clean file, edit to introduce GitHub token → rejected
 *   7. BatchEdit: 2 edits, one with DB URL password → whole batch aborts
 */

const URL_BASE = process.env['HUOZI_CF_URL'] ?? 'https://cloud.huozi.app'
const TOKEN =
  process.env['HUOZI_CF_TOKEN'] ??
  requireEnv('HUOZI_CF_TOKEN')
const RUN = `secrets-${Date.now()}`

let passCount = 0
let failCount = 0
const ok = (cond: unknown, msg: string): void => {
  if (cond) {
    console.log(`✓ ${msg}`)
    passCount++
  } else {
    console.error(`✗ ${msg}`)
    failCount++
    process.exitCode = 1
  }
}

interface RpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: {
    isError?: boolean
    content?: Array<{ type: string; text?: string }>
    structuredContent?: Record<string, unknown>
  }
  error?: { code: number; message: string }
}

let nextId = 1
async function rpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<RpcResponse> {
  const id = nextId++
  const res = await fetch(`${URL_BASE}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  if (!res.ok) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: res.status, message: `HTTP ${res.status}` },
    }
  }
  return (await res.json()) as RpcResponse
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResponse> {
  return rpc('tools/call', { name, arguments: args })
}

async function main(): Promise<void> {
  console.log(`[secrets smoke] endpoint=${URL_BASE} run=${RUN}`)

  // ── 1. Clean content → pass ─────────────────────────────────────
  console.log('\n[1. clean content]')
  const clean = await callTool('huozi_write', {
    file_path: `${RUN}/clean.md`,
    content: '# Hello\n\nNo secrets here.\n',
  })
  ok(!clean.result?.isError, '[W1] clean content writes successfully')

  // ── 2. OpenAI-like key → blocked ───────────────────────────────
  console.log('\n[2. real-looking OpenAI key]')
  const oaKey = await callTool('huozi_write', {
    file_path: `${RUN}/oa.ts`,
    content: 'const key = "sk-proj-realLooking1234567890abcdefghij"',
  })
  ok(oaKey.result?.isError === true, '[W2] OpenAI-like key rejected')
  const oaSc = oaKey.result?.structuredContent as
    | { errorCode?: number; message?: string }
    | undefined
  ok(
    oaSc?.errorCode === 102,
    `[W2b] errorCode=102 SECRET_DETECTED (got ${oaSc?.errorCode})`,
  )
  ok(
    typeof oaSc?.message === 'string' && oaSc.message.includes('openai'),
    '[W2c] error message identifies OpenAI rule',
  )

  // ── 3. AKIA...EXAMPLE → allowlisted ─────────────────────────────
  console.log('\n[3. AWS EXAMPLE key (allowlisted)]')
  const aws = await callTool('huozi_write', {
    file_path: `${RUN}/aws.md`,
    content: '# AWS docs sample\n\nkey: AKIAIOSFODNN7EXAMPLE\n',
  })
  ok(!aws.result?.isError, '[W3] AWS EXAMPLE key allowlisted')

  // ── 4. <YOUR_API_KEY> template → clean ─────────────────────────
  console.log('\n[4. template placeholder]')
  const tpl = await callTool('huozi_write', {
    file_path: `${RUN}/tpl.md`,
    content:
      '# Setup\n\n```\nexport OPENAI_API_KEY="<YOUR_OPENAI_KEY>"\n```\n',
  })
  ok(!tpl.result?.isError, '[W4] <YOUR_*> template placeholder passes')

  // ── 5. Anthropic key → blocked, correct rule ───────────────────
  console.log('\n[5. Anthropic key]')
  const anth = await callTool('huozi_write', {
    file_path: `${RUN}/anth.ts`,
    content:
      'export const key = "sk-ant-api01-realProductionLookingKey1234567890"\n',
  })
  ok(anth.result?.isError === true, '[W5] Anthropic key rejected')
  const anthSc = anth.result?.structuredContent as
    | { message?: string }
    | undefined
  ok(
    typeof anthSc?.message === 'string' &&
      anthSc.message.includes('anthropic'),
    '[W5b] error message identifies Anthropic rule (not OpenAI)',
  )

  // ── 6. Edit that introduces a GitHub PAT → blocked ─────────────
  console.log('\n[6. Edit introducing GitHub PAT]')
  // Seed a clean file first.
  const seed = await callTool('huozi_write', {
    file_path: `${RUN}/config.ts`,
    content: 'export const githubToken = "PLACEHOLDER"\n',
  })
  ok(!seed.result?.isError, '[E-seed] seeded clean file')
  // Read to populate state
  await callTool('huozi_read', { file_path: `${RUN}/config.ts` })

  const edit = await callTool('huozi_edit', {
    file_path: `${RUN}/config.ts`,
    old_string: 'PLACEHOLDER',
    new_string: 'ghp_abcdefghijklmnopqrstuvwxyz1234567890',
  })
  ok(edit.result?.isError === true, '[E1] Edit introducing real token blocked')
  const editSc = edit.result?.structuredContent as
    | { errorCode?: number; message?: string }
    | undefined
  ok(editSc?.errorCode === 102, '[E1b] errorCode=102')
  ok(
    typeof editSc?.message === 'string' && editSc.message.includes('github'),
    '[E1c] message names github rule',
  )

  // Verify the file is unchanged (Edit was rejected before any write happened)
  const checkAfter = await callTool('huozi_read', {
    file_path: `${RUN}/config.ts`,
  })
  const checkSc = checkAfter.result?.structuredContent as
    | { type?: string }
    | undefined
  ok(
    checkSc?.type === 'file_unchanged' || checkSc?.type === 'text',
    '[E1d] file still readable',
  )
  // Check content via grep (doesn't depend on re-read caching)
  const grepForToken = await callTool('huozi_grep', {
    pattern: 'ghp_',
    path: RUN,
    output_mode: 'files_with_matches',
  })
  const grepSc = grepForToken.result?.structuredContent as
    | { numFiles?: number }
    | undefined
  ok((grepSc?.numFiles ?? 1) === 0, '[E1e] no file in workspace contains ghp_*')

  // ── 7. BatchEdit: one clean + one DB URL → batch aborts ────────
  console.log('\n[7. BatchEdit: secret in one edit aborts batch]')
  // Seed two files
  await callTool('huozi_write', {
    file_path: `${RUN}/app.ts`,
    content: 'export const v = 1\n',
  })
  await callTool('huozi_write', {
    file_path: `${RUN}/db.ts`,
    content: 'export const url = "REDACTED"\n',
  })
  // Read both to set state
  await callTool('huozi_read', { file_path: `${RUN}/app.ts` })
  await callTool('huozi_read', { file_path: `${RUN}/db.ts` })

  const be = await callTool('huozi_batch_edit', {
    edits: [
      {
        file_path: `${RUN}/app.ts`,
        old_string: 'export const v = 1',
        new_string: 'export const v = 2',
      },
      {
        file_path: `${RUN}/db.ts`,
        old_string: 'REDACTED',
        new_string: 'postgres://root:superSecret123@db.example.com/prod',
      },
    ],
  })
  ok(!be.result?.isError, '[BE1] batch call itself returns non-error envelope')
  const beSc = be.result?.structuredContent as
    | {
        aborted?: boolean
        commit_sha?: string | null
        results?: Array<{
          file_path: string
          success: boolean
          error?: { code: number; message: string }
        }>
      }
    | undefined
  ok(beSc?.aborted === true, '[BE1b] batch aborted')
  ok(beSc?.commit_sha === null, '[BE1c] no commit_sha on abort')
  const dbRes = beSc?.results?.find((r) => r.file_path.endsWith('db.ts'))
  ok(dbRes?.success === false, '[BE1d] db.ts result marked failed')
  ok(
    dbRes?.error?.code === 102,
    `[BE1e] db.ts error code = SECRET_DETECTED (got ${dbRes?.error?.code})`,
  )

  // And prove neither file was modified (all_or_nothing semantics)
  const g = await callTool('huozi_grep', {
    pattern: 'superSecret',
    path: RUN,
    output_mode: 'files_with_matches',
  })
  const gSc = g.result?.structuredContent as { numFiles?: number } | undefined
  ok(
    (gSc?.numFiles ?? 1) === 0,
    '[BE1f] superSecret string nowhere in workspace (atomic rollback)',
  )

  // ── Summary ─────────────────────────────────────────────────────
  console.log(`\n——— ${passCount} passed, ${failCount} failed`)
  if (failCount === 0) console.log('CF SECRETS SMOKE OK')
  else console.log('CF SECRETS SMOKE FAILED')
}

main().catch((err: unknown) => {
  console.error('UNHANDLED', err)
  process.exit(1)
})

export {}
