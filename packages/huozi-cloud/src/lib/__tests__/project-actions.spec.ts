import { describe, expect, it } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import {
  archiveProject,
  ensureHuoziFrontmatter,
  unarchiveProject,
  upgradeProject,
} from '../project-actions.js'
import type { Author } from '../../storage/types.js'

const enc = new TextEncoder()
const dec = new TextDecoder()
const author: Author = { id: 'alice', type: 'user' }

async function writeFile(
  storage: InMemoryStorage,
  path: string,
  body: string,
): Promise<void> {
  await storage.writeFile({
    workspaceId: 'ws',
    path,
    content: enc.encode(body),
    author: { id: 'system', type: 'system' },
    parent_sha: null,
  })
}

async function readText(
  storage: InMemoryStorage,
  path: string,
): Promise<string> {
  const f = await storage.readFile('ws', path)
  if (!f) throw new Error(`file not found: ${path}`)
  return dec.decode(f.content)
}

describe('ensureHuoziFrontmatter', () => {
  it('prepends a fresh frontmatter when content has none', () => {
    const out = ensureHuoziFrontmatter('# Hello\n\nBody.\n')
    expect(out).toBe('---\nhuozi: project\n---\n# Hello\n\nBody.\n')
  })

  it('injects huozi: project into an existing frontmatter block', () => {
    const input = '---\ntitle: Foo\n---\n# Hello\n'
    const out = ensureHuoziFrontmatter(input)
    expect(out).toContain('huozi: project')
    expect(out).toContain('title: Foo')
  })

  it('is idempotent when huozi: project already declared', () => {
    const input = '---\nhuozi: project\ntitle: Foo\n---\n# Hello\n'
    expect(ensureHuoziFrontmatter(input)).toBe(input)
  })

  it('replaces an existing huozi: value when it differs', () => {
    const out = ensureHuoziFrontmatter('---\nhuozi: legacy\n---\n# X\n')
    expect(out).toContain('huozi: project')
    expect(out).not.toContain('huozi: legacy')
  })
})

describe('upgradeProject — fresh folder', () => {
  it('creates README + tasks.jsonl + memory.jsonl in one commit', async () => {
    const storage = new InMemoryStorage()
    const r = await upgradeProject(storage, 'ws', author, { folderPath: 'fresh' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.paths_written.sort()).toEqual([
      'fresh/.huozi/memory.md',
      'fresh/README.md',
      'fresh/tasks.jsonl',
    ])
    expect(r.data.readme_existed).toBe(false)

    const readme = await readText(storage, 'fresh/README.md')
    expect(readme).toMatch(/^---\nhuozi: project\n---/)
    const tasksSchema = JSON.parse(
      (await readText(storage, 'fresh/tasks.jsonl')).trim(),
    )
    expect(tasksSchema.op).toBe('schema')
    expect(tasksSchema.schema.title).toBe('Tasks')
    // Memory is now a markdown doc — verify the frontmatter + heading
    // are seeded, no JSON to parse.
    const memDoc = await readText(storage, 'fresh/.huozi/memory.md')
    expect(memDoc).toMatch(/^---\nhuozi: project-memory\n---/)
    expect(memDoc).toContain('# Project Memory')
  })
})

describe('upgradeProject — README already exists', () => {
  it('preserves body and only injects frontmatter', async () => {
    const storage = new InMemoryStorage()
    await writeFile(storage, 'huozi-dev/README.md', '# huozi-dev\n\nLong body.\n')
    const r = await upgradeProject(storage, 'ws', author, {
      folderPath: 'huozi-dev',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.readme_existed).toBe(true)

    const readme = await readText(storage, 'huozi-dev/README.md')
    expect(readme).toMatch(/^---\nhuozi: project\n---\n/)
    expect(readme).toContain('Long body.')
  })
})

describe('upgradeProject — refusals', () => {
  it('refuses already-upgraded folders', async () => {
    const storage = new InMemoryStorage()
    await writeFile(storage, 'huozi-dev/.huozi/memory.md', '{"op":"schema"}\n')
    const r = await upgradeProject(storage, 'ws', author, {
      folderPath: 'huozi-dev',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/already an upgraded Project/)
  })

  it('refuses reserved folder names', async () => {
    const storage = new InMemoryStorage()
    for (const name of ['.archive', '__assets__', '.huozi']) {
      const r = await upgradeProject(storage, 'ws', author, { folderPath: name })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toMatch(/reserved system folder/)
    }
  })

  it('refuses nested paths', async () => {
    const storage = new InMemoryStorage()
    const r = await upgradeProject(storage, 'ws', author, {
      folderPath: 'parent/child',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/single top-level folder name/)
  })
})

describe('archiveProject', () => {
  it('moves folder/* under .archive/folder/*', async () => {
    const storage = new InMemoryStorage()
    await writeFile(storage, 'huozi-dev/README.md', 'x')
    await writeFile(storage, 'huozi-dev/tasks.jsonl', 'x')
    const r = await archiveProject(storage, 'ws', author, 'huozi-dev')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.from).toBe('huozi-dev/')
    expect(r.data.to).toBe('.archive/huozi-dev/')
    expect(await storage.readFile('ws', 'huozi-dev/README.md')).toBeNull()
    expect(
      await storage.readFile('ws', '.archive/huozi-dev/README.md'),
    ).not.toBeNull()
  })

  it('refuses when folder is empty', async () => {
    const storage = new InMemoryStorage()
    const r = await archiveProject(storage, 'ws', author, 'missing')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/nothing to archive/)
  })

  it('refuses when archive slot is already occupied', async () => {
    const storage = new InMemoryStorage()
    await writeFile(storage, 'foo/x.md', 'x')
    await writeFile(storage, '.archive/foo/x.md', 'x')
    const r = await archiveProject(storage, 'ws', author, 'foo')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Archive slot/)
  })

  it('refuses reserved system folder names', async () => {
    const storage = new InMemoryStorage()
    for (const name of ['__assets__', '.huozi', '.archive']) {
      const r = await archiveProject(storage, 'ws', author, name)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.message).toMatch(/reserved system folder/)
    }
  })
})

describe('unarchiveProject', () => {
  it('restores .archive/foo/* back to foo/*', async () => {
    const storage = new InMemoryStorage()
    await writeFile(storage, '.archive/marketing/x.md', 'x')
    const r = await unarchiveProject(storage, 'ws', author, 'marketing')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.from).toBe('.archive/marketing/')
    expect(r.data.to).toBe('marketing/')
    expect(await storage.readFile('ws', 'marketing/x.md')).not.toBeNull()
  })

  it('refuses when archived folder does not exist', async () => {
    const storage = new InMemoryStorage()
    const r = await unarchiveProject(storage, 'ws', author, 'nothing')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/No archived folder/)
  })

  it('refuses when top-level slot is already occupied', async () => {
    const storage = new InMemoryStorage()
    await writeFile(storage, '.archive/foo/x.md', 'x')
    await writeFile(storage, 'foo/y.md', 'y')
    const r = await unarchiveProject(storage, 'ws', author, 'foo')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/already occupied/)
  })
})
