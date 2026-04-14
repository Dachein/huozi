import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs for Agents",
  description: "Agent-friendly API reference for Huozi — plain text, Markdown-formatted.",
};

const DOCS = `# Huozi API Reference for Agents

Base URL: https://huozi.app

## Authentication

All publishing endpoints require:
  Authorization: Bearer hz_your_api_key

API keys start with "hz_" prefix. Get one via registration flow or dashboard.

---

## Registration (passwordless, email OTP)

### Step 1: Send verification code
POST /api/v1/auth/signup
Content-Type: application/json
{"email": "<user_email>"}
→ Sends OTP code to email.

### Step 2: Verify code
POST /api/v1/auth/verify
Content-Type: application/json
{"email": "<user_email>", "code": "<6-8 digit code>"}
→ Returns: access_token, user_id

### Step 3: Create workspace + API key
POST /api/v1/auth/setup
Authorization: Bearer <access_token>
Content-Type: application/json
{"workspace_slug": "<slug>"}
→ Returns: api_key, workspace.url
→ Slug suggestion: use email prefix (alice@gmail.com → alice)

---

## Publish a Page

POST /api/v1/pages
Authorization: Bearer hz_your_key
Content-Type: application/json

Required fields:
  title    string   Page title (max 500 chars)
  content  string   Markdown or HTML content

Optional fields:
  slug          string        URL slug (auto-generated from title if omitted, keep under 8 words)
  description   string        SEO description (max 500 chars)
  content_type  "markdown"|"html"  Default: "markdown"
  published     boolean       Default: true
  access_token  string|null   "random" = 6-char code, custom string = password, null = public

Behavior:
  - New slug → creates page (v1), returns 201
  - Existing slug → creates new version (v2, v3...), returns 200
  - Response includes: id, slug, title, version, url, access_token (if random)

---

## List Pages

GET /api/v1/pages?limit=20&offset=0
Authorization: Bearer hz_your_key
→ Returns: { pages: [...] }

---

## Get a Page

GET /api/v1/pages/:slug
Authorization: Bearer hz_your_key
→ Returns full page data including latest version content

---

## Update a Page

PUT /api/v1/pages/:slug
Authorization: Bearer hz_your_key
Content-Type: application/json

Optional fields:
  title        string   Update title
  content      string   Update content (creates new version)
  description  string   Update SEO description
  published    boolean  Publish or unpublish

---

## Delete a Page

DELETE /api/v1/pages/:slug
Authorization: Bearer hz_your_key
→ Deletes page and all versions permanently

---

## Versions

Every publish to the same slug creates a new version.

GET /api/v1/pages/:slug/versions
Authorization: Bearer hz_your_key
→ Returns: { versions: [{ version, content_type, created_at }, ...] }

Public URLs:
  /workspace/slug      → latest version
  /workspace/slug/v1   → version 1
  /workspace/slug/v3   → version 3

---

## Access Tokens (Page Protection)

Set during publish (access_token field) or update separately:

PUT /api/v1/pages/:slug/token
Authorization: Bearer hz_your_key
Content-Type: application/json

  {"access_token": "random"}     → generate 6-char code, returned once
  {"access_token": "mypass"}     → custom password
  {"access_token": null}         → remove protection, make public

All versions of a slug share the same token.
Stored as SHA-256 hash, plaintext never stored.

---

## HTML Support

Set content_type: "html" to publish HTML pages.

### Input formats
  Full document: <html><head>...</head><body>...</body></html>
    → <style> and <meta> in <head> are extracted
  Fragment: any HTML without document wrapper
    → treated as body content

### What is allowed
  HTML tags:    All standard (div, span, table, svg, img, video, audio, etc.)
  CSS:          <style> blocks, inline style="", all standard properties
  SVG:          Full support (filters, animations, gradients)
  Images:       img, picture with http/https src
  Forms:        Display only (input/select render, action/method stripped)

### What is stripped
  JavaScript:   ALL <script> tags, ALL event handlers (onclick, onerror, etc.)
  Iframes:      <iframe>, <embed>, <object>
  External CSS: <link rel="stylesheet"> (use <style> blocks instead)
  Dangerous:    javascript: URLs → rewritten to #
                @import, expression(), -moz-binding in CSS
                data: URIs in img src

### Best practices
  1. Self-contained: all CSS in <style> blocks, no external refs
  2. Images: use absolute https:// URLs
  3. No JS: pages are static, plan accordingly
  4. Test locally: render HTML in browser before publishing

---

## Markdown Features

  GFM tables:        | col | col |
  Task lists:        - [x] done
  Strikethrough:     ~~text~~
  Code highlighting: \`\`\`python ... \`\`\` (auto-detect supported)
  Math (KaTeX):      $inline$ and $$block$$
  Heading anchors:   Auto-generated IDs
  Inline HTML:       Allowed, same sanitization as HTML pages

---

## Limits

  Content size:           2 MB per page
  Title:                  500 chars
  Slug:                   100 chars
  Workspace slug:         1-40 chars, [a-z0-9-]
  API keys per workspace: Unlimited
  Pages per workspace:    Unlimited
  Versions per page:      Unlimited

---

## Quick Reference

  POST   /api/v1/auth/signup          Send OTP
  POST   /api/v1/auth/verify          Verify OTP → access_token
  POST   /api/v1/auth/setup           Create workspace → api_key
  POST   /api/v1/pages                Publish/update page
  GET    /api/v1/pages                List pages
  GET    /api/v1/pages/:slug          Get page
  PUT    /api/v1/pages/:slug          Update page
  DELETE /api/v1/pages/:slug          Delete page
  GET    /api/v1/pages/:slug/versions List versions
  PUT    /api/v1/pages/:slug/token    Manage access token`;

export default function Docs4AgentPage() {
  return (
    <div className="min-h-screen bg-background">
      <pre className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed whitespace-pre-wrap font-mono text-foreground">
        {DOCS}
      </pre>
    </div>
  );
}
