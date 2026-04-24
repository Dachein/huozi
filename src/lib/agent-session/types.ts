/**
 * Wire-shape for the Agent-driven install state machine.
 *
 * An Agent calls `POST /api/agent/start` to begin, then repeatedly calls
 * `POST /api/agent/step` until the response's `next.action` is a terminal
 * type (`install_mcp` or `error`). Every interactive step returns a
 * self-describing "do this next" payload so the Agent can proceed without
 * hard-coding any flow logic.
 */

/** Ask the human a question; expect their reply in the next step. */
export interface AskUserNext {
  action: "ask_user";
  /** Human-readable question (localized per Accept-Language in future). */
  prompt: string;
  /** Optional hint about the shape of the answer ("6-digit code", etc). */
  hint?: string;
  /** How to send the answer back. The Agent fills `body.<input.key>`. */
  input: { key: string };
  then: {
    method: "POST";
    url: string;
    /**
     * Pre-filled body — the Agent must copy this verbatim and then add a
     * top-level field named `input.key` whose value is the user's answer.
     */
    body: Record<string, unknown>;
  };
}

/**
 * Path 2 only. Tell the Agent to run the OAuth device flow on its own,
 * then come back through /agent/step once it has an api_key.
 */
export interface RunDeviceFlowNext {
  action: "run_device_flow";
  prompt: string;
  /** Shell-ready curl scripts. Agent runs them in sequence. */
  steps: Array<{
    description: string;
    shell: string;
  }>;
  then: {
    method: "POST";
    url: string;
    body: Record<string, unknown>;
    input: { key: "token" };
  };
}

/** Terminal success — install the MCP config on the user's client. */
export interface InstallMcpNext {
  action: "install_mcp";
  api_key: string;
  workspace_slug: string;
  /**
   * One-time magic link that drops the user straight into /workspace in
   * a browser — no second email-OTP round-trip needed. Only set on the
   * signup path (choice=1); omitted for choice=2 (device flow) and
   * choice=3 (paste token) because in those cases the user either
   * already has a browser session or never asked for one.
   *
   * Supabase-issued, single-use, 1-hour TTL. The Agent MAY surface this
   * to the user; it MUST NOT store or log it.
   */
  workspace_url?: string;
  /** Per-client install instructions (command or config body). */
  commands: {
    "claude-code": string;
    cursor: string;
    openclaw: string;
    generic: string;
  };
  /** Short human-readable summary to print. */
  message: string;
}

/** Terminal failure — the state machine rejected something. */
export interface ErrorNext {
  action: "error";
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
    | "internal";
  message: string;
}

export type Next =
  | AskUserNext
  | RunDeviceFlowNext
  | InstallMcpNext
  | ErrorNext;

/** Envelope for every response from /agent/start and /agent/step. */
export interface AgentResponse {
  ok: boolean;
  session_id: string;
  next: Next;
}
