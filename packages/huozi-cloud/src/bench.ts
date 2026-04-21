import { requireEnv } from './utils/env.js'
/**
 * Production-endpoint benchmark for huozi-cloud.
 *
 * Hits https://cloud.huozi.app/mcp with a real Bearer token and measures
 * latency + stability across data sizes, operation kinds, and concurrency.
 *
 * Non-destructive: all test files are nested under a `bench-<runId>/` prefix
 * so runs don't collide and the user can clean up after.
 *
 * Run:  npm run bench
 */

const URL_BASE = process.env['HUOZI_CF_URL'] ?? 'https://cloud.huozi.app'
const TOKEN =
  process.env['HUOZI_CF_TOKEN'] ??
  requireEnv('HUOZI_CF_TOKEN')

const RUN_ID = `bench-${Date.now()}`

// ── Tiny timing + stats helpers ──────────────────────────────────────────

interface RunStats {
  label: string
  n: number
  errors: number
  avgMs: number
  p50: number
  p95: number
  p99: number
  minMs: number
  maxMs: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx] ?? 0
}

function summarize(label: string, times: number[], errors: number): RunStats {
  const sorted = [...times].sort((a, b) => a - b)
  const avg = sorted.length
    ? sorted.reduce((a, b) => a + b, 0) / sorted.length
    : 0
  return {
    label,
    n: sorted.length + errors,
    errors,
    avgMs: Math.round(avg),
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    minMs: Math.round(sorted[0] ?? 0),
    maxMs: Math.round(sorted[sorted.length - 1] ?? 0),
  }
}

// ── RPC plumbing ─────────────────────────────────────────────────────────

interface RpcResponse {
  result?: {
    isError?: boolean
    structuredContent?: Record<string, unknown>
  }
  error?: { code: number; message: string }
}

