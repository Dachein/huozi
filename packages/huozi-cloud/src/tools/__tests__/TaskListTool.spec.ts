import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import type { ToolUseContext } from '../../types.js'
import { createTaskAppendTool } from '../TaskAppendTool.js'
import { createTaskCreateTool } from '../TaskCreateTool.js'
import { createTaskListTool } from '../TaskListTool.js'

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

async function createTask(
  storage: InMemoryStorage,
  title: string,
): Promise<string> {
  const t = createTaskCreateTool({ storage })
  const r = await t.run({ project_path: 'p', title }, ctx())
  if (r.kind !== 'success') throw new Error('create failed')
  return r.data.task_id
}

describe('huozi_task_list', () => {
  it('lists all tasks with status="pending" when only create events exist', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    await createTask(storage, 'A')
    await createTask(storage, 'B')

    const list = createTaskListTool({ storage })
    const r = await list.run({ project_path: 'p' }, ctx())
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.tasks).toHaveLength(2)
    expect(r.data.tasks.every((t) => t.status === 'pending')).toBe(true)
    expect(r.data.tasks.map((t) => t.title).sort()).toEqual(['A', 'B'])
  })

  it('projects status from event sequence (working / done / awaiting_user)', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const id = await createTask(storage, 'Run me')
    const append = createTaskAppendTool({ storage })

    await append.run(
      {
        project_path: 'p',
        task_id: id,
        event: { op: 'dispatch', run_id: 'r1' },
      },
      ctx(),
    )

    const list = createTaskListTool({ storage })
    const working = await list.run({ project_path: 'p' }, ctx())
    if (working.kind !== 'success') throw new Error('list failed')
    expect(working.data.tasks[0]?.status).toBe('working')

    await append.run(
      {
        project_path: 'p',
        task_id: id,
        event: { op: 'confirm_requested' },
      },
      ctx(),
    )
    const awaiting = await list.run({ project_path: 'p' }, ctx())
    if (awaiting.kind !== 'success') throw new Error('list failed')
    expect(awaiting.data.tasks[0]?.status).toBe('awaiting_user')

    await append.run(
      {
        project_path: 'p',
        task_id: id,
        event: { op: 'result' },
      },
      ctx(),
    )
    const done = await list.run({ project_path: 'p' }, ctx())
    if (done.kind !== 'success') throw new Error('list failed')
    expect(done.data.tasks[0]?.status).toBe('done')
  })

  it('filters out archived tasks by default', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const a = await createTask(storage, 'Active')
    const b = await createTask(storage, 'Old')
    const append = createTaskAppendTool({ storage })
    await append.run(
      { project_path: 'p', task_id: b, event: { op: 'archive' } },
      ctx(),
    )

    const list = createTaskListTool({ storage })
    const def = await list.run({ project_path: 'p' }, ctx())
    if (def.kind !== 'success') throw new Error('list failed')
    expect(def.data.tasks.map((t) => t.id)).toEqual([a])

    const withArchived = await list.run(
      { project_path: 'p', include_archived: true },
      ctx(),
    )
    if (withArchived.kind !== 'success') throw new Error('list failed')
    expect(withArchived.data.tasks).toHaveLength(2)
  })

  it('filters by status', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const a = await createTask(storage, 'A')
    await createTask(storage, 'B')
    const append = createTaskAppendTool({ storage })
    await append.run(
      {
        project_path: 'p',
        task_id: a,
        event: { op: 'status', status: 'done' },
      },
      ctx(),
    )

    const list = createTaskListTool({ storage })
    const onlyDone = await list.run(
      { project_path: 'p', status: 'done' },
      ctx(),
    )
    if (onlyDone.kind !== 'success') throw new Error('list failed')
    expect(onlyDone.data.tasks).toHaveLength(1)
    expect(onlyDone.data.tasks[0]?.id).toBe(a)
  })

  it('reports runs as distinct run_id values', async () => {
    const storage = new InMemoryStorage()
    await seed(storage)
    const id = await createTask(storage, 'Multi-run')
    const append = createTaskAppendTool({ storage })

    await append.run(
      { project_path: 'p', task_id: id, event: { op: 'dispatch', run_id: 'r1' } },
      ctx(),
    )
    await append.run(
      { project_path: 'p', task_id: id, event: { op: 'agent_turn', run_id: 'r1' } },
      ctx(),
    )
    await append.run(
      { project_path: 'p', task_id: id, event: { op: 'run_paused', run_id: 'r1' } },
      ctx(),
    )
    await append.run(
      { project_path: 'p', task_id: id, event: { op: 'dispatch', run_id: 'r2' } },
      ctx(),
    )

    const list = createTaskListTool({ storage })
    const r = await list.run({ project_path: 'p' }, ctx())
    if (r.kind !== 'success') throw new Error('list failed')
    expect(r.data.tasks[0]?.runs?.sort()).toEqual(['r1', 'r2'])
  })

  it('errors when tasks.jsonl missing', async () => {
    const storage = new InMemoryStorage()
    const list = createTaskListTool({ storage })
    const r = await list.run({ project_path: 'nothing' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/not an upgraded Project/)
  })
})
