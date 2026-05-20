# Tasks

Tasks is huozi's inbox for **agent-driven work**. A task is a unit of work that arrives from somewhere (an email, a webhook, a manual nudge), is dispatched to an agent (Claude Code in v1; Codex / OpenClaw / Hermes are P2), and runs to completion or a confirmation gate — all visible to the user as a single timeline.

Tasks is **not a new file type**. It is a convention on top of Collection (`.jsonl`): an `inbox.jsonl` at the workspace root holds incoming tickets, and each promoted task lives at `tasks/<task_id>.jsonl`. The renderer, the schema event, the fold logic — all of it is already shipped (see `four-types.md` §3, §4). Tasks adds:

- A canonical schema template for inbox and per-task files
- An event vocabulary that the daemon and the UI agree on
- A magic-address email ingest path (Cloud) and a webhook ingest path (both editions)
- A confirm pattern: agent pauses, user clicks Approve/Reject, agent resumes
- A local daemon contract: how an agent CLI on the user's machine couples to a task

If you've read `four-types.md`, you already know 80% of this. Read that first.

---

## 0. Quickstart: what is a task?

A task is **one entity with a lifeline**, which is exactly what Collection was built for. The lifeline runs:

```
ingest → dispatch → (agent_turn / tool_use)* → [confirm_requested → user_action]* → result
```

`tasks/<task_id>.jsonl` is one Collection file with exactly one `id` — the task itself. Every line is an event on that one entity. The file is also a Claude Code session log mirror: `task_id` is reused as the Claude session UUID (`claude --session-id <task_id>`), so one identifier names the task, the file, the URL, and the agent session.

`inbox.jsonl` is the usual multi-entity Collection: each ticket is one `id`, the latest `op` says whether it's still inbox, routed, or dismissed.

---

## 1. Mental model

| Concept       | huozi primitive                  | Why                                                  |
|---------------|----------------------------------|------------------------------------------------------|
| **Inbox**     | `inbox.jsonl` (Collection)       | Many tickets, listable, filterable — native fit      |
| **Task**      | `tasks/<id>.jsonl` (Collection)  | One entity's lifeline = one task's run               |
| **Thread**    | Task (same `task_id` across rounds) | An email reply lands on its parent task             |
| **Session**   | Claude session keyed on `task_id` | One ID end-to-end                                    |
| **Schema**    | First-line `op:"schema"` event    | User defines states/tags/categories per workspace    |

Tasks does not add a fifth file type. The four types stay four.

---

## 2. Storage layout

```
<workspace-root>/
├── inbox.jsonl                       ← Collection: incoming tickets, multi-entity
└── tasks/
    ├── 7c9f2e1a-….jsonl              ← Collection: one task, one entity, many events
    ├── 9d3a44b2-….jsonl
    └── .archive/
        └── 2026-05.jsonl             ← optional rollup of done tasks
```

`task_id` is a UUID v4. It is **the file name** (`tasks/<task_id>.jsonl`), **the `id` on every line in that file**, and **the Claude session UUID** the daemon launches with `--session-id <task_id>`.

The `tasks/` folder is a regular folder — no `.huozi-keep`, no system prefix, no special ACL. It is visible in the file tree like any other folder. The Tasks workspace UI surface is a *view* over this folder; the folder is still the storage.

---

## 3. Event vocabulary (`op` values)

Following `four-types.md` §3.3, prefer semantic-patch style. The vocabulary is fixed enough that the renderer and the daemon both project it:

