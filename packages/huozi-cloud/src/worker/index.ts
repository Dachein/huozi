/**
 * Cloudflare Worker entry point.
 *
 * Exposes MCP-over-HTTP (JSON-RPC 2.0 over POST) at `/mcp`. This is a
 * lighter alternative to StreamableHTTPServerTransport — we handle the
 * `tools/list` and `tools/call` methods directly against our tool registry.
 *
 * Flow for each request to `/mcp`:
 *   1. Authenticate Bearer token via D1 → {workspaceId, principal, scopePath}
 *   2. Load ReadFileState snapshot from HuoziSessionDO
 *   3. Dispatch JSON-RPC method against our registry
 *   4. Persist (updated) ReadFileState snapshot back to DO
 *   5. Return JSON-RPC response
 *
 * Re-exports the DO classes so wrangler can bind them.
 */

import { createHuoziToolRegistry } from '../mcp/tools.js'
import { resvgSvgRenderer } from '../render/svgRendererResvg.js'
import { CloudflareStorage } from '../storage/cloudflare/storage.js'
import { resolveBearer, touchAction } from '../storage/cloudflare/auth.js'
import {
  archiveProject,
  unarchiveProject,
  upgradeProject,
} from '../lib/project-actions.js'
import type { Author } from '../storage/types.js'
import {
  createBlobSigner,
  verifyBlobUrl,
} from '../storage/cloudflare/blob-signer.js'
import { blobKey } from '../storage/cloudflare/sha.js'
import { guessMime } from '../tools/ReadTool/mime.js'
import {
  handleListKeys,
  handleMintKey,
  handleRevokeKey,
  handleUpdateKeyTtl,
  type AdminEnv,
} from '../storage/cloudflare/admin.js'
import {
  handleEmailTokenGetOrMint,
  handleEmailTokenRotate,
  handleEmailTokenRevoke,
  handleEmailTokenUpdateSenders,
} from '../storage/cloudflare/email-tokens.js'
import {
  handleTasksIngest,
  handleTasksEmailIngest,
} from '../storage/cloudflare/tasks-ingest.js'
import {
  handleMailStatus,
  handleMailSetup,
} from '../storage/cloudflare/mail-routing.js'
import { handleInboundEmail } from '../storage/cloudflare/mail-inbound.js'
import {
  handleAliasCheck,
  handleAliasClaim,
  handleAliasList,
  handleAliasRelease,
  handleAliasSetActive,
  handleAliasUpdateSenders,
} from '../storage/cloudflare/email-aliases.js'
import { handleTasksConfirm } from '../storage/cloudflare/tasks-confirm.js'
import {
  handleAdminSetupForm,
  handleAdminSetupSubmit,
} from '../storage/cloudflare/admin-setup.js'
import {
  handleEdgeInviteRedeem,
  handleEdgeLogin,
} from '../storage/cloudflare/auth-password.js'
import { gcOrphanBlobs, handleGcBlobs } from '../storage/cloudflare/blob-gc.js'
import { handleMeBootstrap, type MeEnv } from '../storage/cloudflare/me-bootstrap.js'
import {
  handleMintTicket,
  handleWsUpgrade,
  sweepExpiredTickets,
} from '../storage/cloudflare/events.js'
import { handleRecent } from '../storage/cloudflare/recent.js'
import { fetchWhoami } from '../storage/cloudflare/whoami.js'
import { WHOAMI_TOOL_NAME } from '../tools/WhoamiTool.js'
import {
  createShareRow,
  handleCreateShare,
  handleGetShare,
  handleGetShareAsset,
  handleGetShareData,
  handleGetWorkspaceAsset,
  handleListShares,
  handleRevokeShare,
  handleUnlockShare,
} from '../storage/cloudflare/shares.js'
import {
  handleDeviceAuthorize,
  handleDeviceCode,
  handleDeviceDeny,
  handleDeviceInspect,
  handleDeviceToken,
} from '../storage/cloudflare/device-auth.js'
import {
  handleOauthApprove,
  handleOauthAuthorize,
  handleOauthDeny,
  handleOauthInspectPending,
  handleOauthMetadata,
  handleOauthRegister,
  handleOauthToken,
  handleProtectedResourceMetadata,
} from '../storage/cloudflare/oauth.js'
import {
  handleAuthLogout,
  handleAuthMe,
  handleOtpRequest,
  handleOtpVerify,
  handleSelectWorkspace,
  type AuthOtpEnv,
} from '../storage/cloudflare/auth-otp.js'
import {
  handleCheckSlug,
  handleCreateWorkspace,
  handleDeleteWorkspace,
  handleListWorkspaces,
} from '../storage/cloudflare/workspaces.js'
import {
  handleInspectInvite,
  handleListInvites,
  handleListMembers,
  handleMintInvite,
  handleRedeemInvite,
  handleRemoveMember,
  handleRevokeInvite,
  type InvitesAdminEnv,
} from '../storage/cloudflare/invites.js'
import {
  applyScopeToArgs,
  unscopeResult,
} from '../storage/cloudflare/scope.js'
import {
  TOOL_TO_CAP,
  effectiveCaps,
  parseKeyCaps,
  type Role,
} from '../storage/cloudflare/permissions.js'
import {
  AclCache,
  canAccess,
  extractInputPaths,
  filterPathsByAcl,
} from '../storage/cloudflare/folder-acl.js'
import {
  handleDeleteFolderAcl,
  handleListFolderAcls,
  handleListFolderAclsForUser,
  handleSetFolderAcl,
} from '../storage/cloudflare/folder-acl-admin.js'
import {
  loadSessionState,
  persistSessionState,
} from '../storage/cloudflare/session-state.js'
import { InMemoryReadFileState } from '../state/ReadFileState.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { HuoziCloudflareBindings } from '../storage/cloudflare/bindings.js'
import type { ToolUseContext } from '../types.js'

// Re-export for wrangler DO binding.
export { HuoziWorkspaceDO } from '../storage/cloudflare/workspace-do.js'
export { HuoziSessionDO } from '../storage/cloudflare/session-do.js'

