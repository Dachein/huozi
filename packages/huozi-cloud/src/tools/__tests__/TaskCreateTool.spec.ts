import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import type { ToolUseContext } from '../../types.js'
import { createTaskCreateTool } from '../TaskCreateTool.js'

function ctx(): ToolUseContext {
  return {
    workspaceId: 'ws_test',
    principalId: 'alice',
    principalType: 'user',
    scopePath: null,
    readFileState: new InMemoryReadFileState(),
  }
}

const enc = new TextEncoder()
const dec = new TextDecoder()

async function seedTasksFile(
  storage: InMemoryStorage,
  workspaceId: string,
  projectPath: string,
): Promise<void> {
  await storage.writeFile({
    workspaceId,
    path: `${projectPath}/tasks.jsonl`,
    content: enc.encode(
      JSON.stringify({ op: 'schema', at: '2026-05-21T00:00:00Z', by: 'system' }) + '\n',
    ),
    author: { id: 'system', type: 'system' },
    parent_sha: null,
  })
}

async function readLines(
  storage: InMemoryStorage,
  workspaceId: string,
  path: string,
): Promise<string[]> {
  const f = await storage.readFile(workspaceId, path)
  if (!f) throw new Error(`not found: ${path}`)
  return dec.decode(f.content).split('\n').filter((l) => l.length > 0)
}

describe('huozi_task_create', () => {
  it('appends an op:"create" event with a fresh task_id', async () => {
    const storage = new InMemoryStorage()
    await seedTasksFile(storage, 'ws_test', 'huozi-dev')
    const tool = createTaskCreateTool({ storage })

    const r = await tool.run(
      {
        project_path: 'huozi-dev',
        title: 'Write retro doc',
        deliverable: 'One-pager covering shipped features.',
      },
      ctx(),
    )
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.task_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )

    const lines = await readLines(storage, 'ws_test', 'huozi-dev/tasks.jsonl')
    expect(lines).toHaveLength(2)
    const created = JSON.parse(lines[1] ?? '{}')
    expect(created.op).toBe('create')
    expect(created.title).toBe('Write retro doc')
    expect(created.deliverable).toBe('One-pager covering shipped features.')
    expect(created.id).toBe(r.data.task_id)
    expect(created.by).toBe('user:alice')
  })

  it('attaches source_refs when Promoting from inbox', async () => {
    const storage = new InMemoryStorage()
    await seedTasksFile(storage, 'ws_test', 'huozi-dev')
    const tool = createTaskCreateTool({ storage })

    const r = await tool.run(
      {
        project_path: 'huozi-dev',
        title: 'Reply to email',
        source_refs: ['inbox.jsonl#i_42'],
      },
      ctx(),
    )
    expect(r.kind).toBe('success')
    const lines = await readLines(storage, 'ws_test', 'huozi-dev/tasks.jsonl')
    const created = JSON.parse(lines[1] ?? '{}')
    expect(created.source_refs).toEqual(['inbox.jsonl#i_42'])
  })

  it('refuses if the project has not been upgraded (tasks.jsonl missing)', async () => {
    const storage = new InMemoryStorage()
    const tool = createTaskCreateTool({ storage })

    const r = await tool.run(
      {
        project_path: 'not-a-project',
        title: 'X',
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/not an upgraded Project/)
  })

  it('multiple creates interleave as separate entity ids in the same file', async () => {
    const storage = new InMemoryStorage()
    await seedTasksFile(storage, 'ws_test', 'huozi-dev')
    const tool = createTaskCreateTool({ storage })

    const r1 = await tool.run(
      { project_path: 'huozi-dev', title: 'A' },
      ctx(),
    )
    const r2 = await tool.run(
      { project_path: 'huozi-dev', title: 'B' },
      ctx(),
    )
    expect(r1.kind).toBe('success')
    expect(r2.kind).toBe('success')
    if (r1.kind !== 'success' || r2.kind !== 'success') return
    expect(r1.data.task_id).not.toBe(r2.data.task_id)

    const lines = await readLines(storage, 'ws_test', 'huozi-dev/tasks.jsonl')
    expect(lines).toHaveLength(3) // schema + 2 creates
    expect(JSON.parse(lines[1] ?? '{}').title).toBe('A')
    expect(JSON.parse(lines[2] ?? '{}').title).toBe('B')
  })

  it('rejects paths with `..` segments', async () => {
    const storage = new InMemoryStorage()
    const tool = createTaskCreateTool({ storage })
    const r = await tool.run(
      { project_path: '../escape', title: 'x' },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/\.\./)
  })
})
