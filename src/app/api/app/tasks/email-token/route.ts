/**
 * Per-user magic-address management for Tasks email ingest.
 *
 *   GET    → return the user's current address (mint one if none exists)
 *   POST   → rotate (revoke active + mint new); preserves sender allowlist
 *   DELETE → revoke (no replacement)
 *   PATCH  → update sender allowlist
 *
 * Cookie-authed. Cloud-only — Edge returns 404 `unsupported_on_edge`
 * because there is no shared inbound mail infrastructure. See
 * `app/docs/tasks.md` §6.1 and §10.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminEmailTokenGetOrMint,
  cloudAdminEmailTokenRevoke,
  cloudAdminEmailTokenRotate,
  cloudAdminEmailTokenUpdateSenders,
  slugToWorkspaceId,
} from "@/lib/drive/admin";

interface AuthedContext {
  userId: string;
  workspaceId: string;
}

async function authorize(): Promise<NextResponse | AuthedContext> {
  const identity = await getIdentity();
  if (!identity.supportsEmailIngest()) {
    return NextResponse.json(
      {
        error: "unsupported_on_edge",
        message:
          "Email ingest is a Cloud-only feature. Use the webhook ingest endpoint instead — see app/docs/tasks.md §6.2.",
      },
      { status: 404 },
    );
  }
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return NextResponse.json(
      { error: "no_workspace", message: "Create a workspace first." },
      { status: 404 },
    );
  }
  return {
    userId: principal.userId,
    workspaceId: slugToWorkspaceId(ws.slug),
  };
}

export async function GET(): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;

  const result = await cloudAdminEmailTokenGetOrMint({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "upstream_failed", message: result.error },
      { status: result.status >= 500 ? 502 : result.status },
    );
  }
  return NextResponse.json({
    ok: true,
    address: result.address,
    created_at: result.created_at,
    last_used_at: result.last_used_at,
    allowed_senders: result.allowed_senders,
  });
}

export async function POST(): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;

  const result = await cloudAdminEmailTokenRotate({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "upstream_failed", message: result.error },
      { status: result.status >= 500 ? 502 : result.status },
    );
  }
  return NextResponse.json({
    ok: true,
    address: result.address,
    created_at: result.created_at,
    last_used_at: result.last_used_at,
    allowed_senders: result.allowed_senders,
  });
}

export async function DELETE(): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;

  const result = await cloudAdminEmailTokenRevoke({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "upstream_failed", message: result.error },
      { status: result.status >= 500 ? 502 : result.status },
    );
  }
  return NextResponse.json({ ok: true });
}

interface PatchBody {
  allowed_senders?: string[] | null;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  // `null` is the explicit "no restriction" value; `undefined` means the
  // caller forgot to send the field. We tolerate `undefined` by collapsing
  // to `null` (same effect) rather than rejecting — keeps the UI simple.
  const allowedSenders: string[] | null = Array.isArray(body.allowed_senders)
    ? body.allowed_senders
    : null;

  const result = await cloudAdminEmailTokenUpdateSenders({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    allowed_senders: allowedSenders,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "upstream_failed", message: result.error },
      { status: result.status >= 500 ? 502 : result.status },
    );
  }
  return NextResponse.json({ ok: true, allowed_senders: result.allowed_senders });
}
