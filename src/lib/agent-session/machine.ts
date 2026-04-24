/**
 * Agent-install state machine.
 *
 * {@link startSession} inserts a row in `agent_sessions` and returns the
 * first `ask_user` prompt. {@link advanceSession} reads the current state,
 * dispatches on `body.*`, mutates the row, and returns the next action.
 *
 * All external side-effects (OTP send, Supabase user create, workspace
 * insert, worker mint) happen inside the dispatcher so a failure maps to
 * a clean ErrorNext and the session row captures whatever stuck.
 */

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { cloudAdminMintKey, slugToWorkspaceId } from "@/lib/drive/admin";
import { listTools } from "@/lib/drive/mcp-client";
import { autoGenerateSlug } from "./slug";
import { buildInstallMcpNext } from "./install-prompts";
import type { AgentResponse, Next } from "./types";

const SESSION_ID_BYTES = 24;
const STEP_URL = "https://huozi.app/api/agent/step";

type SessionState =
  | "await_choice"
  | "await_email"
  | "await_code"
  | "await_token"
  | "completed";

interface SessionRow {
  id: string;
  state: SessionState;
  choice: string | null;
  email: string | null;
  user_id: string | null;
  workspace_id: string | null;
  workspace_slug: string | null;
  api_key_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Public entry points ────────────────────────────────────────────────────

export async function startSession(): Promise<AgentResponse> {
  const admin = createAdminClient();
  const session_id = `sess_${randomBytes(SESSION_ID_BYTES).toString("hex")}`;

  const { error } = await admin.from("agent_sessions").insert({
    id: session_id,
    state: "await_choice",
  });
  if (error) {
    return errorResponse(session_id, "internal", `db insert: ${error.message}`);
  }

  return {
    ok: true,
    session_id,
    next: askChoice(session_id),
  };
}

export async function advanceSession(
  session_id: string,
  body: Record<string, unknown>,
): Promise<AgentResponse> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_sessions")
    .select("*")
    .eq("id", session_id)
    .maybeSingle<SessionRow>();

  if (error) {
    return errorResponse(session_id, "internal", `db read: ${error.message}`);
  }
  if (!data) {
    return errorResponse(session_id, "session_not_found", "Unknown session_id.");
  }
  if (Date.parse(data.expires_at) < Date.now()) {
    return errorResponse(
      session_id,
      "session_expired",
      "Session expired after 30 minutes of inactivity. Start a new one via POST /api/agent/start.",
    );
  }

  switch (data.state) {
    case "await_choice":
      return await handleChoice(data, body);
    case "await_email":
      return await handleEmail(data, body);
    case "await_code":
      return await handleCode(data, body);
    case "await_token":
      return await handleToken(data, body);
    case "completed":
      return errorResponse(
        session_id,
        "invalid_state",
        "Session is already completed. Start a new one if you need to reinstall.",
      );
    default:
      return errorResponse(
        session_id,
        "invalid_state",
        `Unknown state: ${data.state}`,
      );
  }
}

// ─── State handlers ─────────────────────────────────────────────────────────

