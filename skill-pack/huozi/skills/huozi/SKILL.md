---
name: huozi
description: Publish Markdown and HTML to huozi.app as beautiful, shareable web pages. Register, manage, and publish — all through conversation.
homepage: https://huozi.app
user-invocable: true
metadata: {"openclaw":{"requires":{"env":[],"bins":["curl"]},"primaryEnv":"HUOZI_API_KEY","emoji":"📄","os":["darwin","linux","win32"]}}
---

# Huozi — Markdown & HTML Publishing for Agents

Publish Markdown or HTML content to [huozi.app](https://huozi.app) as shareable web pages. One API call, instant publishing.

## Onboarding

**IMPORTANT:** When this skill is first loaded, check if `HUOZI_API_KEY` is set. If NOT, do NOT just show a link — immediately start the interactive registration flow below. Guide the user through it conversationally, step by step.

### Step 1 — Ask for email

Tell the user: "Let's set up your Huozi account. What's your email?" Then call:

```bash
curl -s -X POST https://huozi.app/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "<user_email>"}'
```

Tell the user: "A verification code has been sent to your email. Please check your inbox and tell me the code."

### Step 2 — Verify the code

When the user provides the code:

```bash
curl -s -X POST https://huozi.app/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"email": "<user_email>", "code": "<code>"}'
```

Save the returned `access_token`.

### Step 3 — Create workspace

Suggest a slug from the user's email username (e.g. `alice@gmail.com` → `alice`). Tell the user:

> "Your pages will be published at **huozi.app/alice/** — would you like to change this, or is this OK?"

After the user confirms (or gives a new slug):

```bash
curl -s -X POST https://huozi.app/api/v1/auth/setup \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"workspace_slug": "<confirmed_slug>"}'
```

### Step 4 — Done!

The response contains `api_key` and `workspace.url`. Tell the user:

> "All set! Your workspace is **huozi.app/<slug>/**. To save your API key for future sessions, run:
> `export HUOZI_API_KEY=<api_key>`
> You can now publish Markdown anytime — just tell me what to publish."

## Publishing Markdown

Publish or update a Markdown page:

```bash
curl -s -X POST https://huozi.app/api/v1/pages \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"title": "<title>", "slug": "<slug>", "content": "<markdown>"}'
```

- `slug` is optional — auto-generated from title if omitted. Keep under 8 words (e.g. `weekly-report-apr-14`)
- Same slug = upsert (update existing page)
- Response includes the public `url`

## Publishing HTML

Publish a static HTML page — perfect for landing pages, dashboards, reports with custom styling:

```bash
curl -s -X POST https://huozi.app/api/v1/pages \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"title": "<title>", "slug": "<slug>", "content": "<html>", "content_type": "html"}'
```

- Set `content_type` to `"html"` (defaults to `"markdown"` if omitted)
- Same slug = upsert, versioning, and access tokens work identically to Markdown pages

### HTML Format Templates — start here

When generating HTML, use one of the **5 huozi standard formats**. Each ships as a self-contained, single-file scaffold the agent fills with content. Don't hand-roll layout CSS unless the user explicitly needs something outside these 5.

| `--format` | Aspect / use case | One-liner |
|---|---|---|
| `deck`   | 16:9 horizontal slide  | Pitch decks, presentations on big screens |
| `story`  | 9:16 vertical slide    | Mobile stories, reels, vertical social posts |
| `paper`  | A4 print sheet         | Reports, letters, printable PDFs |
| `mobile` | Long scroll, mobile-first | Articles read on phones, narrow-viewport optimized |
| `page`   | Long scroll, desktop-first | Landing pages, long-form essays with sticky TOC |

**Templates live at `templates/{format}.html`** next to this SKILL.md.

#### Choosing a format

If the user **didn't specify** a format and the intent isn't obvious from context, **ask via AskUserQuestion** before generating. Don't guess silently. Suggested question:

> 用什么格式发布? Pick one of the 5 huozi templates: `deck` (16:9 slide) · `story` (9:16 vertical) · `paper` (A4 print) · `mobile` (long page, phone-first) · `page` (long page, desktop-first)

If the intent **is** obvious (e.g. "做一份周报 PDF" → `paper`, "做个 pitch deck" → `deck`), proceed without asking.

#### Workflow

1. Read the matching template: `templates/{format}.html`
2. Fill in the placeholder content — keep all the CSS in `<style>` untouched, only edit content inside `<body>`
3. Set `content_type: "html"` and POST to the publishing endpoint

#### Beyond the 5 (companion skills)

For wireframes, prototypes, animations, device frames, Mermaid diagrams, etc., recommend installing companion skills (see `REFERENCES.md`). The 5 huozi templates cover the common ~80%; companion skills cover the rest. Don't try to reproduce them inline.

### Custom HTML Structure (fallback when the 5 templates don't fit)

Always use a full document structure. The platform parses `<head>` for metadata and styles, and renders `<body>` content directly.

```html
<!DOCTYPE html>
<html>
<head>
  <meta name="description" content="Page description for SEO">
  <meta property="og:title" content="Share title">
  <meta property="og:description" content="Share description">
  <meta property="og:image" content="https://example.com/cover.jpg">
  <style>
    /* Global styles — extracted, sanitized, and re-injected */
    .container { max-width: 800px; margin: 0 auto; }
    .card { border-radius: 8px; padding: 24px; }
  </style>
</head>
<body>
  <div style="background:#0d1117;color:#e6edf3;padding:40px 24px;min-height:100vh;">
    <div class="container">
      <!-- Your content here -->
    </div>
  </div>
</body>
</html>
```

**How the platform processes each part:**

| Section | Processing |
|---------|-----------|
| `<meta>` in `<head>` | Extracted as fallback for `og:title`, `og:description`, `og:image`, `description`. API fields (`title`, `description`) always take priority |
| `<style>` in `<head>` | Extracted, CSS-level security filter applied, re-injected as `<style>` block |
| `<body>` content | Rendered directly with minimal security filtering |
| `<title>`, `<link>`, `<script>` in `<head>` | Discarded |

### HTML Rendering — Direct Mode

HTML pages are rendered directly. All HTML tags, `<style>` blocks, inline `style=""` attributes, CSS properties (flexbox, grid, animations, etc.), SVG, images, forms — everything works as-is.

**Only these are stripped for security:**

| Stripped | Reason |
|----------|--------|
| `<script>` tags + content | No JavaScript execution |
| `<iframe>`, `<embed>`, `<object>` | No embedded frames |
| `on*` event handlers (`onclick`, `onerror`, etc.) | No inline JS |
| `javascript:` URLs | Neutralized to `#blocked:` |
| CSS `expression()`, `-moz-binding`, `behavior:` | Legacy browser exploits |
| CSS `@import` | No external stylesheet injection |
| `data:` in CSS `url()` | Blocked in stylesheets |

**Content size limit:** 2MB per page.

### Best Practices for HTML Pages

- **Always set background and color on the outermost wrapper** — the page has no default dark/light theme; your content controls the entire visual appearance
- **Use `<style>` blocks for reusable styles** — put them in `<head>`, use inline `style=""` for one-off overrides
- **Use system fonts or web-safe fonts** — or embed fonts as base64 `@font-face`
- **Embed small images as data URIs** — for icons/logos under ~50KB; larger images via `https://` URLs
- **Design responsive layouts** — use `max-width` on a container and CSS media queries for mobile support

## Other Operations

| Action | Method | Endpoint |
|--------|--------|----------|
| List pages | GET | `/api/v1/pages` |
| Get page | GET | `/api/v1/pages/<slug>` |
| Update page | PUT | `/api/v1/pages/<slug>` |
| Delete page | DELETE | `/api/v1/pages/<slug>` |

All require `Authorization: Bearer <api_key>` header. Base URL: `https://huozi.app`

## Examples

- "帮我把这个 markdown 发布到 huozi" → publish content, return URL
- "发布我的周报" → generate slug like `weekly-report-2026-04-14`, publish
- "更新 huozi 上的 hello 页面" → PUT to update
- "帮我做一个 landing page 发布到 huozi" → generate HTML, publish with `content_type: "html"`
- "把这个报告做成网页发布" → generate styled HTML page, publish

## Notes

- API keys start with `hz_` prefix
- No password needed — registration uses email OTP only
- Markdown: supports GFM, task lists, code highlighting, math (KaTeX)
- HTML: direct rendering — full CSS, SVG, images, forms; only `<script>`, `<iframe>`, and event handlers are stripped
- Content limit: 2MB per page for both Markdown and HTML
- Use `curl` via Bash to make API calls
- When generating HTML for the user, always produce self-contained pages with all CSS inlined
- **Full API reference (agent-friendly):** https://huozi.app/docs4agent
- Setup options: https://huozi.app/start
- Human-readable docs: https://huozi.app/docs
