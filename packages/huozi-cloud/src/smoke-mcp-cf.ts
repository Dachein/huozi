import { requireEnv } from './utils/env.js'
/**
 * CF-wire smoke test, focused on huozi_batch_edit.
 *
 * Exercises the live deploy at cloud.huozi.app (or any override via
 * HUOZI_CF_URL). Unlike smoke-mcp.ts (stdio in-process) this one goes all the
 * way: Worker → WorkspaceDO → R2 + D1 → back. Good for confirming the DO
 * critical section + R2 writes + D1 commits all behave when multiple files
 * move as one logical change.
 *
 * Config:
 *   HUOZI_CF_URL    default https://cloud.huozi.app
 *   HUOZI_CF_TOKEN  default the demo token (change for any real deploy)
 *
 * Scenarios (all under a timestamped path prefix, so re-runs don't collide):
 *   1. Seed 3 fresh files via huozi_write
 *   2. batch_edit all 3 → one commit_sha, per-file results, all succeeded
 *   3. Verify the edited values landed (via huozi_grep)
 *   4. Same-file multi-edit in one batch (2 edits on file a.ts, sequential apply)
 *   5. all_or_nothing=false: one valid edit + one STRING_NOT_FOUND → partial commit
 *   6. huozi_history on the first file recognizes 'batch' operation
 *
 * Staleness across sessions is covered by the in-memory smoke (requires 2
 * API keys on CF, out of scope here).
 */

const URL_BASE = process.env['HUOZI_CF_URL'] ?? 'https://cloud.huozi.app'
const TOKEN =
  process.env['HUOZI_CF_TOKEN'] ??
  requireEnv('HUOZI_CF_TOKEN')
const PREFIX = `smoke-batch-${Date.now()}`

interface RpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: {
    isError?: boolean
    content?: Array<{ type: string; text?: string }>
    structuredContent?: Record<string, unknown>
  }
  error?: { code: number; message: string; data?: unknown }
}

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

interface BatchResult {
  commit_sha: string | null
  aborted: boolean
  results: Array<{
    file_path: string
    success: boolean
    error?: { code: number; message: string }
    new_blob_sha?: string
  }>
  allOrNothing?: boolean
}

interface HistoryResult {
  history: Array<{
    commit_sha: string
    operation: string
    author: { id: string; type: string }
    message: string
  }>
  has_more: boolean
}

interface GrepResult {
  mode: string
  numFiles: number
  filenames: string[]
}

