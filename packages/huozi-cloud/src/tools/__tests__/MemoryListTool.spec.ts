import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import { buildInitialMemorySchemaLine } from '../../storage/collection-schemas/memory.js'
import type { ToolUseContext } from '../../types.js'
import { createMemoryAppendTool } from '../MemoryAppendTool.js'
import { createMemoryListTool } from '../MemoryListTool.js'

function ctx(): ToolUseContext {
  return {
    workspaceId: 'ws_test',
    principalId: 'alice',
    principalType: 'user',
    scopePath: null,
    readFileState: new InMemoryReadFileState(),
  }
}

async function seedProject(
  storage: InMemoryStorage,
  workspaceId: string,
  projectPath: string,
): Promise<void> {
  const line = buildInitialMemorySchemaLine({ at: '2026-05-21T00:00:00.000Z' }) + '\n'
  await storage.writeFile({
    workspaceId,
    path: `${projectPath}/.huozi/memory.jsonl`,
    content: new TextEncoder().encode(line),
    author: { id: 'system', type: 'system' },
    parent_sha: null,
  })
}

async function appendN(
  storage: InMemoryStorage,
  count: number,
  type: 'feedback' | 'project' | 'reference' | 'user' = 'project',
): Promise<string[]> {
  const tool = createMemoryAppendTool({ storage })
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const r = await tool.run(
      {
        project_path: 'huozi-dev',
        event: { type, name: `entry ${i}`, body: `body ${i}` },
      },
      ctx(),
    )
    if (r.kind !== 'success') throw new Error(`append failed: ${r.message}`)
    ids.push(r.data.id)
  }
  return ids
}

describe('huozi_memory_list', () => {
  it('lists all 3 records after writing 3', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    await appendN(storage, 3)

    const list = createMemoryListTool({ storage })
    const r = await list.run({ project_path: 'huozi-dev' }, ctx())

    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.records).toHaveLength(3)
    expect(r.data.total_events).toBe(4) // 1 schema + 3 records
    expect(r.data.records.map((m) => m.name).sort()).toEqual([
      'entry 0',
      'entry 1',
      'entry 2',
    ])
  })

  it('supersede drops the old id and keeps the new one', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const [first, _second, third] = await appendN(storage, 3)

    const append = createMemoryAppendTool({ storage })
    const sup = await append.run(
      {
        project_path: 'huozi-dev',
        event: {
          type: 'project',
          name: 'replacement of first',
          body: 'newer body',
          supersedes: first,
        },
      },
      ctx(),
    )
    expect(sup.kind).toBe('success')

    const list = createMemoryListTool({ storage })
    const r = await list.run({ project_path: 'huozi-dev' }, ctx())
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    // 2 remaining originals (second, third) + 1 supersede record
    expect(r.data.records).toHaveLength(3)
    const ids = r.data.records.map((m) => m.id)
    expect(ids).not.toContain(first)
    expect(ids).toContain(third)
  })

  it('tombstone removes the target id without adding a new record', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const [_first, second, _third] = await appendN(storage, 3)

    const append = createMemoryAppendTool({ storage })
    await append.run(
      {
        project_path: 'huozi-dev',
        event: { target: second },
      },
      ctx(),
    )

    const list = createMemoryListTool({ storage })
    const r = await list.run({ project_path: 'huozi-dev' }, ctx())
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.records).toHaveLength(2)
    expect(r.data.records.map((m) => m.id)).not.toContain(second)
  })

  it('filters by type', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    await appendN(storage, 2, 'project')
    await appendN(storage, 1, 'feedback')
    await appendN(storage, 1, 'user')

    const list = createMemoryListTool({ storage })
    const onlyFeedback = await list.run(
      { project_path: 'huozi-dev', type: 'feedback' },
      ctx(),
    )
    expect(onlyFeedback.kind).toBe('success')
    if (onlyFeedback.kind !== 'success') return
    expect(onlyFeedback.data.records).toHaveLength(1)
    expect(onlyFeedback.data.records[0]?.type).toBe('feedback')
  })

  it('sorts by `at` descending (newest first)', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    await appendN(storage, 3)

    const list = createMemoryListTool({ storage })
    const r = await list.run({ project_path: 'huozi-dev' }, ctx())
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    const ats = r.data.records.map((m) => m.at)
    const sorted = [...ats].sort().reverse()
    expect(ats).toEqual(sorted)
  })

  it('tolerates dangling supersedes / tombstone targets', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    await appendN(storage, 1)

    const append = createMemoryAppendTool({ storage })
    // supersede an id that doesn't exist — should still write the new record
    await append.run(
      {
        project_path: 'huozi-dev',
        event: {
          type: 'project',
          name: 'orphan supersede',
          body: 'ok',
          supersedes: 'm_nonexistent',
        },
      },
      ctx(),
    )
    // tombstone a non-existent id — silently no-op
    await append.run(
      {
        project_path: 'huozi-dev',
        event: { target: 'm_also_nonexistent' },
      },
      ctx(),
    )

    const list = createMemoryListTool({ storage })
    const r = await list.run({ project_path: 'huozi-dev' }, ctx())
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.records).toHaveLength(2) // original + orphan supersede
  })

  it('errors when memory.jsonl does not exist', async () => {
    const storage = new InMemoryStorage()
    const list = createMemoryListTool({ storage })
    const r = await list.run({ project_path: 'unupgraded' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message).toMatch(/not an upgraded Project/)
  })
})
