/**
 * Auto-generate a workspace slug from a signup email, with collision
 * avoidance. Used during the /agent/step choice=1 flow so the user
 * doesn't have to invent a slug on the spot — they can rename later.
 */

import { createAdminClient } from "@/lib/supabase/admin";

/** Workspace slugs in cloud_workspaces must match this. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/**
 * Sanitize the email local-part into a safe slug base. Does NOT check
 * for conflicts — call {@link autoGenerateSlug} for that.
 */
export function slugFromEmail(email: string): string {
  const prefix = (email.split("@")[0] ?? "").toLowerCase();
  const cleaned = prefix
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  if (cleaned.length >= 3 && SLUG_RE.test(cleaned)) {
    return cleaned;
  }
  // Pad degenerate inputs so we always return a valid slug shape.
  const padded = (cleaned + "001").slice(0, 48);
  return SLUG_RE.test(padded) ? padded : "user001";
}

/**
 * Find an available slug for this email. Tries base, then base-2, -3, …
 * and bails to a random suffix after a few collisions.
 */
export async function autoGenerateSlug(email: string): Promise<string> {
  const admin = createAdminClient();
  const base = slugFromEmail(email);

  // First attempt: the clean slug.
  if (await isAvailable(admin, base)) return base;

  // Sequential: base-2, base-3, … up to base-9.
  for (let i = 2; i <= 9; i++) {
    const candidate = `${base}-${i}`.slice(0, 50);
    if (await isAvailable(admin, candidate)) return candidate;
  }

  // Fall back to a 6-char random suffix — collision there is astronomically
  // unlikely, so we don't loop.
  const random = Math.random().toString(36).slice(2, 8);
  const candidate = `${base}-${random}`.slice(0, 50);
  return candidate;
}

async function isAvailable(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
): Promise<boolean> {
  if (!SLUG_RE.test(slug)) return false;
  const { data } = await admin
    .from("cloud_workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return !data;
}
