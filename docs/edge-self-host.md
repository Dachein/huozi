# Self-hosting huozi (Edge edition)

The **Edge** edition of huozi is the open-source self-host build. One Cloudflare account, one workspace, one deployer who holds the admin key. No Supabase. No email login. No multi-tenant accounting. The deployer hands API keys to themselves and to any Agents they want to grant access.

This guide covers:

1. [What the Edge edition is](#what-the-edge-edition-is) — and what it isn't
2. [Quick start](#quick-start) — `scripts/edge-deploy-test.sh` end-to-end
3. [Environment variables](#environment-variables) — the full surface
4. [Production deployment](#production-deployment) — custom domain, persistent secrets
5. [Operations](#operations) — minting more keys, rotating secrets, teardown
6. [Architecture notes](#architecture-notes) — what runs where

---

## What the Edge edition is

The Edge edition is exactly the same code as Cloud, but with `HUOZI_EDITION=edge` set. Everything edition-divergent is concentrated in `src/lib/identity/{cloud,edge}.ts`; every other file is byte-identical.

```
                           HUOZI_EDITION=edge
                                  │
       ┌──────────────────────────┴─────────────────────────────┐
       │                                                         │
   src/lib/identity/edge.ts                          packages/huozi-cloud/
   ─ "admin" principal whenever                       ─ same code as cloud
     the api_key cookie is present                    ─ HUOZI_PUBLIC_BASE
   ─ single fixed workspace via                         points at YOUR
     HUOZI_EDGE_WORKSPACE_SLUG                          Next.js host (not
   ─ no /login, no email-OTP                            huozi.app)
   ─ /workspace anon → /connect
   (paste-key bootstrap)
```

What you get:

- **Full MCP surface** — every `huozi_*` tool (read / edit / write / glob / grep / list_tree / batch_edit / mkdir / mv / rm / share / template / history / whoami) works the same as Cloud
- **Folder ACL machinery** — works, but the single-admin model means there's only one user; ACL membership is moot until you mint keys for collaborators (planned post-v1)
- **Audit trail** — every Edit / Write / Mv / Rm produces a commit row in D1; `huozi_history` queries it
- **Live shares** — `huozi.app/p/<slug>` equivalent at YOUR host (`HUOZI_PUBLIC_BASE/p/<slug>`)

What you don't get (yet):

- Multi-user invites — the data layer supports it (workspace_members, folder_acl_members), but the Edge UI doesn't expose it. You'd need to mint and hand out api_keys manually for now.
- Email-OTP login — there's no SMTP wired up on Edge. The deployer holds the api_key.
- Web onboarding — the first key mint is a CLI call (`scripts/edge-deploy-test.sh` does it for you).

## Quick start

**Prerequisites**

| Tool | Why | Install |
|---|---|---|
| Node 20+ | Next.js / wrangler runtime | `brew install node` |
| `wrangler` | Cloudflare CLI, authenticated | `npx wrangler login` |
| `jq` | JSON parsing inside the deploy script | `brew install jq` |

**Step 1 — clone + install**

```bash
git clone https://github.com/Dachein/huozi.git
cd huozi
npm install
```

**Step 2 — provision the Worker stack**

```bash
scripts/edge-deploy-test.sh
```

The script is fully unattended. It:

1. Builds the Worker (`tsc → packages/huozi-cloud/dist/`)
2. Generates a temporary `wrangler.edge.toml` (gitignored)
3. Creates D1 `huozi-edge-db` and R2 `huozi-edge-blobs` if they don't exist
4. Applies `schema.sql` against the new D1
5. Seeds an `admin` row in `users`, a workspace row, and the membership
6. Generates a 32-byte hex `HUOZI_ADMIN_SECRET` and pushes it as a Worker secret
7. Pushes `HUOZI_PUBLIC_BASE=http://localhost:3000` (override via `PUBLIC_BASE=…`)
8. Deploys the Worker to your account's `workers.dev` subdomain
9. Mints the first admin `api_key` against `ws_<workspace-slug>` (default slug: `default`)
10. Smoke-tests the Worker by calling `huozi_whoami` and asserting `role=owner`
11. Writes `.huozi-edge.env` (chmod 600, gitignored) with everything the Next.js side needs

Override the inside-huozi workspace slug:

```bash
WORKSPACE_SLUG=alice scripts/edge-deploy-test.sh
```

**Step 3 — run the Next.js front-end**

```bash
set -a; source .huozi-edge.env; set +a
npm run dev
```

Then visit [http://localhost:3000](http://localhost:3000):

- `/` → `/workspace` → `/connect` (no api_key cookie yet)
- Paste the `api_key` printed by the script
- → `/workspace` — you're in. Files written via MCP show up here.

The api_key cookie persists across browser sessions; you only paste it once.

## Environment variables

Worker side (set with `wrangler secret put` or in `[vars]` of your wrangler.toml):

| Var | Required | Default | Notes |
|---|---|---|---|
| `HUOZI_ADMIN_SECRET` | yes | — | Shared with Next.js; gates `/admin/*` routes. Use a 32-byte random hex. |
| `HUOZI_PUBLIC_BASE` | yes for Edge | `https://huozi.app` | Origin used in `huozi_share` URLs. Set to wherever your Next.js front-end serves `/p/<slug>`. |

Next.js side (set in `.env.local` or via `set -a; source .huozi-edge.env; set +a`):

| Var | Required | Default | Notes |
|---|---|---|---|
| `HUOZI_EDITION` | yes | `cloud` | Set to `edge` |
| `HUOZI_CLOUD_URL` | yes | `https://cloud.huozi.app` | Worker URL for this Edge deploy |
| `HUOZI_ADMIN_SECRET` | yes | — | Must match the Worker secret |
| `HUOZI_AUTH_SECRET` | (Cloud only) | — | JWT signing key for email-OTP sessions; not used in Edge |
| `HUOZI_EDGE_WORKSPACE_SLUG` | yes for Edge | `default` | Must match the slug in the workspaces table; api_keys.workspace_id is `ws_<slug>` |
| `HUOZI_EDGE_WORKSPACE_NAME` | optional | `Workspace` | Display name in the UI |

## Production deployment

The `edge-deploy-test.sh` script gives you a working `*.workers.dev` Worker. For a real deploy you'll typically want:

- **Custom domain** for the Worker (so MCP endpoint is e.g. `cloud.alice.dev/mcp`)
- **Custom domain** for the Next.js front-end (where users browse the workspace)
- **Persistent secrets**, ideally injected via your CI / deploy tool, not in `.env.local`

A reasonable production flow:

**Worker** — edit `packages/huozi-cloud/wrangler.edge.toml` (the script-generated one) to add a `routes` block:

```toml
routes = [
  { pattern = "huozi.alice.dev", custom_domain = true }
]
```

Then redeploy:

```bash
cd packages/huozi-cloud
npx wrangler deploy --config wrangler.edge.toml
npx wrangler secret put HUOZI_PUBLIC_BASE --config wrangler.edge.toml
# (paste `https://app.alice.dev` or wherever Next.js will live)
```

**Next.js** — there are several options. The repo ships with `cf:deploy` set up via OpenNext for Cloudflare:

```bash
# At the root:
set -a; source .huozi-edge.env; set +a   # injects edition + worker URL + secrets
npm run cf:deploy
```

This builds with OpenNext and deploys as a separate Worker. Set its custom domain to match `HUOZI_PUBLIC_BASE` so share URLs resolve.

Other hosts (Vercel, Fly, your own Node server) all work — Next.js 16 has no Cloudflare lock-in. Just make sure the env vars from `.huozi-edge.env` are present at runtime.

## Operations

**Mint another api_key** (for a collaborator or a second Agent):

```bash
WORKER=https://huozi.alice.dev   # or your *.workers.dev URL
SECRET=<HUOZI_ADMIN_SECRET>
curl -X POST "$WORKER/admin/mint-key" \
  -H "X-Admin-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "ws_default",
    "principal_id": "admin",
    "principal_type": "agent",
    "name": "[claude-code] Alice laptop"
  }'
```

The response includes the bare `api_key` exactly once. Hand it to the recipient; they paste it at `/workspace/connect` (browser) or pass it as `Authorization: Bearer <key>` (Agent).

**Rotate `HUOZI_ADMIN_SECRET`**:

```bash
cd packages/huozi-cloud
echo "<new-32-byte-hex>" | npx wrangler secret put HUOZI_ADMIN_SECRET --config wrangler.edge.toml
# Then update the Next.js env (.env.local or your CI) to match.
```

The rotation takes effect immediately for new requests; existing api_keys keep working (their hashes are checked against `api_keys.key_hash`, which is independent of the admin secret).

**Revoke an api_key**:

```bash
curl -X POST "$WORKER/admin/revoke-key" \
  -H "X-Admin-Secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"key_id": "k_<id>"}'
```

`key_id` is shown in `huozi_whoami` output and the `/workspace` connections list.

**Tear down everything**:

```bash
scripts/edge-deploy-test-teardown.sh
```

Deletes Worker, D1 (and all data), R2 (and all blobs), local toml, local env file. Cannot be undone.

## Architecture notes

```
┌──────────────────┐      MCP / JSON-RPC      ┌──────────────────────┐
│   Your Agent     │ ───────────────────────► │  huozi-cloud Worker  │
│ (Claude Code,    │ ◄─────────────────────── │  (your CF account)   │
│  Cursor, etc.)   │                          │                      │
└──────────────────┘                          │   ┌──────────────┐   │
                                              │   │ huozi-edge-  │   │
                                              │   │   db (D1)    │   │
                                              │   ├──────────────┤   │
                                              │   │ huozi-edge-  │   │
                                              │   │ blobs (R2)   │   │
                                              │   ├──────────────┤   │
                                              │   │ Workspace +  │   │
                                              │   │ Session DOs  │   │
                                              │   └──────────────┘   │
                                              └──────────┬───────────┘
                                                         │
                                                  ▲ admin REST
                                                  │      │ MCP
                                                  │      │ (cookie auth)
┌─────────────────────────┐                       │      │
│ Browser (you, the       │ ──────────────────────┴──────┘
│ deployer)               │   Next.js front-end
└─────────────────────────┘
```

The Worker is the single source of truth — D1 stores files / commits / ACLs / api_keys, R2 stores blob bytes, Durable Objects serialize writes per workspace and hold per-session state. The Next.js app is a thin browser front-end: it doesn't store anything, it just calls the Worker via MCP (cookie-bound bearer token) and admin endpoints (server-to-server, gated by `HUOZI_ADMIN_SECRET`).

This means **all your data lives in YOUR Cloudflare account**. The huozi.app maintainers (or anyone else) cannot read your files. Lose your CF account credentials = lose access. Standard self-hosting tradeoff.

For deeper details, see [`packages/huozi-cloud/SPEC.md`](../packages/huozi-cloud/SPEC.md).
