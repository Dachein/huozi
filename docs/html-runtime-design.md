# Huozi HTML Runtime Design

Status: 2026-06-08  
Scope: `.html` / `.htm` Page rendering across workspace, fullscreen, public share `/p`, and private open preview `/o`.

## 1. Goal

Huozi HTML is a lightweight local-app runtime: an agent writes a self-contained HTML artifact, Huozi validates it, binds optional data/rendering bundles, and renders it consistently in multiple product surfaces.

The runtime separates two responsibilities:

| Layer | Owner | Responsibility |
|------|-------|----------------|
| Host shell | Huozi React app | Workspace chrome, fullscreen chrome, page outline, dashboard tab bar, canvas fitting, asset/data proxy URLs. |
| Author document | The HTML file | Content, visual design, inline scripts, data reads via `window.huozi`, chart/diagram rendering inside the iframe. |

The author document is rendered in an iframe inside the host shell. This keeps CSS and script execution local to the file while preserving one standard host chrome implementation.

## 2. Format Taxonomy

| Format | Mental model | Geometry | Navigation primitive | Default fit | Background contract |
|--------|--------------|----------|----------------------|-------------|---------------------|
| `blog` | Responsive long-flow article/page | Free flow | None | No scaling | Author document background or surrounding reader surface. |
| `deck` | Horizontal slide deck | 1920 x 1080 canvas | `[data-page]` | contain | Default black outer bleed. |
| `story` | Vertical short-form media | 390 x 844 canvas | `[data-page]` | cover on portrait, contain on wide | Default black outer bleed. |
| `paper` | A4-width report/memo | 816 px locked width, flowing height | `[data-page]` | no transform | Reader surface unless author paints document. |
| `dashboard` | Big-screen operations/data surface | 2560 x 1440 canvas | `[data-tab]` + `huozi:tabs` | contain | Must declare `huozi:background` or document background. |
| `app` | Mobile H5 / miniapp UI | 390 x 844 canvas | single screen today | contain | Must declare `huozi:background` or document background. |

Deprecated values `web` and `mobile` alias to `blog` for old files, but validators should ask agents to write `blog`. Dashboard and app always use contain-fit even if an old file declares `huozi:fit="cover"`, because UI/data surfaces must not clip.

## 3. Surface Profiles

The URLs should be implementation details. The renderer should pick one of a small set of profiles.

| Profile | Used by | Sizing behavior | Chrome |
|---------|---------|-----------------|--------|
| `workspace-inline` | Workspace file preview | Fits inside the file pane. Canvas formats scale into the available preview box. Blog auto-grows. Paper gets a scrollable reading box. | Workspace file actions plus page/tab controls. |
| `fullscreen-large` | Workspace fullscreen, public `/p` web share | Fills the browser viewport. Canvas formats scale to viewport; paper/blog use reader/fullscreen rules. | Fullscreen close in workspace; `/p` may show Open in Huozi unless chromeless. |
| `mobile-preview` | `/o` in miniapp/web-view and mobile QA | Token-gated fullscreen mobile viewport. App/story target 390 x 844; deck should request landscape/fullscreen affordance. | Host app owns outer navigation; Huozi file chrome stays minimal. |
| `embed-chromeless` | iframe embeds, small web views | Same geometry as large or mobile profile, but no Open in Huozi link. | External host owns surrounding chrome. |

Current code maps `/p` to fullscreen-large and `/o` to a private fullscreen preview. `/o` also proxies sibling data and `__assets__` through the open token so mobile previews can render data and assets without publishing the file.

## 4. Iframe Runtime

Huozi does not iframe the whole product page. It iframes only the author document inside the standard Huozi canvas shell.

Why this abstraction:

| Requirement | Consequence |
|-------------|-------------|
| Consistent workspace/share/fullscreen sizing | Canvas, fit, background, and fullscreen stay in React host code. |
| Author CSS/script isolation | Author HTML runs in iframe `srcDoc`; styles do not leak into the workspace shell. |
| Standard page/tab controls | Page outline and dashboard tab bar stay outside iframe and talk through a bridge. |
| Data-driven local apps | `window.huozi.read()` fetches through surface-specific `/d/` proxies. |
| Asset-rich pages | `/__assets__/...` rewrites to `/workspace/a`, `/p/<slug>/a`, or `/o/<token>/a`. |

Bridge events:

| Direction | Event/message | Payload | Meaning |
|-----------|---------------|---------|---------|
| host -> iframe | `page:go` | `{ pageId }` | Scroll to a `[data-page]` id. |
| iframe -> host | `page:changed` | `{ pageId }` | Sync page outline active state. |
| host -> iframe | `tab:go` | `{ tabId, reason }` | Activate a dashboard tab. |
| iframe -> host | `tab:changed` | `{ tabId, reason }` | Sync host tab bar active state. |
| host -> iframe | `refresh` | `{}` | Trigger dashboard refresh work. |
| iframe -> host | `resize` | `{ height }` | Let blog/free-flow iframes auto-grow. |
| iframe -> host | `ready` | `{ format }` | Host can replay current tab/page state after load. |

