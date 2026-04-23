/**
 * POST /api/agent/step
 *
 * Advance an Agent-install session. Body must include `session_id` plus
 * whichever input the previous response's `next.input.key` asked for
 * (e.g. `choice`, `email`, `code`, `token`).
 *
 * Response shape is identical to /api/agent/start — either another
 * `ask_user` instruction, a terminal `install_mcp` payload, or an
 * `error` with a diagnosable `code`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { advanceSession } from "@/lib/agent-session/machine";
import { isCloud } from "@/lib/edition";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isCloud()) {
    return NextResponse.json(
      {
        ok: false,
        next: {
          action: "error",
          code: "invalid_state",
          message:
            "Agent-driven install is a Cloud-only feature. Edge deployments paste an admin-issued key at /connect.",
        },
      },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        next: {
          action: "error",
          code: "invalid_input",
          message: "Request body must be JSON.",
        },
      },
      { status: 400 },
    );
  }

  const session_id = String(body.session_id ?? "").trim();
  if (!session_id.startsWith("sess_")) {
    return NextResponse.json(
      {
        ok: false,
        next: {
          action: "error",
          code: "invalid_input",
          message:
            "Missing or malformed session_id. Start a new flow via POST /api/agent/start.",
        },
      },
      { status: 400 },
    );
  }

  const response = await advanceSession(session_id, body);

  // HTTP status: success = 200. Specific failure modes use 4xx so HTTP-aware
  // tooling (curl -f, fetch.ok) can distinguish happy / retryable / terminal.
  let status = 200;
  if (!response.ok) {
    const code = response.next.action === "error" ? response.next.code : "";
    if (code === "session_not_found" || code === "session_expired") status = 404;
    else if (
      code === "invalid_input" ||
      code === "invalid_state" ||
      code === "token_invalid"
    )
      status = 400;
    else if (code === "otp_send_failed" || code === "otp_verify_failed")
      status = 422;
    else status = 500;
  }

  return NextResponse.json(response, { status });
}
