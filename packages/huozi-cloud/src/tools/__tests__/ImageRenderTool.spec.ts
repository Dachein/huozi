import { describe, expect, it, vi } from 'vitest'
import { InMemoryStorage } from '../../storage/memory.js'
import { InMemoryReadFileState } from '../../state/ReadFileState.js'
import type { ToolUseContext } from '../../types.js'
import {
  createImageRenderTool,
  MAX_RENDERED_PNG_BYTES,
} from '../ImageRenderTool.js'
import type { SvgRenderer } from '../../render/svgRenderer.js'

function ctx(): ToolUseContext {
  return {
    workspaceId: 'ws_test',
    principalId: 'agent_1',
    principalType: 'agent',
    scopePath: null,
    readFileState: new InMemoryReadFileState(),
  }
}

/**
 * Minimal valid PNG: 8-byte signature + IHDR + IDAT + IEND. The
 * storage layer doesn't validate PNG structure — it just stores bytes
 * — so we don't need a *real* PNG, only deterministic bytes the test
 * can assert on.
 */
function fakePng(seed = 0): Uint8Array {
  const bytes = new Uint8Array(64)
  // PNG signature, so content_type sniffers don't get confused.
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  // Pad with seed-derived bytes so different seeds → different blob_sha.
  for (let i = 8; i < bytes.length; i++) bytes[i] = (i + seed) & 0xff
  return bytes
}

function fakeRenderer(seed = 0): SvgRenderer {
  return async (_svg, opts) => ({
    png: fakePng(seed),
    width: opts.width ?? 480 * opts.scale,
    height: 270 * opts.scale,
  })
}

const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>'

describe('huozi_image_render', () => {
  it('renders an SVG and saves to /__assets__/<sha>.png by default', async () => {
    const storage = new InMemoryStorage()
    const tool = createImageRenderTool({
      storage,
      svgRenderer: fakeRenderer(),
    })

    const r = await tool.run(
      { format: 'svg', source: SAMPLE_SVG },
      ctx(),
    )

    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return

    expect(r.data.ok).toBe(true)
    expect(r.data.content_type).toBe('image/png')
    expect(r.data.file_path.startsWith('__assets__/')).toBe(true)
    expect(r.data.file_path.endsWith('.png')).toBe(true)
    expect(r.data.bytes).toBe(64)
    expect(r.data.width).toBe(960) // 480 × scale 2
    expect(r.data.height).toBe(540)
    expect(r.data.blob_sha.length).toBeGreaterThan(0)

    // Bytes actually landed in storage.
    const read = await storage.readFile('ws_test', r.data.file_path)
    expect(read).toBeTruthy()
    expect(read?.size).toBe(64)
    expect(read?.content_type).toBe('image/png')
  })

  it('honors explicit save_to', async () => {
    const storage = new InMemoryStorage()
    const tool = createImageRenderTool({
      storage,
      svgRenderer: fakeRenderer(),
    })

    const r = await tool.run(
      {
        format: 'svg',
        source: SAMPLE_SVG,
        save_to: 'essays/my-essay/figure-1.png',
      },
      ctx(),
    )

    expect(r.kind).toBe('success')
    if (r.kind !== 'success') return
    expect(r.data.file_path).toBe('essays/my-essay/figure-1.png')

    const read = await storage.readFile('ws_test', 'essays/my-essay/figure-1.png')
    expect(read?.size).toBe(64)
  })

  it('rejects save_to without .png extension', async () => {
    const storage = new InMemoryStorage()
    const tool = createImageRenderTool({
      storage,
      svgRenderer: fakeRenderer(),
    })

    const r = await tool.run(
      { format: 'svg', source: SAMPLE_SVG, save_to: 'foo.jpg' },
      ctx(),
    )

    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.message).toContain('.png')
    }
  })

  it('translates renderer errors to a tool error', async () => {
    const storage = new InMemoryStorage()
    const failing: SvgRenderer = async () => {
      throw new Error('malformed SVG: unclosed tag')
    }
    const tool = createImageRenderTool({ storage, svgRenderer: failing })

    const r = await tool.run(
      { format: 'svg', source: '<svg><broken></svg>' },
      ctx(),
    )

    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.message).toContain('malformed SVG')
    }
  })

  it('rejects rendered output above the size cap', async () => {
    const storage = new InMemoryStorage()
    const oversize: SvgRenderer = async () => ({
      png: new Uint8Array(MAX_RENDERED_PNG_BYTES + 1),
      width: 1000,
      height: 1000,
    })
    const tool = createImageRenderTool({ storage, svgRenderer: oversize })

    const r = await tool.run(
      { format: 'svg', source: SAMPLE_SVG },
      ctx(),
    )

    expect(r.kind).toBe('error')
    if (r.kind === 'error') {
      expect(r.message).toMatch(/cap is/i)
    }
  })

  it('passes width through to the renderer when set', async () => {
    const storage = new InMemoryStorage()
    const spy: SvgRenderer = vi.fn(async (_svg, opts) => ({
      png: fakePng(),
      width: opts.width ?? 0,
      height: 100,
    }))
    const tool = createImageRenderTool({ storage, svgRenderer: spy })

    await tool.run(
      { format: 'svg', source: SAMPLE_SVG, width: 1600, scale: 2 },
      ctx(),
    )

    expect(spy).toHaveBeenCalledWith(
      SAMPLE_SVG,
      expect.objectContaining({ width: 1600, scale: 2 }),
    )
  })

  it('is idempotent: same input → same blob_sha (R2 will dedupe)', async () => {
    const storage = new InMemoryStorage()
    const tool = createImageRenderTool({
      storage,
      svgRenderer: fakeRenderer(7),
    })

    const r1 = await tool.run(
      { format: 'svg', source: SAMPLE_SVG },
      ctx(),
    )
    const r2 = await tool.run(
      { format: 'svg', source: SAMPLE_SVG },
      ctx(),
    )

    expect(r1.kind).toBe('success')
    expect(r2.kind).toBe('success')
    if (r1.kind === 'success' && r2.kind === 'success') {
      expect(r1.data.blob_sha).toBe(r2.data.blob_sha)
      expect(r1.data.file_path).toBe(r2.data.file_path)
    }
  })
})
