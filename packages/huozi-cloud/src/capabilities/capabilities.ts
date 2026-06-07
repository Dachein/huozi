/**
 * Capability catalog — the generative palette an authoring agent consults
 * BEFORE writing an HTML doc. Sibling to validate-rules.ts (which is the
 * corrective gate AFTER writing). Surfaced by the `huozi_capabilities`
 * MCP tool.
 *
 * Each capability is one way to bring data into, or render data in, a
 * huozi document. Two axes:
 *   - kind "data"   : where data comes from (workspace jsonl vs hosted API)
 *   - kind "render" : how to draw it (echarts / mermaid / svg)
 *   - kind "runtime": platform JS surface
 *
 * This is hand-authored prose (原理/规则/边界/Example), not auto-derived
 * from BUNDLES — it explains intent the bundle list can't. Add a new
 * capability by pushing one entry here, then redeploy the api worker.
 */

export type CapabilityKind = "data" | "render" | "runtime";

export interface CapabilityExample {
  title: string;
  code: string;
}

export interface Capability {
  /** Stable id. Namespaced with "/" for sub-capabilities (api-data/market). */
  id: string;
  kind: CapabilityKind;
  /** One-line what-it-is. */
  summary: string;
  /** How to turn it on (meta bundle / share-include / which MCP tool). */
  declare: string;
  /** 实现原理 — how it works under the hood. */
  principle: string;
  /** 规则 — what the author must do. */
  rules: string[];
  /** 边界 — limits / what it can't do. */
  limits: string[];
  examples: CapabilityExample[];
  /** Related huozi_validate_rules codes. */
  validateRefs?: string[];
}

