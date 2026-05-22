/**
 * Catalog of HTML validation rules — single source of truth for what
 * the platform expects from agent-authored content.
 *
 * Worker-side mirror of app/src/lib/html/validate-rules.ts. The two
 * trees can't share modules directly (separate package boundary), so
 * KEEP IN SYNC by hand when a rule is added or tightened.
 *
 * Severity contract:
 *   - **error**: write WILL produce broken render. WriteTool gates on
 *     these (errors refuse the write).
 *   - **warning**: write succeeds; result probably isn't what the
 *     author intended. Returned to the agent so the next pass can fix.
 *   - **hint**: best-practice nudge. Pure FYI; agents can ignore.
 */

export type ValidationLevel = 'error' | 'warning' | 'hint'

export type HuoziFormat = 'deck' | 'story' | 'paper' | 'dashboard' | 'blog'

export interface ValidationRule {
  code: string
  level: ValidationLevel
  title: string
  why: string
  remedy: string
  docRef?: string
  appliesTo?: HuoziFormat[]
}

export const VALIDATION_RULES: ValidationRule[] = [
  // Format declaration
  {
    code: 'format-deprecated',
    level: 'error',
    title: 'huozi:format is a deprecated value',
    why: '`mobile` and `web` were collapsed into `blog` on 2026-05-22. The renderer aliases them at runtime, but agents writing fresh files should use the canonical name.',
    remedy:
      'Set `<meta name="huozi:format" content="blog">`. blog is the responsive long-form format that covers both phone and desktop.',
    docRef: 'norms#1-format-types',
  },
  {
    code: 'format-unknown',
    level: 'error',
    title: 'huozi:format value is not a known format',
    why: 'The platform only knows 5 formats: deck / story / paper / dashboard / blog. Unknown values degrade silently to blog, which is rarely what the author meant.',
    remedy:
      'Pick one: deck (16:9 slides), story (9:16 immersive), paper (A4-width document), dashboard (16:9 ops surface with [data-tab]), blog (responsive long-form).',
    docRef: 'norms#1-format-types',
  },
  {
    code: 'format-meta-class-mismatch',
    level: 'warning',
    title: 'huozi:format meta disagrees with the body root class',
    why: "Meta is authoritative (renders to the format the meta declares), but the file's CSS targets the *class*. If they disagree, the layout CSS won't match what the platform renders.",
    remedy:
      'Align the two: pick one format and update both the meta and the `<div class="huozi-X">` wrapper.',
    docRef: 'norms#1-3-format-declaration',
  },
  {
    code: 'format-meta-missing',
    level: 'hint',
    title: 'huozi:format meta is not declared',
    why: 'Class-sniffing on the body root works as a legacy fallback, but the meta tag is the authoritative declaration. Explicit > implicit; future tooling may stop sniffing.',
    remedy:
      'Add `<meta name="huozi:format" content="X">` in <head> where X matches your `huozi-X` class.',
    docRef: 'norms#1-3-format-declaration',
  },

  // Paginated structure
  {
    code: 'paginated-no-pages',
    level: 'error',
    title: 'Paginated format has no <section data-page> markers',
    why: "deck / story / paper need [data-page] sections to power the pager and outline menu. Without them the file is a single un-navigable scroll, and the platform's slide chrome can't function.",
    remedy:
      'Wrap each slide / page in `<section data-page id="sN" data-title="Page title">`.',
    docRef: 'norms#2-page-marker',
    appliesTo: ['deck', 'story', 'paper'],
  },
  {
    code: 'page-id-duplicate',
    level: 'error',
    title: 'Two or more <section data-page> share the same id',
    why: 'Anchor navigation (#sN) and the outline menu use the id to jump to a page. Duplicate ids mean the second occurrence is unreachable.',
    remedy:
      'Give each data-page a unique id, or leave id off entirely (the platform will auto-assign).',
    docRef: 'norms#2-page-marker',
    appliesTo: ['deck', 'story', 'paper'],
  },
  {
    code: 'data-title-missing',
    level: 'hint',
    title: '<section data-page> has no data-title attribute',
    why: "The outline menu's labels fall back to the page's first heading. data-title lets you give a cleaner label that the outline shows regardless of how the slide is structured internally.",
    remedy: 'Add `data-title="…"` to each <section data-page>.',
    docRef: 'norms#2-page-marker',
    appliesTo: ['deck', 'story', 'paper'],
  },

  // Sandbox / strip rules
  {
    code: 'external-script-blocked',
    level: 'warning',
    title: '<script src="https://…"> will be stripped',
    why: "The publish surface sanitizer drops all external <script> tags. JavaScript via CDN won't run for share viewers, so anything that depends on the library will silently fail.",
    remedy:
      'For known libraries (mermaid, echarts, etc.) declare `<meta name="huozi:bundle" content="mermaid,echarts">` — the platform injects them in a sandbox-aware way.',
    docRef: 'toolbox-spec#3-2-author-constraints',
  },
  {
    code: 'inline-script-blocked',
    level: 'warning',
    title: 'Inline <script> blocks will be stripped',
    why: "Same as external scripts — the sanitizer strips ALL <script>, inline or external. JS-driven interactivity won't reach the share viewer.",
    remedy:
      'Move logic into platform-provided bundles (huozi:bundle) or restructure as static CSS-only behavior.',
    docRef: 'toolbox-spec#3-2-author-constraints',
  },
  {
    code: 'iframe-or-embed-stripped',
    level: 'warning',
    title: '<iframe> / <embed> / <object> will be stripped',
    why: "Cross-origin embeds aren't allowed in the publish sandbox. They're removed entirely, leaving holes where the embed used to be.",
    remedy:
      'Replace with native HTML/CSS, screenshot+link, or platform-supported bundles.',
    docRef: 'toolbox-spec#3-2-author-constraints',
  },
  {
    code: 'bundle-unknown-key',
    level: 'warning',
    title: 'huozi:bundle declares an unknown library key',
    why: "Only the bundle keys registered in the platform's asset registry will be injected. Typos or unsupported libs silently fail.",
    remedy:
      "Check the supported list and fix the typo, or drop the key and inline the library yourself if it's small.",
    docRef: 'toolbox-spec#2-bundles',
  },

  // Geometry / scaling hygiene
  {
    code: 'vw-vh-in-paginated',
    level: 'warning',
    title: 'vw / vh units inside a paginated format',
    why: 'The platform renders deck / story / dashboard at a fixed pixel canvas and uses `transform: scale()` to fit the viewport. vw/vh units are computed against the viewport, NOT the canvas — so they break proportionality and read differently across embed / fullscreen / share.',
    remedy:
      "Use cqw / cqh instead. The platform sets `container-type: size` on the canvas root; cqw / cqh resolve to the canvas's pixel dimensions, identical across all three render modes.",
    docRef: 'norms#4-canvas-units',
    appliesTo: ['deck', 'story', 'dashboard'],
  },

  // Metadata / share card
  {
    code: 'title-missing',
    level: 'hint',
    title: 'No <title> tag in <head>',
    why: 'Browser tab labels and link previews use <title>. Without it, shares display the URL slug.',
    remedy: 'Add `<title>Your title</title>` in <head>.',
    docRef: 'norms#5-share-card',
  },
  {
    code: 'og-image-missing',
    level: 'hint',
    title: 'No og:image meta tag',
    why: 'Social-card previews on Twitter / Mastodon / iMessage etc. need og:image (or twitter:image). Without it the platform falls back to a generic huozi card.',
    remedy:
      'Add `<meta property="og:image" content="https://…">` or leave blank to use the huozi default.',
    docRef: 'norms#5-share-card',
  },
]

export function getRule(code: string): ValidationRule | null {
  return VALIDATION_RULES.find((r) => r.code === code) ?? null
}

export function listValidationRules(): ValidationRule[] {
  return VALIDATION_RULES.map((r) => ({ ...r }))
}
