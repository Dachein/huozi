import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import { buildInitialMemorySchemaLine } from '../../storage/collection-schemas/memory.js'
import type { ToolUseContext } from '../../types.js'
import { createMemoryAppendTool } from '../MemoryAppendTool.js'

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
  const line =
    buildInitialMemorySchemaLine({
      at: '2026-05-21T00:00:00.000Z',
      by: 'system',
    }) + '\n'
  await storage.writeFile({
    workspaceId,
    path: `${projectPath}/.huozi/memory.jsonl`,
    content: new TextEncoder().encode(line),
    author: { id: 'system', type: 'system' },
    parent_sha: null,
    message: 'seed test project memory',
  })
}

async function readLines(
  storage: InMemoryStorage,
  workspaceId: string,
  path: string,
): Promise<string[]> {
  const f = await storage.readFile(workspaceId, path)
  if (!f) throw new Error(`file ${path} not found`)
  const text = new TextDecoder().decode(f.content)
  return text.split('\n').filter((l) => l.length > 0)
}

describe('huozi_memory_append', () => {
  it('appends a record event and produces 2 lines (schema + record)', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const tool = createMemoryAppendTool({ storage })

    const r = await tool.run(
      {
        project_path: 'huozi-dev',
        event: {
          type: 'feedback',
          name: 'Prefer terse responses',
          body: 'No trailing summaries.',
          why: 'user said so',
          how_to_apply: 'every turn',
        },
      },
      ctx(),
    )

    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.op).toBe('record')
    expect(r.data.id).toMatch(/^m_[0-9a-f]+$/)

    const lines = await readLines(storage, 'ws_test', 'huozi-dev/.huozi/memory.jsonl')
    expect(lines).toHaveLength(2)
    const recordLine = JSON.parse(lines[1] ?? '{}')
    expect(recordLine.op).toBe('record')
    expect(recordLine.type).toBe('feedback')
    expect(recordLine.name).toBe('Prefer terse responses')
    expect(recordLine.body).toBe('No trailing summaries.')
    expect(recordLine.why).toBe('user said so')
    expect(recordLine.how_to_apply).toBe('every turn')
    expect(recordLine.by).toBe('user:alice')
    expect(typeof recordLine.at).toBe('string')
  })

  it('flips op to "supersede" when event has supersedes', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const tool = createMemoryAppendTool({ storage })

    const r = await tool.run(
      {
        project_path: 'huozi-dev',
        event: {
          type: 'project',
          name: 'Spec version',
          body: 'Authoritative spec is v3.3 (was v3.1).',
          supersedes: 'm_old123',
        },
      },
      ctx(),
    )
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.op).toBe('supersede')

    const lines = await readLines(storage, 'ws_test', 'huozi-dev/.huozi/memory.jsonl')
    const line = JSON.parse(lines[1] ?? '{}')
    expect(line.op).toBe('supersede')
    expect(line.supersedes).toBe('m_old123')
    expect(line.type).toBe('project')
  })

  it('flips op to "tombstone" when event has target (no type/body required)', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const tool = createMemoryAppendTool({ storage })

    const r = await tool.run(
      {
        project_path: 'huozi-dev',
        event: { target: 'm_retired' },
      },
      ctx(),
    )
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.op).toBe('tombstone')

    const lines = await readLines(storage, 'ws_test', 'huozi-dev/.huozi/memory.jsonl')
    const line = JSON.parse(lines[1] ?? '{}')
    expect(line.op).toBe('tombstone')
    expect(line.target).toBe('m_retired')
    expect(line.type).toBeUndefined()
    expect(line.name).toBeUndefined()
    expect(line.body).toBeUndefined()
  })

  it('refuses if the project has not been upgraded (no memory.jsonl)', async () => {
    const storage = new InMemoryStorage()
    const tool = createMemoryAppendTool({ storage })

    const r = await tool.run(
      {
        project_path: 'unupgraded',
        event: {
          type: 'project',
          name: 'X',
          body: 'Y',
        },
      },
      ctx(),
    )

    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message).toMatch(/not an upgraded Project/)
  })

  it('rejects record event missing type / name / body', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const tool = createMemoryAppendTool({ storage })

    const noType = await tool.run(
      {
        project_path: 'huozi-dev',
        event: { name: 'X', body: 'Y' },
      },
      ctx(),
    )
    expect(noType.kind).toBe('error')
    if (noType.kind === 'error') expect(noType.message).toMatch(/event\.type is required/)

    const noName = await tool.run(
      {
        project_path: 'huozi-dev',
        event: { type: 'feedback', body: 'Y' },
      },
      ctx(),
    )
    expect(noName.kind).toBe('error')
    if (noName.kind === 'error') expect(noName.message).toMatch(/event\.name is required/)
  })

  it('rejects events with both target and supersedes', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const tool = createMemoryAppendTool({ storage })

    const r = await tool.run(
      {
        project_path: 'huozi-dev',
        event: {
          type: 'project',
          name: 'x',
          body: 'y',
          supersedes: 'm_a',
          target: 'm_b',
        },
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/mutually exclusive/)
  })

  it('preserves the original schema line and appends after', async () => {
    const storage = new InMemoryStorage()
    await seedProject(storage, 'ws_test', 'huozi-dev')
    const tool = createMemoryAppendTool({ storage })

    await tool.run(
      {
        project_path: 'huozi-dev',
        event: { type: 'project', name: 'A', body: 'first' },
      },
      ctx(),
    )
    await tool.run(
      {
        project_path: 'huozi-dev',
        event: { type: 'project', name: 'B', body: 'second' },
      },
      ctx(),
    )

    const lines = await readLines(storage, 'ws_test', 'huozi-dev/.huozi/memory.jsonl')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0] ?? '{}').op).toBe('schema')
    expect(JSON.parse(lines[1] ?? '{}').name).toBe('A')
    expect(JSON.parse(lines[2] ?? '{}').name).toBe('B')
  })

  it('refuses paths with `..` segments', async () => {
    const storage = new InMemoryStorage()
    const tool = createMemoryAppendTool({ storage })

    const r = await tool.run(
      {
        project_path: '../escape',
        event: { type: 'project', name: 'x', body: 'y' },
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/\.\./)
  })
})