async function handleChoice(
  row: SessionRow,
  body: Record<string, unknown>,
): Promise<AgentResponse> {
  const choice = String(body.choice ?? "").trim();
  if (!["1", "2", "3"].includes(choice)) {
    return errorResponse(
      row.id,
      "invalid_input",
      "Expected body.choice ∈ {'1','2','3'}.",
    );
  }

  if (choice === "1") {
    await updateSession(row.id, { state: "await_email", choice: "1" });
    return {
      ok: true,
      session_id: row.id,
      next: {
        action: "ask_user",
        prompt:
          "What email should we send the verification code to? It becomes your huozi account email.",
        hint: "any valid email address",
        input: { key: "email" },
        then: {
          method: "POST",
          url: STEP_URL,
          body: { session_id: row.id },
        },
      },
    };
  }

  if (choice === "2") {
    await updateSession(row.id, { state: "await_token", choice: "2" });
    return {
      ok: true,
      session_id: row.id,
      next: {
        action: "run_device_flow",
        prompt:
          "Run this device flow with the human. Keep device_code private; only show them the verification URL. When you receive the api_key, come back via /api/agent/step to finish install.",
        steps: [
          {
            description: "Request a device code",
            shell: `curl -sS -X POST https://cloud.huozi.app/auth/device-code \\
  -H "content-type: application/json" \\
  -d '{"client_name":"<your agent name>","agent_kind":"<claude-code|cursor|openclaw|other>"}'`,
          },
          {
            description:
              "Tell the human to open verification_url_complete and click Authorize",
            shell: `# Show the human the returned verification_url_complete and wait.`,
          },
          {
            description:
              "Poll /auth/token every <interval> seconds (default 5) until api_key or expired_token",
            shell: `curl -sS -X POST https://cloud.huozi.app/auth/token \\
  -H "content-type: application/json" \\
  -d '{"device_code":"<from step 1>"}'`,
          },
        ],
        then: {
          method: "POST",
          url: STEP_URL,
          body: { session_id: row.id },
          input: { key: "token" },
        },
      },
    };
  }

  // choice === "3"
  await updateSession(row.id, { state: "await_token", choice: "3" });
  return {
    ok: true,
    session_id: row.id,
    next: {
      action: "ask_user",
      prompt:
        "Paste the API key you already have. Starts with `hz_`. Never echo it back to the human.",
      hint: "hz_…",
      input: { key: "token" },
      then: {
        method: "POST",
        url: STEP_URL,
        body: { session_id: row.id },
      },
    },
  };
}

async function handleEmail(
  row: SessionRow,
  body: Record<string, unknown>,
): Promise<AgentResponse> {
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return errorResponse(
      row.id,
      "invalid_input",
      "Expected body.email as a valid email address.",
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    return errorResponse(row.id, "otp_send_failed", error.message);
  }

  await updateSession(row.id, { state: "await_code", email });

  return {
    ok: true,
    session_id: row.id,
    next: {
      action: "ask_user",
      prompt: `A 6-digit code has been emailed to ${email}. Ask the human for it and submit it here.`,
      hint: "6-digit code",
      input: { key: "code" },
      then: {
        method: "POST",
        url: STEP_URL,
        body: { session_id: row.id },
      },
    },
  };
}

async function handleCode(
  row: SessionRow,
  body: Record<string, unknown>,
): Promise<AgentResponse> {
  if (!row.email) {
    return errorResponse(row.id, "invalid_state", "Session has no email on file.");
  }
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (!code || code.length < 6) {
    return errorResponse(
      row.id,
      "invalid_input",
      "Expected body.code as a 6-digit number.",
    );
  }

  const admin = createAdminClient();
  const { data: verifyData, error: verifyErr } = await admin.auth.verifyOtp({
    email: row.email,
    token: code,
    type: "email",
  });
  if (verifyErr || !verifyData.user) {
    return errorResponse(
      row.id,
      "otp_verify_failed",
      verifyErr?.message ?? "OTP verification returned no user.",
    );
  }
  const userId = verifyData.user.id;

  // Auto-provision a workspace if the user doesn't already have one.
  const { data: existingWs } = await admin
    .from("cloud_workspaces")
    .select("id, slug")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; slug: string }>();

  let workspace_id: string;
  let workspace_slug: string;
  if (existingWs) {
    workspace_id = existingWs.id;
    workspace_slug = existingWs.slug;
  } else {
    const slug = await autoGenerateSlug(row.email);
    const { data: wsData, error: wsErr } = await admin
      .from("cloud_workspaces")
      .insert({ owner_id: userId, slug, name: slug })
      .select("id, slug")
      .single<{ id: string; slug: string }>();
    if (wsErr || !wsData) {
      return errorResponse(
        row.id,
        "workspace_create_failed",
        wsErr?.message ?? "workspace insert returned no row",
      );
    }
    workspace_id = wsData.id;
    workspace_slug = wsData.slug;
  }

  // Mint the Agent's API key via the Worker admin endpoint.
  let minted: Awaited<ReturnType<typeof cloudAdminMintKey>>;
  try {
    minted = await cloudAdminMintKey({
      workspace_id: slugToWorkspaceId(workspace_slug),
      principal_id: userId,
      principal_type: "agent",
      name: "Installed via Agent",
    });
  } catch (e) {
    return errorResponse(
      row.id,
      "mint_failed",
      e instanceof Error ? e.message : String(e),
    );
  }

  // Record the connection so the workspace UI surfaces it.
  await admin.from("cloud_connections").insert({
    workspace_id,
    key_id: minted.key_id,
    label: "Installed via Agent",
    agent_kind: "other",
  });

  await updateSession(row.id, {
    state: "completed",
    user_id: userId,
    workspace_id,
    workspace_slug,
    api_key_id: minted.key_id,
  });

  // Best-effort one-time magic link so the user can land in /workspace
  // without a second email-OTP round-trip. Only generated on this signup
  // path — paths 2/3 already have their own session / key. A failure
  // here is non-fatal: we just drop the link from the response.
  let workspace_url: string | undefined;
  try {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: row.email,
      options: { redirectTo: "https://huozi.app/workspace" },
    });
    if (!linkErr && linkData?.properties?.action_link) {
      workspace_url = linkData.properties.action_link;
    }
  } catch {
    /* best-effort; omit the link on any Supabase hiccup */
  }

  return {
    ok: true,
    session_id: row.id,
    next: buildInstallMcpNext(minted.api_key, workspace_slug, {
      workspace_url,
    }),
  };
}

