/**
 * Concrete SVG renderer backed by `@resvg/resvg-wasm`.
 *
 * Worker context only — uses the wasm module import pattern that
 * wrangler resolves at bundle time. The wasm payload (~1.2 MB) counts
 * against the worker size budget; if that becomes a problem in v2 we
 * can split rendering into a sub-worker invoked over service binding.
 *
 * Initialization is lazy + memoized: the first render in a worker
 * isolate pays the init cost (~50 ms cold), every subsequent call is
 * synchronous wasm.
 */

import { initWasm, Resvg } from '@resvg/resvg-wasm'
// @ts-expect-error — wrangler resolves .wasm imports at bundle time;
// TS doesn't know the module shape, but runtime is a WebAssembly.Module.
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm'
import type { SvgRenderer } from './svgRenderer.js'

let initPromise: Promise<void> | null = null

async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await initWasm(resvgWasm)
    })()
  }
  await initPromise
}

/**
 * Production SVG renderer. Wires into `createHuoziToolRegistry({ svgRenderer })`
 * in the Worker entry. Throws on malformed SVG; ImageRenderTool catches
 * and translates to a user-visible error.
 */
export const resvgSvgRenderer: SvgRenderer = async (svg, opts) => {
  await ensureInit()

  const fitTo = opts.width
    ? ({ mode: 'width', value: opts.width } as const)
    : ({ mode: 'zoom', value: opts.scale } as const)

  const resvg = new Resvg(svg, {
    fitTo,
    // Font fallback chain. PingFang SC is the primary CJK face; Helvetica
    // / Arial cover Latin. Without explicit fonts resvg falls back to
    // its embedded sans-serif which has no CJK coverage.
    font: {
      loadSystemFonts: false,
      defaultFontFamily: 'PingFang SC',
      sansSerifFamily: 'PingFang SC',
    },
    background: 'white',
  })

  const data = resvg.render()
  const png = data.asPng()
  const width = data.width
  const height = data.height
  data.free()
  resvg.free()

  return {
    png: new Uint8Array(png),
    width,
    height,
  }
}
