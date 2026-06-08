import { notFound } from "next/navigation";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { processChartComponents } from "@/lib/html/chart-components";
import { computeHtmlMeta } from "@/lib/html/meta";
import { resolveCanvas } from "@/lib/html/canvas";
import type { HuoziFormat } from "@/lib/html/detect-format";
import { HtmlCanvasFrame } from "@/components/workspace/html-canvas-frame";
import { FullscreenContent } from "@/components/workspace/fullscreen-content";
import { FullscreenProvider } from "@/components/workspace/fullscreen-context";

export const dynamic = "force-dynamic";

type Params = Promise<{ format: string }>;
type SearchParams = Promise<{ surface?: string | string[] }>;

const DEMOS: Record<HuoziFormat, string> = {
  blog: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="huozi:format" content="blog"><title>Blog Demo</title><meta name="description" content=""><meta property="og:image" content=""><style>html,body{margin:0;background:#fbfaf7;color:#1f2937;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.huozi-blog{max-width:880px;margin:0 auto;padding:56px 24px;line-height:1.65}.kicker{color:#0f766e;font-weight:700;text-transform:uppercase;font-size:14px}h1{font-size:44px;line-height:1.05;margin:10px 0 18px}p{font-size:18px;color:#4b5563}.band{margin:28px 0;padding:22px;border:1px solid #d8dee8;border-radius:8px;background:white}</style></head><body><article class="huozi-blog"><div class="kicker">Blog</div><h1>Responsive long-form page</h1><p>This fixture checks natural flow, iframe auto-height, and readable text in a normal article layout.</p><div class="band"><strong>Renderer contract:</strong> blog is not scaled. It reflows and lets the iframe grow to document height.</div><p>Additional paragraph content keeps the page tall enough to verify scrolling and height updates without relying on viewport units.</p></article></body></html>`,
  deck: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="huozi:format" content="deck"><meta name="huozi:viewport" content="width:1920; height:1080"><title>Deck Demo</title><meta property="og:image" content=""><style>html,body{margin:0;width:100%;height:100%;background:#09090b;color:#fafafa;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.huozi-deck{width:100%;height:100%;background:#09090b;container-type:size;overflow:hidden}.slides{display:flex;width:100%;height:100%;overflow-x:auto;scroll-snap-type:x mandatory}.slide{flex:0 0 100%;height:100%;scroll-snap-align:start;display:grid;place-items:center}.stage{width:78%;display:grid;gap:32px}.eyebrow{color:#f97316;font-weight:800;font-size:2cqw}h1{font-size:6cqw;line-height:1.05;margin:0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.card{border:1px solid #3f3f46;border-radius:8px;padding:24px;background:#18181b;font-size:1.7cqw}</style></head><body><div class="huozi-deck"><div class="slides"><section data-page id="s1" data-title="Opening" class="slide"><div class="stage"><div class="eyebrow">Deck</div><h1>16:9 canvas, host pager</h1><div class="grid"><div class="card">Workspace inline</div><div class="card">Fullscreen</div><div class="card">Share</div></div></div></section><section data-page id="s2" data-title="Second" class="slide"><div class="stage"><div class="eyebrow">Bridge</div><h1>Page controls cross the iframe boundary</h1></div></section></div></div></body></html>`,
  story: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="huozi:format" content="story"><meta name="huozi:viewport" content="width:390; height:844"><title>Story Demo</title><meta property="og:image" content=""><style>html,body{margin:0;width:100%;height:100%;background:#0b1020;color:white;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.huozi-story{width:100%;height:100%;background:linear-gradient(180deg,#111827,#6d28d9);container-type:size;overflow:hidden}.pages{height:100%;overflow-y:auto;scroll-snap-type:y mandatory}.page{height:100%;scroll-snap-align:start;box-sizing:border-box;padding:9cqh 8cqw;display:flex;flex-direction:column;justify-content:space-between}.pill{align-self:flex-start;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:8px 12px;font-size:4cqw}h1{font-size:12cqw;line-height:1.02;margin:0}.footer{font-size:4cqw;opacity:.75}</style></head><body><div class="huozi-story"><div class="pages"><section data-page id="s1" data-title="Story" class="page"><div class="pill">Story</div><h1>Vertical cover surface</h1><div class="footer">Safe content stays near center.</div></section><section data-page id="s2" data-title="Detail" class="page"><div class="pill">Page 2</div><h1>Swipe or use host pager</h1><div class="footer">390 x 844 target canvas.</div></section></div></div></body></html>`,
  paper: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="huozi:format" content="paper"><meta name="huozi:viewport" content="width:816"><title>Paper Demo</title><meta property="og:image" content=""><style>html,body{margin:0;background:#f5f2ea;color:#1f2937;font-family:Georgia,"Times New Roman",serif}.huozi-paper{background:#fff;min-height:100%;padding:64px 72px;box-sizing:border-box}.page{border-bottom:1px solid #e5e7eb;padding-bottom:48px;margin-bottom:48px}h1{font-size:42px;line-height:1.1;margin:0 0 18px}h2{font-size:24px;margin:0 0 12px}p{font-size:18px;line-height:1.7;color:#374151}</style></head><body><main class="huozi-paper"><article data-page id="p1" data-title="Memo" class="page"><h1>Paper report fixture</h1><p>This checks locked-width rendering, vertical scroll, and page outline bridging.</p><p>Paper is not transformed; the column width remains stable while height flows naturally.</p></article><article data-page id="p2" data-title="Appendix" class="page"><h2>Appendix</h2><p>Second page marker for outline and keyboard navigation tests.</p></article></main></body></html>`,
  dashboard: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="huozi:format" content="dashboard"><meta name="huozi:viewport" content="width:2560; height:1440"><meta name="huozi:background" content="#080c12"><meta name="huozi:tabs" content="overview=Overview, map=Map, queue=Queue"><title>Dashboard Demo</title><meta property="og:image" content=""><style>html,body{margin:0;width:100%;height:100%;background:#080c12;color:#eef2ff;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.huozi-dashboard{width:100%;height:100%;background:#080c12;container-type:size;overflow:hidden}.screen{height:100%;box-sizing:border-box;padding:64px;display:grid;grid-template-rows:auto 1fr;gap:30px}.top{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid #243044;padding-bottom:28px}h1{font-size:5cqw;line-height:1;margin:0}.date{color:#ff7a4d;font-size:2cqw;font-weight:800}.grid{min-height:0;display:grid;grid-template-columns:1.2fr .8fr;gap:28px}.card{background:#131b2a;border:1px solid #29364d;border-radius:8px;padding:28px;box-sizing:border-box;overflow:auto}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:24px}.kpi{background:#0d1420;border:1px solid #29364d;border-radius:8px;padding:20px}.kpi strong{display:block;font-size:3cqw}.list{display:grid;gap:14px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #29364d;padding-bottom:12px;font-size:1.6cqw}[data-tab]{height:100%;min-height:0}[data-tab]:not(.is-active){display:none}</style></head><body><div class="huozi-dashboard"><section data-tab="overview" class="is-active"><div class="screen"><header class="top"><h1>Dashboard fixture</h1><div class="date">2026-06-08</div></header><main><div class="kpis"><div class="kpi"><span>People</span><strong>33</strong></div><div class="kpi"><span>Posts</span><strong>98</strong></div><div class="kpi"><span>Actions</span><strong>29</strong></div><div class="kpi"><span>Teams</span><strong>18</strong></div></div><div class="grid"><div class="card"><h2>Signals</h2><div class="list"><div class="row"><span>Alignment</span><strong>22</strong></div><div class="row"><span>Policy</span><strong>14</strong></div><div class="row"><span>Interpretability</span><strong>11</strong></div></div></div><div class="card"><h2>Recent changes</h2><p>Host tab bar should switch this iframe without direct DOM access.</p></div></div></main></div></section><section data-tab="map"><div class="screen"><header class="top"><h1>Map</h1><div class="date">Tab 2</div></header><div class="card">Team map content</div></div></section><section data-tab="queue"><div class="screen"><header class="top"><h1>Queue</h1><div class="date">Tab 3</div></header><div class="card">Queue content</div></div></section></div></body></html>`,
  app: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="huozi:format" content="app"><meta name="huozi:viewport" content="width:390; height:844"><meta name="huozi:background" content="#eef2f7"><title>App Demo</title><meta property="og:image" content=""><style>html,body{margin:0;width:100%;height:100%;background:#eef2f7;color:#111827;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.huozi-app{width:100%;height:100%;background:#eef2f7;container-type:size;overflow:hidden}.screen{height:100%;box-sizing:border-box;padding:28px 22px;display:grid;grid-template-rows:auto 1fr auto;gap:20px}.top{display:flex;justify-content:space-between;align-items:center}.logo{font-weight:800;font-size:24px}.avatar{width:38px;height:38px;border-radius:50%;background:#111827;color:#fff;display:grid;place-items:center}.hero{align-self:center}.panel{background:#fff;border:1px solid #d8dee8;border-radius:8px;padding:18px;margin-top:18px;box-shadow:0 12px 30px rgba(15,23,42,.08)}h1{font-size:38px;line-height:1.05;margin:0 0 12px}p{font-size:15px;line-height:1.5;color:#667085;margin:0}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #edf1f6}.row:last-child{border-bottom:0}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px}.btn{border-radius:8px;padding:14px 12px;text-align:center;font-weight:800}.secondary{background:#dfe7f2}.primary{background:#111827;color:#fff}</style></head><body><div class="huozi-app"><main class="screen"><header class="top"><div class="logo">App</div><div class="avatar">HZ</div></header><section class="hero"><h1>Mobile app fixture</h1><p>Contain-fit 390 x 844 surface for /o mobile preview and future miniapp flows.</p><div class="panel"><div class="row"><span>Status</span><strong>Ready</strong></div><div class="row"><span>Tasks</span><strong>8</strong></div><div class="row"><span>Sync</span><strong>12:30</strong></div></div></section><footer class="actions"><div class="btn secondary">Details</div><div class="btn primary">Continue</div></footer></main></div></body></html>`,
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function HtmlRuntimeDemoPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { format: rawFormat } = await params;
  const sp = await searchParams;
  const format = rawFormat as HuoziFormat;
  const source = DEMOS[format];
  if (!source) notFound();

  const { html } = await processHtmlDirect(processChartComponents(source), {
    bundleCtx: { dataBase: "/dev/html-runtime/data/", filePath: `${format}.html` },
  });
  const meta = computeHtmlMeta(source);
  const canvas = resolveCanvas(source, meta.format);
  const pageUnit: "page" | "slide" | "sheet" =
    meta.format === "deck" || meta.format === "story"
      ? "slide"
      : meta.format === "paper"
        ? "sheet"
        : "page";
  const frame = (
    <HtmlCanvasFrame
      html={html}
      format={meta.format}
      canvas={canvas}
      pages={meta.pages}
      pageUnit={pageUnit}
      tabs={meta.tabs}
      refreshMs={meta.refreshMs}
    />
  );

  if (first(sp.surface) === "workspace") {
    return (
      <FullscreenProvider>
        <main className="min-h-screen bg-[#f7f2ea] px-8 py-10 text-slate-900">
          <div className="mx-auto max-w-[1220px]">
            <div className="mb-4 flex items-center justify-between text-sm text-slate-600">
              <span>workspace / html-runtime-demo / {format}.html</span>
              <span>surface=workspace</span>
            </div>
            {frame}
          </div>
        </main>
      </FullscreenProvider>
    );
  }

  return (
    <FullscreenProvider initial>
      <FullscreenContent
        mode="raw"
        pages={meta.pages}
        pageUnit={pageUnit}
        htmlFormat={meta.format}
        alwaysOpen
      >
        {frame}
      </FullscreenContent>
    </FullscreenProvider>
  );
}