const CAPABILITIES: Capability[] = [
  {
    id: "echarts",
    kind: "render",
    summary: "Apache ECharts — interactive charts (line/bar/treemap/candlestick/…).",
    declare: 'Add <meta name="huozi:bundle" content="echarts"> to <head>.',
    principle:
      "Server injects the same-origin /lib/echarts-5.5.1.min.js as <script defer>. The publish sandbox strips author CDN scripts, so this server-injected one is the only way to get the lib. window.echarts is available by DOMContentLoaded.",
    rules: [
      "Tier-2: you write your own echarts.init(el) + setOption(...). The platform does NOT auto-render.",
      "Run init inside DOMContentLoaded (defer guarantees echarts is loaded by then).",
      "The container element needs an explicit height (px or via CSS) or the chart renders 0-height.",
    ],
    limits: [
      "~1MB library; one bundle covers all chart types.",
      "Author owns theme/config; no platform default styling.",
    ],
    examples: [
      {
        title: "Minimal line chart",
        code: [
          '<meta name="huozi:bundle" content="echarts">',
          '<div id="c" style="height:320px"></div>',
          "<script>addEventListener('DOMContentLoaded',function(){",
          "  echarts.init(document.getElementById('c')).setOption({",
          "    xAxis:{type:'category',data:['Mon','Tue','Wed']},",
          "    yAxis:{type:'value'}, series:[{type:'line',data:[1,3,2]}]",
          "  });});</script>",
        ].join("\n"),
      },
    ],
    validateRefs: ["bundle-unknown-key", "inline-script-blocked"],
  },
  {
    id: "mermaid",
    kind: "render",
    summary: "Mermaid — diagrams from text (flowchart/sequence/gantt/…).",
    declare: 'Add <meta name="huozi:bundle" content="mermaid"> to <head>.',
    principle:
      "Server injects /lib/mermaid-10.9.4.min.js (same-origin, defer). window.mermaid is available by DOMContentLoaded.",
    rules: [
      "Tier-2: call mermaid.initialize({...}) for your theme, then mermaid.run() after DOMContentLoaded.",
      "Put diagram source inside <pre class=\"mermaid\">…</pre>.",
    ],
    limits: [
      "You must call mermaid.run() yourself (no auto-render — gives you theme control).",
      "Large library (~3MB).",
    ],
    examples: [
      {
        title: "Flowchart",
        code: [
          '<meta name="huozi:bundle" content="mermaid">',
          '<pre class="mermaid">flowchart LR; A-->B; B-->C</pre>',
          "<script>addEventListener('DOMContentLoaded',function(){",
          "  mermaid.initialize({startOnLoad:false}); mermaid.run();",
          "});</script>",
        ].join("\n"),
      },
    ],
    validateRefs: ["bundle-unknown-key"],
  },
  {
    id: "svg",
    kind: "render",
    summary: "SVG — vector diagrams. Author inline, or render to PNG via tool.",
    declare:
      "Two paths: (a) write inline <svg>…</svg> directly in the HTML (static, passes the sandbox); (b) call the huozi_image_render MCP tool to rasterize agent-authored SVG to a PNG in the image library.",
    principle:
      "Inline <svg> survives sanitization because it's static markup (no scripts). huozi_image_render renders a complete <svg> document server-side to PNG with a fixed font stack and stores it at /__assets__/<sha>.png; the share renderer rewrites that path to a public blob URL at view time.",
    rules: [
      "huozi_image_render needs a COMPLETE <svg>…</svg> document (width/height from viewBox or root attrs).",
      "Use scale 2 (retina) default; scale 3 for dense text; output capped at 5MB.",
      "Prefer inline <svg> for small decorative vectors; prefer huozi_image_render for diagrams you want embedded in markdown.",
    ],
    limits: [
      "huozi_image_render is static raster only — no JS/animation inside the SVG.",
      "v1 supports format:\"svg\" only (Mermaid rasterization is v2).",
    ],
    examples: [
      {
        title: "Inline static SVG",
        code: '<svg viewBox="0 0 100 40"><rect width="100" height="40" fill="#6bd1ff"/><text x="50" y="25" text-anchor="middle">hi</text></svg>',
      },
      {
        title: "Render SVG → PNG (MCP tool)",
        code: 'huozi_image_render({ format:"svg", source:"<svg viewBox=\'0 0 200 100\'>…</svg>", scale:2 })',
      },
    ],
  },
  {
    id: "data/jsonl",
    kind: "data",
    summary: "Read your own workspace files (jsonl / csv / json) at runtime.",
    declare:
      'Add <meta name="huozi:bundle" content="data"> and <meta name="huozi:share-include" content="a.jsonl,b.csv"> to <head>.',
    principle:
      "The `data` bundle exposes window.huozi.read / readJson / readJsonl. Declared sibling files are served at /p/<slug>/d/<path> on publish (workspace proxy in preview). Only files listed in share-include are reachable; everything else 403s.",
    rules: [
      "List every file you fetch in huozi:share-include (relative to the HTML's folder).",
      "Build the base from location.pathname: const base = location.pathname.replace(/\\/$/,'') + '/d/'; then fetch(base + 'a.jsonl').",
      "Or just use window.huozi.readJsonl('a.jsonl') which handles the base for you.",
    ],
    limits: [
      "Read-only, same-origin, files must already exist in the workspace.",
      "Static snapshot — updates only when you edit the file (see api-data/market for live external data).",
    ],
    examples: [
      {
        title: "Load a Collection",
        code: [
          '<meta name="huozi:bundle" content="data">',
          '<meta name="huozi:share-include" content="rows.jsonl">',
          "<script>huozi.readJsonl('rows.jsonl').then(function(rows){",
          "  /* render rows */ });</script>",
        ].join("\n"),
      },
    ],
    validateRefs: ["bundle-unknown-key"],
  },
  {
    id: "api-data/market",
    kind: "data",
    summary:
      "Live market data (stocks/indices/FX/futures) from the hosted data plane. First official source under the `api-data` framework.",
    declare: 'Add <meta name="huozi:bundle" content="api-data"> to <head>.',
    principle:
      "The `api-data` bundle loads the huozi-data SDK from api-data.huozi.app (a transparent Yahoo Finance proxy that only adds CORS) and the Viewer injects the access token. Calls go to api-data.huozi.app and return Yahoo's response shape, verbatim. Gate: Origin allowlist (huozi.app only) + static token — so it only works inside huozi-rendered pages.",
    rules: [
      "Programmatic: huozi.market.chart(symbol,{range,interval}) / .quote('A,B') / .quoteSummary(sym,{modules}) / .search(q) — all return raw Yahoo JSON.",
      "Declarative: <div data-market=\"AAPL\" data-range=\"1y\" data-interval=\"1d\"></div> → element emits a bubbling 'huozi-market' event with detail.result = Yahoo chart.result[0].",
      "Refresh is low-priority polling: one-shot by default; add data-refresh=\"60000\" or use huozi.market.subscribe() to poll.",
      "Use Yahoo symbols: AAPL, 0700.HK, 2330.TW, ^GSPC, EURUSD=X, BTC-USD.",
    ],
    limits: [
      "Only works in huozi-rendered docs (token is injected by the Viewer; not a public API).",
      "Public market data only; polling, not streaming.",
      "Endpoints/shape mirror Yahoo v8 chart / v7 quote / v10 quoteSummary / v1 search.",
      "Sibling sources (api-data/rate, api-data/fx, user-defined) will mount as huozi.<domain>.* under the same framework.",
    ],
    examples: [
      {
        title: "Programmatic series",
        code: [
          '<meta name="huozi:bundle" content="api-data">',
          "<script>huozi.market.chart('AAPL',{range:'1mo',interval:'1d'})",
          "  .then(function(j){ var r=j.chart.result[0];",
          "    /* r.meta.regularMarketPrice ; r.timestamp[] + r.indicators.quote[0].close[] */ });",
          "</script>",
        ].join("\n"),
      },
      {
        title: "Declarative (zero JS)",
        code: [
          '<meta name="huozi:bundle" content="api-data">',
          '<div data-market="AAPL" data-range="1y"></div>',
          "<script>addEventListener('huozi-market',function(e){",
          "  var m=e.detail.result.meta; /* m.regularMarketPrice */ });</script>",
        ].join("\n"),
      },
    ],
    validateRefs: ["bundle-unknown-key", "inline-script-blocked"],
  },
];

export function listCapabilities(): Capability[] {
  return CAPABILITIES;
}

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}
