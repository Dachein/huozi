/**
 * Seed a demo workspace with a small, intentionally-searchable set of files.
 *
 * Used by:
 *   - `dist/mcp/stdio.js` when `HUOZI_DEMO=1` is set (so an external client
 *     connecting via stdio has files to work with)
 *   - `src/smoke-mcp.ts` to have predictable content for assertions
 */

import type { StorageBackend } from '../storage/types.js'

const DEMO_FILES: Array<{ path: string; content: string }> = [
  {
    path: 'src/greet.ts',
    content:
      `import { foo } from "./foo.js"

export function greet(name: string): string {
  return \`hello \${name}\`
}
`,
  },
  {
    path: 'src/log.ts',
    content:
      `export function logError(msg: string) {
  console.error("ERROR:", msg)
}

export function logWarn(msg: string) {
  console.warn("WARN:", msg)
}
`,
  },
  {
    path: 'pkg/a.ts',
    content: 'export const a = 1\n',
  },
  {
    path: 'pkg/b.ts',
    content: 'export const b = 2\n',
  },
  {
    path: 'docs/readme.md',
    content: '# Demo\n\nA tiny sample workspace used by the huozi-cloud demo seed.\n',
  },
]

export async function seedDemoWorkspace(
  storage: StorageBackend,
  workspaceId: string,
): Promise<void> {
  // Only seed with async writeFile (the in-memory backend's public surface).
  // Typed against StorageBackend since prod backends also implement it.
  for (const f of DEMO_FILES) {
    await storage.writeFile({
      workspaceId,
      path: f.path,
      content: new TextEncoder().encode(f.content),
      author: { id: 'demo-seeder', type: 'system' },
    })
  }
}