/**
 * Server-level context delivered to Agents via MCP `initialize` response.
 *
 * Intentionally terse — Hosts typically splice this into the Agent's
 * system prompt, so every token costs on every turn. We cover only the
 * non-obvious things an Agent *can't* infer from tool descriptions alone:
 * how folders work, what's missing, and the Claude Code parity contract.
 */
const HUOZI_INSTRUCTIONS = `You're working against a huozi workspace — an Agent-native cloud drive
accessed via this MCP server. Its tool dialect is bit-exact with Claude
Code's built-in Read / Edit / Write / Glob / Grep, so your existing
Claude Code muscle memory applies.

WORKSPACE MODEL
  - Flat, content-addressed file store. Every path is relative to the
    workspace root. No drives, no symlinks, no hidden OS files.
  - Folders are IMPLICIT: a folder exists iff some file lives under it.
    Writing "blog/post.md" creates the "blog/" folder as a side effect.
    Use huozi_mkdir only when you need to reserve an empty folder name;
    it writes a hidden ".huozi-keep" marker.
  - Every huozi_write / huozi_edit / huozi_batch_edit / huozi_rm /
    huozi_mv produces a commit. History is queryable via huozi_history.

FOLDER-LEVEL CONVENTIONS
  - Before writing new files into an existing folder, huozi_read the
    folder's README.md if one exists — it typically documents file-name
    and layout conventions for that area.
  - For folder-scoped history, pass a prefix to huozi_history (e.g.
    file_path: "blog/"). There is no per-folder log file; commits are
    the log.

PROJECT MEMORY (.huozi/memory.jsonl)
  - A folder is an "upgraded Project" iff it contains \`.huozi/memory.jsonl\`.
    That file holds the agent's persistent observations for that scope:
    feedback the user has given, project facts, references to external
    systems, user-role context.
  - When entering a Project folder, FIRST call
    huozi_memory_list({ project_path: "<folder>" }) to load currently
    effective memories. Apply learned feedback / project facts to your
    behavior before responding.
  - To capture a new memory, call huozi_memory_append with the project
    path and an event body { type, name, body, why?, how_to_apply? }.
    \`type\` is one of: feedback / project / reference / user. The server
    fills id / at / by automatically.
  - Cross-project user preferences and workspace-wide conventions live
    in the workspace root README.md (human-maintained). There is no
    workspace-level memory file.

PROJECT LIFECYCLE (user-only, no MCP)
  - Creating / archiving / restoring Projects is a USER action,
    triggered from the Web Settings page (⚙ icon on a folder row
    in the file tree). There is no MCP tool for it — agents should
    NOT propose to upgrade or archive folders. If a user asks for
    it in chat, point them at the Settings page.

TASKS (agent-driven, three tools)
  - Tasks live in a Project's \`tasks.jsonl\` — a single-file
    Collection, same shape as inbox.jsonl: schema first line, then
    one event per line, multiple tasks identified by \`id\`.
  - To CREATE a task: huozi_task_create({ project_path, title,
    deliverable?, source_refs? }). Returns a fresh uuid.
    \`source_refs\` is the standard form for Promote-from-inbox:
    ["inbox.jsonl#<i_id>"].
  - To LIST tasks with their current state (status folded from the
    op sequence): huozi_task_list({ project_path, status?,
    include_archived? }). Call this when entering a Project to see
    what's open before deciding what to do.
  - To APPEND an event onto an existing task (status / archive /
    result / dispatch / ...): huozi_task_append({ project_path,
    task_id, event: { op, status?, ... } }). Common case:
    { op: "status", status: "done" }.
  - The huozi-bridge daemon writes its own dispatch / agent_turn /
    tool_use / result events directly through huozi_edit — you
    won't normally need to emit those from chat.

WHAT IS NOT SUPPORTED (don't try to work around these — tell the user)
  - No Bash, no shell. This is a cloud surface, not a local machine.
  - No file >10 MB inline through huozi_upload. Larger files: split, or use
    the signed-URL upload endpoint (separate doc).

READ SEMANTICS
  - huozi_read caches per-session: a second read of an unchanged file
    returns file_unchanged (zero bytes). Prefer re-reading over guessing.
  - Paths are case-sensitive. Always use forward slashes.

BINARY FILES
  - huozi_upload is the entry point for non-text bytes (PDF, image, audio,
    zip, docx, …). Inline cap 10 MB raw bytes.
  - extract: true on a .zip path unpacks the archive into a sibling folder
    named after the zip ("pkg.zip" → entries under "pkg/"); the zip itself
    is NOT stored. Path-traversal, bomb-defense, and entry-count safeties
    are enforced server-side; you don't need to pre-check.
  - To hand a downloadable URL to the human (or a downstream HTTP tool),
    call huozi_download. It returns a short-lived signed URL plus size /
    content_type / blob_sha. Default TTL 20 min, cap 24 h.
  - For agent-side reads of small binaries, huozi_read is still the right
    tool; it inlines under 4 MB and falls back to a binary_ref signed URL
    above that.

SHARE SEMANTICS
  - huozi_share produces a LIVE public URL (huozi.app/p/<slug>) that
    tracks the current bytes of the file. Edits go live immediately.
    No snapshot mode.

PUBLISHING HTML — 5 standard formats
  - Before writing an HTML file the user wants to publish, fetch a layout
    scaffold via huozi_template({ format }). 5 standard formats:
      deck   — 16:9 horizontal slide (pitch decks, presentations)
      story  — 9:16 vertical slide (mobile stories, reels)
      paper  — A4 print sheet (reports, letters, printable PDFs)
      mobile — long scroll, mobile-first (phone-read articles)
      web    — long scroll, desktop-first (landing pages, essays w/ TOC).
               This is the default for unmarked HTML.
  - If the user has not picked a format and intent is not obvious from
    context, ASK which of the 5 they want before generating. Don't guess.
  - The returned body is a complete <!doctype html> with all CSS inlined
    and pure-CSS scaling. Fill the placeholder content inside <body>;
    leave the <style> block untouched.
  - Format is declared in <head> (authoritative):
        <meta name="huozi:format" content="deck">
    The 3 paginated formats (deck / story / paper) ALSO require each
    page to be wrapped in a marker so the pager + outline can navigate:
        <section data-page id="s1" data-title="封面">…</section>
        <section data-page id="s2" data-title="问题">…</section>
    \`id\` is auto-injected if omitted. \`data-title\` falls back to the
    inner <h1>/<h2>/<h3> but is recommended for stable outlines.

HTML — sandbox & libraries
  - Inline <script>...</script> is allowed in published HTML.
  - <script src="https://..."> from external CDNs is BLOCKED by the
    publish sandbox. Don't write them.
  - For common libraries, declare them in <head> instead:
        <meta name="huozi:bundle" content="mermaid,echarts">
    Known keys (huozi auto-injects same-origin):
      Tier 1 (auto-init): highlight · katex · marked
        Author writes only the markup; platform runs init on
        DOMContentLoaded.
      Tier 2 (manual init): mermaid · echarts · uplot
        Platform just exposes the global (window.mermaid, window.echarts,
        window.uPlot). Author owns the DOM container and the init call.
        For mermaid that's:
          mermaid.initialize({ startOnLoad: false, theme: 'default' });
          mermaid.run();
      Reserved (not yet wired — declaring it is a no-op, validator
      still accepts the key): chartjs, vega-lite
      For most dashboards prefer plain SVG (zero JS) or ECharts; uPlot
      only for time-series above ~1 k points.
    Pages without huozi:bundle ship zero JS.
  - Optional: <meta name="huozi:theme" content="light|dark|auto">,
              <meta name="huozi:font"  content="sans|serif|mono">

HTML — reading sibling data (Collection / csv / json)
  - A published HTML can declare sibling files it wants to fetch at
    runtime. Authors put the meta tag in <head>:
        <meta name="huozi:share-include" content="threads.jsonl,retros.jsonl">
    Each path is resolved RELATIVE to the HTML's own directory. The
    inline JS reads them through the per-share data proxy at
    /p/<slug>/d/<path>. Build the URL from location.pathname (the page
    URL has no trailing slash, so plain './threads.jsonl' resolves to
    /p/threads.jsonl and 404s):
        const base = location.pathname.replace(/\\/$/, '') + '/d/';
        const r = await fetch(base + 'threads.jsonl');
        const events = (await r.text()).trim().split('\\n').map(JSON.parse);
  - This is the path for custom dashboards over Collection jsonl files:
    bind multiple Collections from one HTML, fold by id in the browser,
    render with the libraries declared in huozi:bundle.
  - Live mode: the data endpoint always serves the CURRENT bytes (no
    cache). Edits to the listed files show up on next visit.
  - Security: only files in the include list are reachable; everything
    else 403s. Authors must enumerate explicitly — same-directory does
    NOT auto-include.
  - Without the meta, sibling fetches 403 — by design (this is the
    "published one file" mental model).

HTML — VALIDATE BEFORE SHARE (strongly recommended)
  - After huozi_write of an HTML file, call huozi_validate({ file_path })
    BEFORE huozi_share. The validator returns structured diagnostics
    (level: error | warning | hint) with a \`remedy\` field telling you
    exactly what to fix.
  - Treat \`level: error\` as a blocker. Common errors:
      paginated-no-pages    deck/story/paper but missing <section data-page>
      page-id-duplicate     two sections share the same id
      format-unknown        huozi:format value is not one of the 5
  - Workflow: huozi_write → huozi_validate → fix → repeat → huozi_share.
    The Web UI shows the same diagnostics in a banner above the preview,
    so the human and the Agent see the same set of issues.

WHEN IN DOUBT
  - Use huozi_glob with a pattern to survey the tree before writing.
  - Prefer minimal, targeted edits to broad rewrites.
  - The Web UI is read-only by design — all writes must come through
    this MCP surface.`

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): Response {
  const body: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  }
  return Response.json(body)
}

