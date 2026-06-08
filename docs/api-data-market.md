# `api-data/market` — Data Contract

Live market data for huozi HTML documents. This is the spec for **what we
support** and **how an author/agent uses it**. It is the source-of-truth
companion to the `huozi_capabilities({ id: "api-data/market" })` entry.

> **Mental model:** replace `query1.finance.yahoo.com` with
> `api-data.huozi.app`. Same paths, same params, same JSON. The proxy adds
> only CORS, an auth gate, an auto-crumb for guarded endpoints, and a short
> edge cache. **No normalization** — responses are Yahoo's, verbatim.

---

## 1. Status / what is contractual

| Tier | Scope | Guarantee |
|------|-------|-----------|
| **Official** | The 4 endpoints in §4 via the SDK methods in §3 | Supported; documented params + response fields below |
| **Best-effort passthrough** | Any other Yahoo `/v<N>/…` or `/ws/…` path via `huozi.market.get()` | Forwarded as-is, **not guaranteed**; shape/availability follow Yahoo |
| **Not supported** | Streaming, websockets for live ticks, private/authenticated Yahoo data, non-Yahoo sources | — |

The proxy's forward rule is the regex `^/(v\d+|ws)/` — so technically *any*
versioned Yahoo path is reachable. Only the §4 set is a product contract.

---

## 2. How it works

- **Where it runs:** only inside huozi-rendered pages. Enable with
  `<meta name="huozi:bundle" content="api-data">`; the Viewer injects the SDK
  (`https://api-data.huozi.app/sdk/huozi-market.js`) and the access token
  (`window.__HUOZI_DATA_KEY__`). The publish sandbox strips author
  `<script src>`, so this is the only way to load the SDK.
- **Gate (internal-use only, not a public API):**
  1. **Origin/Referer allowlist** — caller must be `huozi.app` or a subdomain;
     other origins, `Origin: null` (sandboxed iframes) → `403`.
  2. **Static token** — header `X-Huozi-Key: <token>` (or `?_t=<token>`),
     else `403`. The token is injected per-page by the Viewer.
- **Auto-crumb:** `v7/quote` and `v10/quoteSummary` need a Yahoo crumb+cookie;
  the proxy fetches and caches one (1h per isolate, auto-refresh on 401), so
  these "just work" through the SDK.

---

## 3. SDK API (`window.huozi.market`, v1.0.0)

All methods return a `Promise` resolving to **raw Yahoo JSON**; they throw on
non-2xx (`HTTP <status>`).

| Method | Signature (defaults) | Underlying request |
|--------|----------------------|--------------------|
| `chart` | `chart(symbol, { range="1mo", interval="1d" })` | `GET /v8/finance/chart/<symbol>?range&interval` |
| `quote` | `quote(symbols)` — string `"A,B"` or `string[]` | `GET /v7/finance/quote?symbols=A,B` |
| `quoteSummary` | `quoteSummary(symbol, { modules="price" })` | `GET /v10/finance/quoteSummary/<symbol>?modules` |
| `search` | `search(q)` | `GET /v1/finance/search?q=` |
| `get` | `get(path)` — any Yahoo path | passthrough (best-effort) |
| `subscribe` | `subscribe(symbols, cb, { refreshMs, chart })` | polls `quote` (or `chart` if `chart` opt set) |
| `config` | `config({ base?, token? })` | override base/token (rarely needed) |

**`subscribe` notes:** `refreshMs` is **clamped to a 15 000 ms minimum**;
polling **pauses while the tab is hidden** (`document.hidden`) and resumes on
focus; on network error the callback gets `{ error:"network", message }`.
Returns `{ stop(), refresh() }`.

---

## 4. Supported endpoints

### 4.1 Chart / price series — `/v8/finance/chart/<symbol>`
Crumbless. Time series + meta. Most-used endpoint.
- Params: `range` (§5), `interval` (§5).
- Key response (`json.chart.result[0]`):
  - `meta.regularMarketPrice`, `meta.chartPreviousClose`, `meta.currency`,
    `meta.exchangeName`, `meta.symbol`
  - `timestamp[]` (epoch seconds, aligned to the arrays below)
  - `indicators.quote[0]`: `open[] / high[] / low[] / close[] / volume[]`
  - `indicators.adjclose[0].adjclose[]` (daily ranges)

