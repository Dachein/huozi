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
 * Query parameters:
 *   ?for=<kind>   Filter Step 4 to a single host's snippet. <kind> is
 *                 one of: claude-code | cursor | hermes | openclaw |
 *                 codex | cowork | desktop | generic. Cuts the doc by
 *                 ~70% — small-context-window models stop choking on
 *                 the full 6 KB. The agent-driven flow (Choice 1 in
 *                 the UI) passes this when the user picks an agent.
 *
 * Cache: text/plain, public 5 min — agents fetch this often, content
 * changes are rare. Vary on query string so the ?for variants don't
 * stomp each other in the CDN cache.
 */

export const dynamic = "force-dynamic";

type AgentKind =
  | "claude-code"
  | "cursor"
  | "hermes"
  | "openclaw"
  | "codex"
  | "cowork"
  | "desktop"
  | "generic";

const KNOWN_KINDS: AgentKind[] = [
  "claude-code",
  "cursor",
  "hermes",
  "openclaw",
  "codex",
  "cowork",
  "desktop",
  "generic",
];

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  // base = "https://<host>" with no trailing slash. For Cloud this is
  // https://cloud.huozi.app; for an Edge deploy on myco.workers.dev
  // it's https://myco.workers.dev. Derived from the request itself
  // so the route works unchanged on every deploy without an env-var
  // lookup, and so that custom domains in front of an Edge worker
  // get the right hostname back.
  const base = `${requestUrl.protocol}//${requestUrl.host}`;

  const rawFor = requestUrl.searchParams.get("for")?.trim().toLowerCase();
  const forKind: AgentKind | null =
    rawFor && (KNOWN_KINDS as readonly string[]).includes(rawFor)
      ? (rawFor as AgentKind)
      : null;

  return new Response(buildLlmsTxt(base, forKind), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Vary on query string so ?for=hermes doesn't get cached as
      // the bare /llms.txt response.
      "cache-control": "public, max-age=300",
      vary: "accept-language",
    },
  });
}

// ── Per-client Step 4 snippets ──────────────────────────────────────
//
// Kept as a map so `?for=<kind>` can render just one. The {base} token
// is interpolated to this deploy's URL at render time.

function step4Snippet(kind: AgentKind, base: string): string {
  switch (kind) {
    case "claude-code":
      return `#### claude-code

\`\`\`
claude mcp add --transport http huozi ${base}/mcp \\
  --header "Authorization: Bearer <api_key>"
\`\`\``;
    case "cursor":
      return `#### cursor

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
\`\`\``;
    case "hermes":
      return `#### hermes

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
\`hermes mcp add\`: it requires a TTY and exits in chat shells.`;
    case "openclaw":
      return `#### openclaw

\`\`\`
openclaw mcp set huozi '{"url":"${base}/mcp","transport":"streamable-http","headers":{"Authorization":"Bearer <api_key>"}}'
\`\`\``;
    case "codex":
      return `#### codex

Codex configures HTTP MCP servers by editing \`~/.codex/config.toml\`
(the \`codex mcp add\` CLI is stdio-only). Append this TOML block —
preserve any existing entries:

\`\`\`toml
[mcp_servers.huozi]
url = "${base}/mcp"
bearer_token_env_var = "HUOZI_API_KEY"
\`\`\`

Then export the api_key from step 3 so codex picks it up on next start:

\`\`\`bash
export HUOZI_API_KEY=<api_key>
\`\`\`

Tell the user to add the \`export\` to their shell rc (zshrc / bashrc)
so it persists, then restart codex.`;
    case "cowork":
      return `#### cowork

Cowork has no CLI. Tell the user to:
1. Open Claude Cowork (third tab in Claude Desktop)
2. Customize → Connectors → + Add custom connector
3. Paste URL \`${base}/mcp\` → Add

Cowork drives RFC 8252 OAuth on first call automatically. The
api_key from step 3 is unused for cowork — you can revoke it after
the user finishes setup if you minted it.`;
    case "desktop":
      return `#### desktop (Claude Desktop without Cowork)

Merge into \`claude_desktop_config.json\` (per-OS path), then tell
the user to restart Claude Desktop:

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
\`\`\``;
    case "generic":
      return `#### generic

No specific syntax — adapt to your host's config conventions:

- URL: \`${base}/mcp\`
- Authorization header: \`Bearer <api_key>\`

Per the host's docs, write to its config file (JSON / YAML / TOML)
or use its CLI. Reload as the host requires (process restart /
slash command / reconnect).`;
  }
}

/** Base64'd JSON config for the Cursor "Add to Cursor" deeplink. The
 *  inner config carries just the server entry (no `mcpServers` wrapper)
 *  per Cursor's deeplink spec, with no Authorization header — Choice 2
 *  is OAuth-on-first-use, so static keys belong to Choice 1. */
function cursorDeeplinkConfig(base: string): string {
  const inner = JSON.stringify({ type: "http", url: `${base}/mcp` });
  // Workers runtime exposes btoa globally.
  return btoa(inner);
}