async function main(): Promise<void> {
  console.log(`[CF smoke] endpoint=${URL_BASE}`)
  console.log(`[CF smoke] prefix=${PREFIX}`)

  // ── 1. Seed 3 files ──────────────────────────────────────────────
  console.log('\n[1. Seed]')
  for (const letter of ['a', 'b', 'c']) {
    const r = await callTool('huozi_write', {
      file_path: `${PREFIX}/${letter}.ts`,
      content: `export const ${letter} = 1\n`,
    })
    ok(!r.result?.isError && !r.error, `[S1.${letter}] write ${letter}.ts`)
  }

  // ── 2. Batch edit all 3 ─────────────────────────────────────────
  console.log('\n[2. batch_edit 3 files]')
  const be1 = await callTool('huozi_batch_edit', {
    edits: [
      {
        file_path: `${PREFIX}/a.ts`,
        old_string: 'const a = 1',
        new_string: 'const a = 10',
      },
      {
        file_path: `${PREFIX}/b.ts`,
        old_string: 'const b = 1',
        new_string: 'const b = 20',
      },
      {
        file_path: `${PREFIX}/c.ts`,
        old_string: 'const c = 1',
        new_string: 'const c = 30',
      },
    ],
    message: 'batch: bump 3 via CF smoke',
  })
  ok(!be1.result?.isError && !be1.error, '[BE1] batch call completes without error')
  const be1sc = be1.result?.structuredContent as BatchResult | undefined
  ok(
    typeof be1sc?.commit_sha === 'string' && be1sc.commit_sha.length === 40,
    '[BE1] single 40-char commit_sha returned',
  )
  ok(be1sc?.aborted === false, '[BE1] aborted=false')
  ok(
    Array.isArray(be1sc?.results) && be1sc.results.length === 3,
    '[BE1] 3 per-file results',
  )
  ok(
    (be1sc?.results ?? []).every((r) => r.success),
    '[BE1] every file marked success',
  )
  ok(
    new Set((be1sc?.results ?? []).map((r) => r.new_blob_sha)).size === 3,
    '[BE1] each file has a distinct new_blob_sha',
  )
  const batchCommit1 = be1sc?.commit_sha ?? '?'

  // ── 3. Verify edits landed on R2 via grep ────────────────────────
  console.log('\n[3. verify via grep]')
  const gr = await callTool('huozi_grep', {
    pattern: 'const [abc] = [0-9]+0',
    path: PREFIX,
    output_mode: 'files_with_matches',
  })
  ok(!gr.result?.isError, '[V1] grep ran')
  const grsc = gr.result?.structuredContent as GrepResult | undefined
  ok(
    (grsc?.numFiles ?? 0) === 3,
    `[V1] grep found 3 files with new value (got ${grsc?.numFiles ?? 0})`,
  )

  // ── 4. Same-file multi-edit in one batch ────────────────────────
  console.log('\n[4. same-file multi-edit]')
  // Explicit re-read: batch_edit requires readFileState entry to match
  // current blob_sha. Batch 2 above refreshed state for a.ts, but re-reading
  // is cheap and defensive.
  await callTool('huozi_read', { file_path: `${PREFIX}/a.ts` })
  const be2 = await callTool('huozi_batch_edit', {
    edits: [
      {
        file_path: `${PREFIX}/a.ts`,
        old_string: 'const a = 10',
        new_string: 'const a = 10\nexport const d = 100',
      },
      {
        file_path: `${PREFIX}/a.ts`,
        old_string: 'const d = 100',
        new_string: 'const d = 200',
      },
    ],
  })
  ok(!be2.result?.isError && !be2.error, '[BE2] same-file batch completes')
  const be2sc = be2.result?.structuredContent as BatchResult | undefined
  ok(be2sc?.aborted === false, '[BE2] not aborted')
  ok(
    Array.isArray(be2sc?.results) && be2sc.results.length === 1,
    '[BE2] collapsed to 1 per-path result (same file, 2 edits)',
  )
  ok(be2sc?.results[0]?.success === true, '[BE2] the file succeeded')

  // Verify the second edit actually chained off the first
  const gr2 = await callTool('huozi_grep', {
    pattern: 'const d = 200',
    path: PREFIX,
    output_mode: 'files_with_matches',
  })
  const gr2sc = gr2.result?.structuredContent as GrepResult | undefined
  ok(
    (gr2sc?.filenames ?? []).includes(`${PREFIX}/a.ts`),
    '[BE2] `const d = 200` is in a.ts (edit-2 saw edit-1 output)',
  )

  // ── 5. Partial mode: all_or_nothing=false ────────────────────────
  console.log('\n[5. all_or_nothing=false]')
  await callTool('huozi_read', { file_path: `${PREFIX}/b.ts` })
  await callTool('huozi_read', { file_path: `${PREFIX}/c.ts` })
  const be3 = await callTool('huozi_batch_edit', {
    edits: [
      {
        file_path: `${PREFIX}/b.ts`,
        old_string: 'const b = 20',
        new_string: 'const b = 200',
      },
      {
        file_path: `${PREFIX}/c.ts`,
        old_string: 'DEFINITELY NOT THERE',
        new_string: 'x',
      },
    ],
    all_or_nothing: false,
  })
  ok(!be3.result?.isError && !be3.error, '[BE3] partial call completes')
  const be3sc = be3.result?.structuredContent as BatchResult | undefined
  ok(be3sc?.aborted === false, '[BE3] commit proceeds despite one failure')
  const bRes = (be3sc?.results ?? []).find((r) =>
    r.file_path.endsWith('b.ts'),
  )
  const cRes = (be3sc?.results ?? []).find((r) =>
    r.file_path.endsWith('c.ts'),
  )
  ok(bRes?.success === true, '[BE3] b.ts succeeded')
  ok(cRes?.success === false, '[BE3] c.ts failed')
  ok(cRes?.error?.code === 8, '[BE3] c.ts error code is STRING_NOT_FOUND (8)')

  // ── 6. History recognizes 'batch' operation ──────────────────────
  console.log('\n[6. history]')
  const h = await callTool('huozi_history', {
    file_path: `${PREFIX}/a.ts`,
    limit: 20,
  })
  ok(!h.result?.isError, '[H1] history call succeeds')
  const hsc = h.result?.structuredContent as HistoryResult | undefined
  ok(Array.isArray(hsc?.history), '[H1] history is an array')
  const ops = (hsc?.history ?? []).map((x) => x.operation)
  ok(ops.includes('create'), '[H1] create operation present (from seed)')
  ok(ops.includes('batch'), '[H1] at least one batch operation')
  ok(
    (hsc?.history ?? []).some((x) => x.commit_sha === batchCommit1),
    '[H1] the commit_sha from step 2 is visible in history',
  )
  ok(
    (hsc?.history ?? []).every((x) => x.author.type === 'agent'),
    '[H1] all commits attributed to agent',
  )

  // ── Summary ──────────────────────────────────────────────────────
  console.log(`\n——— ${passCount} passed, ${failCount} failed`)
  if (failCount === 0) console.log('CF BATCH SMOKE OK')
  else console.log('CF BATCH SMOKE FAILED')
}

main().catch((err: unknown) => {
  console.error('UNHANDLED', err)
  process.exit(1)
})

export {}
