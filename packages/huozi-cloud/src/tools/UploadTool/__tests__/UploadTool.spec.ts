import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { InMemoryStorage } from '../../../storage/memory.js'
import { InMemoryReadFileState } from '../../../state/ReadFileState.js'
import type { ToolUseContext } from '../../../types.js'
import { createUploadTool, MAX_INLINE_UPLOAD_BYTES } from '../UploadTool.js'

function ctx(): ToolUseContext {
  return {
    workspaceId: 'ws_test',
    principalId: 'agent_1',
    principalType: 'agent',
    scopePath: null,
    readFileState: new InMemoryReadFileState(),
  }
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

describe('huozi_upload — single-file', () => {
  it('uploads a small binary and persists content_type', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])

    const r = await tool.run(
      {
        file_path: 'cat.png',
        content_base64: b64(png),
        content_type: 'image/png',
      },
      ctx(),
    )
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.kind).toBe('file')
    expect(r.data.size).toBe(png.length)
    expect(r.data.content_type).toBe('image/png')

    const read = await storage.readFile('ws_test', 'cat.png')
    expect(read?.content_type).toBe('image/png')
    expect(read?.size).toBe(png.length)
  })

  it('rejects oversize inline payload', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })
    // Build a fake base64 string just past the encoded cap. Real bytes
    // not needed — the size guard runs before decode.
    const oversize = 'A'.repeat(
      Math.ceil((MAX_INLINE_UPLOAD_BYTES / 3) * 4) + 1024,
    )
    const r = await tool.run(
      { file_path: 'big.bin', content_base64: oversize },
      ctx(),
    )
    expect(r.kind).toBe('error')
  })

  it('rejects bad base64', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })
    const r = await tool.run(
      { file_path: 'bad.bin', content_base64: '!!!not-base64!!!' },
      ctx(),
    )
    expect(r.kind).toBe('error')
  })
})

describe('huozi_upload — extract', () => {
  it('extracts a zip into a sibling folder and skips writing the archive', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })

    const archive = zipSync({
      'README.md': strToU8('# hi'),
      'src/index.ts': strToU8('export {}'),
    })

    const r = await tool.run(
      {
        file_path: 'imports/pkg.zip',
        content_base64: b64(archive),
        extract: true,
      },
      ctx(),
    )
    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.kind).toBe('archive')
    expect(r.data.extracted?.dest_prefix).toBe('imports/pkg/')
    expect(r.data.extracted?.count).toBe(2)

    // Archive itself should NOT have been stored.
    const zipFile = await storage.readFile('ws_test', 'imports/pkg.zip')
    expect(zipFile).toBeNull()

    const readme = await storage.readFile(
      'ws_test',
      'imports/pkg/README.md',
    )
    expect(readme).not.toBeNull()
    expect(new TextDecoder().decode(readme!.content)).toBe('# hi')
  })

  it('refuses extract when path is not a .zip', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })
    const r = await tool.run(
      {
        file_path: 'not-an-archive.txt',
        content_base64: b64(new Uint8Array([1, 2, 3])),
        extract: true,
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
  })

  it('rejects a path-traversal zip', async () => {
    const storage = new InMemoryStorage()
    const tool = createUploadTool({ storage })

    const evil = zipSync({
      'safe.txt': strToU8('ok'),
      '../escape.txt': strToU8('boom'),
    })

    const r = await tool.run(
      {
        file_path: 'incoming/zips/x.zip',
        content_base64: b64(evil),
        extract: true,
      },
      ctx(),
    )
    expect(r.kind).toBe('error')
    if (r.kind !== 'error') return
    expect(r.message).toMatch(/unsafe path/i)

    // Nothing should have been written — atomicity guard.
    const safe = await storage.readFile('ws_test', 'incoming/zips/x/safe.txt')
    expect(safe).toBeNull()
  })
})