function buildLlmsTxt(base: string, forKind: AgentKind | null): string {
  const host = base.replace(/^https?:\/\//, "");

  // Step 4 body: one host if `?for=<kind>`, all 8 hosts otherwise.
  const step4Body = forKind
    ? step4Snippet(forKind, base)
    : KNOWN_KINDS.map((k) => step4Snippet(k, base)).join("\n\n");

  const filterNote = forKind
    ? `\n_(Filtered to \`${forKind}\` because the request URL had \`?for=${forKind}\`. The full host menu is at \`${base}/llms.txt\` without the query.)_\n`
    : "";

  return `# huozi MCP — install protocol

huozi is an Agent-native cloud drive exposed over MCP at
${base}/mcp. This document is the canonical machine-readable
install spec. If you are a chat agent reading this, follow the
section that matches your environment.

This is a setup task — not a coding project. Do not ask the user about
tech stack, do not write code. Run the steps below verbatim.

---

## Before you start (self-check)

To drive Choice 1 (the Agent-driven device flow) you need:

- An HTTP request tool that can POST JSON. Anything works: \`curl\`,
  the host runtime's \`fetch\`, Python \`requests\`, Node's
  \`fetch\` / \`http\`. **Avoid Python's stdlib \`urllib\`** — its
  default User-Agent is on Cloudflare's bot-signature list and gets
  403'd. Prefer \`requests\` / \`httpx\` / \`aiohttp\`, or just \`curl\`.
- A way to print a clickable link to the user (almost every chat
  agent does this by default).
- For Step 4 below: a file-write tool, **or** a shell tool that can
  invoke the host's \`mcp add\` CLI. Either is fine.

If you don't have any HTTP tool at all, stop and tell the user:

> I can't drive a full install from this surface. Open ${host}/start
> and pick Choice 2 — your client has its own \`mcp add\` command
> (or GUI add-connector dialog) that handles the rest.

If you do have a shell + HTTP request tool but you're about to ask
a clarifying question first ("what tech stack?", "should I do X?"),
**don't**. Skip directly to Step 1 with placeholder values; the
protocol is self-contained.

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

The protocol uses **plain HTTP** (POST + JSON). All examples below
are shown as request shape (method · URL · body) plus a curl
example for clarity. Use whatever HTTP tool you have; the wire
format is what matters.

### Step 1 — Request a device code

| | |
|---|---|
| Method | \`POST\` |
| URL | \`${base}/auth/device-code\` |
| Headers | \`Content-Type: application/json\` |
| Body (JSON) | \`{"client_name": "<your name>", "agent_kind": "<kind>"}\` |

\`\`\`bash
# curl example
curl -sS -X POST ${base}/auth/device-code \\
  -H "content-type: application/json" \\
  -d '{"client_name": "Hermes", "agent_kind": "hermes"}'
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
\`claude-code | cursor | hermes | openclaw | codex | cowork | desktop | generic\`

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

| | |
|---|---|
| Method | \`POST\` |
| URL | \`${base}/auth/token\` |
| Headers | \`Content-Type: application/json\` |
| Body (JSON) | \`{"device_code": "<from step 1>"}\` |

\`\`\`bash
# curl example
curl -sS -X POST ${base}/auth/token \\
  -H "content-type: application/json" \\
  -d '{"device_code": "<from step 1>"}'
\`\`\`

Responses:
- \`202 {"error": "authorization_pending"}\` → keep polling
- \`400 {"error": "expired_token"}\` → grant timed out, restart step 1
- \`400 {"error": "access_denied"}\` → user clicked Deny, stop
- \`200 {"api_key", "key_id", "workspace"}\` → done, capture api_key

### Step 4 — Write the MCP config in your host

Pick the snippet matching your \`agent_kind\`. NEVER print api_key in
chat — keep it in your tool scratch only.
${filterNote}
${step4Body}

### Step 5 — Verify

Call \`huozi_whoami\` via the MCP. A workspace identity in the reply
means done. A 401 means the api_key didn't land — re-check step 4.
Most hosts pick up MCP config changes immediately (Cursor, Claude
Code, Codex). Hermes needs the user to type \`/reload-mcp\` in chat;
Claude Desktop needs an app restart. Don't ask for a reload until
you've actually seen a 401.

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
| Codex         | Add \`[mcp_servers.huozi] url="${base}/mcp"\` to \`~/.codex/config.toml\`, then \`codex mcp login huozi\` (browser OAuth, no api_key) |
| Hermes        | \`hermes mcp add huozi --url ${base}/mcp --auth oauth\` |
| OpenClaw      | \`openclaw mcp set huozi '{"url":"${base}/mcp","transport":"streamable-http"}'\` |
| Cursor        | One-click deeplink: \`cursor://anysphere.cursor-deeplink/mcp/install?name=huozi&config=${cursorDeeplinkConfig(base)}\` — Cursor handles it natively, no Reload needed. (Manual fallback: merge \`{"mcpServers":{"huozi":{"type":"http","url":"${base}/mcp"}}}\` into \`~/.cursor/mcp.json\`.) |
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
