/**
 * POST /api/agent/start
 *
 * Entry point for the Agent-driven install flow. Creates a short-lived
 * session row and returns the first `ask_user` prompt. The Agent then
 * drives the conversation via POST /api/agent/step until it receives an
 * `install_mcp` or `error` next.
 *
 * No auth — sessions are opaque and expire after 30 minutes.
 * Cloud edition only (Edge has no Supabase signup path).
 */

import { NextResponse } from "next/server";
import { startSession } from "@/lib/agent-session/machine";
import { isCloud } from "@/lib/edition";

export async function POST(): Promise<NextResponse> {
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

  const response = await startSession();
  return NextResponse.json(response, { status: response.ok ? 200 : 500 });
}
