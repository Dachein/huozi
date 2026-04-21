/**
 * Edition flag — single source of truth for "which build am I running as".
 *
 * huozi.app ships in two editions:
 *
 *   • **cloud** — the hosted site on huozi.app. Has Supabase for accounts,
 *     multi-workspace, billing surfaces, etc. This is the default.
 *
 *   • **edge** — the open-source, self-hosted build. Single-deployer:
 *     whoever holds `HUOZI_ADMIN_SECRET` is the admin; all users connect
 *     via pasted API keys. No Supabase, no email login, no dashboard.
 *     Published pages (the `/dashboard` publishing feature) are dropped —
 *     the drive surface (`/cloud/workspace`) is all that remains.
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
