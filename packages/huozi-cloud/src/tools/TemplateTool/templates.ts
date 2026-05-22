/**
 * The 4 huozi standard layout ("版") templates surfaced via huozi_template.
 *
 * Each is a self-contained, single-file HTML scaffold the agent fills with
 * content before publishing via huozi_share. Inlined here as `const` strings
 * so they ship with the Worker bundle — no runtime asset loading required.
 * This file is the canonical source; edits land here directly.
 *
 * Format taxonomy (mirrors HuoziFormat):
 *
 *   Canvas formats (platform scales to fit):
 *     - deck       16:9 horizontal slides, contain-fit, 1920×1080 canvas
 *     - story       9:16 vertical immersive, cover-fit, 390×844 canvas
 *     - dashboard  16:9 ops surface (no scaffold yet — author writes directly)
 *
 *   Lock-width formats (platform locks the column, content flows vertically):
 *     - paper      816×auto, US Letter / A4 column for printable reports
 *
 *   Free-flow formats:
 *     - blog       responsive long-form; adapts to phone + desktop
 *                  via the template's own @media queries.
 *
 *   (Deprecated: `mobile` and `web` collapsed into `blog` 2026-05-22.)
 *
 * Design constraints:
 *   - Pure CSS (no JS) — the publish surface strips <script>.
 *   - All styles inlined in <style> — no @import, no external links.
 *   - Class names prefixed `huozi-{format}-` to avoid global CSS collision.
 *   - Container queries (cqw / cqh) for self-scaling slide stages instead
 *     of JS-driven transform: scale().
 *
 * Multi-page (deck / story / paper) framework:
 *   - Each page unit has an id (`s1`, `s2` for slides; `p1`, `p2` for paper).
 *   - A right-side fixed `.pages-menu` <nav> lists `<a href="#sN">` links
 *     1:1 with the page units. Same screen position across all 3 formats.
 *   - deck/story use scroll-snap (x/y) for swipe + key navigation. paper uses
 *     plain smooth-scroll anchor jumps (A4 pages can exceed viewport).
 *   - No current-page highlight: tracking the user's scroll position needs
 *     IntersectionObserver, which the sanitizer strips. Position feedback
 *     comes from the scroll itself.
 *   - Print: pages-menu is hidden in @media print.
 */

// Order: 1 free-flow (blog) then 3 paginated (deck / story / paper).
// Paginated formats include [data-page] markers + outline + pager chrome.
// `blog` is the catch-all default — the publish view treats unmarked HTML
// as `blog` too.
export const TEMPLATE_FORMATS = [
  'blog',
  'deck',
  'story',
  'paper',
] as const

export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]

/** Subset that has [data-page] outline structure. Drives pager + outline UX. */
export const PAGINATED_FORMATS: ReadonlySet<TemplateFormat> = new Set<TemplateFormat>([
  'deck',
  'story',
  'paper',
])

export function isPaginated(format: TemplateFormat): boolean {
  return PAGINATED_FORMATS.has(format)
}

export interface TemplateMeta {
  format: TemplateFormat
  /** One-line description for tool prompt + initialize instructions. */
  description: string
  /** Aspect ratio or page-size hint, for human-readable output. */
  shape: string
  body: string
}

const DECK_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="huozi:format" content="deck">
<meta name="huozi:viewport" content="aspect-ratio:16/9">
<!-- Card / OG meta — fill before publishing. og:image is optional;
     leave blank to use the huozi default banner. -->
