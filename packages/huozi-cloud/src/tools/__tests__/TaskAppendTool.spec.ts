import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import type { ToolUseContext } from '../../types.js'
import { createTaskAppendTool } from '../TaskAppendTool.js'
import { createTaskCreateTool } from '../TaskCreateTool.js'

function ctx(): ToolUseContext {
  return {
    workspaceId: 'ws',
    principalId: 'alice',
    principalType: 'user',
    scopePath: null,
    readFileState: new InMemoryReadFileState(),
  }
}

const enc = new TextEncoder()
const dec = new TextDecoder()

async function seed(storage: InMemoryStorage): Promise<void> {
  await storage.writeFile({
    workspaceId: 'ws',
    path: 'p/tasks.jsonl',
    content: enc.encode(
      JSON.stringify({ op: 'schema', at: '2026-05-21T00:00:00Z', by: 'system' }) + '\n',
    ),
    author: { id: 'system', type: 'system' },
    parent_sha: null,
  })
}

async function createTask(storage: InMemoryStorage, title: string): Promise<string> {
  const t = createTaskCreateTool({ storage })
  const r = await t.run({ project_path: 'p', title }, ctx())
  if (r.kind !== 'success') throw new Error('create failed')
  return r.data.task_id
}

async function readLines(storage: InMemoryStorage): Promise<string[]> {
  const f = await storage.readFile('ws', 'p/tasks.jsonl')
  if (!f) throw new Error('no file')
  return dec.decode(f.content).split('\n').filter((l) => l.length > 0)
}

describe('huozi_task_append', () => {
  it('appends a status:done event onto an existing task', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const id = await createTask(storage, 'Reply')

    const tool = createTaskAppendTool({ storage })
    const r = await tool.run(
      {
        project_path: 'p',
        task_id: id,
        event: { op: 'status', status: 'done' },
      },
      ctx(),
    )
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.op).toBe('status')
    expect(r.data.task_id).toBe(id)

    const lines = await readLines(storage)
    expect(lines).toHaveLength(3)
    const last = JSON.parse(lines[2] ?? '{}')
    expect(last.op).toBe('status')
    expect(last.status).toBe('done')
    expect(last.id).toBe(id)
    expect(last.by).toBe('user:alice')
  })

  it('rejects op:"status" without a status field', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const id = await createTask(storage, 'X')
    const tool = createTaskAppendTool({ storage })
    const r = await tool.run(
      { project_path: 'p', task_id: id, event: { op: 'status' } },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/event\.status is required/)
  })

  it('refuses unknown task_id', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const tool = createTaskAppendTool({ storage })
    const r = await tool.run(
      {
        project_path: 'p',
        task_id: 'unknown',
        event: { op: 'status', status: 'done' },
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/No task "unknown"/)
  })

  it('refuses if tasks.jsonl is missing (Project not upgraded)', async () => {
    const storage = new InMemoryStorage()
    const tool = createTaskAppendTool({ storage })
    const r = await tool.run(
      {
        project_path: 'nothing',
        task_id: 'x',
        event: { op: 'archive' },
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/not an upgraded Project/)
  })

  it('supports archive + result + run_paused ops', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const id = await createTask(storage, 'Run')
    const tool = createTaskAppendTool({ storage })

    for (const op of ['result', 'run_paused', 'archive']) {
      const r = await tool.run(
        { project_path: 'p', task_id: id, event: { op: op as 'archive' } },
        ctx(),
      )
      expect(r.kind).toBe('success')
    }
    const lines = await readLines(storage)
    expect(lines).toHaveLength(5) // schema + create + 3 appended
  })

  it('passes through open-ended fields like summary / run_id', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const id = await createTask(storage, 'X')
    const tool = createTaskAppendTool({ storage })

    await tool.run(
      {
        project_path: 'p',
        task_id: id,
        event: {
          op: 'result',
          summary: 'Wrapped up cleanly',
          result_kind: 'ok',
          run_id: 'run-42',
        },
      },
      ctx(),
    )
    const lines = await readLines(storage)
    const last = JSON.parse(lines[2] ?? '{}')
    expect(last.summary).toBe('Wrapped up cleanly')
    expect(last.result_kind).toBe('ok')
    expect(last.run_id).toBe('run-42')
  })
})
