<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Editions — Cloud vs Edge

huozi.app ships as two builds from one codebase. Both expose the same product: an Agent-native cloud drive backed by the huozi-cloud Worker. The editions differ only in how they answer "who is this request?".

- **cloud** (default): hosted at huozi.app. Supabase-backed email-OTP login, multi-user, each user owns one workspace. Billing surfaces will live here too.
- **edge**: open-source self-host. No Supabase, no login surface. The deployer holds `HUOZI_ADMIN_SECRET`; all users paste an API key at `/cloud/connect` to bootstrap. One deployment = one workspace.

The edition is selected by `HUOZI_EDITION` (`cloud` | `edge`), resolved via `@/lib/edition`. Everything else is shared.

**There is no separate "publishing v1" subsystem anymore.** The old `/dashboard`, `/[workspace]/[slug]`, and `/api/v1/*` routes were removed on 2026-04-21 in favor of the unified drive model. If you're tempted to resurrect REST endpoints that mirror MCP tools — don't. The MCP surface at `cloud.huozi.app/mcp` is the single API.

## Architectural invariant

**Supabase must only be imported inside `@/lib/identity/cloud.ts` and `@/lib/supabase/*`.** Everything else — pages, routes, components — goes through `@/lib/identity`.

This one rule is what lets Edge builds compile without Supabase. If you catch yourself writing `import { createClient } from "@/lib/supabase/server"` in a page or route, extend `IdentityService` instead and call through `getIdentity()`.

## Module map

```
src/lib/
├── edition.ts              getEdition() · isCloud() · isEdge()
├── identity/               "who is this request?"
│   ├── types.ts            Principal · Workspace · Connection · IdentityService
│   ├── cloud.ts            Supabase impl  (Supabase only imported here)
│   ├── edge.ts             single-admin impl  (stub — throws until built)
│   └── index.ts            getIdentity()  ← public entry
├── drive/                  huozi-cloud Worker client
│   ├── mcp-client.ts       /mcp via JSON-RPC (cookie-auth)
│   ├── admin.ts            /admin/* via HUOZI_ADMIN_SECRET (server-only)
│   └── index.ts            barrel
└── supabase/               raw Supabase clients (do NOT import outside identity/)
```

- **Identity** knows *who*.
- **Drive** knows *what's in the workspace*.
- Pages/routes compose these two and don't know which edition they're running under.

## When extending

- Adding a new user-facing capability that needs Supabase data? Put the method on `IdentityService`, implement in `cloud.ts`, leave a `throw` in `edge.ts` with a TODO comment.
- Talking to huozi-cloud Worker (drive data, admin ops)? Go through `@/lib/drive`. Don't `fetch()` the cloud URL directly from a page.
- Touching the `HUOZI_EDITION` env var anywhere other than `@/lib/edition`? Don't. Always `isCloud()` / `isEdge()`.

See `packages/huozi-cloud/SPEC.md` for the Worker's data model (D1 schema, DO topology, MCP surface).
