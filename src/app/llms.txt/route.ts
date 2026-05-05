/**
 * /llms.txt — canonical agent-readable install protocol.
 *
 * Lives in app/ rather than marketing/ on purpose: every deploy of
 * the product needs its own /llms.txt with its own URLs baked in.
 *   - Cloud:      cloud.huozi.app/llms.txt   → cloud.huozi.app/mcp
 *   - Edge:       <deployer>.workers.dev/llms.txt → <deployer>.workers.dev/mcp
 * The marketing site at huozi.app doesn't speak MCP, so it can't
 * usefully serve an install protocol; only the actual product worker
 * knows its own base URL.
 *
 * The content is identical across deploys except for the host. We
 * derive that from the incoming request URL so this route works
 * unmodified on every deploy without a separate env-var lookup.
 *
 * Cache: text/plain, public 5 min — agents fetch this often, content
 * changes are rare.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  // base = "https://<host>" with no trailing slash. For Cloud this is
  // https://cloud.huozi.app; for an Edge deploy on myco.workers.dev
  // it's https://myco.workers.dev. Derived from the request itself
  // so the route works unchanged on every deploy without an env-var
  // lookup, and so that custom domains in front of an Edge worker
  // get the right hostname back.
  const base = `${requestUrl.protocol}//${requestUrl.host}`;

  return new Response(buildLlmsTxt(base), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function buildLlmsTxt(base: string): string {
  // host without protocol — used in prose where the full URL would
  // read clunky (e.g. "Cloud → cloud.huozi.app").
  const host = base.replace(/^https?:\/\//, "");

  return `# huozi MCP — install protocol

huozi is an Agent-native cloud drive exposed over MCP at
${base}/mcp. This document is the canonical machine-readable
install spec. If you are a chat agent reading this, follow the
section that matches your environment.

This is a setup task — not a coding project. Do not ask the user about
tech stack, do not write code. Run the steps below verbatim.

---

## Two install paths

Every client supports both paths below. Pick by environment, not by
client:

### Choice 1 · Agent-driven (RFC 8628 device authorization grant)

Use when you (the agent) are running in chat mode and want to install
huozi for the user without them touching a terminal. Works in
non-TTY shells, headless / sandboxed environments, and on remote
servers — no localhost callback needed.

Triggered by: this prompt. The agent calls \`/auth/device-code\`,
prints a verification URL, polls \`/auth/token\` until success, writes
the host's MCP config. Token returned is a static \`hz_*\` api_key,
stored in the host config the agent writes.

Walk through the 5 steps in the next section.

### Choice 2 · Native CLI / GUI (RFC 8252 OAuth-on-first-use)

Use when the user is at their own terminal (or a GUI app like
Cowork / Cursor). Each client has its own native \`mcp add\` CLI
command or GUI add-connector dialog; the first MCP call returns 401
with a WWW-Authenticate header pointing at \`/.well-known/oauth-
protected-resource\`, and the host follows authorization-code-with-
PKCE, opens a browser, the user clicks Approve, the host gets a real
OAuth access_token through a localhost callback. Token lives in the
host's own credential store, never the host config.

Skip Choice 1 and point the user at their host's \`mcp add\` command
(see "Choice 2 reference" further below).

If you are a chat-mode agent, you are almost certainly Choice 1.

---

## Choice 1 — verbatim 5 steps

### Step 1 — Request a device code

\`\`\`
POST ${base}/auth/device-code
Content-Type: application/json
Body: {"client_name": "<your name>", "agent_kind": "<see kinds below>"}
\`\`\`

Response:
\`\`\`json
{
  "device_code": "<opaque hex>",
  "user_code": "ABCD-1234",
  "verification_url": "${base}/device",
  "verification_url_complete": "${base}/device?code=ABCD-1234",
  "expires_in": 900,
  "interval": 5
}
\`\`\`

The \`verification_url\` host always matches the host you POST'd
\`/auth/device-code\` to (this deploy is \`${host}\`). Hand the user
whichever URL the response contains — never hard-code a domain. Edge
self-hosted deploys use the deployer's own worker domain, not
\`cloud.huozi.app\`.

\`agent_kind\` enum (use the value matching your host):
\`claude-code | openclaw | hermes | codex | cursor | cowork | generic\`

### Step 2 — Hand the user a clickable link

Print \`verification_url_complete\` to the user as a clickable link.
Tell them, verbatim:

> Open this link. If asked, sign in (new email = auto-register on
> Cloud). Then click Approve. I'll be polling and pick up the key
> the moment you approve — no need to come back and tell me.

The \`/device\` page handles login + grant approval together. New
users register on the spot via email OTP (Cloud) or password (Edge —
invite required).

### Step 3 — Poll for the api_key

Every \`interval\` seconds (default 5) until terminal:

\`\`\`
POST ${base}/auth/token
Content-Type: application/json
Body: {"device_code": "<from step 1>"}
\`\`\`

Responses:
- \`202 {"error": "authorization_pending"}\` → keep polling
- \`400 {"error": "expired_token"}\` → grant timed out, restart step 1
- \`400 {"error": "access_denied"}\` → user clicked Deny, stop
- \`200 {"api_key", "key_id", "workspace"}\` → done, capture api_key

### Step 4 — Write the MCP config in your host

Pick the snippet matching your \`agent_kind\`. NEVER print api_key in
chat — keep it in your tool scratch only.

#### claude-code

\`\`\`
claude mcp add --transport http huozi ${base}/mcp \\
  --header "Authorization: Bearer <api_key>"
\`\`\`

#### cursor

Merge into \`~/.cursor/mcp.json\` (or project-level \`.cursor/mcp.json\`):

\`\`\`json
{
  "mcpServers": {
    "huozi": {
      "type": "http",
      "url": "${base}/mcp",
      "headers": { "Authorization": "Bearer <api_key>" }
    }
  }
}
\`\`\`

#### hermes

Append to \`~/.hermes/config.yaml\` (create if missing, preserve
existing entries):

\`\`\`yaml
mcp_servers:
  huozi:
    url: "${base}/mcp"
    headers:
      Authorization: "Bearer <api_key>"
\`\`\`

Then tell the user to type \`/reload-mcp\` in chat — slash commands
must be user-typed; you can't issue them. Do NOT use
\`hermes mcp add\`: it requires a TTY and exits in chat shells.

#### openclaw

\`\`\`
openclaw mcp set huozi '{"url":"${base}/mcp","transport":"streamable-http","headers":{"Authorization":"Bearer <api_key>"}}'
\`\`\`

#### codex

Two lines, run both:

\`\`\`
export HUOZI_API_KEY=<api_key>
codex mcp add huozi --url ${base}/mcp \\
  --bearer-token-env-var HUOZI_API_KEY
\`\`\`

#### cowork

Cowork has no CLI. Tell the user to:
1. Open Claude Cowork (third tab in Claude Desktop)
2. Customize → Connectors → + Add custom connector
3. Paste URL \`${base}/mcp\` → Add

Cowork drives RFC 8252 OAuth on first call automatically. The
api_key from step 3 is unused for cowork — you can revoke it after
the user finishes setup if you minted it.

#### desktop (Claude Desktop without Cowork)

Merge into \`claude_desktop_config.json\` (per-OS path), then tell the
user to restart Claude Desktop:

\`\`\`json
{
  "mcpServers": {
    "huozi": {
      "type": "http",
      "url": "${base}/mcp",
      "headers": { "Authorization": "Bearer <api_key>" }
    }
  }
}
\`\`\`

#### generic

No specific syntax — adapt to your host's config conventions:

- URL: \`${base}/mcp\`
- Authorization header: \`Bearer <api_key>\`

Per the host's docs, write to its config file (JSON / YAML / TOML)
or use its CLI. Reload as the host requires (process restart /
slash command / reconnect).

### Step 5 — Verify

Call \`huozi_whoami\` via the MCP. A workspace identity in the reply
means done. A 401 means the api_key didn't land — re-check step 4
and ask the user to reload their host (or \`/reload-mcp\` for Hermes).

### Security rules (always)

- Never print device_code or api_key in chat.
- Keep them in your tool scratch only; persist them only into the
  host MCP config that owns them.
- The user can revoke any key at ${base}/workspace.

---

## Choice 2 reference (for users at their own terminal)

Point them at one of these and stop — no agent driving needed.
First MCP call opens a browser; user Approves; host gets an OAuth
access_token through a localhost callback. No api_key in any of
these snippets.

| Host          | Command / action |
|---------------|------------------|
| Claude Code   | \`claude mcp add --transport http huozi ${base}/mcp\` |
| Codex         | \`codex mcp add huozi --url ${base}/mcp\` |
| Hermes        | \`hermes mcp add huozi --url ${base}/mcp --auth oauth\` |
| OpenClaw      | \`openclaw mcp set huozi '{"url":"${base}/mcp","transport":"streamable-http"}'\` |
| Cursor        | Merge \`{"mcpServers":{"huozi":{"type":"http","url":"${base}/mcp"}}}\` into \`~/.cursor/mcp.json\`. Reload Window. |
| Cowork        | Customize → Connectors → + Add custom connector → URL \`${base}/mcp\` |

---

## Auto-discovery (for clients that natively speak OAuth metadata)

\`${base}/.well-known/oauth-authorization-server\` (RFC 8414)
advertises both grant types:

- \`authorization_code\` (for Choice 2)
- \`urn:ietf:params:oauth:grant-type:device_code\` (for Choice 1)

Endpoints:

\`\`\`
authorization_endpoint        = ${base}/oauth/authorize
token_endpoint                = ${base}/oauth/token
registration_endpoint         = ${base}/oauth/register
device_authorization_endpoint = ${base}/auth/device-code
\`\`\`

Plus \`${base}/.well-known/oauth-protected-resource\`
(RFC 9728) declares \`/mcp\` as the protected resource and points to
the auth-server metadata above.

Clients that natively support RFC 8628 do not need this prompt —
they can call \`token_endpoint\` with
\`grant_type=urn:ietf:params:oauth:grant-type:device_code\`
(form-encoded) directly.

---

## Self-host (huozi Edge)

If the user wants the same drive deployed on their own Cloudflare
account instead of using Cloud, point them at huozi.app/start/edge
for the bootstrap walkthrough. After deploy they get a worker URL
like \`https://<their>.workers.dev\` — substitute that for
\`${host}\` everywhere in this document and the install protocol is
identical.

Edge differs from Cloud on three axes only:
- Login: password (invite-only) vs email OTP (open registration)
- Workspace model: single workspace locked to the deploy vs many
- Public registration: closed vs open

The MCP surface, identity tools, and install protocol are
identical.

---

## See also

- ${base}/workspace        Manage connected agents and revoke keys
- huozi.app/docs           MCP tools reference (16 tools)
- huozi.app/cloud          Cloud edition overview
- huozi.app/edge           Edge edition (self-host overview)
- huozi.app/start          Human-facing install page (this protocol rendered for browsers)
- https://github.com/Dachein/huozi  Source code (MIT)
`;
}
