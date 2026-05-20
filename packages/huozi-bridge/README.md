# huozi-bridge

The local daemon that turns a huozi workspace's Tasks Collection into
agent work. Subscribes to your workspace's WebSocket commit stream,
spawns `claude --session-id=<task_id>` per task, mirrors the agent's
stream-json output back into `tasks/<task_id>.jsonl`.

See `app/docs/tasks.md` §8 for the protocol contract and §9 for the
confirm pattern.

## v0 scope (this version)

| Feature                                        | Status   |
|------------------------------------------------|----------|
| WebSocket subscribe + auto-reconnect           | ✅       |
| Inbox → tasks promotion (default router)       | ✅       |
| Claude CLI spawn with `--session-id`           | ✅       |
| stream-json → huozi event translation          | ✅       |
| Resume on `user_action`                        | ✅       |
| In-memory event dedup                          | ✅       |
| OAuth device flow login                        | ❌ (env var) |
| Multi-workspace                                 | ❌       |
| Router rules from `~/.huozi-bridge/router.yaml` | ❌       |
| Persistent state (cold-start catch-up)         | ❌       |
| Packaged binary / signed installer             | ❌       |

v0 needs the user to paste an API key into an env var. Future PRs add
OAuth device flow so `huozi-bridge login` mirrors `claude login`.

## Prerequisites

- Node ≥ 18
- `claude` CLI installed and logged in (`claude login` works locally)
- A huozi API key for the target workspace — mint one in your
  workspace settings under Connections, agent_kind = `other` or
  `claude-code`.

## Install + run

```bash
cd packages/huozi-bridge
pnpm install
pnpm build

export HUOZI_API_KEY=hz_…
# Optional overrides:
# export HUOZI_CLOUD_URL=https://cloud.huozi.app
# export HUOZI_BRIDGE_WORKDIR=$HOME/.huozi-bridge/tasks
# export HUOZI_BRIDGE_VERBOSE=1
node dist/index.js
```

Output is NDJSON to stderr — pipe through `jq` for ad-hoc inspection:

```bash
node dist/index.js 2>&1 | jq .
```

## What happens

1. On startup the daemon mints a WebSocket ticket against
   `cloud.huozi.app/events/mint-ticket` and opens `wss://…/events/ws`.
2. For every `commit` event whose `paths` include `inbox.jsonl`:
   - Read `inbox.jsonl`, find tickets with no matching `routed` event.
   - For each: append a `routed` event to inbox, seed `tasks/<id>.jsonl`
     with the canonical schema event + a `create` event mirroring the
     ticket. That commit then loops back through (3).
3. For every `commit` event whose `paths` include `tasks/<id>.jsonl`:
   - Read the file; look at the latest event.
   - `create` / `ingest` → spawn `claude` (first dispatch or
     `--resume`, depending on whether we've dispatched this task this
     run).
   - `user_action` → spawn `claude --resume <id>` with a synthesized
     prompt that conveys approve / reject / comment + optional note.
   - Anything else → ignore (most commits are from the daemon itself).
4. The Claude process streams JSONL. The daemon translates each event
   into a huozi `op` (`agent_turn`, `tool_use`, `tool_result`,
   `result`) and appends to `tasks/<id>.jsonl` via MCP `huozi_write`
   with `parent_blob_sha` for staleness retries.
5. When Claude exits 0 the daemon appends one final `result` event
   carrying `cost_usd` and `stop_reason`. Non-zero exit appends an
   `op:"result"` with `result_kind: "error"`.

## Per-task workdir

Each task runs in `~/.huozi-bridge/tasks/<task_id>/`. Claude's session
log lives at `~/.claude/projects/<encoded-cwd>/<task_id>.jsonl` — the
cwd-keying is what makes `--resume` work, so the daemon never reuses
a workdir across task ids.

Workdirs accumulate; clean them when a task is archived (manual for
v0).

## In-memory dedup

The daemon keeps a per-task `Set<uuid>` of stream-json event uuids
and tool-use ids it has already mirrored. This protects against
within-run replays (e.g. a single commit handler running twice).

A full daemon restart loses the in-memory state. v0 is OK with that
because:
- The WS subscription only delivers commits going forward.
- A claude run that was in-flight at restart is killed by the OS; the
  user can re-trigger by appending any `user_action` or just commenting
  on the task file.

A future PR will persist dedup state and add `catchUp()` so the daemon
resumes truly idempotently across cold restarts.

## Limits

- One claude process per task at a time (in-flight guard).
- Sequential per task — no parallelism within a single thread.
- No outbound send-email — replies need a separate path (deferred).
- Tool allowlist is global, not per-task: change with
  `HUOZI_BRIDGE_ALLOWED_TOOLS`. Default is
  `Read,Edit,Grep,Glob,Bash(git *)`.
- 8 KB cap per `tool_result` body in the mirrored event; full result
  stays in `~/.claude/projects/.../session.jsonl`.

## Troubleshooting

```bash
HUOZI_BRIDGE_VERBOSE=1 node dist/index.js 2>&1 | jq .
```

- "mint-ticket http 401" → `HUOZI_API_KEY` wrong or revoked.
- "ws closed" repeating quickly → service binding / proxy stripping
  the `Authorization` header; check `HUOZI_CLOUD_URL` points at the
  real Worker.
- "claude non-zero exit … not logged in" → run `claude login` once
  on this machine.
- Mirrored events stop mid-run → look for `claude stderr` lines in
  verbose mode; likely a permission prompt the daemon couldn't
  bypass. Either widen `--allowedTools` or use
  `--permission-mode acceptEdits` (already the default).