let nextId = 1
async function rpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<{ ok: true; body: RpcResponse } | { ok: false; error: string }> {
  const id = nextId++
  try {
    const res = await fetch(`${URL_BASE}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const body = (await res.json()) as RpcResponse
    return { ok: true, body }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function toolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; ms: number; message?: string }> {
  const start = performance.now()
  const r = await rpc('tools/call', { name, arguments: args })
  const ms = performance.now() - start
  if (!r.ok) return { ok: false, ms, message: r.error }
  if (r.body.result?.isError) {
    const sc = r.body.result.structuredContent as
      | { message?: string }
      | undefined
    return { ok: false, ms, message: sc?.message ?? 'tool error' }
  }
  return { ok: true, ms }
}

// ── Fixture generators ───────────────────────────────────────────────────

function makeContent(bytes: number, seed: string): string {
  // Deterministic content of exactly `bytes` bytes (ASCII only, no surprises).
  // Fills with base62-ish chars so it's also valid UTF-8.
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = `# ${seed}\n\n`
  let i = 0
  while (s.length < bytes) {
    s +=
      alphabet[(i * 7 + seed.length) % alphabet.length]! +
      (i % 80 === 79 ? '\n' : '')
    i++
  }
  return s.slice(0, bytes)
}

// ── Scenarios ────────────────────────────────────────────────────────────

async function scenarioWriteBySize(): Promise<RunStats[]> {
  const sizes: Array<[string, number]> = [
    ['100 B', 100],
    ['1 KB', 1024],
    ['10 KB', 10 * 1024],
    ['100 KB', 100 * 1024],
    ['200 KB', 200 * 1024],
  ]
  const results: RunStats[] = []
  for (const [label, bytes] of sizes) {
    const N = bytes >= 100 * 1024 ? 5 : 10
    const times: number[] = []
    let errors = 0
    for (let i = 0; i < N; i++) {
      const r = await toolCall('huozi_write', {
        file_path: `${RUN_ID}/write-${bytes}-${i}.txt`,
        content: makeContent(bytes, `w-${bytes}-${i}`),
      })
      if (r.ok) times.push(r.ms)
      else errors++
    }
    results.push(summarize(`write ${label}`, times, errors))
  }
  return results
}

async function scenarioReadBySize(): Promise<RunStats[]> {
  // Read back the files we wrote above.
  const sizes: Array<[string, number]> = [
    ['100 B', 100],
    ['1 KB', 1024],
    ['10 KB', 10 * 1024],
    ['100 KB', 100 * 1024],
    ['200 KB', 200 * 1024],
  ]
  const results: RunStats[] = []
  for (const [label, bytes] of sizes) {
    const N = bytes >= 100 * 1024 ? 5 : 10
    const times: number[] = []
    let errors = 0
    for (let i = 0; i < N; i++) {
      const r = await toolCall('huozi_read', {
        file_path: `${RUN_ID}/write-${bytes}-${i}.txt`,
      })
      if (r.ok) times.push(r.ms)
      else errors++
    }
    results.push(summarize(`read ${label}`, times, errors))
  }
  return results
}

async function scenarioEdit(): Promise<RunStats[]> {
  // Edit each 1 KB file we wrote — needs prior Read to populate session state.
  const N = 10
  const bytes = 1024
  // Read them first (sequential — session state accrues per-request)
  for (let i = 0; i < N; i++) {
    await toolCall('huozi_read', {
      file_path: `${RUN_ID}/write-${bytes}-${i}.txt`,
    })
  }
  const times: number[] = []
  let errors = 0
  for (let i = 0; i < N; i++) {
    // Each file's first line is "# w-1024-<i>" — change that.
    const r = await toolCall('huozi_edit', {
      file_path: `${RUN_ID}/write-${bytes}-${i}.txt`,
      old_string: `# w-${bytes}-${i}`,
      new_string: `# edited-w-${bytes}-${i}`,
    })
    if (r.ok) times.push(r.ms)
    else errors++
  }
  return [summarize(`edit 1KB file`, times, errors)]
}

async function scenarioBatchEdit(): Promise<RunStats[]> {
  const results: RunStats[] = []
  for (const N of [5, 20]) {
    // Write N fresh targets, read them, then batch-edit all in one commit
    // Write + read are SETUP (not timed in the result)
    for (let i = 0; i < N; i++) {
      await toolCall('huozi_write', {
        file_path: `${RUN_ID}/batch-${N}-${i}.md`,
        content: `# batch-${N}-${i}\n\nversion: 1\n`,
      })
    }
    for (let i = 0; i < N; i++) {
      await toolCall('huozi_read', {
        file_path: `${RUN_ID}/batch-${N}-${i}.md`,
      })
    }
    const edits = Array.from({ length: N }, (_, i) => ({
      file_path: `${RUN_ID}/batch-${N}-${i}.md`,
      old_string: `version: 1`,
      new_string: `version: 2`,
    }))
    const start = performance.now()
    const r = await toolCall('huozi_batch_edit', {
      edits,
      message: `bench: ${N}-file batch`,
    })
    const ms = performance.now() - start
    results.push({
      label: `batch_edit ${N} files`,
      n: 1,
      errors: r.ok ? 0 : 1,
      avgMs: Math.round(ms),
      p50: Math.round(ms),
      p95: Math.round(ms),
      p99: Math.round(ms),
      minMs: Math.round(ms),
      maxMs: Math.round(ms),
    })
  }
  return results
}

async function scenarioGlob(): Promise<RunStats[]> {
  const results: RunStats[] = []
  const cases: Array<{ label: string; pattern: string; path?: string }> = [
    { label: 'glob **/* (full)', pattern: '**/*' },
    { label: `glob **/* under ${RUN_ID}/`, pattern: '**/*', path: RUN_ID },
    {
      label: `glob write-*.txt under ${RUN_ID}/`,
      pattern: 'write-*.txt',
      path: RUN_ID,
    },
  ]
  for (const c of cases) {
    const N = 5
    const times: number[] = []
    let errors = 0
    for (let i = 0; i < N; i++) {
      const r = await toolCall('huozi_glob', {
        pattern: c.pattern,
        ...(c.path ? { path: c.path } : {}),
      })
      if (r.ok) times.push(r.ms)
      else errors++
    }
    results.push(summarize(c.label, times, errors))
  }
  return results
}

async function scenarioGrep(): Promise<RunStats[]> {
  const results: RunStats[] = []
  const cases: Array<{
    label: string
    pattern: string
    output_mode?: 'content' | 'files_with_matches' | 'count'
  }> = [
    { label: 'grep simple files_with_matches', pattern: 'edited-w-' },
    { label: 'grep content mode', pattern: 'edited-w-', output_mode: 'content' },
    { label: 'grep regex (\\w+-\\d+)', pattern: '\\w+-\\d+' },
    { label: 'grep count mode', pattern: 'batch', output_mode: 'count' },
  ]
  for (const c of cases) {
    const N = 5
    const times: number[] = []
    let errors = 0
    for (let i = 0; i < N; i++) {
      const r = await toolCall('huozi_grep', {
        pattern: c.pattern,
        ...(c.output_mode ? { output_mode: c.output_mode } : {}),
        path: RUN_ID,
      })
      if (r.ok) times.push(r.ms)
      else errors++
    }
    results.push(summarize(c.label, times, errors))
  }
  return results
}

async function scenarioHistory(): Promise<RunStats[]> {
  // Create a file and edit it 10 times so history has real depth.
  const path = `${RUN_ID}/history-target.md`
  await toolCall('huozi_write', {
    file_path: path,
    content: `# history\n\nversion: 0\n`,
  })
  await toolCall('huozi_read', { file_path: path })
  for (let i = 0; i < 10; i++) {
    await toolCall('huozi_edit', {
      file_path: path,
      old_string: `version: ${i}`,
      new_string: `version: ${i + 1}`,
    })
  }

  const N = 10
  const times: number[] = []
  let errors = 0
  for (let i = 0; i < N; i++) {
    const r = await toolCall('huozi_history', { file_path: path, limit: 20 })
    if (r.ok) times.push(r.ms)
    else errors++
  }
  return [summarize(`history (11 commits)`, times, errors)]
}

async function scenarioParallelReads(): Promise<RunStats[]> {
  // 10 parallel reads on the same file + 10 parallel reads on different files.
  const bytes = 1024
  const sameFile = `${RUN_ID}/write-${bytes}-0.txt`

  // Same file × 10
  let start = performance.now()
  const sameResults = await Promise.all(
    Array.from({ length: 10 }, () =>
      toolCall('huozi_read', { file_path: sameFile }),
    ),
  )
  let wallSame = performance.now() - start
  const sameTimes = sameResults.filter((r) => r.ok).map((r) => r.ms)
  const sameErrs = sameResults.filter((r) => !r.ok).length

  // Different files × 10
  start = performance.now()
  const diffResults = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      toolCall('huozi_read', {
        file_path: `${RUN_ID}/write-${bytes}-${i}.txt`,
      }),
    ),
  )
  let wallDiff = performance.now() - start
  const diffTimes = diffResults.filter((r) => r.ok).map((r) => r.ms)
  const diffErrs = diffResults.filter((r) => !r.ok).length

  return [
    {
      ...summarize('parallel read × 10 (same file)', sameTimes, sameErrs),
      label: `parallel × 10 same file  [wall ${Math.round(wallSame)}ms]`,
    },
    {
      ...summarize('parallel read × 10 (diff files)', diffTimes, diffErrs),
      label: `parallel × 10 diff files  [wall ${Math.round(wallDiff)}ms]`,
    },
  ]
}

