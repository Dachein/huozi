import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { SiteHeader } from "@/components/site-header";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Huozi API Reference — publish Markdown and HTML as shareable web pages.",
};

function Code({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-[#1c1914] text-[#e8e0d0] p-4 pr-12 text-sm overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold mt-16 mb-4 scroll-mt-20">
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </h2>
  );
}

function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-semibold mt-10 mb-3 scroll-mt-20">
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{children}</p>;
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border border-border rounded-lg">
        {children}
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-2.5 font-medium border-b border-border bg-muted">
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-4 py-2.5 border-b border-border ${mono ? "font-mono text-xs" : ""}`}>
      {children}
    </td>
  );
}

export default async function DocsPage() {
  const locale = await getLocale();

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader locale={locale} />

      <div className="flex-1 mx-auto max-w-5xl px-6 py-12 flex gap-12">
        {/* Sidebar */}
        <nav className="hidden lg:block w-56 shrink-0 sticky top-20 self-start">
          <ul className="space-y-1 text-sm">
            <li><a href="#overview" className="block py-1 text-muted-foreground hover:text-foreground">Overview</a></li>
            <li><a href="#authentication" className="block py-1 text-muted-foreground hover:text-foreground">Authentication</a></li>
            <li><a href="#registration" className="block py-1 text-muted-foreground hover:text-foreground">Registration</a></li>
            <li><a href="#publish" className="block py-1 text-muted-foreground hover:text-foreground">Publish a Page</a></li>
            <li><a href="#list-pages" className="block py-1 text-muted-foreground hover:text-foreground">List Pages</a></li>
            <li><a href="#get-page" className="block py-1 text-muted-foreground hover:text-foreground">Get a Page</a></li>
            <li><a href="#update-page" className="block py-1 text-muted-foreground hover:text-foreground">Update a Page</a></li>
            <li><a href="#delete-page" className="block py-1 text-muted-foreground hover:text-foreground">Delete a Page</a></li>
            <li><a href="#versions" className="block py-1 text-muted-foreground hover:text-foreground">Versions</a></li>
            <li><a href="#access-tokens" className="block py-1 text-muted-foreground hover:text-foreground">Access Tokens</a></li>
            <li><a href="#html-support" className="block py-1 text-muted-foreground hover:text-foreground">HTML Support</a></li>
            <li><a href="#markdown-features" className="block py-1 text-muted-foreground hover:text-foreground">Markdown Features</a></li>
            <li><a href="#rate-limits" className="block py-1 text-muted-foreground hover:text-foreground">Limits</a></li>
          </ul>
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <h1 className="text-4xl font-bold tracking-tight">API Documentation</h1>
          <P>Complete reference for the Huozi API. Base URL: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs font-mono">https://huozi.app</code></P>

          {/* Overview */}
          <H2 id="overview">Overview</H2>
          <P>
            Huozi is a publishing service that turns Markdown and HTML into shareable web pages.
            Every page gets a permanent URL at <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs font-mono">huozi.app/&#123;workspace&#125;/&#123;slug&#125;</code>.
            Pages are versioned automatically — each publish creates a new version without overwriting previous content.
          </P>
          <Table>
            <thead>
              <tr><Th>Feature</Th><Th>Details</Th></tr>
            </thead>
            <tbody>
              <tr><Td>Content types</Td><Td>Markdown (default), HTML</Td></tr>
              <tr><Td>Versioning</Td><Td>Automatic. Same slug = new version. Access via /v1, /v2, etc.</Td></tr>
              <tr><Td>Access control</Td><Td>Optional per-page access token (password protection)</Td></tr>
              <tr><Td>Authentication</Td><Td>API Key (Bearer token) for publishing, email OTP for registration</Td></tr>
              <tr><Td>Content limit</Td><Td>2 MB per page</Td></tr>
            </tbody>
          </Table>

          {/* Authentication */}
          <H2 id="authentication">Authentication</H2>
          <P>
            All publishing endpoints require an API key passed as a Bearer token.
            API keys are scoped to a workspace and start with the <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs font-mono">hz_</code> prefix.
          </P>
          <Code code={`Authorization: Bearer hz_your_api_key`} />

          {/* Registration */}
          <H2 id="registration">Registration</H2>
          <P>Passwordless registration using email OTP. Three steps to get an API key.</P>

          <H3 id="reg-signup">POST /api/v1/auth/signup</H3>
          <P>Send a verification code to the email address. Creates account if new, or logs in existing user.</P>
          <Code code={`curl -X POST https://huozi.app/api/v1/auth/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email": "alice@example.com"}'`} />
          <P>Response:</P>
          <Code code={`{
  "message": "Verification code sent to your email.",
  "email": "alice@example.com"
}`} />

          <H3 id="reg-verify">POST /api/v1/auth/verify</H3>
          <P>Verify the code from email. Returns an access token for the setup step.</P>
          <Code code={`curl -X POST https://huozi.app/api/v1/auth/verify \\
  -H "Content-Type: application/json" \\
  -d '{"email": "alice@example.com", "code": "12345678"}'`} />
          <P>Response:</P>
          <Code code={`{
  "message": "Email verified successfully.",
  "access_token": "eyJ...",
  "user_id": "uuid"
}`} />

          <H3 id="reg-setup">POST /api/v1/auth/setup</H3>
          <P>Create a workspace and generate an API key. Requires the access token from the verify step.</P>
          <Code code={`curl -X POST https://huozi.app/api/v1/auth/setup \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"workspace_slug": "alice"}'`} />
          <P>Response:</P>
          <Code code={`{
  "message": "Setup complete! You can now publish pages.",
  "workspace": {
    "slug": "alice",
    "url": "https://huozi.app/alice"
  },
  "api_key": "hz_abc123..."
}`} />

          {/* Publish */}
          <H2 id="publish">Publish a Page</H2>
          <H3 id="publish-post">POST /api/v1/pages</H3>
          <P>
            Create a new page or update an existing one. If a page with the same slug exists
            in your workspace, a new version is created automatically (upsert behavior).
          </P>
          <Table>
            <thead>
              <tr><Th>Field</Th><Th>Type</Th><Th>Required</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <tr><Td mono>title</Td><Td>string</Td><Td>Yes</Td><Td>Page title (max 500 chars)</Td></tr>
              <tr><Td mono>content</Td><Td>string</Td><Td>Yes</Td><Td>Markdown or HTML content</Td></tr>
              <tr><Td mono>slug</Td><Td>string</Td><Td>No</Td><Td>URL slug. Auto-generated from title if omitted. Keep under 8 words.</Td></tr>
              <tr><Td mono>description</Td><Td>string</Td><Td>No</Td><Td>SEO description (max 500 chars)</Td></tr>
              <tr><Td mono>content_type</Td><Td>string</Td><Td>No</Td><Td>{`"markdown"  (default) or "html"`}</Td></tr>
              <tr><Td mono>published</Td><Td>boolean</Td><Td>No</Td><Td>Default true. Set false for drafts.</Td></tr>
              <tr><Td mono>access_token</Td><Td>string | null</Td><Td>No</Td><Td>{`"random" = generate 6-char code, custom string = your password, null = public`}</Td></tr>
            </tbody>
          </Table>
          <Code code={`curl -X POST https://huozi.app/api/v1/pages \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Weekly Report",
    "content": "# Weekly Report\\n\\nAll systems operational.",
    "slug": "weekly-report"
  }'`} />
          <P>Response (201 for new, 200 for update):</P>
          <Code code={`{
  "id": "uuid",
  "slug": "weekly-report",
  "title": "Weekly Report",
  "version": 1,
  "url": "https://huozi.app/alice/weekly-report",
  "access_token": "bvfy33"  // only if access_token was "random"
}`} />

          {/* List */}
          <H2 id="list-pages">List Pages</H2>
          <H3 id="list-get">GET /api/v1/pages</H3>
          <P>List all pages in your workspace. Supports pagination.</P>
          <Table>
            <thead>
              <tr><Th>Param</Th><Th>Type</Th><Th>Default</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <tr><Td mono>limit</Td><Td>int</Td><Td>20</Td><Td>Max 100</Td></tr>
              <tr><Td mono>offset</Td><Td>int</Td><Td>0</Td><Td>Pagination offset</Td></tr>
            </tbody>
          </Table>
          <Code code={`curl https://huozi.app/api/v1/pages \\
  -H "Authorization: Bearer hz_your_key"`} />

          {/* Get */}
          <H2 id="get-page">Get a Page</H2>
          <H3 id="get-slug">GET /api/v1/pages/:slug</H3>
          <P>Get full details and latest content of a page.</P>
          <Code code={`curl https://huozi.app/api/v1/pages/weekly-report \\
  -H "Authorization: Bearer hz_your_key"`} />

          {/* Update */}
          <H2 id="update-page">Update a Page</H2>
          <H3 id="update-put">PUT /api/v1/pages/:slug</H3>
          <P>Partial update. If content is changed, a new version is created.</P>
          <Table>
            <thead>
              <tr><Th>Field</Th><Th>Type</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <tr><Td mono>title</Td><Td>string</Td><Td>Update title</Td></tr>
              <tr><Td mono>content</Td><Td>string</Td><Td>Update content (creates new version)</Td></tr>
              <tr><Td mono>description</Td><Td>string</Td><Td>Update SEO description</Td></tr>
              <tr><Td mono>published</Td><Td>boolean</Td><Td>Publish or unpublish</Td></tr>
            </tbody>
          </Table>
          <Code code={`curl -X PUT https://huozi.app/api/v1/pages/weekly-report \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Weekly Report - Updated"}'`} />

          {/* Delete */}
          <H2 id="delete-page">Delete a Page</H2>
          <H3 id="delete-slug">DELETE /api/v1/pages/:slug</H3>
          <P>Permanently delete a page and all its versions.</P>
          <Code code={`curl -X DELETE https://huozi.app/api/v1/pages/weekly-report \\
  -H "Authorization: Bearer hz_your_key"`} />

          {/* Versions */}
          <H2 id="versions">Versions</H2>
          <P>
            Every time you publish content to an existing slug, a new version is created.
            The bare URL always shows the latest version. Append <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs font-mono">/v1</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs font-mono">/v2</code>, etc. to access specific versions.
          </P>
          <Table>
            <thead>
              <tr><Th>URL</Th><Th>Behavior</Th></tr>
            </thead>
            <tbody>
              <tr><Td mono>/alice/my-page</Td><Td>Latest version</Td></tr>
              <tr><Td mono>/alice/my-page/v1</Td><Td>Version 1 (original)</Td></tr>
              <tr><Td mono>/alice/my-page/v3</Td><Td>Version 3</Td></tr>
            </tbody>
          </Table>

          <H3 id="versions-list">GET /api/v1/pages/:slug/versions</H3>
          <P>List all versions of a page.</P>
          <Code code={`curl https://huozi.app/api/v1/pages/my-page/versions \\
  -H "Authorization: Bearer hz_your_key"`} />
          <P>Response:</P>
          <Code code={`{
  "versions": [
    { "version": 3, "content_type": "markdown", "created_at": "2026-04-14T..." },
    { "version": 2, "content_type": "markdown", "created_at": "2026-04-14T..." },
    { "version": 1, "content_type": "markdown", "created_at": "2026-04-14T..." }
  ]
}`} />

          {/* Access Tokens */}
          <H2 id="access-tokens">Access Tokens</H2>
          <P>
            Protect pages with an access code. When set, visitors must enter the code to view the page.
            The token is per-slug (all versions share it). Stored as SHA-256 hash — plaintext is never stored.
          </P>

          <H3 id="token-set">Set on publish</H3>
          <P>Include <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs font-mono">access_token</code> in the POST /api/v1/pages body:</P>
          <Table>
            <thead>
              <tr><Th>Value</Th><Th>Behavior</Th></tr>
            </thead>
            <tbody>
              <tr><Td mono>{`"random"`}</Td><Td>Generate a 6-character random code. Returned once in the response.</Td></tr>
              <tr><Td mono>{`"mypassword"`}</Td><Td>Use a custom access code.</Td></tr>
              <tr><Td mono>null</Td><Td>Remove protection (public page).</Td></tr>
              <tr><Td>(omitted)</Td><Td>No change to existing token.</Td></tr>
            </tbody>
          </Table>

          <H3 id="token-update">PUT /api/v1/pages/:slug/token</H3>
          <P>Update or remove the access token for an existing page.</P>
          <Code code={`# Set random code
curl -X PUT https://huozi.app/api/v1/pages/my-page/token \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"access_token": "random"}'

# Remove protection
curl -X PUT https://huozi.app/api/v1/pages/my-page/token \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"access_token": null}'`} />

          {/* HTML Support */}
          <H2 id="html-support">HTML Support</H2>
          <P>
            Set <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-xs font-mono">content_type: &quot;html&quot;</code> to publish HTML pages.
            HTML is sanitized server-side to prevent XSS while preserving visual fidelity.
          </P>

          <H3 id="html-input">Input Format</H3>
          <Table>
            <thead>
              <tr><Th>Format</Th><Th>Description</Th></tr>
            </thead>
            <tbody>
              <tr><Td>Full document</Td><Td>{`<html><head>...</head><body>...</body></html> — <style> and <meta> tags in <head> are extracted`}</Td></tr>
              <tr><Td>Fragment</Td><Td>Any HTML without document tags — rendered as body content directly</Td></tr>
            </tbody>
          </Table>

          <H3 id="html-allowed">What Is Allowed</H3>
          <Table>
            <thead>
              <tr><Th>Category</Th><Th>Allowed</Th><Th>Stripped</Th></tr>
            </thead>
            <tbody>
              <tr>
                <Td>HTML tags</Td>
                <Td>All standard tags: div, span, table, form, svg, img, video, audio, etc.</Td>
                <Td>{`<script>, <iframe>, <embed>, <object>, <link rel="stylesheet">`}</Td>
              </tr>
              <tr>
                <Td>CSS</Td>
                <Td>{`<style> blocks, inline style="", all standard properties (flexbox, grid, animations, transforms)`}</Td>
                <Td>{`@import, expression(), javascript: in url(), -moz-binding, behavior:`}</Td>
              </tr>
              <tr>
                <Td>JavaScript</Td>
                <Td>None</Td>
                <Td>{`All <script> tags, all event handlers (onclick, onerror, onload, etc.)`}</Td>
              </tr>
              <tr>
                <Td>URLs</Td>
                <Td>http:, https:, mailto:, tel:</Td>
                <Td>{`javascript: (rewritten to #), data: in CSS url()`}</Td>
              </tr>
              <tr>
                <Td>SVG</Td>
                <Td>Full SVG support including filters, animations, gradients</Td>
                <Td>SVG script elements, foreignObject with scripts</Td>
              </tr>
              <tr>
                <Td>Images</Td>
                <Td>img, picture, source with http/https src</Td>
                <Td>data: URIs in img src</Td>
              </tr>
              <tr>
                <Td>Forms</Td>
                <Td>Display only — input, select, textarea, button render visually</Td>
                <Td>action and method attributes stripped, no form submission</Td>
              </tr>
            </tbody>
          </Table>

          <H3 id="html-example">Example</H3>
          <Code code={`curl -X POST https://huozi.app/api/v1/pages \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My Landing Page",
    "slug": "landing",
    "content_type": "html",
    "content": "<style>body{font-family:system-ui;max-width:680px;margin:0 auto;padding:2rem}h1{color:#2c2418}</style><h1>Welcome</h1><p>This is an HTML page.</p>"
  }'`} />
          <P>
            Best practice: produce self-contained HTML with all CSS inlined in {`<style>`} blocks.
            External stylesheets ({`<link>`}) are stripped. Images must use absolute URLs.
          </P>

          {/* Markdown Features */}
          <H2 id="markdown-features">Markdown Features</H2>
          <P>
            Markdown pages are rendered with a full pipeline supporting GitHub Flavored Markdown and more.
          </P>
          <Table>
            <thead>
              <tr><Th>Feature</Th><Th>Syntax</Th></tr>
            </thead>
            <tbody>
              <tr><Td>GFM tables</Td><Td mono>{`| col | col |`}</Td></tr>
              <tr><Td>Task lists</Td><Td mono>{`- [x] done`}</Td></tr>
              <tr><Td>Strikethrough</Td><Td mono>{`~~text~~`}</Td></tr>
              <tr><Td>Code highlighting</Td><Td mono>{`\`\`\`python ... \`\`\``}</Td></tr>
              <tr><Td>Math (KaTeX)</Td><Td mono>{`$inline$ and $$block$$`}</Td></tr>
              <tr><Td>Heading anchors</Td><Td>Auto-generated IDs and links</Td></tr>
              <tr><Td>Inline HTML</Td><Td>Allowed, sanitized same as HTML pages</Td></tr>
            </tbody>
          </Table>

          {/* Limits */}
          <H2 id="rate-limits">Limits</H2>
          <Table>
            <thead>
              <tr><Th>Limit</Th><Th>Value</Th></tr>
            </thead>
            <tbody>
              <tr><Td>Content size</Td><Td>2 MB per page</Td></tr>
              <tr><Td>Title length</Td><Td>500 characters</Td></tr>
              <tr><Td>Slug length</Td><Td>100 characters</Td></tr>
              <tr><Td>Workspace slug</Td><Td>1–40 characters, lowercase alphanumeric + hyphens</Td></tr>
              <tr><Td>API keys per workspace</Td><Td>Unlimited</Td></tr>
              <tr><Td>Pages per workspace</Td><Td>Unlimited</Td></tr>
              <tr><Td>Versions per page</Td><Td>Unlimited</Td></tr>
            </tbody>
          </Table>

          <div className="mt-16 pt-8 border-t border-border text-sm text-muted-foreground">
            <P>
              Questions? Visit <Link href="/start" className="underline hover:text-foreground">Get Started</Link> for
              setup guides, or publish a page and see it live.
            </P>
          </div>
        </main>
      </div>
    </div>
  );
}
