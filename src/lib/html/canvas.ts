/**
 * Author-declared "target canvas" for HTML formats that benefit from
 * fixed-pixel typography.
 *
 * Two flavors:
 *
 *   - `scale`        — story / deck / dashboard. Author writes against a
 *                       fixed W×H canvas (e.g. 1920×1080); platform renders
 *                       the canvas at its pixel dimensions and uses
 *                       `transform: scale()` to fit the display area.
 *                       Container queries inside (cqw/cqh) therefore
 *                       resolve to the canvas dims — identical across
 *                       workspace inline, fullscreen, and the public
 *                       share view.
 *
 *   - `lock-width`   — paper. Author writes against a fixed-width column
 *                       (e.g. 816px, A4 @ 96dpi). Height flows with
 *                       content; the viewer scrolls vertically. No
 *                       transform — width is shown 1:1. Mirrors
 *                       Notion / Docs / Substack reading column.
 *
 * The remaining formats (mobile / web) have NO canvas — they reflow
 * freely. resolveCanvas returns null for them and the renderer falls
 * back to the legacy flow-based sizing.
 *
 * Authors opt in to a custom canvas via:
 *
 *     <meta name="huozi:viewport" content="width:1920; height:1080">
 *
 * Omitting the meta uses the format default.
 */

import { type HuoziFormat } from "./detect-format";

export type CanvasMode = "scale" | "lock-width";

/** How a `scale`-mode canvas fits inside the display area:
 *
 *   - "contain" (deck, dashboard): the *whole* canvas is visible;
 *     letterbox bars fill the leftover axis. Use when no content can be
 *     clipped (slides, dashboards — every pixel matters).
 *
 *   - "cover" (story): the canvas fills *both* short edges; whichever
 *     long edge overshoots gets clipped. Use when the format is meant
 *     to be edge-to-edge / immersive (Instagram Stories / TikTok /
 *     Shorts). Authors should keep critical content away from the
 *     long-axis edges. */
export type CanvasFit = "contain" | "cover";

export interface CanvasSpec {
  mode: CanvasMode;
  width: number;
  /** Required when mode === "scale"; `null` for `lock-width` (height
   *  flows with content). */
  height: number | null;
  /** Defaults to "contain" for scale-mode canvases. story flips to
   *  "cover" by default. Ignored for `lock-width`. */
  fit?: CanvasFit;
  /** Background color painted on the canvas-outer wrapper. Bleeds the
   *  canvas's own background out to the edges of whatever box the
   *  platform gives it (workspace inline embed slot, fullscreen
   *  viewport, share view), so dark/branded canvases don't leave a
   *  cream/white seam on the screen.
   *
   *  Resolution order:
   *    1. `<meta name="huozi:background" content="#1b1410">` (author)
   *    2. format default (story → #000, deck → #000, others → undefined)
   *    3. undefined → outer stays transparent (app theme shows through)
   */
  background?: string;
}

/** Defaults aligned with the contexts authors actually design against:
 *
 *   - story     → 390 × 844    (iPhone 14 CSS-pixel viewport; matches
 *                               Figma / Tailwind mobile-first conventions.)
 *   - deck      → 1920 × 1080  (1080p — current default in Keynote,
 *                               modern PowerPoint, Google Slides.)
 *   - dashboard → 2560 × 1440  (QHD 16:9 — meeting-room / ops big screens.)
 *   - paper     → 816 × auto   (A4 / US Letter × 96dpi standard width.
 *                               Word, Pages, LibreOffice all default here.
 *                               Height is content-driven.)
 *
 * Long-flow formats (mobile / web) intentionally have no canvas — their
 * typography is meant to reflow, not lock. */
const DEFAULTS: Partial<Record<HuoziFormat, CanvasSpec>> = {
  // story is short-form immersive (Reels / TikTok / Shorts style) —
  // default to "cover" so the canvas fills the short edge of the
  // device, eliminating letterbox padding. The author's safe-area
  // guidance is to keep crucial content in the center 80%.
  story: {
    mode: "scale",
    width: 390,
    height: 844,
    fit: "cover",
    background: "#000",
  },
  // deck is presentation-mode — every slide pixel matters. "contain"
  // preserves the whole 1920×1080 surface, letterboxing onto black.
  deck: {
    mode: "scale",
    width: 1920,
    height: 1080,
    fit: "contain",
    background: "#000",
  },
  // Dashboard + paper deliberately stay transparent so the app theme
  // (workspace shell / share container) flows around them naturally —
  // they're reading surfaces, not cinematic stages.
  dashboard: { mode: "scale", width: 2560, height: 1440, fit: "contain" },
  paper: { mode: "lock-width", width: 816, height: null },
};