| `op`                | Emitted by    | Purpose                                                                 |
|---------------------|---------------|-------------------------------------------------------------------------|
| `create`            | router        | Task created. Carries initial `subject`, `body`, `source`, `from`.      |
| `ingest`            | router        | A new inbound message landed on an *existing* task (reply email, follow-up webhook). |
| `dispatch`          | daemon        | Daemon decided to send this task to an agent. Carries `agent`, `session_id`. |
| `agent_turn`        | daemon        | Agent emitted assistant text. Carries `content`, `model`, `tokens`.     |
| `tool_use`          | daemon        | Agent invoked a tool. Carries `tool_name`, `input`.                     |
| `tool_result`       | daemon        | Tool returned. Carries `tool_use_id`, `content`, `is_error`.            |
| `confirm_requested` | daemon        | Agent paused. Carries `prompt` (what's being confirmed) and optional `proposal`. |
| `user_action`       | UI            | User clicked. Carries `action: "approve"\|"reject"\|"comment"`, optional `note`. |
| `result`            | daemon        | This dispatch round finished. Carries `summary`, `cost_usd`, `stop_reason`. |
| `status`            | any           | Explicit state override. Carries `value` from §4.                       |
| `archive`           | user / agent  | Task is closed. Renderer hides from default list.                       |
| `schema`            | bootstrap     | Render config — see `four-types.md` §3.6.                               |

Inbox-only `op` values (live in `inbox.jsonl`, never in `tasks/*.jsonl`):

| `op`        | Purpose                                                                          |
|-------------|----------------------------------------------------------------------------------|
| `ingest`    | A new ticket arrived. Carries `source`, `from`, `subject`, `body`, `message_id`. |
| `routed`    | Promoted to a task. Carries `task_id` so the inbox can link to the task file.   |
| `dismissed` | Spam / no-action. Carries optional `reason`.                                     |

`ingest` is overloaded on purpose: in the inbox it means "a new ticket landed"; in a task file it means "a new inbound message landed on this thread." The shape is the same, the location disambiguates.

---

## 4. State machine

Status is **derived from the latest `op`** unless an explicit `status` event overrides it:

| Latest `op`         | Derived `status`     |
|---------------------|----------------------|
| `create` / `ingest` (in task) | `pending`           |
| `dispatch`          | `working`            |
| `agent_turn` / `tool_use` / `tool_result` | `working` |
| `confirm_requested` | `awaiting_user`      |
| `user_action`       | `working` (daemon will resume) |
| `result`            | `done`               |
| `archive`           | `archived`           |

Renderer rule: scan from the end of the file backwards until you hit one of the above; that line's projection wins. Custom `op` values fall through to the prior status.

The canonical schema (§5) declares `status` as a `select` field with these enum values, so the right-rail aside renders a colored chip without any custom code.

---

## 5. Canonical schema

The default schema is the same for `inbox.jsonl` and every `tasks/*.jsonl`. Workspaces can extend it — `four-types.md` §3.6 documents the deep-merge accumulate rule. The default lives in `src/lib/tasks/schema.ts` and is injected by `huozi_collection_init` (or the equivalent ingest-time helper) when a task file is first written.

```jsonl
{"op":"schema","at":"…","by":"system","version":1,"schema":{
  "title": "Tasks",
  "entity": {
    "title_field": "subject",
    "subtitle_field": "from",
    "avatar_field": "source_icon"
  },
  "fields": {
    "subject":   {"type":"text",    "label":"Subject",  "display":"headline",    "searchable":true},
    "from":      {"type":"email",   "label":"From",     "display":"subheadline"},
    "source":    {"type":"select",  "label":"Source",   "display":"aside", "filterable":true,
                  "options":[{"value":"email","label":"Email"},{"value":"webhook","label":"Webhook"},{"value":"manual","label":"Manual"},{"value":"slack","label":"Slack"}]},
    "status":    {"type":"select",  "label":"Status",   "display":"aside", "filterable":true,
                  "options":[
                    {"value":"pending","label":"Pending","color":"gray"},
                    {"value":"working","label":"Working","color":"blue"},
                    {"value":"awaiting_user","label":"Awaiting","color":"amber"},
                    {"value":"done","label":"Done","color":"green"},
                    {"value":"archived","label":"Archived","color":"slate"}
                  ]},
    "agent":     {"type":"select",  "label":"Agent",    "display":"aside", "filterable":true,
                  "options":[{"value":"claude-code","label":"Claude Code"}]},
    "tags":      {"type":"multi_select", "label":"Tags", "display":"meta", "filterable":true, "options":[]},
    "category":  {"type":"select",  "label":"Category", "display":"meta", "filterable":true, "options":[]},
    "cost_usd":  {"type":"number",  "label":"Cost",     "display":"meta"},
    "body":      {"type":"richtext","label":"Body",     "display":"body"}
  },
  "list_view": {
    "filters": ["status","agent","source","tags","category"],
    "search":  ["subject","from","body"]
  }
}}
```

`tags.options` and `category.options` start empty — users add their own via the inline-edit pathway (see `inline-edit.md`). The schema event is event-sourced; later schema lines deep-merge in. A workspace that wants a "Priority" field just appends one schema event with `{"fields":{"priority":{...}}}`.

---

## 6. Channels and ingest

Three channels in v1. All converge on `inbox.jsonl` (or directly on a task file when the thread can be resolved — see §7).

### 6.1 Email — magic address (Cloud only)

Per-user magic address: `t-<token>@mail.huozi.app`. The user pastes this into Gmail / Outlook / Apple Mail forwarding settings and forwards anything they want huozi to handle.

**Mechanism:**

1. `*@mail.huozi.app` → Cloudflare Email Routing catch-all → standalone `huozi-email-ingest` Worker.
2. Worker parses the `to` address, looks up `email_tokens` (D1 table — see §8) to resolve `(workspace_id, user_id)`.
3. Worker POSTs to the main Worker's `/admin/tasks/ingest` (admin-secret authenticated, server-to-server only).
4. The admin endpoint writes to `inbox.jsonl` or appends to an existing task per §7.

**Token rotation** (`POST /api/app/tasks/email-token`) revokes the old token and mints a new one; old inbound mail will bounce with "Unknown address."

**Sender allowlist** (`PATCH /api/app/tasks/email-token`) optionally restricts the address to a list of sender domains. Off by default — most users want any forwarded mail to land.

Bounces on unknown token: **drop, do not bounce**. Bouncing leaks token-validity to attackers.

### 6.2 Webhook (Cloud + Edge)

`POST /api/app/tasks/ingest`, HMAC-signed (shared secret per workspace, rotatable). Body is the same `{source, from, subject, body, message_id?, in_reply_to?, raw?}` shape as the email path. Edge editions, which usually don't have inbound SMTP, get tasks via this path or §6.3.

### 6.3 Manual create

A "New Task" button in the Tasks UI surface. Writes a `create` event directly to a new `tasks/<task_id>.jsonl`, bypassing the inbox.

### 6.4 Router

Anything in `inbox.jsonl` is **a candidate**, not yet a task. The router (daemon-side, configured per user) decides:

- Drop / dismiss (write `dismissed` to inbox)
- Promote to new task (write `routed` to inbox, create `tasks/<task_id>.jsonl`)
- Append to existing task (write `routed` to inbox with the existing `task_id`, append `ingest` event to the task file)

Router rules live in `~/.huozi-bridge/router.yaml` on the daemon side. Default rule: promote everything to a new task and dispatch to Claude Code.

---

## 7. Threading rules

Email threading uses RFC 2822 `Message-Id` / `In-Reply-To` / `References`. A small D1 table maps message IDs to tasks:

```sql
CREATE TABLE task_message_index (
  message_id      TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  task_id         TEXT NOT NULL,
  recorded_at     INTEGER NOT NULL
);
```

On every inbound email the ingest path:

1. If `In-Reply-To` or any `References` hits the index → look up `task_id` → append `ingest` event directly to `tasks/<task_id>.jsonl`, **skip the inbox**. Index every `Message-Id` we see for future replies.
2. Otherwise → write `ingest` event to `inbox.jsonl`. Once routed/promoted, the router records the new task's seed `Message-Id` in the index.

Webhook and manual sources don't thread by default. Callers can opt in by passing an explicit `task_id` in the payload (existing task) or omitting it (new task).

---

## 8. The daemon protocol (`huozi-bridge`)

The daemon lives on the user's machine (separate repo). It's the only thing that knows how to call a local agent CLI.

**Auth:** OAuth device flow against the huozi Worker (already shipped — `packages/huozi-cloud/src/storage/cloudflare/device-auth.ts` and `oauth.ts`). The daemon ends up holding an `hz_*` API key with workspace scope.

**Subscribe:** the daemon mints a WebSocket ticket via `/api/app/ws-ticket` (browser endpoint) — or a server-to-server equivalent — and listens for commit events. Filter client-side: any commit whose `paths[]` includes `inbox.jsonl` or anything under `tasks/`.

**Read:** on a commit event, the daemon pulls the changed file via the MCP read tool, folds to current state.

**Write back:** via the MCP edit tool with append semantics. The daemon enforces append-only at write time (read the current SHA, append, write with `parent_blob_sha`). On `MODIFIED_SINCE_READ` it retries with a fresh read.

**Dispatch (Claude Code adapter):**

```ts
const cwd = path.join(homedir(), ".huozi-bridge", "tasks", task_id);
await mkdir(cwd, { recursive: true });

const proc = spawn("claude", [
  "-p", body,
  "--session-id", task_id,            // first time: assigns it
  "--resume", task_id,                // subsequent rounds: resumes it
  "--output-format", "stream-json",
  "--bare",                            // no hooks/MCP/memory in the spawned claude
  "--permission-mode", "acceptEdits",
  "--allowedTools", "Read,Edit,Bash(git *),Grep",
], { cwd });

// Parse stream-json:
//   {"type":"system","subtype":"init", "session_id": "<task_id>"}
//   {"type":"assistant", "content": [...]}    → append `agent_turn`
//   {"type":"tool_use", ...}                  → append `tool_use`
//   {"type":"tool_result", ...}               → append `tool_result`
//   {"type":"result", "subtype":"success", "result": "...", "total_cost_usd": ...}
//                                              → append `result`
```

**Critical: cwd is part of session identity.** Claude Code stores session JSONL under `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Resume only works if the daemon spawns from the same cwd. The per-task workdir is not a stylistic choice; it is what makes `--resume` work.

**Idempotency:** every event the daemon writes carries `at` (RFC 3339) and a deterministic source identifier (`tool_use_id`, `claude_message_id`). The daemon may replay a stream from the start after a crash; the writer must de-dup by `(id, at, source_id)` before appending.

---

## 9. Confirm pattern

Some tasks need a human Yes/No mid-flow. The flow:

1. Agent emits a `confirm_requested` line via the daemon. Schema-aware projector flips `status` to `awaiting_user`.
2. CollectionView detail page detects the trailing `confirm_requested` event and renders Approve / Reject buttons inline above the timeline.
3. User clicks → `POST /api/app/tasks/<task_id>/confirm` with `{action, note?}`. The route appends a `user_action` event (`by: user:<id>`, `at: <now>`, `action`, `note`).
4. The daemon's WebSocket subscription fires on the new commit. It sees the new `user_action`, calls `claude --resume <task_id>` with a synthesized prompt like `User approved. Proceed.` (or `User rejected: <note>. Stop or revise.`).
5. Agent emits more events. Status returns to `working` (or jumps to `result` if the rejection ends the run).

The Approve / Reject UI is the only Tasks-specific addition to `collection-view.tsx`. Everything else — list, detail, timeline, schema-driven fields — is the existing Collection viewer doing its job.

---

## 10. Cloud vs Edge

### 10.1 What works on both editions

Tasks is **mostly edition-agnostic**. The Collection model, the per-task file layout, the event vocabulary, the projector, the render, the daemon protocol, and the confirm pattern all run unchanged on Edge. Of the eight Tasks-specific surfaces, **seven are edition-neutral**. Only the email ingest path diverges.

| Capability                         | Cloud                                | Edge                                  |
|------------------------------------|--------------------------------------|---------------------------------------|
| `inbox.jsonl` + `tasks/<id>.jsonl` model | ✅                                | ✅                                    |
| Webhook ingest                     | ✅ HMAC, per-workspace secret        | ✅ HMAC, single-workspace             |
| Manual create                      | ✅                                   | ✅                                    |
| Confirm pattern + UI               | ✅                                   | ✅                                    |
| Daemon (`huozi-bridge`)            | ✅                                   | ✅ (points at deployer's worker URL)  |
| OAuth device flow for daemon       | ✅                                   | ✅ (already shipped)                  |
| Real-time updates via WebSocket    | ✅                                   | ✅ (already shipped)                  |
| Email magic address (`mail.huozi.app`) | ✅ per-user `t-<token>@`         | ❌ no shared inbound domain           |

### 10.2 Why Tasks is *more* relevant on Edge than email feels

Edge deployments are typically small teams running huozi as internal automation infrastructure. Their pain point is rarely "process my Gmail" — it's "let an agent drive work that arrives from Slack / Linear / our own ticketing system." That maps to the **webhook ingest path**, which Edge supports as a first-class channel. The lack of `mail.huozi.app` removes a channel many Edge deployers wouldn't have used anyway.

Concretely, on an Edge deployment:

- A Slack slash command POSTs to `<edge-worker>/api/app/tasks/ingest` with an HMAC.
- A JIRA / Linear automation POSTs the same shape on a webhook trigger.
- A user clicks "New Task" in the Tasks UI panel.
- The daemon on their laptop subscribes to the Edge worker's WebSocket and dispatches to local Claude Code.
- The result lands back in the task file; if the daemon raises `confirm_requested`, the user clicks Approve in the Edge UI and the agent resumes.

This is the full Tasks loop, with zero Cloud dependency.

### 10.3 If an Edge deployer *does* want email

Two opt-in paths, neither in v1:

1. **Bring your own domain.** Deployer points an MX record at Cloudflare on `mail.acme-internal.com`, deploys a copy of `huozi-email-ingest` configured with the workspace_id baked in (Edge is single-workspace, so the D1 token table simplifies to a single passphrase or to per-user tokens scoped to the one workspace).
2. **Pipe through a generic mail-to-webhook bridge.** Tools like Improvmx, ForwardEmail, Mailgun Routes, or n8n's IMAP node can deliver inbound mail to the existing webhook endpoint. Edge inherits this for free — no code changes.

### 10.4 Edition divergence in code

The divergence is small enough that one method on `IdentityService` covers it:

```ts
interface IdentityService {
  // …existing methods…
  /** The user's inbound magic address, or null if this edition doesn't support email ingest. */
  getEmailIngestAddress(userId: string): Promise<string | null>;
}
```

- `cloud.ts` returns `t-<token>@mail.huozi.app` (mints/looks up the token in `email_tokens`).
- `edge.ts` returns `null`.
- The settings panel checks for `null` and renders the webhook-only configuration instead.

Everything else — the ingest route, the schema, the daemon, the confirm flow — has no edition-aware code.

---

## 11. Anti-patterns

**Don't put every task in one giant `tasks.jsonl`.** A single file with N tasks as N entities makes the Claude session mirror impossible (one session per file would mean one session per workspace). The whole architecture rests on `task_id == file_path == session_id`.

**Don't mirror the entire Claude session log into the task file.** The daemon translates Claude's stream events into huozi's event vocabulary (§3) and drops the noise (partial messages, retries, internal pings). The huozi file is for the user; the raw Claude session is for replay/debug at `~/.claude/projects/`.

**Don't write `status` events as the primary state carrier.** Status is derived from `op`. Write the `op` you actually did; the projector handles `status`. Explicit `status` events exist only for cases where no other `op` fits (manual override).

**Don't expose `inbox.jsonl` as the agent's primary view.** Inbox is triage. Agents get dispatched at the task level — they should not be reading sibling tickets unless the user explicitly tells them to.

**Don't auto-archive without a `result` event.** Archive is the user's (or agent's, at the user's request) explicit close. If `result` never landed and the task is just stale, the renderer marks it dim — but it stays.

**Don't write tokens or message bodies to logs.** The email Worker is the only thing that ever sees a magic-address token in cleartext; it forwards the workspace ID downstream, never the token. Inbox / task files store sender + subject + body, never the token that delivered them.

---

## 12. Implementation pointers

| Concern                                  | Where                                                          |
|------------------------------------------|----------------------------------------------------------------|
| Canonical schema constant                | `src/lib/tasks/schema.ts` (new)                                |
| Confirm CTA in detail view               | `src/components/collection-view.tsx` (small additive change)   |
| Tasks workspace surface                  | `src/components/workspace/tasks-panel.tsx` (new)               |
| Settings — email address panel           | `src/components/workspace/settings/tasks-email-panel.tsx` (new) |
| `GET /POST /PATCH /api/app/tasks/email-token` | `src/app/api/app/tasks/email-token/route.ts` (new)         |
| `POST /api/app/tasks/ingest` (webhook)   | `src/app/api/app/tasks/ingest/route.ts` (new)                  |
| `POST /api/app/tasks/[id]/confirm`       | `src/app/api/app/tasks/[id]/confirm/route.ts` (new)            |
| Email-Worker → main-Worker bridge        | `POST /admin/tasks/ingest` on `huozi-cloud` (new)              |
| Email-Worker (separate package)          | `packages/huozi-email-ingest/` (new)                           |
| D1: `email_tokens` table                 | `packages/huozi-cloud/src/storage/cloudflare/schema.sql` (extend) |
| D1: `task_message_index` table           | same                                                           |
| Edition divergence                       | `getEmailIngestAddress` on `IdentityService` (`cloud.ts` / `edge.ts`) |
| Daemon                                   | `huozi-bridge` (separate repo, Node, OAuth device flow)        |

See `four-types.md` §3 for the underlying Collection contract that this whole document leans on.
