/**
 * POST /api/connections/mint
 *
 * Mints a new API key for an Agent device (Claude Code, Cursor, Desktop…)
 * against the signed-in user's workspace. The plaintext token is returned
 * ONCE in the response body — only the hash + metadata is persisted.
 *
 * Body: { label: string, agent_kind: 'claude-code' | 'cursor' | 'desktop' | 'other' }
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminMintKey,
  cloudAdminRevokeKey,
  slugToWorkspaceId,
} from "@/lib/drive/admin";

const ALLOWED_KINDS = [
  "claude-code",
  "cursor",
  "desktop",
  "openclaw",
  "hermes",
  "raw-curl",
  "other",
] as const;
type AgentKind = (typeof ALLOWED_KINDS)[number];

interface MintBody {
  label?: string;
  agent_kind?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: MintBody;
  try {
    body = (await req.json()) as MintBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const label = (body.label ?? "").trim();
  const rawKind = (body.agent_kind ?? "other").trim();
  if (!label || label.length > 80) {
    return NextResponse.json(
      { error: "invalid_label", message: "Label must be 1–80 characters." },
      { status: 400 },
    );
  }
  if (!ALLOWED_KINDS.includes(rawKind as AgentKind)) {
    return NextResponse.json(
      { error: "invalid_agent_kind" },
      { status: 400 },
    );
  }
  const agentKind = rawKind as AgentKind;

  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return NextResponse.json(
      {
        error: "no_workspace",
        message: "Create a workspace first at /onboard.",
      },
      { status: 404 },
    );
  }

  let minted: Awaited<ReturnType<typeof cloudAdminMintKey>>;
  try {
    minted = await cloudAdminMintKey({
      workspace_id: slugToWorkspaceId(ws.slug),
      principal_id: principal.userId,
      principal_type: "agent",
      name: identity.formatMintName(label, agentKind),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "mint_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  try {
    await identity.insertConnection({
      workspaceId: ws.id,
      keyId: minted.key_id,
      label,
      agentKind,
    });
  } catch (err) {
    await cloudAdminRevokeKey(minted.key_id).catch(() => {});
    return NextResponse.json(
      {
        error: "connection_insert_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    key_id: minted.key_id,
    api_key: minted.api_key,
    label,
    agent_kind: agentKind,
  });
}