<title>Untitled</title>
<meta name="description" content="">
<meta property="og:title" content="">
<meta property="og:description" content="">
<meta property="og:type" content="article">
<meta property="og:image" content="">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{
  --color-bg:#ffffff;
  --color-fg:#111111;
  --color-muted:#6b7280;
  --color-accent:#0066ff;
  --color-border:#e5e7eb;
  --font-sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;
  --font-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
.huozi-deck{
  margin:0;
  background:#000;
  width:100vw;
  height:100vh;
  font-family:var(--font-sans);
  -webkit-font-smoothing:antialiased;
  position:relative;
  /* Container queries scope slide sizing (cqh/cqw) to .huozi-deck.
     transform makes .huozi-deck the containing block for fixed children
     (the menu) so the menu floats at .huozi-deck's edge — viewport edge
     in published view, embed edge in workspace inline preview. */
  container-type:size;
  transform:translateZ(0);
}
.huozi-deck .slides{
  display:flex;
  flex-direction:row;
  height:100cqh;
  overflow-x:auto;
  overflow-y:hidden;
  scroll-snap-type:x mandatory;
  scroll-behavior:smooth;
  scrollbar-width:none;
}
.huozi-deck .slides::-webkit-scrollbar{display:none}
.huozi-deck .slide{
  flex:0 0 100cqw;
  height:100cqh;
  scroll-snap-align:start;
  scroll-snap-stop:always;
  display:grid;
  place-items:center;
}
.huozi-deck .stage{
  aspect-ratio:16/9;
  width:min(100cqw, calc(100cqh * 16 / 9));
  height:min(100cqh, calc(100cqw * 9 / 16));
  background:var(--color-bg);
  color:var(--color-fg);
  container-type:size;
  overflow:hidden;
  padding:5cqh 6cqw;
  font-size:clamp(14px, 2.4cqw, 32px);
  line-height:1.4;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  justify-content:center;
  position:relative;
}
.huozi-deck .stage h1{font-size:5.5cqw; margin:0 0 .4em; letter-spacing:-.02em; line-height:1.1}
.huozi-deck .stage h2{font-size:3.4cqw; margin:0 0 .5em; color:var(--color-accent); font-weight:600}
.huozi-deck .stage h3{font-size:2.6cqw; margin:0 0 .4em; font-weight:600}
.huozi-deck .stage p{margin:0 0 .8em}
.huozi-deck .stage ul,.huozi-deck .stage ol{margin:0 0 .8em; padding-left:1.2em}
.huozi-deck .stage li{margin-bottom:.3em}
.huozi-deck .stage code{font-family:var(--font-mono); background:var(--color-border); padding:.1em .3em; border-radius:.2em; font-size:.9em}
.huozi-deck .stage .muted{color:var(--color-muted)}
.huozi-deck .stage .footer{position:absolute; bottom:3cqh; right:6cqw; font-size:1.4cqw; color:var(--color-muted)}
/* Auto-landscape on portrait phones — opt-in via [data-huozi-rotate-portrait]
   on an ancestor. A 16:9 deck squashed into 9:16 is unreadable, so when the
   host explicitly opts in (publish view, workspace fullscreen) we rotate.
   Workspace inline preview deliberately does NOT opt in: it shows the deck
   in its embed-sized 16:9 frame, no surprise rotation. Vertical finger
   swipe maps to horizontal slide advance (.slides scroll axis points down
   on screen after rotation). */
@media (max-width:767px) and (orientation:portrait){
  /* !important here is load-bearing: workspace fullscreen sets
     [&_.huozi-deck]:!w-full !h-full on the host wrapper to force the deck
     to fill its embed in inline preview, but those !important rules would
     otherwise pin the deck at 100vw x 100vh and break rotation. We need to
     win the cascade so the rotated geometry is the actual layout box. */
  [data-huozi-rotate-portrait] .huozi-deck{
    width:100vh !important;
    height:100vw !important;
    transform:rotate(90deg) translateY(-100vw) !important;
    transform-origin:top left !important;
  }
  [data-huozi-rotate-portrait]{overflow:hidden}
}
@media print{
  .huozi-deck{background:#fff; width:auto; height:auto; min-height:auto; transform:none; container-type:normal}
  .huozi-deck .slides{display:block; height:auto; overflow:visible}
  .huozi-deck .slide{width:100%; height:100vh; display:block; page-break-after:always}
  .huozi-deck .stage{width:100%; height:100vh; aspect-ratio:auto}
  @page{size:landscape; margin:0}
}
</style>
</head>
<body>
<!--
  Multi-page contract (huozi outline):
    - Each slide = <section class="slide" id="sN" data-page data-title="…">
                     <div class="stage">…</div>
                   </section>
    - data-page  → marker that this is a page
    - id         → anchor target (#sN); also referenced by huozi outline
    - data-title → label shown in the huozi outline (falls back to the
                   first <h1>/<h2>/<h3>, then "Page N")

  No menu HTML inside this file — huozi (workspace + /p/<slug>) renders a
  unified outline by scanning [data-page]. Add a slide = append one section.
-->
<div class="huozi-deck">
  <div class="slides">
    <section class="slide" id="s1" data-page data-title="封面">
      <div class="stage">
        <h1>标题占位</h1>
        <p class="muted">副标题或日期</p>
      </div>
    </section>
    <section class="slide" id="s2" data-page data-title="第二页">
      <div class="stage">
        <h2>第二页占位</h2>
        <p>横向 swipe / 滚动 / 方向键都能切换;huozi 会渲染右侧分页菜单。</p>
      </div>
    </section>
  </div>
</div>
</body>
</html>
`

const STORY_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="huozi:format" content="story">
<meta name="huozi:viewport" content="aspect-ratio:9/16; max-width:360px">
<!-- Card / OG meta — fill before publishing. og:image is optional;
     leave blank to use the huozi default banner. -->
<title>Untitled</title>
<meta name="description" content="">
<meta property="og:title" content="">
<meta property="og:description" content="">
<meta property="og:type" content="article">
<meta property="og:image" content="">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{
  --color-bg:#0f0f10;
  --color-fg:#fafafa;
  --color-muted:#a1a1aa;
  --color-accent:#ff5577;
  --color-border:#27272a;
  --font-sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;
}
.huozi-story{
  margin:0;
  background:#000;
  width:100vw;
  height:100vh;
  font-family:var(--font-sans);
  -webkit-font-smoothing:antialiased;
  position:relative;
  /* See deck for container/transform rationale. */
  container-type:size;
  transform:translateZ(0);
}
.huozi-story .slides{
  display:flex;
  flex-direction:column;
  height:100cqh;
  overflow-x:hidden;
  overflow-y:auto;
  scroll-snap-type:y mandatory;
  scroll-behavior:smooth;
  scrollbar-width:none;
}
.huozi-story .slides::-webkit-scrollbar{display:none}
.huozi-story .slide{
  flex:0 0 100cqh;
  height:100cqh;
  scroll-snap-align:start;
  scroll-snap-stop:always;
  display:grid;
  place-items:center;
}
.huozi-story .stage{
  aspect-ratio:9/16;
  width:min(100cqw, calc(100cqh * 9 / 16));
  height:min(100cqh, calc(100cqw * 16 / 9));
  background:var(--color-bg);
  color:var(--color-fg);
  container-type:size;
  overflow:hidden;
  padding:10cqh 7cqw;
  font-size:clamp(14px, 4.2cqw, 28px);
  line-height:1.45;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  justify-content:center;
  position:relative;
}
.huozi-story .stage h1{font-size:10cqw; margin:0 0 .35em; letter-spacing:-.02em; line-height:1.05; font-weight:800}
.huozi-story .stage h2{font-size:5.5cqw; margin:0 0 .4em; color:var(--color-accent); font-weight:600}
.huozi-story .stage p{margin:0 0 .8em}
.huozi-story .stage ul{margin:0 0 .8em; padding-left:1.2em}
.huozi-story .stage li{margin-bottom:.4em}
.huozi-story .stage .muted{color:var(--color-muted)}
.huozi-story .stage .pill{display:inline-block; padding:.4em .9em; border:1px solid var(--color-border); border-radius:999px; font-size:.85em; color:var(--color-muted); margin-bottom:1em}
.huozi-story .stage .footer{position:absolute; bottom:5cqh; left:7cqw; right:7cqw; font-size:3cqw; color:var(--color-muted); text-align:center}
</style>
</head>
<body>
<!--
  Multi-page contract (huozi outline):
    - Each slide = <section class="slide" id="sN" data-page data-title="…">
                     <div class="stage">…</div>
                   </section>
    - data-page  → marker that this is a page
    - data-title → label shown in the huozi outline

  No menu HTML inside this file — huozi renders a unified right-side
  outline by scanning [data-page]. Add a slide = append one section.
-->
<div class="huozi-story">
  <div class="slides">
    <section class="slide" id="s1" data-page data-title="标签">
      <div class="stage">
        <span class="pill">标签</span>
        <h1>竖屏大标题</h1>
        <p class="muted">一句副文本</p>
      </div>
    </section>
    <section class="slide" id="s2" data-page data-title="第二屏">
      <div class="stage">
        <h2>第二屏</h2>
        <p>纵向 swipe / 滚动 / 方向键都能切换;huozi 会渲染右侧分页菜单。</p>
      </div>
    </section>
  </div>
</div>
</body>
</html>
`

const PAPER_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="huozi:format" content="paper">
<meta name="huozi:viewport" content="max-height:80vh">
<!-- Card / OG meta — fill before publishing. og:image is optional;
     leave blank to use the huozi default banner. -->
<title>Untitled</title>
<meta name="description" content="">
<meta property="og:title" content="">
<meta property="og:description" content="">
<meta property="og:type" content="article">
<meta property="og:image" content="">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{
  --color-bg:#ffffff;
  --color-fg:#1a1a1a;
  --color-muted:#666666;
  --color-accent:#000000;
  --color-border:#d4d4d8;
  --font-serif:Georgia,"Times New Roman","Songti SC","SimSun",ui-serif,serif;
  --font-sans:ui-sans-serif,system-ui,-apple-system,"PingFang SC","Hiragino Sans GB",sans-serif;
  --font-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
.huozi-paper{
  margin:0;
  background:#e5e5e5;
  font-family:var(--font-serif);
  color:var(--color-fg);
  -webkit-font-smoothing:antialiased;
  padding:32px 16px;
  scroll-behavior:smooth;
  /* inline-size container so the @container queries below can hide the
     fixed-position menu in narrow embeds (e.g. workspace inline preview)
     without affecting the published full-window view. */
  container-type:inline-size;
}
.huozi-paper .page{
  width:210mm;
  max-width:100%;
  min-height:297mm;
  margin:0 auto;
  background:var(--color-bg);
  padding:25mm 22mm;
  box-shadow:0 4px 24px rgba(0,0,0,.08);
  font-size:11pt;
  line-height:1.65;
  box-sizing:border-box;
  scroll-margin-top:24px;
}
.huozi-paper .page + .page{margin-top:24px}
.huozi-paper h1{font-size:22pt; margin:0 0 .4em; letter-spacing:-.01em; line-height:1.2; font-weight:700}
.huozi-paper h2{font-size:15pt; margin:1.4em 0 .4em; font-weight:600}
.huozi-paper h3{font-size:12pt; margin:1.1em 0 .3em; font-weight:600}
.huozi-paper p{margin:0 0 .8em; text-align:justify; hyphens:auto}
.huozi-paper ul,.huozi-paper ol{margin:0 0 .8em; padding-left:1.4em}
.huozi-paper li{margin-bottom:.25em}
.huozi-paper code{font-family:var(--font-mono); background:#f4f4f5; padding:.1em .3em; border-radius:.2em; font-size:.92em}
.huozi-paper hr{border:0; border-top:1px solid var(--color-border); margin:1.6em 0}
.huozi-paper .muted{color:var(--color-muted)}
.huozi-paper .meta{font-family:var(--font-sans); color:var(--color-muted); font-size:10pt; margin-bottom:1.5em}
.huozi-paper table{width:100%; border-collapse:collapse; margin:0 0 1em}
.huozi-paper th,.huozi-paper td{border-bottom:1px solid var(--color-border); padding:.5em .6em; text-align:left}
.huozi-paper th{font-weight:600}
@page{size:A4; margin:0}
@media print{
  .huozi-paper{background:#fff; padding:0; container-type:normal}
  .huozi-paper .page{box-shadow:none; margin:0; width:210mm; min-height:297mm; page-break-after:always}
}
</style>
</head>
<body>
<!--
  Multi-page contract (huozi outline):
    - Each page = <article class="page" id="pN" data-page data-title="章节名">…</article>
    - data-page  → marker that this is a page
    - data-title → label shown in the huozi outline (else first heading)

  No menu HTML inside this file — huozi renders a unified right-side
  outline by scanning [data-page]. Pages may exceed one viewport (A4
  portrait); huozi uses smooth-scroll anchor jumps, no scroll-snap.
-->
<div class="huozi-paper">
  <article class="page" id="p1" data-page data-title="封面">
    <h1>文档标题</h1>
    <p class="meta">作者 · 日期</p>
    <hr>
    <h2>章节</h2>
    <p>正文段落…</p>
  </article>
  <article class="page" id="p2" data-page data-title="第二页">
    <h2>第二页</h2>
    <p>新增页:复制一个 <code>&lt;article class="page" id="pN" data-page data-title="标题"&gt;…&lt;/article&gt;</code>。huozi 会自动列入右侧分页菜单。</p>
  </article>
</div>
</body>
</html>
`

const BLOG_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="huozi:format" content="blog">
<!-- Card / OG meta — fill before publishing. og:image is optional;
     leave blank to use the huozi default banner. -->
<title>Untitled</title>
<meta name="description" content="">
<meta property="og:title" content="">
<meta property="og:description" content="">
<meta property="og:type" content="article">
<meta property="og:image" content="">
<meta name="twitter:card" content="summary_large_image">
<style>
:root{
  --color-bg:#ffffff;
  --color-fg:#111111;
  --color-muted:#6b7280;
  --color-accent:#0066ff;
  --color-border:#e5e7eb;
  --font-sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;
  --font-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
.huozi-blog{
  margin:0;
  background:var(--color-bg);
  color:var(--color-fg);
  font-family:var(--font-sans);
  font-size:17px;
  line-height:1.7;
  -webkit-font-smoothing:antialiased;
  scroll-behavior:smooth;
}
.huozi-blog .layout{
  display:grid;
  grid-template-columns:1fr min(720px, calc(100% - 64px)) 220px;
  gap:0 48px;
  padding:64px 32px;
  max-width:1200px;
  margin:0 auto;
}
.huozi-blog .layout > main{grid-column:2}
.huozi-blog .toc{
  grid-column:3;
  align-self:start;
  position:sticky;
  top:32px;
  font-size:14px;
  border-left:2px solid var(--color-border);
  padding:4px 0 4px 16px;
}
.huozi-blog .toc-title{font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--color-muted); margin:0 0 .8em}
.huozi-blog .toc ul{list-style:none; padding:0; margin:0}
.huozi-blog .toc li{margin-bottom:.4em}
.huozi-blog .toc a{color:var(--color-muted); text-decoration:none; line-height:1.4}
.huozi-blog .toc a:hover{color:var(--color-fg)}
.huozi-blog h1{font-size:42px; margin:0 0 .25em; letter-spacing:-.02em; line-height:1.15; font-weight:700}
.huozi-blog h2{font-size:28px; margin:1.6em 0 .4em; scroll-margin-top:32px; font-weight:700; letter-spacing:-.01em}
.huozi-blog h3{font-size:21px; margin:1.3em 0 .4em; scroll-margin-top:32px; font-weight:600}
.huozi-blog p{margin:0 0 1em}
.huozi-blog ul,.huozi-blog ol{margin:0 0 1em; padding-left:1.4em}
.huozi-blog li{margin-bottom:.3em}
.huozi-blog img{max-width:100%; height:auto; border-radius:8px; margin:.5em 0}
.huozi-blog a{color:var(--color-accent); text-decoration:none}
.huozi-blog a:hover{text-decoration:underline}
.huozi-blog code{font-family:var(--font-mono); background:#f4f4f5; padding:.1em .35em; border-radius:.25em; font-size:.92em}
.huozi-blog pre{background:#f6f8fa; padding:16px 18px; border-radius:8px; overflow-x:auto; font-size:14px; line-height:1.55; margin:0 0 1em}
.huozi-blog pre code{background:none; padding:0}
.huozi-blog blockquote{border-left:3px solid var(--color-accent); margin:0 0 1em; padding:.3em 0 .3em 16px; color:var(--color-muted)}
.huozi-blog hr{border:0; border-top:1px solid var(--color-border); margin:2em 0}
.huozi-blog table{width:100%; border-collapse:collapse; margin:0 0 1em; font-size:15px}
.huozi-blog th,.huozi-blog td{border-bottom:1px solid var(--color-border); padding:.6em .8em; text-align:left}
.huozi-blog th{font-weight:600}
.huozi-blog .muted{color:var(--color-muted)}
.huozi-blog .meta{color:var(--color-muted); font-size:15px; margin:0 0 2em}
@media (max-width:960px){
  .huozi-blog .layout{grid-template-columns:1fr; padding:40px 20px; gap:0}
  .huozi-blog .layout > main{grid-column:1}
  .huozi-blog .toc{display:none}
  .huozi-blog h1{font-size:32px}
  .huozi-blog h2{font-size:24px}
}
</style>
</head>
<body>
<div class="huozi-blog">
  <div class="layout">
    <main>
      <h1>页面标题</h1>
      <p class="meta">作者 · 日期</p>

      <h2 id="section-1">第一部分</h2>
      <p>内容…</p>

      <h2 id="section-2">第二部分</h2>
      <p>内容…</p>
    </main>
    <nav class="toc" aria-label="目录">
      <p class="toc-title">目录</p>
      <ul>
        <li><a href="#section-1">第一部分</a></li>
        <li><a href="#section-2">第二部分</a></li>
      </ul>
    </nav>
  </div>
</div>
</body>
</html>
`

export const TEMPLATES: Record<TemplateFormat, TemplateMeta> = {
  deck: {
    format: 'deck',
    description:
      '16:9 horizontal slide. Pitch decks, presentations on big screens.',
    shape: '16:9',
    body: DECK_HTML,
  },
  story: {
    format: 'story',
    description:
      '9:16 vertical slide. Mobile stories, reels, vertical social posts.',
    shape: '9:16',
    body: STORY_HTML,
  },
  paper: {
    format: 'paper',
    description: 'A4 print sheet. Reports, letters, printable PDFs.',
    shape: 'A4',
    body: PAPER_HTML,
  },
  blog: {
    format: 'blog',
    description:
      'Responsive long-form. Articles, landing pages, essays — same file reads well on phone AND desktop via @media queries baked into the template. Default for unmarked HTML.',
    shape: 'responsive long, sticky TOC on wide',
    body: BLOG_HTML,
  },
}
