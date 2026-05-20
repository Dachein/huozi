import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import type { ToolUseContext } from '../../types.js'
import {
  createProjectUpgradeTool,
  ensureHuoziFrontmatter,
} from '../ProjectUpgradeTool.js'

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

async function writeFile(
  storage: InMemoryStorage,
  workspaceId: string,
  path: string,
  body: string,
): Promise<void> {
  await storage.writeFile({
    workspaceId,
    path,
    content: enc.encode(body),
    author: { id: 'system', type: 'system' },
    parent_sha: null,
  })
}

async function readText(
  storage: InMemoryStorage,
  workspaceId: string,
  path: string,
): Promise<string> {
  const f = await storage.readFile(workspaceId, path)
  if (!f) throw new Error(`file not found: ${path}`)
  return dec.decode(f.content)
}

describe('ensureHuoziFrontmatter', () => {
  it('prepends a fresh frontmatter when content has none', () => {
    const out = ensureHuoziFrontmatter('# Hello\n\nBody text.\n')
    expect(out).toBe('---\nhuozi: project\n---\n# Hello\n\nBody text.\n')
  })

  it('injects huozi: project into an existing frontmatter block', () => {
    const input = '---\ntitle: Foo\nauthor: Bar\n---\n# Hello\n'
    const out = ensureHuoziFrontmatter(input)
    expect(out).toContain('huozi: project')
    expect(out).toContain('title: Foo')
    expect(out).toContain('author: Bar')
    expect(out.endsWith('# Hello\n')).toBe(true)
  })

  it('is idempotent when huozi: project already declared', () => {
    const input = '---\nhuozi: project\ntitle: Foo\n---\n# Hello\n'
    expect(ensureHuoziFrontmatter(input)).toBe(input)
  })

  it('replaces an existing huozi: value when it differs', () => {
    const input = '---\nhuozi: legacy\n---\n# Hi\n'
    const out = ensureHuoziFrontmatter(input)
    expect(out).toContain('huozi: project')
    expect(out).not.toContain('huozi: legacy')
  })
})

describe('huozi_project_upgrade — fresh folder', () => {
  it('creates README.md + tasks.jsonl + .huozi/memory.jsonl in one commit', async () => {
    const storage = new InMemoryStorage()
    const tool = createProjectUpgradeTool({ storage })

    const r = await tool.run({ folder_path: 'fresh' }, ctx())
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.paths_written.sort()).toEqual([
      'fresh/.huozi/memory.jsonl',
      'fresh/README.md',
      'fresh/tasks.jsonl',
    ])
    expect(r.data.readme_existed).toBe(false)

    const readme = await readText(storage, 'ws_test', 'fresh/README.md')
    expect(readme).toMatch(/^---\nhuozi: project\n---/)
    expect(readme).toContain('# fresh')

    const tasks = await readText(storage, 'ws_test', 'fresh/tasks.jsonl')
    const tasksSchema = JSON.parse(tasks.trim())
    expect(tasksSchema.op).toBe('schema')
    expect(tasksSchema.schema.title).toBe('Tasks')

    const memory = await readText(storage, 'ws_test', 'fresh/.huozi/memory.jsonl')
    const memSchema = JSON.parse(memory.trim())
    expect(memSchema.op).toBe('schema')
    expect(memSchema.schema.title).toBe('Agent Memory')
  })

  it('honors readme_content for a fresh README', async () => {
    const storage = new InMemoryStorage()
    const tool = createProjectUpgradeTool({ storage })

    const r = await tool.run(
      {
        folder_path: 'with-body',
        readme_content: '# Custom\n\nMy own intro.\n',
      },
      ctx(),
    )
    expect(r.kind).toBe('success')

    const readme = await readText(storage, 'ws_test', 'with-body/README.md')
    expect(readme).toContain('huozi: project')
    expect(readme).toContain('My own intro.')
  })
})

describe('huozi_project_upgrade — README already exists', () => {
  it('preserves existing README body and only injects frontmatter', async () => {
    const storage = new InMemoryStorage()
    await writeFile(
      storage,
      'ws_test',
      'huozi-dev/README.md',
      '# huozi-dev\n\nLots of pre-existing content here.\n',
    )
    const tool = createProjectUpgradeTool({ storage })

    const r = await tool.run({ folder_path: 'huozi-dev' }, ctx())
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.readme_existed).toBe(true)

    const readme = await readText(storage, 'ws_test', 'huozi-dev/README.md')
    expect(readme).toMatch(/^---\nhuozi: project\n---\n/)
    expect(readme).toContain('Lots of pre-existing content here.')
    // Memory + tasks were also created.
    expect(await storage.readFile('ws_test', 'huozi-dev/tasks.jsonl')).not.toBeNull()
    expect(
      await storage.readFile('ws_test', 'huozi-dev/.huozi/memory.jsonl'),
    ).not.toBeNull()
  })

  it('merges into existing frontmatter without nuking other keys', async () => {
    const storage = new InMemoryStorage()
    await writeFile(
      storage,
      'ws_test',
      'fargo/README.md',
      '---\ntitle: Fargo Plan\nstage: draft\n---\n# Fargo\n',
    )
    const tool = createProjectUpgradeTool({ storage })

    await tool.run({ folder_path: 'fargo' }, ctx())
    const readme = await readText(storage, 'ws_test', 'fargo/README.md')
    expect(readme).toContain('huozi: project')
    expect(readme).toContain('title: Fargo Plan')
    expect(readme).toContain('stage: draft')
  })
})

describe('huozi_project_upgrade — refusals', () => {
  it('refuses if the folder is already an upgraded Project', async () => {
    const storage = new InMemoryStorage()
    await writeFile(
      storage,
      'ws_test',
      'huozi-dev/.huozi/memory.jsonl',
      '{"op":"schema"}\n',
    )
    const tool = createProjectUpgradeTool({ storage })

    const r = await tool.run({ folder_path: 'huozi-dev' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message).toMatch(/already an upgraded Project/)
  })

  it('refuses reserved folder names', async () => {
    const storage = new InMemoryStorage()
    const tool = createProjectUpgradeTool({ storage })

    for (const name of ['.archive', '__assets__', '.huozi']) {
      const r = await tool.run({ folder_path: name }, ctx())
      expect(r.kind).toBe('error')
      if (r.kind === 'error') expect(r.message).toMatch(/reserved system folder name/)
    }
  })

  it('refuses nested paths (no nested projects)', async () => {
    const storage = new InMemoryStorage()
    const tool = createProjectUpgradeTool({ storage })

    const r = await tool.run({ folder_path: 'parent/child' }, ctx())
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/single top-level folder name/)
  })
})
