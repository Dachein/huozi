/**
 * Edition flag — single source of truth for "which build am I running as".
 *
 * huozi.app ships in two editions, both backed by the same Cloudflare
 * Worker codebase under packages/huozi-cloud:
 *
 *   • **cloud** — the hosted site on huozi.app. D1-native email-OTP login
 *     (no Supabase as of 2026-04-27), multi-user workspaces with invites,
 *     web-mintable api_keys. This is the default when HUOZI_EDITION is unset.
 *
 *   • **edge** — the open-source, self-hosted build. Single-deployer:
 *     whoever holds `HUOZI_ADMIN_SECRET` is the admin; all browser sessions
 *     authenticate by pasting an api_key at `/connect`. No email login,
 *     no signup, no /onboard. One deployment = one workspace.
 *
 * Code that needs to diverge by edition should route through this module
 * (or through `@/lib/identity`, which already dispatches on edition). No
 * other file should read `HUOZI_EDITION` directly.
 */

export type Edition = "cloud" | "edge";

const VALID: Edition[] = ["cloud", "edge"];

/**
 * Current build's edition. Resolved from the `HUOZI_EDITION` env var.
 *
 * Falls back to "cloud" when unset so the hosted build keeps working with
 * zero config. Edge builds MUST set this explicitly.
 */
export function getEdition(): Edition {
  const raw = process.env.HUOZI_EDITION?.trim().toLowerCase();
  if (raw && (VALID as string[]).includes(raw)) {
    return raw as Edition;
  }
  return "cloud";
}

export function isCloud(): boolean {
  return getEdition() === "cloud";
}

export function isEdge(): boolean {
  return getEdition() === "edge";
}

// ── Edge-only configuration ─────────────────────────────────────────────
//
// These values are read only when HUOZI_EDITION=edge; in Cloud they're
// irrelevant (workspaces are per-user, their slugs come from the DB).

/**
 * The single workspace slug for an Edge deployment. Every deployer's
 * instance has exactly one workspace; this is its slug.
 *
 * Defaults to `"default"`, overridable via `HUOZI_EDGE_WORKSPACE_SLUG`
 * (e.g. a solo dev deploying to `huozi.alice.dev` might set it to `alice`).
 *
 * The slug becomes part of the huozi-cloud `workspace_id` as `ws_<slug>`.
 */
export function getEdgeWorkspaceSlug(): string {
  const raw = process.env.HUOZI_EDGE_WORKSPACE_SLUG?.trim();
  if (raw && /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(raw)) {
    return raw;
  }
  return "default";
}

/** Display name for the Edge workspace — just a label, can be anything. */
export function getEdgeWorkspaceName(): string {
  return process.env.HUOZI_EDGE_WORKSPACE_NAME?.trim() || "Workspace";
}

// ── Edge route gating ───────────────────────────────────────────────────
//
// Cloud-only routes (e.g. /onboard, /select-workspace, /api/auth/otp/*)
// call these helpers at the top of their handler so Edge builds never
// expose surfaces that have no Edge equivalent.

/**
 * Throws a Next.js notFound() if running on Edge. Use at the top of route
 * segments (`page.tsx` / `route.ts`) that don't apply to Edge — the OTP
 * email request endpoint, the /onboard wizard, etc.
 */
export function ensureCloudOr404(): void {
  if (isEdge()) {
    // Lazy require keeps this importable from contexts that don't have
    // next/navigation in scope.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { notFound } = require("next/navigation") as typeof import("next/navigation");
    notFound();
  }
}
