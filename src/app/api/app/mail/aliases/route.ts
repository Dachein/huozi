/**
 * User-chosen email aliases for inbound mail.
 *
 *   GET    → list this user's aliases
 *   POST   → claim a new prefix (body: { local_part })
 *   PATCH  → toggle active / update allowed_senders
 *            (body: { local_part, active? , allowed_senders? })
 *   DELETE → release a prefix      (body: { local_part })
 *
 * Cookie-authed. Cloud-only — Edge has no shared inbound mail domain.
 * Mutating routes are restricted to the alias owner; you can't toggle
 * or delete someone else's prefix even if you know the name.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminEmailAliasClaim,
  cloudAdminEmailAliasList,
  cloudAdminEmailAliasRelease,
  cloudAdminEmailAliasSetActive,
  cloudAdminEmailAliasUpdateSenders,
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
        message: "Email aliases are a Cloud-only feature.",
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
    return NextResponse.json({ error: "no_workspace" }, { status: 404 });
  }
  return { userId: principal.userId, workspaceId: slugToWorkspaceId(ws.slug) };
}

export async function GET(): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;
  const r = await cloudAdminEmailAliasList({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: "upstream", message: r.error },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, aliases: r.aliases });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await request.json().catch(() => null)) as
    | { local_part?: unknown }
    | null;
  const localPart =
    body && typeof body.local_part === "string" ? body.local_part : "";
  if (!localPart) {
    return NextResponse.json({ error: "missing_local_part" }, { status: 400 });
  }
  const r = await cloudAdminEmailAliasClaim({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    local_part: localPart,
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error, message: r.message },
      { status: r.status },
    );
  }
  return NextResponse.json({ ok: true, alias: r.alias }, { status: 201 });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await request.json().catch(() => null)) as
    | {
        local_part?: unknown;
        active?: unknown;
        allowed_senders?: unknown;
      }
    | null;
  if (!body || typeof body.local_part !== "string" || !body.local_part) {
    return NextResponse.json({ error: "missing_local_part" }, { status: 400 });
  }
  const localPart = body.local_part;

  if (typeof body.active === "boolean") {
    const r = await cloudAdminEmailAliasSetActive({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      local_part: localPart,
      active: body.active,
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ ok: true, active: r.active });
  }

  if (Array.isArray(body.allowed_senders) || body.allowed_senders === null) {
    const senders =
      body.allowed_senders === null
        ? null
        : (body.allowed_senders as unknown[]).filter(
            (s): s is string => typeof s === "string",
          );
    const r = await cloudAdminEmailAliasUpdateSenders({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      local_part: localPart,
      allowed_senders: senders,
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ ok: true, allowed_senders: r.allowed_senders });
  }

  return NextResponse.json(
    { error: "no_mutation", message: "Pass `active` or `allowed_senders`." },
    { status: 400 },
  );
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const ctx = await authorize();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await request.json().catch(() => null)) as
    | { local_part?: unknown }
    | null;
  const localPart =
    body && typeof body.local_part === "string" ? body.local_part : "";
  if (!localPart) {
    return NextResponse.json({ error: "missing_local_part" }, { status: 400 });
  }
  const r = await cloudAdminEmailAliasRelease({
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    local_part: localPart,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({ ok: true });
}
