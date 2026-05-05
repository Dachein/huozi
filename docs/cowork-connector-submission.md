# Cowork / Connectors Directory submission

Tracking the work to get huozi into Anthropic's **Connectors Directory** — the registry that Cowork (Claude Desktop's third tab, alongside Chat and Code), Claude.ai web, and Claude Desktop's Connectors panel all browse.

**Status as of 2026-05-05: paused.** The technical and content prerequisites are all done and shipped to production; what remains is operational (test account + form submission). Resume by jumping to [How to resume](#how-to-resume) below.

Contents:

1. [Why this matters](#why-this-matters)
2. [What's already shipped](#whats-already-shipped) — 4 commits, all on `main`
3. [What still needs doing](#what-still-needs-doing) — owner: a human
4. [How to resume](#how-to-resume) — step-by-step from a cold start
5. [Reference parameters](#reference-parameters) — redirect URIs, doc URLs, contacts
6. [Long-term optimization](#long-term-optimization) — DCR → CIMD, not blocking

---

## Why this matters

The huozi MCP server can already be installed in three host families:

| Host | Install path | Status |
|---|---|---|
| Claude Code (CLI / Desktop > Code) | `claude mcp add ...` + `/mcp` OAuth | ✅ works today |
| Cursor / Codex CLI | one-line `mcp.json` / `codex mcp add` | ✅ works today |
| Claude.ai web / Cowork / Desktop > Connectors (manual add) | **Customize → Connectors → +** UI; paste `https://cloud.huozi.app/mcp` | ✅ works today |
| Claude.ai web / Cowork / Desktop > Connectors (search) | registry-gated picker — search a directory | ❌ **huozi not in directory yet** |

Important nuance: `search_mcp_registry` inside Cowork returns nothing for `huozi`, so Cowork users *can't discover* huozi from the built-in search. But the **Customize → Connectors → +** UI accepts any HTTPS MCP URL on every paid plan (Free / Pro / Max / Team / Enterprise). So the practical Cowork install today is "paste this URL into the +" — exactly what `huozi.app/start` now teaches in the new **Claude Cowork tab** (added 2026-05-05).

The Connectors Directory submission solves a different problem: discoverability. Once accepted, huozi shows up in the same picker that lists Gmail / Drive / Notion / Slack today, so a Cowork user can install it without knowing the URL. Submission target: https://clau.de/mcp-directory-submission.

---

## What's already shipped

Four commits across two repos. All on `main`, deployed.

### `huozi/huozi` (app) · 1 commit

```
d13f8a0  feat(mcp): expose tool annotations for Connectors Directory
         packages/huozi-cloud/src/mcp/server.ts  +10
```

Surfaces each tool's `userFacingName` and `isReadOnly` (already carried per-tool internally) as MCP `ListTools` annotations: `title`, `readOnlyHint`, `destructiveHint`. Closes the #1 reason Connectors Directory submissions get rejected — every tool now declares whether it's read-only or destructive, so any host can render confirmation UIs around destructive operations. All 17 huozi tools benefit; 226 tests pass with no regression.

### `Dachein/huozi-marketing` · 3 commits

```
813ca43  docs(start): two-step Claude Code install + Desktop > Code note
         install-picker.tsx + 4 i18n locales  +30 / -7

7bd90be  feat(docs): /docs/connector + /privacy for Connectors Directory
         src/app/docs/connector/page.tsx  (new, 287 lines)
         src/app/privacy/page.tsx         (new, 148 lines)

2e79d04  feat(brand): add favicon, icon.svg, apple-icon.svg from product repo
         src/app/{icon.svg, apple-icon.svg, favicon.ico}  +8
```

- **`813ca43`** — Replaces the previous oneshot `claude mcp add ... && claude "use huozi"` flow on huozi.app/start (which couldn't survive OAuth — the host process exited and closed the loopback callback port before the browser redirect arrived) with explicit Step 1 (terminal paste) + Step 2 (`/mcp` → huozi → Authenticate). The note clarifies the same flow applies when launching Code from inside Claude Desktop.
- **`7bd90be`** — Adds the two public URLs the Connectors Directory submission requires: `huozi.app/docs/connector` (the page reviewers land on, with three worked example prompts: research notes → 16:9 deck, CSV → public dashboard, cross-session knowledge base maintenance) and `huozi.app/privacy` (architecture-grounded transparency stub flagged `[LEGAL REVIEW REQUIRED]` until a vetted policy lands).
- **`2e79d04`** — Mirrors the `活` brand mark (dark rounded square + cream character, same visual language as the 印/版/盘 glyphs) from the product repo into the marketing site so huozi.app gets a proper browser-tab icon when reviewers open `/docs/connector`.

---

## What still needs doing

Two tasks, both require a human.

### Task 14 · Create a test workspace + reviewer credentials

The submission form asks for an account Anthropic's reviewer can log into to verify huozi works end-to-end. Concretely:

1. Sign up a fresh email (e.g. `anthropic-review@huozi.app` or similar) at cloud.huozi.app
2. Inside that workspace, pre-load 3-5 example files that demonstrate huozi's surface — a README in Markdown, a CSV, an SVG, maybe a `huozi_template`-generated deck so the reviewer immediately sees what huozi enables
3. Document the credentials and any setup steps somewhere safe (NOT in this file, NOT in the repo) — they go directly into the submission form

### Task 15 · Submit the form at https://clau.de/mcp-directory-submission

Once the test account exists, fill the form. Fields it asks for and how to answer them are in [Reference parameters](#reference-parameters) below.

---

## How to resume

Cold-start checklist when picking this back up:

1. **Verify nothing broke.** Run `claude mcp list`; huozi should still be `✓ Connected` with the OAuth token still valid. Open `huozi.app/docs/connector` — it should render. Open `huozi.app/privacy` — it should render.
2. **Decide on logo for the form.** The directory listing usually wants a square SVG mark.
   - Option A (fastest): upload `huozi/huozi-marketing/src/app/apple-icon.svg` (180×180 viewBox) directly
   - Option B (cleaner): create a `huozi-marketing/public/connector-logo.svg` at 256×256 viewBox, ideally with transparent background so the directory's own card chrome shows through; current `apple-icon.svg` has a dark `#2c2418` rounded square as backdrop, which works but isn't theme-neutral
3. **Decide on privacy policy.** The current `/privacy` page is an architecture-grounded transparency stub with `[LEGAL REVIEW REQUIRED]` at the bottom. For a real submission, replace with a legally-vetted Privacy Policy + Data Processing Addendum covering: data controller info, jurisdiction, retention period, GDPR / CCPA stance, sub-processors. The stub structure is a fine starting point.
4. **Do Task 14** (above): create reviewer test account + credentials.
5. **Do Task 15** (above): submit the form.
6. **Wait.** No published SLA from Anthropic; correspondence may go to `mcp-review@anthropic.com`. The form sometimes has a self-serve status dashboard; check the confirmation email.

---

## Reference parameters

Everything you need to fill the form, in one place.

### Submission form

- URL: https://clau.de/mcp-directory-submission
- Escalation contact: `mcp-review@anthropic.com`

### MCP server endpoint

- Production URL: `https://cloud.huozi.app/mcp`
- Transport: Streamable HTTP (MCP 2025-11-25 spec)
- Auth: OAuth 2.1 + PKCE + Dynamic Client Registration
- Discovery: `https://cloud.huozi.app/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`

### Redirect URIs accepted by huozi (for the form's "OAuth callback" field)

The huozi authorization server (`packages/huozi-cloud/src/storage/cloudflare/oauth.ts`) accepts any `redirect_uri` matching either:

- `https://*` — any HTTPS hostname (no host whitelist; per-client, not global)
- `http://localhost`, `http://127.0.0.1`, `http://[::1]` — RFC 8252 loopback, any port

Which means all four URLs the directory requires are already accepted with zero code changes:

```
https://claude.ai/api/mcp/auth_callback     ← hosted Claude / Claude.ai web / Cowork / Desktop
https://claude.com/api/mcp/auth_callback    ← same as above on the .com domain
http://localhost/callback                   ← Claude Code, Cursor, Codex (loopback)
http://127.0.0.1/callback                   ← same, IPv4 loopback
```

The host registers its own `redirect_uri` via `/oauth/register` (DCR) at first connection — no per-host configuration on the huozi side.

### Public URLs reviewers will visit

- Connector docs page: `https://huozi.app/docs/connector` — three worked examples + security notes
- Privacy: `https://huozi.app/privacy` — currently a transparency stub
- Marketing home: `https://huozi.app/`
- Install picker: `https://huozi.app/start`

### Logo / favicon assets

| Asset | Path | Size |
|---|---|---|
| Marketing favicon | `huozi-marketing/src/app/favicon.ico` | 16×16 + 32×32 |
| Marketing icon (auto `<link rel="icon">`) | `huozi-marketing/src/app/icon.svg` | 32×32 viewBox |
| Marketing apple-touch-icon | `huozi-marketing/src/app/apple-icon.svg` | 180×180 viewBox |
| Original product source | `huozi/src/app/{favicon.ico,icon.svg,apple-icon.svg}` | same |
| OG image (1200×630) | `huozi/public/og.svg` | 1200×630 |

For the directory listing logo upload, recommended is `apple-icon.svg` (180×180) — large enough for any directory rendering, vector-clean.

### Tool surface (for the form's tool description)

17 tools total. Grouped:

- **Claude Code dialect mirror (5):** `huozi_read`, `huozi_write`, `huozi_edit`, `huozi_glob`, `huozi_grep` — bit-exact mirrors of Claude Code's file-tool dialect.
- **Directory & versioning (6):** `huozi_list_tree`, `huozi_mkdir`, `huozi_mv`, `huozi_rm`, `huozi_batch_edit`, `huozi_history`
- **Binary / asset (3):** `huozi_upload`, `huozi_download`, `huozi_image_render`
- **Publishing / identity (3):** `huozi_template`, `huozi_share`, `huozi_whoami`

All carry MCP `annotations` ({`title`, `readOnlyHint`, `destructiveHint`}) as of commit `d13f8a0`. No tool mixes read and write semantics; search-style tools never delete, write-style tools never query unrelated data.

### Contact for submission

- Public contact in `/docs/connector`: `hello@huozi.app`
- Same for security disclosures (no separate security mailbox yet)

---

## Long-term optimization

Not blocking submission; record so it doesn't get forgotten.

**DCR → CIMD migration.** huozi's OAuth currently only supports Dynamic Client Registration (`/oauth/register`). Anthropic recommends supporting Client ID Metadata Document (CIMD) or Anthropic-held credentials for high-traffic connectors instead. With DCR, every fresh Claude.ai session calls `/oauth/register` and writes a new row to `oauth_clients` — at directory-listing scale (potentially tens of thousands of users), that table grows unboundedly. CIMD avoids the registration call entirely (the host hosts a metadata document at a stable URL describing itself; huozi resolves it on demand). When huozi's `oauth_clients` row count starts trending toward five digits, prioritize this work.

Related: review the rejection criteria periodically at https://claude.com/docs/connectors/building/review-criteria — the spec evolves.
