/**
 * `lib/drive` — the client side of huozi-cloud.
 *
 * Two sub-modules, one barrel:
 *
 *   - **mcp-client** — read paths from the Worker as a user (cookie-auth'd
 *     browser or server component). Calls `/mcp` via JSON-RPC.
 *
 *   - **admin** — server-only, calls `/admin/*` via `HUOZI_ADMIN_SECRET`.
 *     Used when huozi.app needs to mint/revoke keys on behalf of a user.
 *
 * Both modules are edition-agnostic: Cloud and Edge talk to the same
 * Worker. The *who* story is in `lib/identity`, the *what* lives here.
 */

export * from "./mcp-client";
export * from "./admin";
