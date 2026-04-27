<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Editions — Cloud vs Edge

huozi.app ships as two builds from one codebase. Both expose the same product: an Agent-native cloud drive backed by the huozi-cloud Worker. The editions differ only in how they answer "who is this request?".

- **cloud** (default): hosted at huozi.app. D1-backed email-OTP login, multi-user invites, each user can belong to multiple workspaces. Billing surfaces will live here too.
- **edge**: open-source self-host. No login surface — the deployer holds `HUOZI_ADMIN_SECRET` and pastes the resulting api_key at `/connect` to bootstrap. One deployment = one workspace.

The edition is selected by `HUOZI_EDITION` (`cloud` | `edge`), resolved via `@/lib/edition`. Everything else is shared.

**There is no separate "publishing v1" subsystem anymore.** The old `/dashboard`, `/[workspace]/[slug]`, and `/api/v1/*` routes were removed on 2026-04-21 in favor of the unified drive model. If you're tempted to resurrect REST endpoints that mirror MCP tools — don't. The MCP surface at `cloud.huozi.app/mcp` (Cloud) or your worker URL (Edge) is the single API.

**Identity used to be Supabase.** As of 2026-04-27 it lives entirely in D1 — see `packages/huozi-cloud/src/storage/cloudflare/{users,workspaces,workspace_members,workspace_invites,otp_codes}` (in `schema.sql`) plus `auth-otp.ts` / `jwt.ts` / `mailer.ts`. Migrations 00008–00010 dropped the old Supabase tables. There is no `@/lib/supabase` anymore.

## Architectural invariant

**Edition-divergent code lives in exactly two files: `src/lib/identity/cloud.ts` and `src/lib/identity/edge.ts`.** Everything else — pages, routes, components — goes through `@/lib/identity`'s `getIdentity()` and the `IdentityService` interface.

This is what lets the Edge build run with no email-OTP, no JWT signing, no multi-workspace logic. If you catch yourself wanting to special-case "are we cloud?" outside of `getIdentity()`, extend `IdentityService` instead.

The other edition-aware module is `@/lib/edition` itself (`isCloud()` / `isEdge()`), used in narrow places like `(app)/layout.tsx` to pick the right unauthenticated redirect target (`/login` vs `/connect`). Use it sparingly.

## Module map

```
src/lib/
├── edition.ts              getEdition() · isCloud() · isEdge()
├── identity/               "who is this request?"
│   ├── types.ts            Principal · Workspace · Connection · IdentityService
│   ├── cloud.ts            D1-backed impl (Worker admin endpoints + JWT cookies)
│   ├── edge.ts             single-admin impl (api_key cookie = "admin" principal)
│   ├── connections.ts      shared connection CRUD (cloud + edge use it)
│   └── index.ts            getIdentity()  ← public entry
├── drive/                  huozi-cloud Worker client
│   ├── mcp-client.ts       /mcp via JSON-RPC (cookie-auth)
│   ├── admin.ts            /admin/* via HUOZI_ADMIN_SECRET (server-only)
│   └── shares.ts           /shares/* read endpoints
├── auth/                   email-OTP + JWT primitives (Cloud-only at runtime,
│                           but importable from Edge with no side effects)
└── permissions.ts          capability matrix shared with the Worker
```

- **Identity** knows *who*.
- **Drive** knows *what's in the workspace*.
- Pages/routes compose these two and don't know which edition they're running under.

## When extending

- Adding a new user-facing capability that needs Cloud-only data (e.g. multi-workspace listing)? Put the method on `IdentityService`, implement in `cloud.ts`, return a sensible Edge fallback in `edge.ts` (often `null` or a no-op). Never throw from `edge.ts` for paths that the layout calls — silent degradation is the contract.
- Talking to the huozi-cloud Worker (drive data, admin ops)? Go through `@/lib/drive`. Don't `fetch()` the cloud URL directly from a page.
- Touching the `HUOZI_EDITION` env var anywhere other than `@/lib/edition`? Don't. Always `isCloud()` / `isEdge()`.
- Adding a marketing / blog / brand page? **Don't.** Marketing lives in the sibling `huozi-marketing` repo. Anything that ships in this repo should be product surface (workspace, auth, /p, MCP).

See `packages/huozi-cloud/SPEC.md` for the Worker's data model (D1 schema, DO topology, MCP surface).
