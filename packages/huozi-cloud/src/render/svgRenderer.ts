/**
 * SVG → PNG renderer.
 *
 * Pure interface so tests can inject a fake renderer. The concrete
 * Worker-side implementation in `svgRendererResvg.ts` uses
 * `@resvg/resvg-wasm` and is loaded lazily — keeping this file free of
 * heavy imports lets the tool layer stay testable without WASM init.
 */

export interface SvgRenderOptions {
  /**
   * Output pixel width. If omitted, the renderer falls back to the
   * SVG's intrinsic width (from viewBox / width attribute) × scale.
   */
  width?: number
  /**
   * Pixel ratio. 1 = no upscale, 2 = retina, 3 = ultra. Applied only
   * when `width` is omitted; when an explicit `width` is provided
   * `scale` is ignored to avoid surprise multiplication.
   */
  scale: 1 | 2 | 3
}

export interface SvgRenderResult {
  png: Uint8Array
  width: number
  height: number
}

/**
 * Render SVG markup to PNG bytes. May throw on malformed SVG. Callers
 * are expected to catch and translate to ToolResult error.
 */
export type SvgRenderer = (
  svg: string,
  opts: SvgRenderOptions,
) => Promise<SvgRenderResult>
