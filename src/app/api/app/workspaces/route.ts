/**
 * POST /api/app/workspaces
 *
 * Called from the onboarding form. Flow:
 *   1. Validate principal + slug via the identity layer.
 *   2. Identity creates the workspace row.
 *   3. Mint the user's first API key via huozi-cloud admin endpoint.
 *   4. Record a connection for it.
 *   5. Set HttpOnly cookie so the browser is already "connected".
 *
 * On any failure after step 2, rollback via identity.deleteWorkspace() +
 * cloudAdminRevokeKey() — so the user can retry a clean slate.
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminMintKey,
  cloudAdminRevokeKey,
  slugToWorkspaceId,
} from "@/lib/drive/admin";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { workerSelectWorkspace } from "@/lib/auth/worker-client";
import { buildSessionCookie } from "@/lib/auth/jwt";

interface CreateBody {
  slug?: string;
  name?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const slug = (body.slug ?? "").trim().toLowerCase();
  const name = (body.name ?? slug).trim();

  // Create workspace (slug validation + uniqueness enforced in identity layer).
  const created = await identity.createWorkspace({ slug, name });
  if (!created.ok) {
    const status =
      created.error === "slug_taken"
        ? 409
        : created.error === "slug_format"
          ? 400
          : created.error === "not_authenticated"
            ? 401
            : 500;
    return NextResponse.json(
      { error: created.error, message: created.message },
      { status },
    );
  }
  const ws = created.workspace;

  // Mint the browser-session API key via admin endpoint.
  let minted: Awaited<ReturnType<typeof cloudAdminMintKey>>;
  try {
    minted = await cloudAdminMintKey({
      workspace_id: slugToWorkspaceId(slug),
      principal_id: principal.userId,
      principal_type: "user",
      name: identity.formatMintName(`${name} · browser session`, "other"),
    });
  } catch (err) {
    // Rollback so the user can retry.
    await identity.deleteWorkspace(ws.id);
    return NextResponse.json(
      {
        error: "mint_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // Record connection metadata.
  try {
    await identity.insertConnection({
      workspaceId: ws.id,
      keyId: minted.key_id,
      label: "Browser session",
      agentKind: "other",
    });
  } catch (err) {
    await cloudAdminRevokeKey(minted.key_id).catch(() => {});
    await identity.deleteWorkspace(ws.id);
    return NextResponse.json(
      {
        error: "connection_insert_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // Set the browser cookie so the user is already connected.
  const cookieStore = await cookies();
  cookieStore.set({
    name: HUOZI_CLOUD_KEY_COOKIE,
    value: minted.api_key,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Re-issue the session JWT so it carries the new workspace's wsid claim.
  // Without this the user just-onboarded would still have a wsid-less JWT
  // and getPrimaryWorkspace would return null on the next page load.
  const cookieHeader = req.headers.get("cookie") ?? "";
  const reissue = await workerSelectWorkspace({
    cookieHeader,
    workspaceId: ws.id,
  });
  const responseHeaders: Record<string, string> = {};
  if (reissue.ok) {
    responseHeaders["set-cookie"] = buildSessionCookie(reissue.token);
  }

  return NextResponse.json(
    {
      ok: true,
      workspace: { id: ws.id, slug: ws.slug, name: ws.name },
    },
    { headers: responseHeaders },
  );
}