async function scenarioParallelWrites(): Promise<RunStats[]> {
  // 10 parallel writes to different paths — WorkspaceDO serializes these.
  // Measures how much serialization costs vs sequential.
  const N = 10

  // Sequential baseline
  let start = performance.now()
  const seqTimes: number[] = []
  for (let i = 0; i < N; i++) {
    const r = await toolCall('huozi_write', {
      file_path: `${RUN_ID}/seq-w-${i}.txt`,
      content: `sequential ${i}\n`,
    })
    if (r.ok) seqTimes.push(r.ms)
  }
  const wallSeq = performance.now() - start

  // Parallel
  start = performance.now()
  const parResults = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      toolCall('huozi_write', {
        file_path: `${RUN_ID}/par-w-${i}.txt`,
        content: `parallel ${i}\n`,
      }),
    ),
  )
  const wallPar = performance.now() - start
  const parTimes = parResults.filter((r) => r.ok).map((r) => r.ms)

  return [
    {
      ...summarize('sequential writes × 10', seqTimes, 0),
      label: `sequential write × 10  [wall ${Math.round(wallSeq)}ms]`,
    },
    {
      ...summarize('parallel writes × 10 (DO-serialized)', parTimes, 0),
      label: `parallel write × 10     [wall ${Math.round(wallPar)}ms]`,
    },
  ]
}