Author-facing conventions:

- Use `<section data-page id="s1" data-title="...">` for deck/story/paper pages.
- Use `<meta name="huozi:tabs" content="overview=Overview, queue=Queue">` and matching `<section data-tab="overview">` for dashboard tabs.
- Use `window.huozi.on('tab', fn)` for dashboard init/show/refresh hooks.
- Use `window.huozi.read('data.jsonl')`, `readJson`, or `readJsonl` after declaring `<meta name="huozi:share-include" content="data.jsonl">`.
- Do not query or mutate `window.parent.document`; parent chrome is not part of the author API.

## 5. Data And Rendering Bundles

| Capability | Declaration | Runtime location | Notes |
|------------|-------------|------------------|-------|
| Workspace sibling data | `<meta name="huozi:bundle" content="data">` plus `huozi:share-include` | iframe | Uses `/workspace/d`, `/p/<slug>/d`, or `/o/<token>/d`. |
| Charts | `huozi:bundle="echarts"` or related renderer bundle | iframe | Author owns chart container and init. |
| Mermaid/SVG | renderer bundle or inline SVG | iframe | Host only provides isolation and sizing. |
| Assets | `/__assets__/...` URLs | iframe | Rewritten to surface-specific asset proxy. |

## 6. Current Implementation Map

| Concern | Current file |
|---------|--------------|
| Canvas resolution | `src/lib/html/canvas.ts` |
| Format/page/tab metadata | `src/lib/html/meta.ts`, `extract-pages.ts`, `extract-tabs.ts` |
| Sanitization/bundle injection | `src/lib/html/sanitizer.ts`, `asset-registry.ts` |
| iframe srcDoc and bridge | `src/lib/html/iframe-document.ts` |
| iframe React host | `src/components/workspace/html-iframe-frame.tsx` |
| Shared canvas dispatcher | `src/components/workspace/html-canvas-frame.tsx` |
| Dashboard host tab bar | `src/components/workspace/dashboard-tab-bar.tsx` |
| Page outline/pager | `src/components/workspace/page-outline-menu.tsx` |
| Workspace render entry | `src/components/workspace/file-renderer.tsx` |
| Public share render entry | `src/app/p/[slug]/page.tsx`, `src/components/p/share-viewer.tsx` |
| Private open render entry | `src/app/o/[token]/page.tsx` |
| Public/open asset proxies | `src/app/p/[slug]/a`, `src/app/o/[token]/a`, worker share/open handlers |
| Agent template guidance | `packages/huozi-cloud/src/tools/TemplateTool/*` |

## 7. Test Matrix

Every release touching HTML runtime should test one file per format across the surfaces below.

| Format | Validate | Workspace inline | Workspace fullscreen | `/p` desktop | `/o` mobile viewport | Key assertion |
|--------|----------|------------------|----------------------|--------------|----------------------|---------------|
| blog | yes | auto height | readable fullscreen | readable | readable | iframe grows, no nested scroll trap. |
| deck | yes | contained 16:9 preview | full viewport contain | full viewport contain | landscape/fullscreen affordance | page controls work through bridge. |
| story | yes | vertical preview | cover on portrait, contain on wide | same | fills mobile safely | safe area content remains visible. |
| paper | yes | fixed-width reading box | scrollable reader | same | scrollable | no scale blur, page outline works. |
| dashboard | yes | contained big-screen preview | full viewport contain | same | show mobile/big-screen guidance if needed | host tab bar switches iframe sections. |
| app | yes | mobile canvas preview | centered mobile UI | same | fills mobile contain | no clipped controls; background explicit. |

## 8. Practical Authoring Rules

1. Pick the format by user intent, not by current viewport.
2. Canvas formats should use container-relative sizing (`cqw`, `cqh`, percentages) inside their root, not `vw`/`vh` for internal layout.
3. `dashboard` is allowed to scroll within panels, but the top-level canvas should fit one screen. If information grows without bound, split it into tabs or switch to `blog`/`paper` for reading.
4. `app` should keep primary controls inside the center safe area and avoid relying on browser chrome height.
5. `deck` on portrait phones should prefer a rotate/fullscreen prompt rather than shrinking text into an unreadable strip.
6. `story` can crop edges by design; keep critical content in the center 80%.
7. Always include `og:image` with an empty content value if no custom image is available, so the Huozi default share card is used.
8. For dashboard/app, always declare `huozi:background` or paint `html/body/:root`.
