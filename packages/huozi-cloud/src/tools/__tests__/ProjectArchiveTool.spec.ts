import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import type { ToolUseContext } from '../../types.js'
import {
  createProjectArchiveTool,
  createProjectUnarchiveTool,
} from '../ProjectArchiveTool.js'

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

async function seed(
  storage: InMemoryStorage,
  workspaceId: string,
  path: string,
): Promise<void> {
  await storage.writeFile({
    workspaceId,
    path,
    content: enc.encode('x'),
    author: { id: 'system', type: 'system' },
    parent_sha: null,
  })
}

describe('huozi_project_archive', () => {
  it('moves folder/* under .archive/folder/*', async () => {
    const storage = new InMemoryStorage()
    await seed(storage, 'ws_test', 'huozi-dev/README.md')
    await seed(storage, 'ws_test', 'huozi-dev/tasks.jsonl')
    await seed(storage, 'ws_test', 'huozi-dev/.huozi/memory.jsonl')

    const tool = createProjectArchiveTool({ storage })
    const r = await tool.run({ folder_path: 'huozi-dev' }, ctx())

    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.from).toBe('huozi-dev/')
    expect(r.data.to).toBe('.archive/huozi-dev/')
    expect(r.data.moved_paths).toBe(3)

    expect(await storage.readFile('ws_test', 'huozi-dev/README.md')).toBeNull()
    expect(
      await storage.readFile('ws_test', '.archive/huozi-dev/README.md'),
    ).not.toBeNull()
    expect(
      await storage.readFile('ws_test', '.archive/huozi-dev/.huozi/memory.jsonl'),
    ).not.toBeNull()
  })

  it('refuses when folder is empty', async () => {
    const storage = new InMemoryStorage()
    const tool = createProjectArchiveTool({ storage })
    const r = await tool.run({ folder_path: 'nonexistent' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/nothing to archive/)
  })

  it('refuses when archive slot is already occupied', async () => {
    const storage = new InMemoryStorage()
    await seed(storage, 'ws_test', 'foo/README.md')
    await seed(storage, 'ws_test', '.archive/foo/README.md')
    const tool = createProjectArchiveTool({ storage })

    const r = await tool.run({ folder_path: 'foo' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/Archive slot/)
  })

  it('refuses reserved system folder names', async () => {
    const storage = new InMemoryStorage()
    const tool = createProjectArchiveTool({ storage })

    for (const name of ['__assets__', '.huozi', '.archive']) {
      const r = await tool.run({ folder_path: name }, ctx())
      expect(r.kind).toBe('error')
      if (r.kind === 'error') expect(r.message).toMatch(/reserved system folder/)
    }
  })
})

describe('huozi_project_unarchive', () => {
  it('restores .archive/folder/* back to folder/*', async () => {
    const storage = new InMemoryStorage()
    await seed(storage, 'ws_test', '.archive/marketing/README.md')
    await seed(storage, 'ws_test', '.archive/marketing/tasks.jsonl')

    const tool = createProjectUnarchiveTool({ storage })
    const r = await tool.run({ folder_path: 'marketing' }, ctx())

    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.from).toBe('.archive/marketing/')
    expect(r.data.to).toBe('marketing/')

    expect(await storage.readFile('ws_test', 'marketing/README.md')).not.toBeNull()
    expect(
      await storage.readFile('ws_test', '.archive/marketing/README.md'),
    ).toBeNull()
  })

  it('refuses when the archived folder does not exist', async () => {
    const storage = new InMemoryStorage()
    const tool = createProjectUnarchiveTool({ storage })

    const r = await tool.run({ folder_path: 'nothing' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/No archived folder/)
  })

  it('refuses when top-level slot is already occupied', async () => {
    const storage = new InMemoryStorage()
    await seed(storage, 'ws_test', '.archive/foo/README.md')
    await seed(storage, 'ws_test', 'foo/already-here.md')
    const tool = createProjectUnarchiveTool({ storage })

    const r = await tool.run({ folder_path: 'foo' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/already occupied/)
  })
})
