import { requireEnv } from './utils/env.js'
/**
 * CF-wire smoke focused on Scope enforcement (SPEC §2.4 / §7.4).
 *
 * Uses TWO API keys:
 *   - UNSCOPED_TOKEN: full workspace access, used to seed fixture data in
 *     multiple folders so we can verify the scoped key can't see everything.
 *   - SCOPED_TOKEN:   key with scope_path = `funds/fund-A/`. Everything it
 *     does is transparently relative to that scope.
 *
 * Scenarios:
 *   1. Seed two files with the unscoped key:
 *        funds/fund-A/report.md
 *        funds/fund-B/secret.md
 *   2. Scoped key writes `note.md` → lands at funds/fund-A/note.md
 *   3. Scoped key reads `note.md` → content matches; filePath in response is
 *      SCOPE-RELATIVE ('note.md'), NOT the full 'funds/fund-A/note.md'
 *   4. Scoped key globs `**` → sees only fund-A files, never fund-B
 *   5. Scoped key tries to read `../fund-B/secret.md` → SCOPE_VIOLATION (101)
 *   6. Scoped key tries to read `/funds/fund-B/secret.md` (absolute-ish) →
 *      resolves to funds/fund-A/funds/fund-B/secret.md → FILE_NOT_FOUND
 *      (the `/` was stripped and treated as scope-relative)
 *   7. Scoped key greps — results come back scope-relative
 */

const URL_BASE = process.env['HUOZI_CF_URL'] ?? 'https://cloud.huozi.app'
const UNSCOPED_TOKEN =
  process.env['HUOZI_CF_TOKEN'] ??
  requireEnv('HUOZI_CF_TOKEN')
const SCOPED_TOKEN =
  process.env['HUOZI_CF_SCOPED_TOKEN'] ??
  requireEnv('HUOZI_CF_SCOPED_TOKEN')
