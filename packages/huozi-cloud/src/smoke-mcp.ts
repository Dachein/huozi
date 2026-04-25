/**
 * End-to-end MCP smoke test.
 *
 * Spawns `dist/mcp/stdio.js` as a child process with HUOZI_DEMO=1, connects
 * via the official MCP client SDK, and exercises each of the 7 huozi_* tools
 * over the wire. This is the real integration test — different from
 * smoke.ts (which is in-process).
 *
 * Success criteria: all assertions pass, and the server process exits cleanly
 * when the client disconnects.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

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

interface ToolResultContent {
  type: string
  text?: string
}
interface ToolResult {
  content?: ToolResultContent[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

async function main(): Promise<void> {
  // ── Spawn server + connect client ─────────────────────────────────
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/mcp/stdio.js'],
    env: {
      ...(process.env as Record<string, string>),
      HUOZI_DEMO: '1',
      HUOZI_WORKSPACE: 'ws_demo',
    },
  })

  const client = new Client(
    { name: 'huozi-smoke-client', version: '0.0.0' },
    { capabilities: {} },
  )

  await client.connect(transport)

  // ── ListTools ─────────────────────────────────────────────────────
  console.log('\n[MCP listTools]')
  const list = await client.listTools()
  const toolNames = list.tools.map((t) => t.name).sort()
  ok(list.tools.length === 12, `[L1] exposes 12 tools (got ${list.tools.length})`)
  const expected = [
    'huozi_batch_edit',
    'huozi_edit',
    'huozi_glob',
    'huozi_grep',
    'huozi_history',
    'huozi_list_tree',
    'huozi_mkdir',
    'huozi_mv',
    'huozi_read',
    'huozi_rm',
    'huozi_template',
    'huozi_write',
  ]
  ok(
    JSON.stringify(toolNames) === JSON.stringify(expected),
    '[L2] tool names match expected set',
  )
  // Every tool should have a JSON Schema
  ok(
    list.tools.every((t) => typeof t.inputSchema === 'object' && t.inputSchema !== null),
    '[L3] every tool has an inputSchema',
  )

  // ── Read ──────────────────────────────────────────────────────────
  console.log('\n[MCP huozi_read]')
  const readRes = (await client.callTool({
    name: 'huozi_read',
    arguments: { file_path: 'src/greet.ts' },
  })) as ToolResult

  ok(!readRes.isError, '[R1] read returns non-error')
  ok(
    Boolean(
      readRes.content?.[0]?.text && readRes.content[0].text.includes('greet'),
    ),
    '[R2] read text content contains "greet"',
  )
  const readSc = readRes.structuredContent as
    | { type?: string; file?: { blob_sha?: string; totalLines?: number } }
    | undefined
  ok(readSc?.type === 'text', '[R3] structuredContent.type === "text"')
  ok(
    typeof readSc?.file?.blob_sha === 'string' && readSc.file.blob_sha.length === 40,
    '[R4] structuredContent.file.blob_sha is 40-char sha',
  )

  // Re-read → file_unchanged (state survives across MCP calls in same session)
  const readRes2 = (await client.callTool({
    name: 'huozi_read',
    arguments: { file_path: 'src/greet.ts' },
  })) as ToolResult
  const readSc2 = readRes2.structuredContent as { type?: string } | undefined
  ok(
    readSc2?.type === 'file_unchanged',
    '[R5] re-read → file_unchanged (session state preserved over stdio)',
  )

  // ── Glob ──────────────────────────────────────────────────────────
  console.log('\n[MCP huozi_glob]')
  const globRes = (await client.callTool({
    name: 'huozi_glob',
    arguments: { pattern: '**/*.ts' },
  })) as ToolResult
  ok(!globRes.isError, '[G1] glob non-error')
  const globSc = globRes.structuredContent as
    | { filenames?: string[]; numFiles?: number }
    | undefined
  ok(
    (globSc?.filenames ?? []).includes('src/greet.ts'),
    '[G2] glob finds src/greet.ts',
  )
  ok(
    (globSc?.numFiles ?? 0) >= 4,
    `[G3] finds ≥ 4 .ts files (got ${globSc?.numFiles ?? 0})`,
  )

  // ── Grep ──────────────────────────────────────────────────────────
  console.log('\n[MCP huozi_grep]')
  const grepRes = (await client.callTool({
    name: 'huozi_grep',
    arguments: {
      pattern: 'log\\w+',
      output_mode: 'files_with_matches',
    },
  })) as ToolResult
  ok(!grepRes.isError, '[GR1] grep non-error')
  const grepSc = grepRes.structuredContent as
    | { filenames?: string[]; mode?: string }
    | undefined
  ok(grepSc?.mode === 'files_with_matches', '[GR2] grep default mode')
  ok(
    (grepSc?.filenames ?? []).includes('src/log.ts'),
    '[GR3] grep locates src/log.ts',
  )

  // ── Edit (requires Read → refresh; grep/glob don't register in state) ──
  console.log('\n[MCP huozi_edit]')
  // Read first so state has an entry
  await client.callTool({
    name: 'huozi_read',
    arguments: { file_path: 'pkg/a.ts' },
  })
  const editRes = (await client.callTool({
    name: 'huozi_edit',
    arguments: {
      file_path: 'pkg/a.ts',
      old_string: 'export const a = 1',
      new_string: 'export const a = 42',
    },
  })) as ToolResult
  ok(!editRes.isError, '[E1] edit non-error')
  const editSc = editRes.structuredContent as
    | { commit_sha?: string; new_blob_sha?: string; structuredPatch?: unknown[] }
    | undefined
  ok(
    typeof editSc?.commit_sha === 'string' && editSc.commit_sha.length === 40,
    '[E2] edit returns 40-char commit_sha',
  )
  ok(
    Array.isArray(editSc?.structuredPatch) && editSc.structuredPatch.length > 0,
    '[E3] edit returns non-empty structuredPatch',
  )

  // Edit without prior Read → error
  const editBad = (await client.callTool({
    name: 'huozi_edit',
    arguments: {
      file_path: 'pkg/b.ts',
      old_string: 'export const b = 2',
      new_string: 'export const b = 200',
    },
  })) as ToolResult
  ok(editBad.isError === true, '[E4] edit without Read → isError=true')
  ok(
    Boolean(
      editBad.content?.[0]?.text &&
        editBad.content[0].text.includes('has not been read'),
    ),
    '[E4b] error text explains Read-first requirement',
  )

  // ── Write ─────────────────────────────────────────────────────────
  console.log('\n[MCP huozi_write]')
  const writeRes = (await client.callTool({
    name: 'huozi_write',
    arguments: {
      file_path: 'scratch/new.md',
      content: '# New file\n\nHello from MCP.\n',
    },
  })) as ToolResult
  ok(!writeRes.isError, '[W1] write new file non-error')
  const writeSc = writeRes.structuredContent as
    | { type?: string; commit_sha?: string }
    | undefined
  ok(writeSc?.type === 'create', '[W2] new file → operation=create')

  // ── Batch Edit ────────────────────────────────────────────────────
  console.log('\n[MCP huozi_batch_edit]')
  // Read the two files first
  await client.callTool({ name: 'huozi_read', arguments: { file_path: 'pkg/b.ts' } })
  const beRes = (await client.callTool({
    name: 'huozi_batch_edit',
    arguments: {
      edits: [
        {
          file_path: 'pkg/a.ts',
          old_string: 'export const a = 42',
          new_string: 'export const a = 100',
        },
        {
          file_path: 'pkg/b.ts',
          old_string: 'export const b = 2',
          new_string: 'export const b = 200',
        },
      ],
      message: 'batch: bump constants via MCP',
    },
  })) as ToolResult
  ok(!beRes.isError, '[BE1] batch_edit non-error')
  const beSc = beRes.structuredContent as
    | { commit_sha?: string | null; aborted?: boolean; results?: unknown[] }
    | undefined
  ok(typeof beSc?.commit_sha === 'string', '[BE2] batch returned commit_sha')
  ok(beSc?.aborted === false, '[BE3] batch not aborted')
  ok((beSc?.results ?? []).length === 2, '[BE4] 2 per-file results')

  // ── History ───────────────────────────────────────────────────────
  console.log('\n[MCP huozi_history]')
  const histRes = (await client.callTool({
    name: 'huozi_history',
    arguments: { file_path: 'pkg/a.ts', limit: 10 },
  })) as ToolResult
  ok(!histRes.isError, '[H1] history non-error')
  const histSc = histRes.structuredContent as
    | {
        history?: Array<{
          commit_sha: string
          operation: string
          author: { type: string }
        }>
      }
    | undefined
  ok(
    (histSc?.history ?? []).length >= 3,
    `[H2] history has ≥ 3 entries (got ${histSc?.history?.length ?? 0})`,
  )
  const ops = new Set((histSc?.history ?? []).map((h) => h.operation))
  ok(ops.has('batch'), '[H3] history recognizes batch operation')
  ok(
    (histSc?.history ?? []).some((h) => h.author.type === 'agent'),
    '[H4] history shows agent authorship',
  )

  // ── Teardown ──────────────────────────────────────────────────────
  await client.close()

  console.log(`\n———\n${passCount} passed, ${failCount} failed`)
  if (failCount === 0) console.log('MCP SMOKE OK')
  else console.log('MCP SMOKE FAILED')
}

main().catch((err: unknown) => {
  console.error('UNHANDLED', err)
  process.exit(1)
})
