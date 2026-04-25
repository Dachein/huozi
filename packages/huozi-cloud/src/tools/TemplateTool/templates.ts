/**
 * The 5 huozi standard layout ("版") templates.
 *
 * Each is a self-contained, single-file HTML scaffold the agent fills with
 * content before publishing via huozi_share. Inlined here as `const` strings
 * so they ship with the Worker bundle — no runtime asset loading required.
 *
 * Source of truth lives at /skill-pack/huozi/skills/huozi/templates/*.html
 * in the repo. Keep these in sync if you edit either side.
 *
 * Design constraints:
 *   - Pure CSS (no JS) — the publish surface strips <script>.
 *   - All styles inlined in <style> — no @import, no external links.
 *   - Class names prefixed `huozi-{format}-` to avoid global CSS collision.
 *   - Container queries (cqw / cqh) for self-scaling slide stages instead
 *     of JS-driven transform: scale().
 */

export const TEMPLATE_FORMATS = [
  'deck',
  'story',
  'paper',
  'mobile',
  'page',
] as const

export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]

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
  min-height:100vh;
  display:grid;
  place-items:center;
  font-family:var(--font-sans);
  -webkit-font-smoothing:antialiased;
}
.huozi-deck .stage{
  aspect-ratio:16/9;
  width:min(100vw, calc(100vh * 16 / 9));
  height:min(100vh, calc(100vw * 9 / 16));
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
@media print{
  .huozi-deck{background:#fff; min-height:auto; display:block}
  .huozi-deck .stage{width:100%; height:100vh; aspect-ratio:auto; page-break-after:always}
  @page{size:landscape; margin:0}
}
</style>
</head>
<body>
<div class="huozi-deck">
  <section class="stage">
    <h1>标题占位</h1>
    <p class="muted">副标题或日期</p>
  </section>
</div>
</body>
</html>
`

const STORY_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
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
  min-height:100vh;
  display:grid;
  place-items:center;
  font-family:var(--font-sans);
  -webkit-font-smoothing:antialiased;
}
.huozi-story .stage{
  aspect-ratio:9/16;
  width:min(100vw, calc(100vh * 9 / 16));
  height:min(100vh, calc(100vw * 16 / 9));
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
<div class="huozi-story">
  <section class="stage">
    <span class="pill">标签</span>
    <h1>竖屏大标题</h1>
    <p class="muted">一句副文本</p>
  </section>
</div>
</body>
</html>
`

const PAPER_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
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
  min-height:100vh;
  font-family:var(--font-serif);
  color:var(--color-fg);
  -webkit-font-smoothing:antialiased;
  padding:32px 16px;
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
  .huozi-paper{background:#fff; padding:0}
  .huozi-paper .page{box-shadow:none; margin:0; width:210mm; min-height:297mm; page-break-after:always}
}
</style>
</head>
<body>
<div class="huozi-paper">
  <article class="page">
    <h1>文档标题</h1>
    <p class="meta">作者 · 日期</p>
    <hr>
    <h2>章节</h2>
    <p>正文段落…</p>
  </article>
</div>
</body>
</html>
`

const MOBILE_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{
  --color-bg:#ffffff;
  --color-fg:#111111;
  --color-muted:#6b7280;
  --color-accent:#0066ff;
  --color-border:#e5e7eb;
  --font-sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;
  --font-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --safe-top:env(safe-area-inset-top);
  --safe-bottom:env(safe-area-inset-bottom);
}
.huozi-mobile{
  margin:0;
  background:var(--color-bg);
  color:var(--color-fg);
  font-family:var(--font-sans);
  font-size:16px;
  line-height:1.65;
  -webkit-font-smoothing:antialiased;
  padding:calc(var(--safe-top) + 20px) 20px calc(var(--safe-bottom) + 40px);
  min-height:100vh;
  box-sizing:border-box;
}
.huozi-mobile .container{max-width:560px; margin:0 auto}
.huozi-mobile h1{font-size:28px; margin:0 0 .35em; letter-spacing:-.02em; line-height:1.2; font-weight:700}
.huozi-mobile h2{font-size:21px; margin:1.4em 0 .4em; line-height:1.3; font-weight:600}
.huozi-mobile h3{font-size:17px; margin:1.1em 0 .3em; font-weight:600}
.huozi-mobile p{margin:0 0 1em}
.huozi-mobile ul,.huozi-mobile ol{margin:0 0 1em; padding-left:1.3em}
.huozi-mobile li{margin-bottom:.3em}
.huozi-mobile img{max-width:100%; height:auto; border-radius:8px; margin:.5em 0}
.huozi-mobile a{color:var(--color-accent); text-decoration:none}
.huozi-mobile a:hover{text-decoration:underline}
.huozi-mobile code{font-family:var(--font-mono); background:#f4f4f5; padding:.1em .35em; border-radius:.25em; font-size:.92em}
.huozi-mobile pre{background:#f4f4f5; padding:14px; border-radius:8px; overflow-x:auto; font-size:14px; line-height:1.5; margin:0 0 1em}
.huozi-mobile pre code{background:none; padding:0}
.huozi-mobile blockquote{border-left:3px solid var(--color-accent); margin:0 0 1em; padding:.2em 0 .2em 14px; color:var(--color-muted)}
.huozi-mobile hr{border:0; border-top:1px solid var(--color-border); margin:1.6em 0}
.huozi-mobile .muted{color:var(--color-muted); font-size:14px}
.huozi-mobile .meta{color:var(--color-muted); font-size:14px; margin:0 0 1.6em}
</style>
</head>
<body>
<div class="huozi-mobile">
  <main class="container">
    <h1>页面标题</h1>
    <p class="meta">作者 · 日期</p>
    <p>正文…</p>
  </main>
</div>
</body>
</html>
`

const PAGE_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
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
.huozi-page{
  margin:0;
  background:var(--color-bg);
  color:var(--color-fg);
  font-family:var(--font-sans);
  font-size:17px;
  line-height:1.7;
  -webkit-font-smoothing:antialiased;
  scroll-behavior:smooth;
}
.huozi-page .layout{
  display:grid;
  grid-template-columns:1fr min(720px, calc(100% - 64px)) 220px;
  gap:0 48px;
  padding:64px 32px;
  max-width:1200px;
  margin:0 auto;
}
.huozi-page .layout > main{grid-column:2}
.huozi-page .toc{
  grid-column:3;
  align-self:start;
  position:sticky;
  top:32px;
  font-size:14px;
  border-left:2px solid var(--color-border);
  padding:4px 0 4px 16px;
}
.huozi-page .toc-title{font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--color-muted); margin:0 0 .8em}
.huozi-page .toc ul{list-style:none; padding:0; margin:0}
.huozi-page .toc li{margin-bottom:.4em}
.huozi-page .toc a{color:var(--color-muted); text-decoration:none; line-height:1.4}
.huozi-page .toc a:hover{color:var(--color-fg)}
.huozi-page h1{font-size:42px; margin:0 0 .25em; letter-spacing:-.02em; line-height:1.15; font-weight:700}
.huozi-page h2{font-size:28px; margin:1.6em 0 .4em; scroll-margin-top:32px; font-weight:700; letter-spacing:-.01em}
.huozi-page h3{font-size:21px; margin:1.3em 0 .4em; scroll-margin-top:32px; font-weight:600}
.huozi-page p{margin:0 0 1em}
.huozi-page ul,.huozi-page ol{margin:0 0 1em; padding-left:1.4em}
.huozi-page li{margin-bottom:.3em}
.huozi-page img{max-width:100%; height:auto; border-radius:8px; margin:.5em 0}
.huozi-page a{color:var(--color-accent); text-decoration:none}
.huozi-page a:hover{text-decoration:underline}
.huozi-page code{font-family:var(--font-mono); background:#f4f4f5; padding:.1em .35em; border-radius:.25em; font-size:.92em}
.huozi-page pre{background:#f6f8fa; padding:16px 18px; border-radius:8px; overflow-x:auto; font-size:14px; line-height:1.55; margin:0 0 1em}
.huozi-page pre code{background:none; padding:0}
.huozi-page blockquote{border-left:3px solid var(--color-accent); margin:0 0 1em; padding:.3em 0 .3em 16px; color:var(--color-muted)}
.huozi-page hr{border:0; border-top:1px solid var(--color-border); margin:2em 0}
.huozi-page table{width:100%; border-collapse:collapse; margin:0 0 1em; font-size:15px}
.huozi-page th,.huozi-page td{border-bottom:1px solid var(--color-border); padding:.6em .8em; text-align:left}
.huozi-page th{font-weight:600}
.huozi-page .muted{color:var(--color-muted)}
.huozi-page .meta{color:var(--color-muted); font-size:15px; margin:0 0 2em}
@media (max-width:960px){
  .huozi-page .layout{grid-template-columns:1fr; padding:40px 20px; gap:0}
  .huozi-page .layout > main{grid-column:1}
  .huozi-page .toc{display:none}
  .huozi-page h1{font-size:32px}
  .huozi-page h2{font-size:24px}
}
</style>
</head>
<body>
<div class="huozi-page">
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
  mobile: {
    format: 'mobile',
    description:
      'Long scroll, mobile-first. Articles read on phones, narrow-viewport optimized.',
    shape: 'long, mobile-first',
    body: MOBILE_HTML,
  },
  page: {
    format: 'page',
    description:
      'Long scroll, desktop-first. Landing pages, long-form essays with sticky TOC.',
    shape: 'long, desktop-first',
    body: PAGE_HTML,
  },
}
