import { TEMPLATES, TEMPLATE_FORMATS } from './templates.js'

export const TEMPLATE_TOOL_NAME = 'huozi_template'
export const TEMPLATE_TOOL_USER_FACING_NAME = 'Template'

/**
 * Single-page contract description for huozi_template.
 *
 * Two roles this prompt plays:
 *  1. Tell the agent the *format taxonomy* and what each one is for, so
 *     it picks correctly instead of guessing.
 *  2. Tell the agent the *typography contract* — that the platform
 *     gives every canvas format a fixed target W×H and scales it to fit
 *     whatever viewport / embed / share surface it lands on. The agent
 *     just writes for the target; the platform absorbs the rest. This
 *     promise is what makes container queries (cqw / cqh) sized
 *     stably across all three render modes.
 */
export function templatePrompt(): string {
  const lines: string[] = [
    'Fetch one of the huozi standard layout ("版") templates as a self-contained HTML scaffold.',
    '',
    'Use this BEFORE generating an HTML file for huozi_write + huozi_share.',
    'The returned `body` is a complete <!doctype html> document with all CSS',
    'inlined; fill in placeholder content inside <body>, leave the <style>',
    'block alone unless you intentionally need to override.',
    '',
    'Formats:',
  ]
  for (const f of TEMPLATE_FORMATS) {
    const meta = TEMPLATES[f]
    lines.push(`  - ${f.padEnd(6)} (${meta.shape}) — ${meta.description}`)
  }
  lines.push(
    '  - dashboard (16:9, 2560×1440 canvas) — Big-screen ops surface with',
    '    [data-tab] sections + optional refresh interval. No scaffold yet;',
    '    author writes directly. Use `huozi:format=dashboard` in <head>.',
    '',
    'Picking a format — pick by content intent:',
    '  • pitch slides / talk             → deck',
    '  • short-form / phone / reel / story → story',
    '  • monitoring / KPIs / live data    → dashboard',
    '  • printable report / letter / spec → paper',
    '  • article / landing / essay        → blog (default for unmarked HTML)',
    '',
    'If the user has not chosen a format, ASK. Do not guess silently.',
    '',
    'Format family + sizing model:',
    '',
    '  Canvas formats (deck / story / dashboard):',
    '    The platform renders these at a fixed pixel canvas and scales it',
    '    to fit the display area (workspace inline, fullscreen, public',
    '    share view). Container queries inside (cqw / cqh) therefore',
    '    resolve to the CANVAS dimensions — identical across all three',
    '    render modes. Write typography assuming:',
    '      deck:      1920 × 1080  (4cqw ≈ 76.8px before clamp)',
    '      story:      390 ×  844  (4cqw ≈ 15.6px before clamp)',
    '      dashboard: 2560 × 1440  (4cqw ≈ 102px  before clamp)',
    '    deck + dashboard use FIT=contain (whole canvas visible, letterbox',
    '    on the leftover axis). story uses FIT=cover (canvas fills both',
    '    short edges of the device; the longer axis may clip a few pixels).',
    '    For story, keep critical content within the center 80% safe area —',
    '    edges may be trimmed on extreme aspect ratios.',
    '',
    '  Lock-width formats (paper):',
    '    Width is locked (816px / A4 @ 96dpi); height flows with content;',
    '    the viewer scrolls vertically. No transform — pages render 1:1 at',
    '    the locked width, centered. Think Notion / Docs / Substack column,',
    '    not Acrobat per-page-zoom.',
    '',
    '  Free-flow formats (blog):',
    '    Plain responsive HTML. Author owns the @media queries. The',
    '    platform does NOT scale or letterbox. cqw is unstable across',
    '    modes here — use rem / fluid clamp() if you need responsive type.',
    '',
    'Paginated formats (deck / story / paper) carry [data-page] markers:',
    '  <section data-page id="sN" data-title="…"> (or <article> for paper).',
    '  huozi reads these to build the outline + pager + share-card.',
    '',
    'Every template ships with `<meta name="huozi:format" content="X">` in',
    '<head>. Preserve it. Removing it falls back to `blog` (long scroll,',
    'no pager).',
    '',
    'Author-side overrides — set these in <head> to customise behaviour',
    'per file (sane defaults apply when omitted):',
    '',
    '  <meta name="huozi:viewport"   content="width:1280; height:720">',
    '    Override the canvas pixel dims for deck/story/dashboard, or the',
    '    locked column width for paper. Also accepts aspect-ratio:16/9.',
    '',
    '  <meta name="huozi:fit"        content="contain|cover">',
    '    Override default fit. story defaults cover; others default contain.',
    '',
    '  <meta name="huozi:background" content="#1b1410">',
    '    Color painted on the canvas-outer wrapper, bleeding the canvas',
    '    background out to the edges of the display surround. story / deck',
    '    default to #000; dashboard / paper / blog default transparent',
    '    (app theme shows through).',
    '',
    'Host background — the embed host (.huozi-html-host) is transparent',
    'by default, so the workspace theme / fullscreen wrapper / share shell',
    'bleeds through. To paint a host-level bleed colour yourself, set',
    '`background` on `html`, `body`, or `:root` in your <style> — the',
    'sanitizer rewrites those selectors to the host element so your colour',
    'covers the full embed surface uniformly across all three render modes.',
    'For canvas formats (deck/story/dashboard) the `huozi:background` meta',
    'above does the same job on the canvas-outer wrapper.',
    '',
    'Workflow:',
    '  1. huozi_template({ format: "deck" })  ← pick from { blog, deck, story, paper }',
    '  2. Fill placeholder content inside <body>; leave <style> as-is.',
    '  3. huozi_write({ file_path, content })',
    '  4. huozi_share({ file_path }) → returns the public URL.',
    '',
    'Deprecated: `mobile` and `web` formats were collapsed into `blog`',
    'on 2026-05-22. Files still declaring `huozi:format="mobile"` or',
    '`"web"` render correctly but the validator flags the meta as',
    'outdated — update on the next save.',
  )
  return lines.join('\n')
}
