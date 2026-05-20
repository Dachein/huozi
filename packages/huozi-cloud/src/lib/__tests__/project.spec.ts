import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { isProject, listProjects } from '../project.js'

const enc = new TextEncoder()

async function touch(
  storage: InMemoryStorage,
  workspaceId: string,
  path: string,
  body = 'x',
): Promise<void> {
  await storage.writeFile({
    workspaceId,
    path,
    content: enc.encode(body),
    author: { id: 'sys', type: 'system' },
    parent_sha: null,
  })
}

describe('isProject', () => {
  it('returns false for a folder with no sentinel', async () => {
    const storage = new InMemoryStorage()
    await touch(storage, 'ws', 'huozi-dev/README.md')
    expect(await isProject(storage, 'ws', 'huozi-dev')).toBe(false)
  })

  it('returns true once .huozi/memory.jsonl exists', async () => {
    const storage = new InMemoryStorage()
    await touch(storage, 'ws', 'huozi-dev/README.md')
    await touch(storage, 'ws', 'huozi-dev/.huozi/memory.jsonl', '{"op":"schema"}\n')
    expect(await isProject(storage, 'ws', 'huozi-dev')).toBe(true)
  })

  it('accepts trailing slash on the folder path', async () => {
    const storage = new InMemoryStorage()
    await touch(storage, 'ws', 'huozi-dev/.huozi/memory.jsonl', '{"op":"schema"}\n')
    expect(await isProject(storage, 'ws', 'huozi-dev/')).toBe(true)
  })

  it('returns false for empty folder path', async () => {
    const storage = new InMemoryStorage()
    expect(await isProject(storage, 'ws', '')).toBe(false)
  })
})

describe('listProjects', () => {
  it('returns empty when no projects exist', async () => {
    const storage = new InMemoryStorage()
    await touch(storage, 'ws', 'huozi-dev/README.md') // no sentinel
    await touch(storage, 'ws', 'inbox.jsonl')
    expect(await listProjects(storage, 'ws')).toEqual([])
  })

  it('returns the top-level folders that carry a sentinel', async () => {
    const storage = new InMemoryStorage()
    await touch(storage, 'ws', 'huozi-dev/.huozi/memory.jsonl', 's')
    await touch(storage, 'ws', 'fargo/.huozi/memory.jsonl', 's')
    await touch(storage, 'ws', 'fargo/README.md')
    await touch(storage, 'ws', 'random/file.md') // no sentinel
    expect(await listProjects(storage, 'ws')).toEqual(['fargo', 'huozi-dev'])
  })

  it('ignores nested .huozi/memory.jsonl (no nested projects)', async () => {
    const storage = new InMemoryStorage()
    await touch(storage, 'ws', 'fargo/sub/.huozi/memory.jsonl', 's')
    expect(await listProjects(storage, 'ws')).toEqual([])
  })

  it('does not list workspaces from other tenants', async () => {
    const storage = new InMemoryStorage()
    await touch(storage, 'ws-a', 'huozi-dev/.huozi/memory.jsonl', 's')
    await touch(storage, 'ws-b', 'other/.huozi/memory.jsonl', 's')
    expect(await listProjects(storage, 'ws-a')).toEqual(['huozi-dev'])
    expect(await listProjects(storage, 'ws-b')).toEqual(['other'])
  })
})