async function handleToken(
  row: SessionRow,
  body: Record<string, unknown>,
): Promise<AgentResponse> {
  const token = String(body.token ?? "").trim();
  if (!token || !token.startsWith("hz_")) {
    return errorResponse(
      row.id,
      "invalid_input",
      "Expected body.token as an hz_... API key.",
    );
  }

  // Validate by making a tools/list probe. Cheapest roundtrip that also
  // exercises the auth layer.
  const probe = await listTools(token);
  if (!probe.ok) {
    return errorResponse(
      row.id,
      "token_invalid",
      probe.message.slice(0, 200),
    );
  }

  // We can't derive the workspace slug from the token without shipping a
  // new Worker admin endpoint (plaintext→hash mapping lives there). For
  // paths 2/3 we just tell the user their key works — the snippet itself
  // doesn't need the slug since the MCP URL is workspace-agnostic.
  await updateSession(row.id, { state: "completed" });

  return {
    ok: true,
    session_id: row.id,
    next: buildInstallMcpNext(token, null),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function askChoice(session_id: string): Next {
  return {
    action: "ask_user",
    prompt: `How do you want to set up huozi?

  1. Sign up for a new account (email OTP, auto-provisions a workspace)
  2. Log in via the browser device flow (existing account)
  3. Paste an API key I already have (starts with hz_)

Ask the human for a single digit (1, 2, or 3) and submit it.`,
    hint: "1 | 2 | 3",
    input: { key: "choice" },
    then: {
      method: "POST",
      url: STEP_URL,
      body: { session_id },
    },
  };
}

function errorResponse(
  session_id: string,
  code: Parameters<typeof buildError>[0],
  message: string,
): AgentResponse {
  return {
    ok: false,
    session_id,
    next: buildError(code, message),
  };
}

function buildError(
  code:
    | "session_not_found"
    | "session_expired"
    | "invalid_state"
    | "invalid_input"
    | "otp_send_failed"
    | "otp_verify_failed"
    | "token_invalid"
    | "workspace_create_failed"
    | "mint_failed"
    | "internal",
  message: string,
): Next {
  return { action: "error", code, message };
}

async function updateSession(
  session_id: string,
  patch: Partial<{
    state: SessionState;
    choice: string;
    email: string;
    user_id: string;
    workspace_id: string;
    workspace_slug: string;
    api_key_id: string | null;
  }>,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("agent_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", session_id);
}