### 4.2 Quote — `/v7/finance/quote?symbols=A,B`
Auto-crumb. One snapshot row per symbol (batch supported).
- Key response (`json.quoteResponse.result[]`): `symbol`,
  `regularMarketPrice`, `regularMarketChange`, `regularMarketChangePercent`,
  `regularMarketPreviousClose`, `currency`, `shortName/longName`,
  `marketState`, `regularMarketVolume`, `marketCap`, `fiftyTwoWeekHigh/Low`.

### 4.3 Quote summary / fundamentals — `/v10/finance/quoteSummary/<symbol>?modules=…`
Auto-crumb. Per-module detail blocks.
- Param: `modules` = comma-list (§5).
- Response: `json.quoteSummary.result[0].<module>` per requested module.

### 4.4 Search — `/v1/finance/search?q=…`
Crumbless. Symbol/news lookup.
- Response: `json.quotes[]` (`symbol`, `shortname`, `exchange`, `quoteType`),
  `json.news[]`.

---

## 5. Parameter reference

These are **Yahoo's accepted values** — the proxy/SDK pass them through and do
**not** validate. Invalid combos return Yahoo's own error JSON.

- **`range`**: `1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max`
- **`interval`**: `1m 2m 5m 15m 30m 60m 90m 1h 1d 5d 1wk 1mo 3mo`
  - Intraday intervals (`<1d`) only return data for short recent ranges
    (Yahoo limits, e.g. `1m` ≈ last 7 days). Daily+ for long ranges.
- **`modules`** (common): `price summaryDetail defaultKeyStatistics
  financialData assetProfile earnings earningsHistory calendarEvents
  recommendationTrend incomeStatementHistory balanceSheetHistory
  cashflowStatementHistory`

---

## 6. Symbols / asset classes

Use **Yahoo symbol format**. The proxy is symbol-agnostic — anything Yahoo
knows works.

| Asset class | Format | Example |
|-------------|--------|---------|
| US equity | bare ticker | `AAPL`, `MSFT` |
| HK equity | `<code>.HK` | `0700.HK` |
| TW equity | `<code>.TW` | `2330.TW` |
| Index | `^<code>` | `^GSPC`, `^HSI` |
| FX | `<pair>=X` | `EURUSD=X`, `USDCNY=X` |
| Crypto | `<coin>-<ccy>` | `BTC-USD`, `ETH-USD` |
| Futures | `<code>=F` | `CL=F`, `GC=F` |

---

## 7. Frequency & caching

- **Polling, not streaming.** SDK default is **one-shot**; opt in via
  `data-refresh="<ms>"` (declarative) or `subscribe(..., { refreshMs })`.
- **Caching:** edge `cf: { cacheTtl: 5 }` + response `cache-control:
  public, max-age≈30` → repeated/concurrent reads within ~30s are served from
  cache. Effective freshness ≈ 30s; fast polling is collapsed, so you cannot
  hammer Yahoo through the proxy.
- No per-user quota in the proxy; access control is Origin + token, not rate.

---

## 8. Limits / known quirks

- Only works in huozi-rendered docs (token is page-injected). Not a public API.
- Public market data only; ~30s cache; not real-time tick streaming.
- `meta.marketState` is often `null` in chart meta — do **not** rely on it for
  pre/post-market detection (use `/v7/quote`'s `marketState`).
- Occasional Cloudflare-edge `error code: 1042` (cold-start / subrequest
  jitter) — retry; the cache smooths repeats.
- Sibling sources (`api-data/rate`, `api-data/fx`, user-defined) will mount as
  `huozi.<domain>.*` under the same `api-data` framework.

---

## 9. Minimal examples

```html
<meta name="huozi:bundle" content="api-data">
<!-- Programmatic -->
<script>
  huozi.market.chart('AAPL', { range: '1mo', interval: '1d' })
    .then(function (j) {
      var r = j.chart.result[0];
      // r.meta.regularMarketPrice
      // r.timestamp[] + r.indicators.quote[0].close[]
    });
</script>

<!-- Declarative (zero JS) -->
<div data-market="0700.HK" data-range="1y" data-interval="1d"></div>
<script>
  addEventListener('huozi-market', function (e) {
    var m = e.detail.result.meta;   // m.regularMarketPrice
  });
</script>
```

---

*Implementation: `data-worker/src/index.js` (proxy) + `src/sdk.js` (SDK);
Viewer wiring: `app/src/lib/html/asset-registry.ts` (`api-data` bundle);
validator: `packages/huozi-cloud/src/validate/html-validate.ts`.*
