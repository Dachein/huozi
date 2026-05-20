/**
 * POST /api/app/tasks/<task_id>/confirm
 *
 * Appends a `user_action` event to `tasks/<task_id>.jsonl` so the
 * waiting daemon can resume the Claude session. See `app/docs/tasks.md`
 * §9 (confirm pattern).
 *
 * Body: { action: 'approve' | 'reject' | 'comment', note?: string }
 *
 * Cookie-authed; the principal must be a member of the workspace that
 * owns the task. We rely on `getIdentity().getPrimaryWorkspace()` to
 * scope the write — there is no cross-workspace task confirm path.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminTasksConfirm, slugToWorkspaceId } from "@/lib/drive/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS = ["approve", "reject", "comment"] as const;
type Action = (typeof VALID_ACTIONS)[number];

interface ConfirmBody {
  action?: string;
  note?: string;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const taskId = rawId.trim().toLowerCase();
  if (!UUID_RE.test(taskId)) {
    return NextResponse.json({ error: "invalid_task_id" }, { status: 400 });
  }

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return NextResponse.json({ error: "no_workspace" }, { status: 404 });
  }

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const action = (body.action ?? "").trim();
  if (!VALID_ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note.length > 0
    ? body.note
    : undefined;

  const result = await cloudAdminTasksConfirm({
    workspace_id: slugToWorkspaceId(ws.slug),
    task_id: taskId,
    user_id: principal.userId,
    action: action as Action,
    ...(note !== undefined ? { note } : {}),
  });
  if (!result.ok) {
    const status = result.status === 404
      ? 404
      : result.status >= 500
        ? 502
        : result.status;
    return NextResponse.json(
      { error: status === 404 ? "unknown_task" : "upstream_failed", message: result.error },
      { status },
    );
  }
  return NextResponse.json({
    ok: true,
    task_id: result.task_id,
    at: result.at,
    action: result.action,
  });
}
