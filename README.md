# huozi · 活字

[![CI](https://github.com/Dachein/huozi/actions/workflows/ci.yml/badge.svg)](https://github.com/Dachein/huozi/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Dachein/huozi?style=social)](https://github.com/Dachein/huozi)

**An Agent-native cloud drive.** Speaks the Claude Code tool dialect bit-for-bit, so any MCP-capable Agent — Claude Code, Cursor, Codex, your own — can mount it with zero adapters and use it as a working directory.

> 印 (MCP) · 版 (templates) · 盘 (cloud) · "Agents write, humans read."

[huozi.app](https://huozi.app) · [`cloud.huozi.app/mcp`](https://cloud.huozi.app/mcp) · MIT

---

## What it is

Three layers, one product:

| 层 | What | Surface |
|---|---|---|
| **印 (MCP)** | Agents read / edit / write / glob / grep / share files | `cloud.huozi.app/mcp` — JSON-RPC over HTTP, Claude Code dialect |
| **版 (templates)** | 5 self-contained HTML scaffolds for publishable content | `huozi_template` MCP tool: `web` / `mobile` / `deck` / `story` / `paper` |
| **盘 (cloud)** | Storage + multi-Agent collab + audit | Cloudflare Workers + D1 + R2 + Durable Objects |

Each write is a Git-style commit with a tamper-resistant audit trail. Folder-level ACLs let you share parts of a workspace without leaking the rest. Public files become live `huozi.app/p/<slug>` URLs that track the source on every edit.

The Web UI is intentionally read-only — the Agent is the editor, the human reads / approves / instructs. (See [`packages/huozi-cloud/SPEC.md` § 0.4](packages/huozi-cloud/SPEC.md) for the rationale.)

## Two editions

```
                ┌─────────────────────────────────┐
                │   the same Next.js + Worker     │
                │   codebase, picked by env       │
                └────────┬────────────────┬───────┘
                         │                │
                  HUOZI_EDITION=cloud   HUOZI_EDITION=edge
                         │                │
       ┌─────────────────┴─────┐      ┌───┴────────────────────────┐
       │ huozi.app — hosted    │      │ Self-host on your CF       │
       │  · email-OTP login    │      │ account (free tier OK)     │
       │  · multi-user invites │      │  · single deployer = admin │
       │  · multiple workspaces│      │  · paste-key auth          │
       │  · Web UI for everyone│      │  · 1 deploy = 1 workspace  │
       └───────────────────────┘      └────────────────────────────┘
```

Code is byte-identical except for `src/lib/identity/{cloud,edge}.ts`. Selection is via the `HUOZI_EDITION` env var, resolved through `src/lib/edition.ts`.

## Quick start — Edge (self-host)

A single bash script provisions every Cloudflare resource you need into your own account, applies the schema, mints the first admin key, and runs a smoke test.

**Prerequisites:** Node 20+, [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) authenticated (`npx wrangler login`), `jq` (`brew install jq`).

```bash
git clone https://github.com/Dachein/huozi.git
cd huozi
npm install

# One-shot: provisions Worker / D1 / R2, seeds admin row, mints first key.
scripts/edge-deploy.sh
```

What it creates (in your CF account):

- Worker: `huozi-edge` (workers.dev URL — no DNS needed)
- D1: `huozi-edge-db`
- R2: `huozi-edge-blobs`
- Secrets: `HUOZI_ADMIN_SECRET`, `HUOZI_PUBLIC_BASE`
- One admin user / workspace / membership row in D1
- First admin `api_key` for paste-key auth

A `.huozi-edge.env` file gets dropped at the repo root with everything the Next.js dev server needs. Gitignored automatically.

```bash
# Then run the Next.js front-end in Edge mode:
set -a; source .huozi-edge.env; set +a
npm run dev
# → open http://localhost:3000
# → /workspace/connect: paste the api_key the script printed
# → /workspace: you're in
```

Tear down anytime with `scripts/edge-teardown.sh`. See [`docs/edge-self-host.md`](docs/edge-self-host.md) for production deployment, custom domains, and the full env-var surface.

## Quick start — Cloud (hosted)

Just visit [huozi.app](https://huozi.app), sign in with your email, and connect your Agent. The hosted build is what most users want. The source here is the same code that runs there.

For local development against the hosted Worker:

```bash
git clone https://github.com/Dachein/huozi.git
cd huozi
npm install
npm run dev
# → open http://localhost:3000
```

The Cloud build talks to `cloud.huozi.app/mcp` by default. To point at a different Worker (e.g. a local `wrangler dev`), set `HUOZI_CLOUD_URL=http://localhost:8787` in `.env.local`.

## Connecting an Agent

The MCP endpoint is `cloud.huozi.app/mcp` (Cloud) or your Edge Worker URL.

**Claude Code:**

```bash
claude mcp add huozi https://cloud.huozi.app/mcp
```

You'll be walked through OAuth-device-flow auth on first use. From then on, every Read / Edit / Write / Glob / Grep call from Claude Code lands in your huozi workspace.

**Anything else MCP-aware** — the JSON-RPC surface is documented in [`packages/huozi-cloud/SPEC.md` § 4](packages/huozi-cloud/SPEC.md). Tool names and field shapes match Claude Code's built-in file tools 1:1, so adapters built for Claude Code work as-is.

## Repo layout

```
huozi/
├── src/                            # Next.js app (the product surface)
│   ├── app/
│   │   ├── (app)/workspace/        # the actual product UI
│   │   ├── (auth)/                 # login / connect / onboard / select-workspace
│   │   ├── api/                    # server-side endpoints
│   │   └── p/[slug]/               # public share viewer (huozi.app/p/<slug>)
│   ├── lib/identity/{cloud,edge}.ts# the only edition-divergent code
│   ├── lib/drive/                  # huozi-cloud Worker client
│   └── components/workspace/       # workspace UI
│
├── packages/huozi-cloud/           # the Worker (cloud.huozi.app/mcp)
│   ├── src/worker/                 # entry point
│   ├── src/storage/cloudflare/     # D1 / R2 / DO storage layer
│   ├── src/tools/                  # MCP tools (huozi_read, _edit, …)
│   └── SPEC.md                     # the canonical architecture doc
│
├── scripts/                        # edge-deploy.sh, teardown
└── docs/                           # deployment guides
```

The huozi.app **marketing site** (landing, blog, /cloud, /edge, /docs, /start) lives in a sibling repo at `huozi-marketing` so this repo stays clean of brand-specific copy. Self-hosters of the Edge edition see only the product surface.

## Documentation

- [`packages/huozi-cloud/SPEC.md`](packages/huozi-cloud/SPEC.md) — architecture, tool contracts, audit model, the why behind every decision
- [`docs/edge-self-host.md`](docs/edge-self-host.md) — Edge deployment in production
- [`AGENTS.md`](AGENTS.md) — invariants for anyone (human or AI) writing code in this repo

## License

MIT — see [LICENSE](LICENSE).