function rpcOk(id: string | number | null, result: unknown): Response {
  const body: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    result,
  }
  return Response.json(body)
}

const handler: ExportedHandler<HuoziCloudflareBindings> = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'huozi-cloud' })
    }

    // Self-host install bootstrap. Users (or their Agents) curl this
    // path to get a one-shot Edge install script:
    //   bash <(curl -sSL https://huozi.app/install) --hostname edge.you.com
    // Mirrors raw GitHub instead of bundling the script into the
    // worker — that way the script can iterate independently of
    // worker deploys, and one source-of-truth lives in the repo.
    if (url.pathname === '/install') {
      return fetch(
        'https://raw.githubusercontent.com/Dachein/huozi/main/scripts/edge-install.sh',
        { headers: { 'cache-control': 'no-store' } },
      ).then((upstream) => {
        // Pass through bytes + content-type as plain bash so curl pipes
        // to bash work cleanly. Some browsers will try to render
        // text/x-shellscript so force text/plain for in-browser preview.
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=300',
          },
        })
      })
    }

    // Signed blob downloads. URL shape generated by createBlobSigner; verified
    // here. Public path — the HMAC over (sha, ws, path, exp) is the only auth.
    {
      const m = url.pathname.match(/^\/blobs\/[0-9a-f]{40}$/)
      if (m) return handleBlobDownload(request, env)
    }

    if (url.pathname === '/mcp') {
      return handleMcp(request, env)
    }

    // Real-time events — browsers open a WS here after fetching a ticket.
    if (url.pathname === '/events/mint-ticket') {
      // Opportunistic cleanup — cheap, bounded, swallows errors.
      ctx.waitUntil(sweepExpiredTickets(env))
      return handleMintTicket(request, env)
    }
    if (url.pathname === '/events/ws') {
      return handleWsUpgrade(request, env)
    }
    if (url.pathname === '/events/recent') {
      return handleRecent(request, env)
    }

    // Public shares — `huozi.app/p/<slug>` backing endpoints.
    if (url.pathname === '/shares') {
      return request.method === 'GET'
        ? handleListShares(request, env)
        : handleCreateShare(request, env)
    }
    {
      const m = url.pathname.match(/^\/shares\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(?:\/(unlock|revoke))?$/)
      if (m) {
        const slug = m[1]!
        const action = m[2]
        if (action === 'unlock') return handleUnlockShare(request, env, slug)
        if (action === 'revoke') return handleRevokeShare(request, env, slug)
        return handleGetShare(request, env, slug)
      }
    }
    // GET /shares/<slug>/asset/__assets__/<...> — public asset proxy
    // for /p/<slug> markdown image references. Separate from the slug
    // regex above because the trailing path is variable-depth.
    {
      const m = url.pathname.match(
        /^\/shares\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\/asset\/(.+)$/,
      )
      if (m) {
        return handleGetShareAsset(request, env, m[1]!, m[2]!)
      }
    }
    // GET /shares/<slug>/data/<...> — sibling-file data proxy for
    // HTML pages that declared `<meta huozi:share-include="a.jsonl,...">`.
    // Only paths listed in that meta are reachable; everything else 403s.
    {
      const m = url.pathname.match(
        /^\/shares\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\/data\/(.+)$/,
      )
      if (m) {
        return handleGetShareData(request, env, m[1]!, m[2]!)
      }
    }

    // Edge first-run admin setup. One-shot HTML flow served by the
    // Worker itself (no Next.js — keeps bootstrap self-contained). Only
    // works when D1 `users` is empty + HUOZI_EDGE_WORKSPACE_SLUG is set.
    if (url.pathname === '/admin/setup') {
      if (request.method === 'POST') {
        return await handleAdminSetupSubmit(request, env as AdminEnv)
      }
      return await handleAdminSetupForm(request, env as AdminEnv)
    }

    // Admin endpoints — server-to-server via HUOZI_ADMIN_SECRET.
    if (url.pathname === '/admin/mint-key') {
      try {
        return await handleMintKey(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/revoke-key') {
      try {
        return await handleRevokeKey(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/list-keys') {
      try {
        return await handleListKeys(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/update-key-ttl') {
      try {
        return await handleUpdateKeyTtl(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/device-authorize') {
      try {
        return await handleDeviceAuthorize(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/device-deny') {
      try {
        return await handleDeviceDeny(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/device-inspect') {
      try {
        return await handleDeviceInspect(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Workspace CRUD (used by Cloud's identity layer + onboarding).
    if (url.pathname === '/admin/workspaces') {
      try {
        if (request.method === 'POST')
          return await handleCreateWorkspace(request, env as AdminEnv)
        if (request.method === 'GET')
          return await handleListWorkspaces(request, env as AdminEnv)
        if (request.method === 'DELETE')
          return await handleDeleteWorkspace(request, env as AdminEnv)
        return new Response('method not allowed', { status: 405 })
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/workspaces/check-slug') {
      try {
        return await handleCheckSlug(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/gc-blobs') {
      try {
        return await handleGcBlobs(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Invites + members.
    if (url.pathname === '/admin/invites') {
      try {
        if (request.method === 'POST')
          return await handleMintInvite(request, env as InvitesAdminEnv)
        if (request.method === 'GET')
          return await handleListInvites(request, env as InvitesAdminEnv)
        if (request.method === 'DELETE')
          return await handleRevokeInvite(request, env as InvitesAdminEnv)
        return new Response('method not allowed', { status: 405 })
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/invites/redeem') {
      try {
        return await handleRedeemInvite(request, env as InvitesAdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/invites/inspect') {
      try {
        return await handleInspectInvite(request, env as InvitesAdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/workspace-members') {
      try {
        if (request.method === 'GET')
          return await handleListMembers(request, env as InvitesAdminEnv)
        if (request.method === 'DELETE' || request.method === 'POST')
          return await handleRemoveMember(request, env as InvitesAdminEnv)
        return new Response('method not allowed', { status: 405 })
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Folder ACLs.
    if (url.pathname === '/admin/folder-acls') {
      try {
        if (request.method === 'GET')
          return await handleListFolderAcls(request, env as AdminEnv)
        if (request.method === 'POST')
          return await handleSetFolderAcl(request, env as AdminEnv)
        if (request.method === 'DELETE')
          return await handleDeleteFolderAcl(request, env as AdminEnv)
        return new Response('method not allowed', { status: 405 })
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/folder-acls/for-user') {
      try {
        return await handleListFolderAclsForUser(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Tasks email-token CRUD (Next.js identity layer calls these on behalf
    // of the cookie-authed user). See `app/docs/tasks.md` §6.1.
    if (url.pathname === '/admin/email-tokens/get-or-mint') {
      try {
        return await handleEmailTokenGetOrMint(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-tokens/rotate') {
      try {
        return await handleEmailTokenRotate(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-tokens/revoke') {
      try {
        return await handleEmailTokenRevoke(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-tokens/update-senders') {
      try {
        return await handleEmailTokenUpdateSenders(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Tasks ingest (called server-to-server by the huozi-email-ingest Worker
    // and by the Next.js webhook proxy after HMAC verification).
    if (url.pathname === '/admin/tasks/ingest') {
      try {
        return await handleTasksIngest(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/tasks/confirm') {
      try {
        return await handleTasksConfirm(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    // Aggregate endpoint for huozi-email-ingest Worker: takes
    // {token, from, subject, body, headers...}, does token lookup +
    // allowlist + ingest in one round trip. See tasks-ingest.ts.
    if (url.pathname === '/admin/tasks/email-ingest') {
      try {
        return await handleTasksEmailIngest(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    // CF Email Routing setup — enable routing on the configured zone +
    // point the catch-all at huozi-email-ingest. Idempotent.
    if (url.pathname === '/admin/mail/status') {
      try {
        return await handleMailStatus(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/mail/setup') {
      try {
        return await handleMailSetup(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    // User-chosen email aliases for inbound mail (sibling to email_tokens).
    if (url.pathname === '/admin/email-aliases/check') {
      try {
        return await handleAliasCheck(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-aliases/claim') {
      try {
        return await handleAliasClaim(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-aliases/list') {
      try {
        return await handleAliasList(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-aliases/set-active') {
      try {
        return await handleAliasSetActive(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-aliases/release') {
      try {
        return await handleAliasRelease(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/email-aliases/update-senders') {
      try {
        return await handleAliasUpdateSenders(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Device-flow public endpoints (no auth; Agents hit these).
    if (url.pathname === '/auth/device-code') {
      return handleDeviceCode(request, env)
    }
    if (url.pathname === '/auth/token') {
      return handleDeviceToken(request, env)
    }

    // OAuth 2.1 + PKCE primary path (RFC 6749/7636/7591/8414/9728).
    // All endpoints publicly callable; tokens are protected by PKCE.
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return handleOauthMetadata(request, env)
    }
    if (url.pathname === '/.well-known/oauth-protected-resource') {
      return handleProtectedResourceMetadata(request, env)
    }
    if (url.pathname === '/oauth/register') {
      return handleOauthRegister(request, env)
    }
    if (url.pathname === '/oauth/authorize') {
      return handleOauthAuthorize(request, env)
    }
    if (url.pathname === '/oauth/token') {
      return handleOauthToken(request, env)
    }
    // Admin-secret-protected: called by the Next.js /authorize page after
    // user consent. Not a browser-facing endpoint.
    if (url.pathname === '/admin/oauth/inspect-pending') {
      try {
        return await handleOauthInspectPending(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/oauth/approve') {
      try {
        return await handleOauthApprove(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/admin/oauth/deny') {
      try {
        return await handleOauthDeny(request, env as AdminEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // Email-OTP login (humans). Wraps in try/catch so misconfig (missing
    // HUOZI_AUTH_SECRET) surfaces as a 501 rather than crashing the Worker.
    if (url.pathname === '/auth/otp/request') {
      try {
        return await handleOtpRequest(request, env as AuthOtpEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/auth/otp/verify') {
      try {
        return await handleOtpVerify(request, env as AuthOtpEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    // Edge-only password login. Returns 404 in Cloud (where
    // HUOZI_EDGE_WORKSPACE_SLUG is unset).
    if (url.pathname === '/auth/edge-login') {
      return await handleEdgeLogin(request, env as AuthOtpEnv)
    }
    if (url.pathname === '/auth/edge-invite-redeem') {
      return await handleEdgeInviteRedeem(request, env as AuthOtpEnv)
    }
    if (url.pathname === '/auth/me') {
      try {
        return await handleAuthMe(request, env as AuthOtpEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/auth/logout') {
      try {
        return await handleAuthLogout(request, env as AuthOtpEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }
    if (url.pathname === '/auth/select-workspace') {
      try {
        return await handleSelectWorkspace(request, env as AuthOtpEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // GET /me/asset/__assets__/<...> — Bearer-auth workspace asset proxy.
    // The authenticated sibling of /shares/<slug>/asset/...; lets the
    // /workspace/view renderer resolve `<link href="/__assets__/foo.css">`
    // and friends without having to publish the file as a share first.
    {
      const m = url.pathname.match(/^\/me\/asset\/(.+)$/)
      if (m) {
        return handleGetWorkspaceAsset(request, env, m[1]!)
      }
    }

    // User-authed bootstrap for the agent-install flow at huozi.app/start.
    // Single call: ensure-workspace + mint-key, JWT-authed (no admin secret).
    if (url.pathname === '/me/workspaces/bootstrap') {
      try {
        return await handleMeBootstrap(request, env as MeEnv)
      } catch (r) {
        if (r instanceof Response) return r
        throw r
      }
    }

    // POST /me/project — Bearer-authed Project lifecycle (upgrade /
    // archive / unarchive). Deliberately outside the MCP surface:
    // Project state changes are user-driven UI actions, not something
    // an agent should trigger autonomously. The Web Settings page is
    // the only caller.
    if (url.pathname === '/me/project') {
      return handleMeProject(request, env)
    }

    // TEMPORARY DEBUG: clear session state for the token's principal.
    if (url.pathname === '/debug/clear-session' && request.method === 'POST') {
      const authRes = await resolveBearer(
        request.headers.get('authorization'),
        env,
      )
      if (!authRes.ok) {
        return Response.json({ error: authRes.failure.message }, { status: 401 })
      }
      const key = `${authRes.principal.workspaceId}:${authRes.principal.principalId}`
      const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(key))
      const res = await stub.fetch('https://session/snapshot', { method: 'DELETE' })
      return Response.json({ ok: res.ok, sessionKey: key })
    }

    return new Response('not found', { status: 404 })
  },

  // Cloudflare Cron Trigger entry. Schedules in wrangler.toml [triggers]
  // crons drive this; the handler runs on the Worker without an inbound
  // request. Each cron expression we wire up branches on controller.cron.
  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      gcOrphanBlobs(env).then((r) => {
        console.log(
          `[cron ${controller.cron}] gc-blobs ` +
          `scanned=${r.scanned} kept=${r.kept} deleted=${r.deleted} ` +
          `skipped_recent=${r.skipped_recent} failed=${r.failed} ` +
          `dur=${r.duration_ms}ms`,
        )
      }),
    )
  },

  // CF Email Routing catch-all on mail.huozi.app → this Worker. Inline
  // parse + ingest; see storage/cloudflare/mail-inbound.ts.
  async email(message, env, ctx): Promise<void> {
    await handleInboundEmail(message, env as AdminEnv, ctx)
  },
}

async function handleMeProject(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const authRes = await resolveBearer(request.headers.get('authorization'), env)
  if (!authRes.ok) {
    return Response.json(
      { error: authRes.failure.message },
      { status: 401 },
    )
  }
  const principal = authRes.principal

  let body: { action?: unknown; folder_path?: unknown; readme_content?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const action = typeof body.action === 'string' ? body.action : ''
  const folderPath = typeof body.folder_path === 'string' ? body.folder_path : ''
  if (folderPath.length === 0) {
    return Response.json({ error: 'invalid_folder_path' }, { status: 400 })
  }

  const storage = new CloudflareStorage(env)
  const author: Author = {
    id: principal.principalId,
    type: principal.principalType,
  }

  switch (action) {
    case 'upgrade': {
      const readme =
        typeof body.readme_content === 'string' && body.readme_content.length > 0
          ? body.readme_content
          : undefined
      const r = await upgradeProject(storage, principal.workspaceId, author, {
        folderPath,
        readmeContent: readme,
      })
      if (!r.ok) {
        return Response.json({ error: r.message }, { status: r.status })
      }
      return Response.json({ ok: true, ...r.data })
    }
    case 'archive': {
      const r = await archiveProject(
        storage,
        principal.workspaceId,
        author,
        folderPath,
      )
      if (!r.ok) {
        return Response.json({ error: r.message }, { status: r.status })
      }
      return Response.json({ ok: true, ...r.data })
    }
    case 'unarchive': {
      const r = await unarchiveProject(
        storage,
        principal.workspaceId,
        author,
        folderPath,
      )
      if (!r.ok) {
        return Response.json({ error: r.message }, { status: r.status })
      }
      return Response.json({ ok: true, ...r.data })
    }
    default:
      return Response.json(
        { error: 'invalid_action', allowed: ['upgrade', 'archive', 'unarchive'] },
        { status: 400 },
      )
  }
}

async function handleBlobDownload(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 })
  }

  const verified = await verifyBlobUrl(request, env.HUOZI_SIGNING_SECRET)
  if (!verified) {
    // Don't leak whether the SHA exists, the path is wrong, or the token's
    // expired — single 403 covers all forgery / tampering / expiry cases.
    return new Response('forbidden', { status: 403 })
  }

  const obj = await env.BLOBS.get(blobKey(verified.blob_sha))
  if (!obj) {
    // Signature was valid but the blob is gone (e.g. R2 lost it, or files_current
    // was deleted then GC'd). Return 410 so clients with retry logic give up.
    return new Response('blob no longer available', { status: 410 })
  }

  const headers = new Headers()
  headers.set('content-type', guessMime(verified.path))
  if (obj.size != null) headers.set('content-length', String(obj.size))
  // Encourage browser caching within the URL's lifetime — re-issuing the same
  // signed URL is cheap, but bytes don't change for a given blob_sha.
  headers.set(
    'cache-control',
    `private, max-age=${Math.max(0, Math.floor((verified.expiresAt - Date.now()) / 1000))}`,
  )
  // Filename hint for save-as dialogs. basename is enough; the leading folder
  // chain isn't useful in a download UI.
  const basename = verified.path.split('/').pop() ?? 'download'
  headers.set(
    'content-disposition',
    `inline; filename="${basename.replace(/"/g, '')}"`,
  )

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers })
  }
  return new Response(obj.body, { status: 200, headers })
}

async function handleMcp(
  request: Request,
  env: HuoziCloudflareBindings,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  // Parse JSON-RPC envelope first so we can echo the id even on auth failure.
  let rpc: JsonRpcRequest
  try {
    rpc = (await request.json()) as JsonRpcRequest
  } catch {
    return rpcError(null, -32700, 'parse error')
  }
  if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return rpcError(rpc.id ?? null, -32600, 'invalid request')
  }
  const reqId = rpc.id ?? null

  // Auth.
  const authRes = await resolveBearer(
    request.headers.get('authorization'),
    env,
  )
  if (!authRes.ok) {
    // OAuth 2.1 / RFC 6750 §3 / MCP authorization spec require a real HTTP
    // 401 with WWW-Authenticate so OAuth-aware clients (Claude Code, Cursor,
    // Codex, Hermes) can auto-discover our authorization server. Body is
    // still JSON-RPC-shaped so legacy clients display a sensible message.
    const issuer = (env.HUOZI_PUBLIC_BASE ?? `${new URL(request.url).protocol}//${new URL(request.url).host}`).replace(/\/+$/, '')
    const wwwAuth =
      `Bearer error="invalid_token", ` +
      `error_description="${authRes.failure.message.replace(/"/g, "'")}", ` +
      `resource_metadata="${issuer}/.well-known/oauth-protected-resource"`
    const body: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: reqId,
      error: { code: -32001, message: authRes.failure.message },
    }
    return new Response(JSON.stringify(body), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': wwwAuth,
      },
    })
  }
  const principal = authRes.principal

  // Registry + storage.
  const storage = new CloudflareStorage(env)
  // Build the blob signer if configured. Origin priority:
  //   1. env.HUOZI_PUBLIC_BASE — explicit public hostname; required when
  //      MCP requests arrive via Cloudflare service binding (request.url
  //      is then a synthetic "huozi-cloud.internal" host that no browser
  //      can reach). Cloud production sets this to https://cloud.huozi.app.
  //   2. request.url — fall-back for Edge / standalone deploys where the
  //      worker isn't fronted by a separate BFF and the request hostname
  //      is the same one the browser will use.
  const requestUrl = new URL(request.url)
  const signerOrigin =
    env.HUOZI_PUBLIC_BASE ?? `${requestUrl.protocol}//${requestUrl.host}`
  const sign = createBlobSigner({
    origin: signerOrigin,
    secret: env.HUOZI_SIGNING_SECRET,
  })
  const binarySigner = sign
    ? {
        async signUrl(args: {
          workspaceId: string
          path: string
          blob_sha: string
          ttlSeconds: number
        }) {
          const out = await sign(args)
          return {
            url: out.url,
            expiresAt: out.expiresAt,
            mimeType: guessMime(args.path),
          }
        },
      }
    : undefined
  const registry = createHuoziToolRegistry({
    storage,
    shareDeps: {
      // Bind the D1-backed createShareRow to an arrow that matches the
      // Tool's expected signature (no env leaked into ShareTool itself).
      createShare: (principal, input) => createShareRow(env, principal, input),
      // Edge deploys override via HUOZI_PUBLIC_BASE; default keeps the
      // hosted huozi.app build working with zero config.
      publicBase: env.HUOZI_PUBLIC_BASE ?? 'https://huozi.app',
    },
    whoamiDeps: {
      // Bake env + this request's principal/keyHash into a closure so the
      // tool stays free of Worker types.
      whoami: () => fetchWhoami(env, principal, authRes.keyHash),
    },
    binarySigner,
    svgRenderer: resvgSvgRenderer,
  })

  if (rpc.method === 'initialize') {
    // `instructions` is an MCP-spec field that well-behaved Hosts (Claude
    // Code, Cursor, ClawHub) surface to the Agent as server-level system
    // context. We use it to preempt the obvious "missing tool" confusions
    // by spelling out huozi's opinions about folders, deletion, and parity
    // with Claude Code's file-tool dialect.
    return rpcOk(reqId, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'huozi-cloud', version: '0.1.0' },
      instructions: HUOZI_INSTRUCTIONS,
    })
  }

  if (rpc.method === 'tools/list') {
    const tools = await Promise.all(
      registry.tools.map(async (t) => ({
        name: t.name,
        description: await t.prompt(),
        inputSchema: toDraft2020Schema(
          zodToJsonSchema(t.inputSchema, {
            target: 'openApi3',
            $refStrategy: 'none',
          }) as Record<string, unknown>,
        ),
      })),
    )
    return rpcOk(reqId, { tools })
  }

  if (rpc.method === 'tools/call') {
    const params = (rpc.params ?? {}) as {
      name?: string
      arguments?: Record<string, unknown>
    }
    if (!params.name) {
      return rpcError(reqId, -32602, 'missing params.name')
    }
    const tool = registry.get(params.name)
    if (!tool) {
      return rpcError(reqId, -32601, `unknown tool: ${params.name}`)
    }

    // ── Whoami bypass ────────────────────────────────────────────────
    // huozi_whoami is the diagnostic tool — it must work even when the
    // caller has no workspace_members row, no folder ACL membership, and
    // no scope the rest of the dispatcher would tolerate. Otherwise an
    // orphan key can't see its own state, defeating the whole point.
    // Auth itself already passed (token is valid + not revoked), and
    // whoami takes no path arguments, so we skip cap / scope / ACL.
    if (params.name === WHOAMI_TOOL_NAME) {
      const ctx: ToolUseContext = {
        workspaceId: principal.workspaceId,
        principalId: principal.principalId,
        principalType: principal.principalType,
        scopePath: principal.scopePath,
        readFileState: new InMemoryReadFileState(),
      }
      const wResult = await tool.run({}, ctx)
      await touchAction(env, authRes.keyHash, params.name, null)
      if (wResult.kind === 'error') {
        return rpcOk(reqId, {
          isError: true,
          content: [
            { type: 'text', text: `Error ${wResult.errorCode}: ${wResult.message}` },
          ],
          structuredContent: {
            errorCode: wResult.errorCode,
            message: wResult.message,
          },
        })
      }
      return rpcOk(reqId, {
        content: [{ type: 'text', text: tool.renderResult(wResult.data) }],
        structuredContent: wResult.data as Record<string, unknown>,
      })
    }

    // ── Capability check ─────────────────────────────────────────────
    // Resolve the principal's effective caps:
    //   - system principals (admin-bootstrap keys) bypass entirely
    //   - else: look up role in workspace_members, intersect with key.caps
    // Reject before scope rewriting so an unauthorized call doesn't
    // even reach the tool.
    const required = TOOL_TO_CAP[params.name] ?? 'read'
    if (principal.principalType !== 'system') {
      // api_keys.workspace_id is stored as `ws_<slug>` (legacy compat with
      // R2 prefixes), while workspace_members.workspace_id is the
      // workspaces.id UUID. JOIN via slug to bridge the two formats.
      const wsSlug = principal.workspaceId.replace(/^ws_/, '')
      const roleRow = await env.DB.prepare(
        `SELECT m.role
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE w.slug = ? AND m.user_id = ?`,
      )
        .bind(wsSlug, principal.principalId)
        .first<{ role: string }>()
      const role: Role | null =
        roleRow?.role === 'owner' || roleRow?.role === 'member'
          ? roleRow.role
          : null
      // No membership = creator was removed from workspace. Deny rather
      // than fall back to "all caps" — the agent's user has no business
      // here anymore.
      if (!role) {
        return rpcOk(reqId, {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Error 403: principal has no membership in this workspace',
            },
          ],
          structuredContent: {
            errorCode: 403,
            message: 'principal_no_membership',
          },
        })
      }
      const effective = effectiveCaps({
        keyCaps: parseKeyCaps(authRes.keyCapsRaw),
        role,
      })
      if (!effective.has(required)) {
        return rpcOk(reqId, {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error 403: missing capability '${required}' for tool ${params.name}`,
            },
          ],
          structuredContent: {
            errorCode: 403,
            message: 'permission_denied',
            required,
          },
        })
      }
    }

    // Scope enforcement (SPEC §7.4). Applied BEFORE the tool sees the args,
    // so every path the tool operates on is already absolute within the
    // workspace. scope=null keys pass through untouched.
    const scoped = applyScopeToArgs(
      params.name,
      params.arguments ?? {},
      principal.scopePath,
    )
    if (!scoped.ok) {
      return rpcOk(reqId, {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error 101: ${scoped.message}`,
          },
        ],
        structuredContent: {
          errorCode: 101, // ERR.SCOPE_VIOLATION
          message: scoped.message,
        },
      })
    }

    // ── Folder ACL input check ────────────────────────────────────────
    // For each path the tool wants to operate on, verify the principal
    // is in the nearest private folder's ACL (or that the path is in a
    // public region). Owner has NO bypass — data layer is egalitarian.
    // System principals (admin keys) skip this entirely.
    const aclCache = new AclCache()
    if (principal.principalType !== 'system') {
      const inputPaths = extractInputPaths(params.name, scoped.args)
      for (const path of inputPaths) {
        const r = await canAccess(
          env,
          principal.workspaceId,
          path,
          principal.principalId,
          aclCache,
        )
        if (!r.allow) {
          return rpcOk(reqId, {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error 403: path is in a private folder you don't have access to`,
              },
            ],
            structuredContent: {
              errorCode: 403,
              message: 'acl_denied',
              path_prefix: r.acl?.pathPrefix ?? null,
            },
          })
        }
      }
    }

    // Stateless-read opt-out. Web UI renders on huozi.app set this header so
    // SSR page loads always see fresh content (the Agent-side session cache is
    // meant for Claude Code's `Read → Edit` loop, not for humans reloading a
    // page who want to see the current bytes every time).
    const noSession = request.headers.get('X-Huozi-No-Session') === '1'

    // Per-session DO for ReadFileState.
    const sessionKey = `${principal.workspaceId}:${principal.principalId}`
    const sessionStub = noSession
      ? null
      : env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionKey))

    const { state: readFileState } = sessionStub
      ? await loadSessionState(sessionStub)
      : { state: new InMemoryReadFileState() }

    const ctx: ToolUseContext = {
      workspaceId: principal.workspaceId,
      principalId: principal.principalId,
      principalType: principal.principalType,
      scopePath: principal.scopePath,
      readFileState,
    }

    let result
    try {
      result = await tool.run(scoped.args, ctx)
    } finally {
      if (sessionStub) {
        try {
          await persistSessionState(sessionStub, readFileState)
        } catch (err) {
          // Log but don't fail the request. The in-memory state was used
          // for this request; persist failures mean subsequent requests lose
          // that state, but they can rebuild it by re-reading.
          console.error('[persistSessionState] failed:', err)
        }
      }
    }

    // Record "last action" metadata on the key row so /workspace's
    // StatusSummary can show "Last action: huozi_write · blog/post.md"
    // instead of just a timestamp. Awaited (not `void`): without this,
    // the Worker terminates before the D1 UPDATE resolves and the
    // column stays null. Cost is one ~1 ms DB write per tools/call.
    await touchAction(
      env,
      authRes.keyHash,
      params.name,
      extractTarget(params.name, scoped.args),
    )

    if (result.kind === 'error') {
      return rpcOk(reqId, {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error ${result.errorCode}: ${result.message}`,
          },
        ],
        structuredContent: {
          errorCode: result.errorCode,
          message: result.message,
          ...(result.meta ? { meta: result.meta } : {}),
        },
      })
    }

    // ── Folder ACL output filter ──────────────────────────────────────
    // Listing tools enumerate workspace contents — strip any path the
    // user can't access so they never even learn the path EXISTS.
    // Hides /private/secret.md from glob/grep/list_tree output.
    if (
      principal.principalType !== 'system' &&
      result.data &&
      typeof result.data === 'object'
    ) {
      const data = result.data as Record<string, unknown>
      const ws = principal.workspaceId
      const uid = principal.principalId

      if (params.name === 'huozi_glob' && Array.isArray(data.filenames)) {
        data.filenames = await filterPathsByAcl(
          env,
          ws,
          data.filenames as string[],
          uid,
          aclCache,
        )
      } else if (
        params.name === 'huozi_grep' &&
        Array.isArray(data.filenames)
      ) {
        const allowed = new Set(
          await filterPathsByAcl(
            env,
            ws,
            data.filenames as string[],
            uid,
            aclCache,
          ),
        )
        data.filenames = (data.filenames as string[]).filter((p) =>
          allowed.has(p),
        )
        // Strip lines from grep content that came from filtered-out files.
        if (typeof data.content === 'string') {
          const lines = (data.content as string).split('\n')
          const kept: string[] = []
          for (const line of lines) {
            // Grep lines are formatted as "path:lineno:contents"; we only
            // need to peek at the prefix.
            const idx = line.indexOf(':')
            if (idx > 0) {
              const path = line.slice(0, idx)
              if (allowed.has(path)) kept.push(line)
            } else {
              kept.push(line)
            }
          }
          data.content = kept.join('\n')
        }
      } else if (
        params.name === 'huozi_list_tree' &&
        Array.isArray(data.entries)
      ) {
        const filtered: unknown[] = []
        for (const entry of data.entries as unknown[]) {
          if (
            entry &&
            typeof entry === 'object' &&
            typeof (entry as Record<string, unknown>).path === 'string'
          ) {
            const r = await canAccess(
              env,
              ws,
              (entry as Record<string, unknown>).path as string,
              uid,
              aclCache,
            )
            if (r.allow) filtered.push(entry)
          }
        }
        data.entries = filtered
      }
    }

    // Strip the scope prefix from any path-bearing field in the response so
    // the Agent never sees prefixes it couldn't have written.
    const unscoped = unscopeResult(
      params.name,
      result.data,
      principal.scopePath,
    ) as Record<string, unknown>

    return rpcOk(reqId, {
      content: [{ type: 'text', text: tool.renderResult(result.data) }],
      structuredContent: unscoped,
    })
  }

  return rpcError(reqId, -32601, `method not found: ${rpc.method}`)
}

/**
 * Pick the most informative "target" string out of tool arguments so the
 * Web UI can render e.g. `huozi_write · blog/post.md` instead of just
 * `huozi_write`. Best-effort — unrecognized shapes return null.
 */
function extractTarget(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  // Direct path-like fields shared by read / write / edit / history / share
  if (typeof args.file_path === 'string' && args.file_path.length > 0) {
    return args.file_path
  }
  if (typeof args.path === 'string' && args.path.length > 0) return args.path
  // Pattern-based tools (glob / grep)
  if (typeof args.pattern === 'string' && args.pattern.length > 0) {
    return args.pattern
  }
  // Batch edit — first file plus a "(+N more)" hint
  if (Array.isArray(args.edits) && args.edits.length > 0) {
    const first = args.edits[0] as { file_path?: unknown } | undefined
    const fp = first && typeof first.file_path === 'string' ? first.file_path : null
    if (fp) {
      return args.edits.length > 1 ? `${fp} (+${args.edits.length - 1})` : fp
    }
  }
  void toolName
  return null
}

export default handler

/**
 * Normalize a zod-to-json-schema (OpenAPI-3 / draft-7-flavoured) output to
 * JSON Schema draft 2020-12, which Anthropic's Messages API enforces on
 * MCP tool `inputSchema`.
 *
 * Only one known incompatibility appears with our current zod schemas:
 *   draft-7:    { "minimum": 0, "exclusiveMinimum": true }
 *   draft-2020: { "exclusiveMinimum": 0 }
 *
 * Same for exclusiveMaximum. We walk the tree and rewrite in place.
 * Other 2020-12 divergences ($ref semantics, `type: ["X","null"]` vs
 * `nullable`) don't appear in our schemas because we use `$refStrategy:
 * 'none'` and don't emit nullable fields.
 */
function toDraft2020Schema(node: unknown): Record<string, unknown> {
  return walk(node) as Record<string, unknown>
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk)
  if (node === null || typeof node !== 'object') return node
  const obj = node as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = walk(v)
  }
  // Fix draft-7 exclusive{Minimum,Maximum}: boolean pairing.
  if (out.exclusiveMinimum === true && typeof out.minimum === 'number') {
    out.exclusiveMinimum = out.minimum
    delete out.minimum
  } else if (out.exclusiveMinimum === false) {
    // draft-7 "false" is just equivalent to not-exclusive; drop it.
    delete out.exclusiveMinimum
  }
  if (out.exclusiveMaximum === true && typeof out.maximum === 'number') {
    out.exclusiveMaximum = out.maximum
    delete out.maximum
  } else if (out.exclusiveMaximum === false) {
    delete out.exclusiveMaximum
  }
  return out
}
