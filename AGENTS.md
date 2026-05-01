<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Editions — Cloud vs Edge

huozi.app ships as two builds from one codebase. Both expose the same product: an Agent-native cloud drive backed by the huozi-cloud Worker. The editions differ only in how they answer "who is this request?".

The edition is selected by `HUOZI_EDITION` (`cloud` | `edge`), resolved via `@/lib/edition`. Everything else is shared.

## Three core differences (Cloud vs Edge)

| 维度 | Cloud | Edge |
|---|---|---|
| **登录方式** | Email OTP（无密码） | Email + 密码 |
| **Workspace 模型** | 多个（用户可属于多个） | 单一（部署时锁定 `HUOZI_EDGE_WORKSPACE_SLUG`） |
| **公开注册** | 支持（任何人输 email） | 不支持（邀请制） |

共通点：邀请制添加成员、magic-link 浏览器会话、api_key 是 MCP 唯一凭证。Cloud 与 Edge 的 `IdentityService` 接口一致；上面三条是它们仅有的行为分歧。

## Auth flows (browser closed loop — main flow)

**Cloud first contact**：访客访问 `/login` → 输 email → 收 OTP code → 输 code → 登录。新邮箱第一次登录 = 注册（无独立 signup 路由）。后续可被邀请加入其它 workspace。

**Edge first contact**：
1. **Admin bootstrap**：deployer 设 `HUOZI_ADMIN_SECRET` → 访问 `/admin/setup?secret=…` 一次性 URL → 设邮箱 + 密码 → 自动落到固定 workspace 当 owner。
2. **被邀请用户**：admin 在 `/workspace/members` 输被邀请人 email + 生成 URL → 邀请人点击 → 表单已预填 email（**可改**）+ 输密码 → 加入。Email 不验证（信任来自 URL 本身），用作 username。
3. **后续登录**：所有 Edge 用户走 `/login` 输 email + password。

**Why Edge 用密码不用 OTP**：Self-host 部署不一定有出站 SMTP；用户群可信（部署者邀来的）。OTP 增加运维负担没换来对应的安全收益。

接受邀请始终走浏览器 — 那是 onboarding 入口，借机引导新用户配 Agent，不应该被 MCP 工具替代。

## Identity tools (MCP layer — Phase B)

浏览器闭环之上，Agent 可通过 MCP 工具完成同一组动作的快捷路径：

| 工具 | Cloud | Edge | 说明 |
|---|---|---|---|
| `huozi_whoami` | ✅ | ✅ | 已实现 |
| `huozi_request_otp({email})` | ✅ 匿名 | — | 触发 OTP 邮件 |
| `huozi_verify_otp({email, code})` | ✅ 匿名 | — | 返回 api_key（注册即登录）|
| `huozi_invite({email})` | ✅ | ✅ | 已认证调用，返回邀请 URL（让 Agent 转发给被邀请人）|
| `huozi_grant_browser_session()` | ✅ | ✅ | 已认证调用，返回一次性魔法链接（点击后浏览器自动登录）|

**故意不做** Agent 工具：
- `huozi_create_workspace` — Cloud 暂时一人一 workspace；Edge 永远单 workspace
- `huozi_join_workspace` / `huozi_accept_invite` — 接受邀请走浏览器，借机引导新用户配 Agent
- 改密码 / 删 workspace / 转 owner — 高破坏性，留 UI 加二次确认

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
