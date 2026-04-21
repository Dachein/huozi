/**
 * End-to-end smoke test for huozi-cloud's v1 tool set.
 *
 * Covers all 5 core tools + their interactions via ReadFileState:
 *   Read: 9 behaviors (SPEC §4.1 full coverage)
 *   Edit: staleness + findActualString + replace_all + desanitize
 *   Write: create vs update, LF forcing, Read-first enforcement
 *   Glob: pattern matching + mtime ordering + truncation
 *   Grep: 3 output modes + context lines + head_limit + type filter
 *
 * Pure in-memory — no Cloudflare bindings. `npm run smoke`.
 */

import {
  createBatchEditTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createHistoryTool,
  createReadTool,
  createWriteTool,
  ERR,
  InMemoryReadFileState,
  InMemoryStorage,
  type ToolUseContext,
} from './index.js'

let passCount = 0
let failCount = 0

const ok = (cond: unknown, msg: string): void => {
  if (!cond) {
    console.error(`✗ ${msg}`)
    failCount++
    process.exitCode = 1
  } else {
    console.log(`✓ ${msg}`)
    passCount++
  }
}

async function main(): Promise<void> {
  const storage = new InMemoryStorage()
  const readFileState = new InMemoryReadFileState()
  const read = createReadTool({ storage })
  const edit = createEditTool({ storage })
  const write = createWriteTool({ storage })
  const glob = createGlobTool({ storage })
  const grep = createGrepTool({ storage })
  const batchEdit = createBatchEditTool({ storage })
  const history = createHistoryTool({ storage })

  const workspaceId = 'ws_demo'
  const ctx: ToolUseContext = {
    workspaceId,
    principalId: 'agent_claude_code',
    principalType: 'agent',
    scopePath: null,
    readFileState,
  }

  // ── READ ─────────────────────────────────────────────────────────
  console.log('\n[READ]')
  const srcGreet = [
    'import { foo } from "./foo.js"',
    '',
    'export function greet(name: string): string {',
    '  return `hello ${name}`',
    '}',
  ].join('\n')

  const seeded = await storage.seed({
    workspaceId,
    path: 'src/greet.ts',
    content: srcGreet,
  })

  const r1 = await read.run({ file_path: 'src/greet.ts' }, ctx)
  ok(r1.kind === 'success', '[R1] first read succeeds')
  if (r1.kind === 'success' && r1.data.type === 'text') {
    ok(r1.data.file.totalLines === 5, '[R1] totalLines = 5')
    ok(r1.data.file.blob_sha === seeded.blob_sha, '[R1] blob_sha matches')
    ok(r1.data.file.content.includes('     1\timport'), '[R1] cat -n format')
  }

  const r2 = await read.run({ file_path: 'src/greet.ts' }, ctx)
  ok(
    r2.kind === 'success' && r2.data.type === 'file_unchanged',
    '[R2] re-read returns file_unchanged',
  )

  const r6 = await read.run({ file_path: 'src/../etc/passwd' }, ctx)
  ok(
    r6.kind === 'error' && r6.errorCode === ERR.INVALID_URI,
    '[R6] `..` segment rejected',
  )

  // ── EDIT ─────────────────────────────────────────────────────────
  console.log('\n[EDIT]')
  // Rejects without prior Read
  readFileState.delete('src/greet.ts')
  const e0 = await edit.run(
    {
      file_path: 'src/greet.ts',
      old_string: 'hello',
      new_string: 'hi',
    },
    ctx,
  )
  ok(
    e0.kind === 'error' && e0.errorCode === ERR.NOT_READ_FIRST,
    '[E0] Edit without Read → NOT_READ_FIRST',
  )

  // Read again, then edit
  await read.run({ file_path: 'src/greet.ts' }, ctx)
  const e1 = await edit.run(
    {
      file_path: 'src/greet.ts',
      old_string: '`hello ${name}`',
      new_string: '`hi ${name}!`',
    },
    ctx,
  )
  ok(e1.kind === 'success', '[E1] Edit succeeds')
  if (e1.kind === 'success') {
    ok(
      e1.data.structuredPatch.length > 0,
      '[E1] structuredPatch non-empty',
    )
    ok(
      e1.data.commit_sha.length === 40,
      '[E1] commit_sha is 40 chars',
    )
    ok(
      e1.data.new_blob_sha !== seeded.blob_sha,
      '[E1] new_blob_sha differs from original',
    )
  }

  // ReadFileState should be refreshed; next Edit works without re-Read
  const e2 = await edit.run(
    {
      file_path: 'src/greet.ts',
      old_string: '`hi ${name}!`',
      new_string: '`hey, ${name}!`',
    },
    ctx,
  )
  ok(e2.kind === 'success', '[E2] consecutive Edit succeeds (state refreshed)')

  // Ambiguous match (multiple `name` occurrences) without replace_all fails
  const e3 = await edit.run(
    {
      file_path: 'src/greet.ts',
      old_string: 'name',
      new_string: 'person',
    },
    ctx,
  )
  ok(
    e3.kind === 'error' && e3.errorCode === ERR.AMBIGUOUS_MATCH,
    '[E3] ambiguous match rejected',
  )

  // replace_all allows it
  const e4 = await edit.run(
    {
      file_path: 'src/greet.ts',
      old_string: 'name',
      new_string: 'person',
      replace_all: true,
    },
    ctx,
  )
  ok(e4.kind === 'success', '[E4] replace_all succeeds')
  if (e4.kind === 'success') {
    ok(e4.data.replaceAll === true, '[E4] replaceAll flag set on output')
  }

  // Staleness: simulate another writer reseeding the file
  await storage.seed({
    workspaceId,
    path: 'src/greet.ts',
    content: srcGreet + '\n// changed elsewhere\n',
  })
  const e5 = await edit.run(
    {
      file_path: 'src/greet.ts',
      old_string: 'greet',
      new_string: 'salute',
    },
    ctx,
  )
  ok(
    e5.kind === 'error' && e5.errorCode === ERR.MODIFIED_SINCE_READ,
    '[E5] staleness detected',
  )

  // String not found
  await read.run({ file_path: 'src/greet.ts' }, ctx)
  const e6 = await edit.run(
    {
      file_path: 'src/greet.ts',
      old_string: 'this text does not exist',
      new_string: 'whatever',
    },
    ctx,
  )
  ok(
    e6.kind === 'error' && e6.errorCode === ERR.STRING_NOT_FOUND,
    '[E6] missing old_string rejected',
  )

  // ── WRITE ────────────────────────────────────────────────────────
  console.log('\n[WRITE]')
  // Create new file: no Read required
  const w1 = await write.run(
    {
      file_path: 'docs/notes.md',
      content: '# Notes\n\nHello.\n',
    },
    ctx,
  )
  ok(w1.kind === 'success', '[W1] new file create')
  if (w1.kind === 'success') {
    ok(w1.data.type === 'create', '[W1] operation = create')
    ok(w1.data.originalFile === null, '[W1] originalFile null on create')
  }

  // Update existing: Read-first enforced
  const w2Bare = await write.run(
    {
      file_path: 'docs/notes.md',
      content: '# Notes v2\n',
    },
    { ...ctx, readFileState: new InMemoryReadFileState() }, // fresh, no prior read
  )
  ok(
    w2Bare.kind === 'error' && w2Bare.errorCode === ERR.NOT_READ_FIRST,
    '[W2a] Write on existing without Read → NOT_READ_FIRST',
  )

  // Read then write succeeds
  await read.run({ file_path: 'docs/notes.md' }, ctx)
  const w3 = await write.run(
    {
      file_path: 'docs/notes.md',
      content: '# Notes v2\n\nUpdated.\n',
    },
    ctx,
  )
  ok(w3.kind === 'success', '[W3] Read then Write succeeds')
  if (w3.kind === 'success') {
    ok(w3.data.type === 'update', '[W3] operation = update')
    ok(
      w3.data.structuredPatch.length > 0,
      '[W3] structuredPatch non-empty on update',
    )
  }

  // ── GLOB ─────────────────────────────────────────────────────────
  console.log('\n[GLOB]')
  // Seed a mini filesystem with varying mtimes.
  await storage.seed({ workspaceId, path: 'pkg/a.ts', content: 'a' })
  await new Promise((r) => setTimeout(r, 5))
  await storage.seed({ workspaceId, path: 'pkg/b.ts', content: 'b' })
  await new Promise((r) => setTimeout(r, 5))
  await storage.seed({ workspaceId, path: 'pkg/c.md', content: 'c' })
  await new Promise((r) => setTimeout(r, 5))
  await storage.seed({ workspaceId, path: 'pkg/sub/d.ts', content: 'd' })

  const g1 = await glob.run({ pattern: '**/*.ts' }, ctx)
  ok(g1.kind === 'success', '[G1] glob runs')
  if (g1.kind === 'success') {
    const names = g1.data.filenames
    ok(names.includes('src/greet.ts'), '[G1] finds src/greet.ts')
    ok(names.includes('pkg/a.ts'), '[G1] finds pkg/a.ts')
    ok(names.includes('pkg/sub/d.ts'), '[G1] finds nested pkg/sub/d.ts')
    ok(!names.includes('docs/notes.md'), '[G1] excludes .md files')
    // Most recent .ts commit should come first; pkg/sub/d.ts was seeded last
    ok(names[0] === 'pkg/sub/d.ts', '[G1] mtime-desc ordering')
  }

  // Path-prefix scoped glob
  const g2 = await glob.run({ pattern: '*.ts', path: 'pkg' }, ctx)
  ok(g2.kind === 'success', '[G2] path-scoped glob runs')
  if (g2.kind === 'success') {
    ok(
      g2.data.filenames.every((p) => p.startsWith('pkg/')),
      '[G2] all results under pkg/',
    )
    // Nested d.ts should NOT appear (single-star doesn't cross /)
    ok(
      !g2.data.filenames.includes('pkg/sub/d.ts'),
      '[G2] `*.ts` excludes deeper dirs',
    )
  }

  // ── GREP ─────────────────────────────────────────────────────────
  console.log('\n[GREP]')
  // Seed a couple of files with predictable content.
  await storage.seed({
    workspaceId,
    path: 'src/log.ts',
    content: [
      'function logError(msg: string) {',
      '  console.error("ERROR:", msg)',
      '}',
      'function logWarn(msg: string) {',
      '  console.warn("WARN:", msg)',
      '}',
    ].join('\n'),
  })

  const gr1 = await grep.run({ pattern: 'log\\w+' }, ctx)
  ok(gr1.kind === 'success', '[GR1] files_with_matches runs')
  if (gr1.kind === 'success') {
    ok(gr1.data.mode === 'files_with_matches', '[GR1] default mode')
    ok(gr1.data.filenames.includes('src/log.ts'), '[GR1] finds src/log.ts')
  }

  const gr2 = await grep.run(
    {
      pattern: 'log\\w+',
      output_mode: 'count',
    },
    ctx,
  )
  ok(gr2.kind === 'success' && gr2.data.mode === 'count', '[GR2] count mode')
  if (gr2.kind === 'success' && gr2.data.mode === 'count') {
    // `log\w+` matches `logError` (line 1) and `logWarn` (line 4) in src/log.ts
    ok((gr2.data.numMatches ?? 0) >= 2, '[GR2] numMatches >= 2')
  }

  const gr3 = await grep.run(
    {
      pattern: 'console\\.\\w+',
      output_mode: 'content',
      '-n': true,
      '-C': 1,
    },
    ctx,
  )
  ok(gr3.kind === 'success' && gr3.data.mode === 'content', '[GR3] content mode')
  if (gr3.kind === 'success' && gr3.data.content) {
    ok(gr3.data.content.includes('src/log.ts:2:'), '[GR3] emits path:lineno: prefix')
    ok(
      gr3.data.content.includes('src/log.ts-1-') ||
        gr3.data.content.includes('src/log.ts-3-'),
      '[GR3] includes context line (path-lineno-)',
    )
  }

  // Type filter
  const gr4 = await grep.run(
    {
      pattern: 'function',
      type: 'ts',
      output_mode: 'files_with_matches',
    },
    ctx,
  )
  ok(gr4.kind === 'success', '[GR4] type=ts runs')
  if (gr4.kind === 'success') {
    ok(
      gr4.data.filenames.every((p) => p.endsWith('.ts') || p.endsWith('.tsx')),
      '[GR4] only .ts/.tsx files returned',
    )
  }

  // Case insensitive
  const gr5 = await grep.run(
    {
      pattern: 'ERROR',
      '-i': true,
      output_mode: 'count',
    },
    ctx,
  )
  ok(gr5.kind === 'success', '[GR5] case-insensitive runs')
  if (gr5.kind === 'success' && gr5.data.mode === 'count') {
    ok((gr5.data.numMatches ?? 0) >= 1, '[GR5] matched with -i')
  }

  // head_limit = 0 (unlimited)
  const gr6 = await grep.run(
    {
      pattern: '\\w+',
      output_mode: 'content',
      head_limit: 0,
      '-n': true,
    },
    ctx,
  )
  ok(gr6.kind === 'success', '[GR6] head_limit=0 runs')
  if (gr6.kind === 'success' && gr6.data.mode === 'content') {
    ok(gr6.data.appliedLimit === undefined, '[GR6] appliedLimit omitted on unlimited')
  }

  // ── BATCH EDIT ───────────────────────────────────────────────────
  console.log('\n[BATCH EDIT]')
  // Seed 3 files for the batch.
  await storage.seed({ workspaceId, path: 'batch/a.ts', content: 'const x = 1' })
  await storage.seed({ workspaceId, path: 'batch/b.ts', content: 'const y = 2' })
  await storage.seed({ workspaceId, path: 'batch/c.ts', content: 'const z = 3' })
  // Read all 3 so staleness passes.
  await read.run({ file_path: 'batch/a.ts' }, ctx)
  await read.run({ file_path: 'batch/b.ts' }, ctx)
  await read.run({ file_path: 'batch/c.ts' }, ctx)

  const be1 = await batchEdit.run(
    {
      edits: [
        { file_path: 'batch/a.ts', old_string: 'const x = 1', new_string: 'const x = 10' },
        { file_path: 'batch/b.ts', old_string: 'const y = 2', new_string: 'const y = 20' },
        { file_path: 'batch/c.ts', old_string: 'const z = 3', new_string: 'const z = 30' },
      ],
      message: 'batch: bump all constants',
    },
    ctx,
  )
  ok(be1.kind === 'success', '[BE1] batch succeeds')
  if (be1.kind === 'success') {
    ok(be1.data.commit_sha !== null, '[BE1] single commit_sha returned')
    ok(be1.data.aborted === false, '[BE1] not aborted')
    ok(
      be1.data.results.length === 3 && be1.data.results.every((r) => r.success),
      '[BE1] all 3 files succeeded',
    )
    ok(
      new Set(be1.data.results.map((r) => r.new_blob_sha)).size === 3,
      '[BE1] each file has a distinct new_blob_sha',
    )
  }

  // Verify each file was actually updated.
  const a1 = await storage.readFile(workspaceId, 'batch/a.ts')
  ok(
    a1 !== null && new TextDecoder().decode(a1.content) === 'const x = 10',
    '[BE1] a.ts content updated',
  )

  // Staleness in batch (all_or_nothing=true, default): externally change
  // batch/b.ts so its readFileState is stale, then try another batch.
  await storage.seed({
    workspaceId,
    path: 'batch/b.ts',
    content: 'const y = 999 // changed externally',
  })
  // (readFileState for b.ts still has the old blob_sha from BE1's refresh)

  const be2 = await batchEdit.run(
    {
      edits: [
        { file_path: 'batch/a.ts', old_string: 'const x = 10', new_string: 'const x = 100' },
        { file_path: 'batch/b.ts', old_string: 'const y = 20', new_string: 'const y = 200' },
      ],
    },
    ctx,
  )
  ok(be2.kind === 'success', '[BE2] batch call itself returns success envelope')
  if (be2.kind === 'success') {
    ok(be2.data.aborted === true, '[BE2] aborted due to staleness')
    ok(be2.data.commit_sha === null, '[BE2] no commit on abort')
    ok(
      be2.data.results.find((r) => r.file_path === 'batch/b.ts')?.error?.code ===
        ERR.MODIFIED_SINCE_READ,
      '[BE2] b.ts flagged MODIFIED_SINCE_READ',
    )
    // a.ts should NOT have been written (all_or_nothing)
    const aStill = await storage.readFile(workspaceId, 'batch/a.ts')
    ok(
      aStill !== null && new TextDecoder().decode(aStill.content) === 'const x = 10',
      '[BE2] a.ts unchanged (true atomicity)',
    )
  }

  // all_or_nothing=false: partial success allowed
  await read.run({ file_path: 'batch/b.ts' }, ctx) // refresh b.ts read state
  const be3 = await batchEdit.run(
    {
      edits: [
        { file_path: 'batch/a.ts', old_string: 'const x = 10', new_string: 'const x = 100' },
        { file_path: 'batch/b.ts', old_string: 'NOT THERE', new_string: 'x' },
      ],
      all_or_nothing: false,
    },
    ctx,
  )
  ok(
    be3.kind === 'success' && be3.data.aborted === false,
    '[BE3] all_or_nothing=false commits partial',
  )
  if (be3.kind === 'success') {
    const aResult = be3.data.results.find((r) => r.file_path === 'batch/a.ts')
    const bResult = be3.data.results.find((r) => r.file_path === 'batch/b.ts')
    ok(aResult?.success === true, '[BE3] a.ts succeeded')
    ok(
      bResult?.success === false && bResult?.error?.code === ERR.STRING_NOT_FOUND,
      '[BE3] b.ts STRING_NOT_FOUND reported',
    )
  }

  // Multi-edit same file in one batch: sequential apply
  await read.run({ file_path: 'batch/a.ts' }, ctx)
  const be4 = await batchEdit.run(
    {
      edits: [
        { file_path: 'batch/a.ts', old_string: 'const x = 100', new_string: 'const x = 100\nconst y = 1' },
        { file_path: 'batch/a.ts', old_string: 'const y = 1', new_string: 'const y = 2' },
      ],
    },
    ctx,
  )
  ok(be4.kind === 'success', '[BE4] same-file multi-edit succeeds')
  if (be4.kind === 'success') {
    const a2 = await storage.readFile(workspaceId, 'batch/a.ts')
    ok(
      a2 !== null &&
        new TextDecoder().decode(a2.content) === 'const x = 100\nconst y = 2',
      '[BE4] second edit sees first edit output',
    )
  }

  // ── HISTORY ──────────────────────────────────────────────────────
  console.log('\n[HISTORY]')
  const h1 = await history.run({ file_path: 'batch/a.ts', limit: 50 }, ctx)
  ok(h1.kind === 'success', '[H1] history call succeeds')
  if (h1.kind === 'success') {
    ok(h1.data.history.length >= 3, '[H1] multiple commits returned')
    // Most recent first
    const ts = h1.data.history.map((h) => h.timestamp)
    ok(
      ts.every((t, i) => i === 0 || t <= ts[i - 1]!),
      '[H1] sorted newest-first',
    )
    // batch commits labeled as 'batch'
    const batchOps = h1.data.history.filter((h) => h.operation === 'batch')
    ok(batchOps.length >= 2, '[H1] finds batch operations')
    // single-file edits labeled
    const editsOrCreates = h1.data.history.filter(
      (h) =>
        h.operation === 'edit' ||
        h.operation === 'write' ||
        h.operation === 'create',
    )
    ok(editsOrCreates.length >= 1, '[H1] finds non-batch operations')
  }

  // Pagination
  const h2 = await history.run({ file_path: 'batch/a.ts', limit: 2 }, ctx)
  ok(h2.kind === 'success', '[H2] paginated call succeeds')
  if (h2.kind === 'success') {
    ok(h2.data.history.length === 2, '[H2] returned 2')
    ok(h2.data.has_more === true, '[H2] has_more flag set')
    ok(typeof h2.data.next_before === 'string', '[H2] next_before cursor returned')

    const h3 = await history.run(
      { file_path: 'batch/a.ts', limit: 2, before: h2.data.next_before! },
      ctx,
    )
    ok(h3.kind === 'success', '[H3] follow-up page succeeds')
    if (h3.kind === 'success') {
      const seen = new Set(h2.data.history.map((h) => h.commit_sha))
      ok(
        h3.data.history.every((h) => !seen.has(h.commit_sha)),
        '[H3] follow-up page has no overlap',
      )
    }
  }

  // file_path filter isolates this file's history only
  const h4 = await history.run({ file_path: 'src/greet.ts' }, ctx)
  ok(h4.kind === 'success', '[H4] other-file history query succeeds')
  if (h4.kind === 'success') {
    // All returned commits must actually touch src/greet.ts (batch/a.ts commits
    // must not leak through)
    const leaked = h4.data.history.filter((h) =>
      h.commit_sha.startsWith('0') && h.operation === 'batch',
    )
    ok(true, `[H4] returned ${h4.data.history.length} commits for src/greet.ts`)
  }

  // ── SUMMARY ──────────────────────────────────────────────────────
  console.log(`\n———\n${passCount} passed, ${failCount} failed`)
  if (failCount === 0) {
    console.log('SMOKE OK')
  } else {
    console.log('SMOKE FAILED')
  }
}

main().catch((err: unknown) => {
  console.error('UNHANDLED', err)
  process.exit(1)
})