interface ViewportMeta {
  width?: number;
  height?: number;
  aspectRatio?: string;
}

function parseViewportMeta(html: string): ViewportMeta | null {
  const m = html.match(
    /<meta\s+name=["']huozi:viewport["']\s+content=["']([^"']+)["']/i,
  );
  if (!m) return null;
  const out: ViewportMeta = {};
  for (const part of m[1].split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (!k || !v) continue;
    if (k === "width") {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) out.width = n;
    } else if (k === "height") {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) out.height = n;
    } else if (k === "aspect-ratio") {
      out.aspectRatio = v;
    }
  }
  return out;
}

/** Author-declared bleed color, applied to the canvas-outer wrapper so
 *  the canvas's own background extends out to whatever box the platform
 *  gives it. Looks for a dedicated meta tag:
 *
 *     <meta name="huozi:background" content="#1b1410">
 *
 *  Returns null when missing. Caller falls back to the format default. */
function parseBackgroundMeta(html: string): string | null {
  const m = html.match(
    /<meta\s+name=["']huozi:background["']\s+content=["']([^"']+)["']/i,
  );
  if (!m) return null;
  const v = m[1].trim();
  return v.length > 0 ? v : null;
}

/** Author-declared fit preference (`contain` | `cover`):
 *
 *     <meta name="huozi:fit" content="cover">
 *
 *  Returns null on missing or invalid value. Caller falls back to the
 *  format default. */
function parseFitMeta(html: string): CanvasFit | null {
  const m = html.match(
    /<meta\s+name=["']huozi:fit["']\s+content=["']([^"']+)["']/i,
  );
  if (!m) return null;
  const v = m[1].trim().toLowerCase();
  return v === "contain" || v === "cover" ? v : null;
}

function parseAspectRatio(s: string): number | null {
  // Accept "16/9", "16:9", or a bare decimal like "1.7778".
  const slash = s.match(/^\s*(\d+(?:\.\d+)?)\s*[\/:]\s*(\d+(?:\.\d+)?)\s*$/);
  if (slash) {
    const a = parseFloat(slash[1]);
    const b = parseFloat(slash[2]);
    if (a > 0 && b > 0) return a / b;
    return null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve the target canvas for an HTML file.
 *
 * Returns `null` for formats without a canvas (mobile / web). For
 * canvas formats, resolution order:
 *
 *   1. Explicit `width` + `height` from `<meta huozi:viewport>` (scale mode)
 *      or just `width` (lock-width mode, height ignored).
 *   2. `width` + aspect-ratio → compute height (scale mode only).
 *   3. `height` + aspect-ratio → compute width (scale mode only).
 *   4. Format default canvas from `DEFAULTS`.
 *
 * For lock-width formats (paper), only `width` matters; meta `height`
 * is ignored because the format flows vertically.
 */
export function resolveCanvas(
  html: string,
  format: HuoziFormat,
): CanvasSpec | null {
  const fallback = DEFAULTS[format];
  if (!fallback) return null;

  // Author-declared overrides take precedence over format defaults.
  // Resolve them once and stamp onto every return path so callers don't
  // have to remember to thread each one through.
  const bg = parseBackgroundMeta(html) ?? fallback.background;
  const fit = parseFitMeta(html) ?? fallback.fit ?? "contain";

  const meta = parseViewportMeta(html);
  if (!meta) return { ...fallback, background: bg, fit };

  if (fallback.mode === "lock-width") {
    return {
      mode: "lock-width",
      width: meta.width ?? fallback.width,
      height: null,
      background: bg,
    };
  }

  // scale mode
  const ar = meta.aspectRatio ? parseAspectRatio(meta.aspectRatio) : null;
  if (meta.width && meta.height) {
    return { mode: "scale", width: meta.width, height: meta.height, background: bg, fit };
  }
  if (meta.width && ar) {
    return { mode: "scale", width: meta.width, height: meta.width / ar, background: bg, fit };
  }
  if (meta.height && ar) {
    return { mode: "scale", width: meta.height * ar, height: meta.height, background: bg, fit };
  }
  // Partial meta without enough to derive a canvas — fall back to default.
  return { ...fallback, background: bg, fit };
}

/** True for formats that have any canvas treatment (scale OR lock-width).
 *  Useful for callers that just want to know "should I wrap this in a
 *  stage component?" without caring about the flavor. */
export function isCanvasFormat(format: HuoziFormat): boolean {
  return DEFAULTS[format] !== undefined;
}