// ── Reporter ─────────────────────────────────────────────────────────────

function renderTable(title: string, rows: RunStats[]): void {
  console.log(`\n${title}`)
  console.log('─'.repeat(title.length))
  const header = [
    'label'.padEnd(42),
    'n'.padStart(3),
    'err'.padStart(4),
    'avg'.padStart(6),
    'p50'.padStart(6),
    'p95'.padStart(6),
    'p99'.padStart(6),
    'min'.padStart(6),
    'max'.padStart(6),
  ].join(' ')
  console.log(header)
  console.log('─'.repeat(header.length))
  for (const r of rows) {
    console.log(
      [
        r.label.padEnd(42),
        String(r.n).padStart(3),
        String(r.errors).padStart(4),
        `${r.avgMs}`.padStart(6),
        `${r.p50}`.padStart(6),
        `${r.p95}`.padStart(6),
        `${r.p99}`.padStart(6),
        `${r.minMs}`.padStart(6),
        `${r.maxMs}`.padStart(6),
      ].join(' '),
    )
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function resetSession(): Promise<boolean> {
  // Debug endpoint — clears any accumulated session state so state-heavy
  // scenarios don't carry baggage from prior runs.
  try {
    const res = await fetch(`${URL_BASE}/debug/clear-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    return res.ok
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  console.log(`huozi-cloud bench`)
  console.log(`endpoint: ${URL_BASE}`)
  console.log(`run-id:   ${RUN_ID}`)
  const cleared = await resetSession()
  console.log(`session cleared: ${cleared}`)
  console.log('')
  const startWall = performance.now()

  // Primes the CF worker / DNS cache
  await toolCall('huozi_glob', { pattern: '**/*' })

  const writeStats = await scenarioWriteBySize()
  renderTable('WRITE by size (sequential)', writeStats)

  const readStats = await scenarioReadBySize()
  renderTable('READ by size (sequential, uncached first)', readStats)

  const editStats = await scenarioEdit()
  renderTable('EDIT (1KB file, with prior Read in session)', editStats)

  const batchStats = await scenarioBatchEdit()
  renderTable('BATCH EDIT (atomic multi-file commit)', batchStats)

  const globStats = await scenarioGlob()
  renderTable('GLOB', globStats)

  const grepStats = await scenarioGrep()
  renderTable('GREP', grepStats)

  const histStats = await scenarioHistory()
  renderTable('HISTORY', histStats)

  const parReadStats = await scenarioParallelReads()
  renderTable('PARALLEL READS', parReadStats)

  const parWriteStats = await scenarioParallelWrites()
  renderTable('PARALLEL WRITES (vs sequential baseline)', parWriteStats)

  const totalWall = performance.now() - startWall
  console.log(`\nTotal wall-clock: ${Math.round(totalWall / 1000)}s`)
  console.log(
    `Bench files under path prefix "${RUN_ID}/" — clean up later if needed.`,
  )
}

main().catch((err: unknown) => {
  console.error('UNHANDLED', err)
  process.exit(1)
})

export {}