const RUN = `run-${Date.now()}`

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
  token: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<RpcResponse> {
  const id = nextId++
  const res = await fetch(`${URL_BASE}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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

async function callAs(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResponse> {
  return rpc(token, 'tools/call', { name, arguments: args })
}

async function main(): Promise<void> {
  console.log(`[scope smoke] endpoint=${URL_BASE}`)
  console.log(`[scope smoke] run tag=${RUN}`)

  // Unique paths per run to avoid collisions with earlier runs.
  const FUND_A = `funds/fund-A/${RUN}`
  const FUND_B = `funds/fund-B/${RUN}`

  // ── 1. Seed with UNSCOPED key (puts a file in each fund) ─────────
  console.log('\n[1. seed via unscoped key]')
  const seedA = await callAs(UNSCOPED_TOKEN, 'huozi_write', {
    file_path: `${FUND_A}/report.md`,
    content: '# Fund A report\n\nPublic: quarterly summary.\n',
  })
  ok(!seedA.result?.isError, '[S1] seeded fund-A/report.md')

  const seedB = await callAs(UNSCOPED_TOKEN, 'huozi_write', {
    file_path: `${FUND_B}/secret.md`,
    content: '# Fund B SECRET\n\nPrivate: analyst-only.\n',
  })
  ok(!seedB.result?.isError, '[S2] seeded fund-B/secret.md')

  // ── 2. Scoped key writes 'note.md' → lands inside fund-A ─────────
  console.log('\n[2. scoped write]')
  const wNote = await callAs(SCOPED_TOKEN, 'huozi_write', {
    file_path: `${RUN}/note.md`,
    content: '# Scoped note\n',
  })
  ok(!wNote.result?.isError, '[W1] scoped write succeeds')
  const wSc = wNote.result?.structuredContent as
    | { type?: string; filePath?: string }
    | undefined
  ok(wSc?.type === 'create', '[W2] created')
  ok(
    wSc?.filePath === `${RUN}/note.md`,
    `[W3] response filePath is SCOPE-RELATIVE (got "${wSc?.filePath}")`,
  )

  // Verify via unscoped key that it actually landed inside fund-A
  const verifyRaw = await callAs(UNSCOPED_TOKEN, 'huozi_read', {
    file_path: `funds/fund-A/${RUN}/note.md`,
  })
  ok(!verifyRaw.result?.isError, '[W4] file actually lives at funds/fund-A/{run}/note.md')

  // ── 3. Scoped read: response path is scope-relative ──────────────
  console.log('\n[3. scoped read]')
  // Clear the unscoped session's readFileState would be different — we call
  // with SCOPED_TOKEN so state is per-scoped-principal, not reused.
  const rNote = await callAs(SCOPED_TOKEN, 'huozi_read', {
    file_path: `${RUN}/note.md`,
  })
  const rSc = rNote.result?.structuredContent as
    | { type?: string; file?: { filePath?: string; content?: string; totalLines?: number } }
    | undefined
  ok(!rNote.result?.isError, '[R1] scoped read succeeds')
  // Write already populated readFileState for scoped session → re-read may
  // hit file_unchanged. Either 'text' or 'file_unchanged' is acceptable.
  ok(
    rSc?.type === 'text' || rSc?.type === 'file_unchanged',
    `[R2] response type is text or file_unchanged (got ${rSc?.type})`,
  )
  ok(
    rSc?.file?.filePath === `${RUN}/note.md`,
    `[R3] file.filePath is scope-relative (got "${rSc?.file?.filePath}")`,
  )

  // ── 4. Glob only sees fund-A ─────────────────────────────────────
  console.log('\n[4. scoped glob]')
  const gAll = await callAs(SCOPED_TOKEN, 'huozi_glob', {
    pattern: '**/*.md',
  })
  const gSc = gAll.result?.structuredContent as
    | { numFiles?: number; filenames?: string[] }
    | undefined
  ok(!gAll.result?.isError, '[G1] glob succeeds')
  const filenames = gSc?.filenames ?? []
  ok(
    filenames.every((p) => !p.startsWith('funds/fund-B/')),
    '[G2] no fund-B files leaked',
  )
  ok(
    filenames.every((p) => !p.includes('fund-B')),
    '[G3] scope prefix fully stripped in response',
  )
  // Our seeded note.md should be in results (scope-relative)
  ok(
    filenames.includes(`${RUN}/note.md`),
    `[G4] sees our own note.md (scope-relative): got ${JSON.stringify(filenames)}`,
  )

  // ── 5. `..` escape attempt → SCOPE_VIOLATION ─────────────────────
  console.log('\n[5. `..` escape attempt]')
  const attack = await callAs(SCOPED_TOKEN, 'huozi_read', {
    file_path: `../fund-B/${RUN}/secret.md`,
  })
  ok(attack.result?.isError === true, '[A1] attack flagged as error')
  const attackSc = attack.result?.structuredContent as
    | { errorCode?: number; message?: string }
    | undefined
  ok(attackSc?.errorCode === 101, `[A2] errorCode=101 SCOPE_VIOLATION (got ${attackSc?.errorCode})`)
  ok(
    typeof attackSc?.message === 'string' &&
      /(escape|\.\.)/.test(attackSc.message),
    '[A3] error message mentions escape/`..`',
  )

  // ── 6. Absolute-ish path (leading /) is scope-relative, never escapes ──
  console.log('\n[6. absolute-looking path is still scope-relative]')
  const abs = await callAs(SCOPED_TOKEN, 'huozi_read', {
    file_path: `/funds/fund-B/${RUN}/secret.md`,
  })
  // Path resolved to funds/fund-A/funds/fund-B/{RUN}/secret.md, which
  // obviously doesn't exist — so FILE_NOT_FOUND (4). Importantly, it did
  // NOT read fund-B/secret.md.
  ok(abs.result?.isError === true, '[AB1] absolute attack returns error')
  const absSc = abs.result?.structuredContent as
    | { errorCode?: number }
    | undefined
  ok(
    absSc?.errorCode === 4,
    `[AB2] errorCode=4 FILE_NOT_FOUND (got ${absSc?.errorCode}) — absolute path was NOT taken as workspace-absolute`,
  )

  // ── 7. Scoped grep: results are scope-relative ───────────────────
  console.log('\n[7. scoped grep]')
  const grep = await callAs(SCOPED_TOKEN, 'huozi_grep', {
    pattern: 'Scoped|quarterly',
    output_mode: 'files_with_matches',
  })
  const grepSc = grep.result?.structuredContent as
    | { filenames?: string[] }
    | undefined
  ok(!grep.result?.isError, '[GR1] grep succeeds')
  const gfnames = grepSc?.filenames ?? []
  ok(
    gfnames.every((p) => !p.startsWith('funds/')),
    '[GR2] no scope prefix leaked in grep result paths',
  )
  ok(
    gfnames.some((p) => p.endsWith('note.md')) ||
      gfnames.some((p) => p.endsWith('report.md')),
    '[GR3] grep found scope-internal matches',
  )

  // Also grep content mode — lines should have scope stripped
  const grepContent = await callAs(SCOPED_TOKEN, 'huozi_grep', {
    pattern: 'Scoped note',
    output_mode: 'content',
    '-n': true,
  })
  const gcSc = grepContent.result?.structuredContent as
    | { content?: string }
    | undefined
  ok(!grepContent.result?.isError, '[GR4] grep content mode succeeds')
  if (gcSc?.content) {
    ok(
      !gcSc.content.includes('funds/fund-A/'),
      '[GR5] grep content lines have scope prefix stripped',
    )
    ok(
      gcSc.content.includes(`${RUN}/note.md`),
      '[GR6] grep content includes scope-relative path',
    )
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n——— ${passCount} passed, ${failCount} failed`)
  if (failCount === 0) console.log('CF SCOPE SMOKE OK')
  else console.log('CF SCOPE SMOKE FAILED')
}

main().catch((err: unknown) => {
  console.error('UNHANDLED', err)
  process.exit(1)
})

export {}
