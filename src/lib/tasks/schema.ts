/**
 * Canonical schema for Tasks Collections. See `app/docs/tasks.md` §5.
 *
 * Two surfaces use this:
 *  - The webhook/email ingest path writes the schema event as the first
 *    line of a freshly created `inbox.jsonl` or `tasks/<id>.jsonl`.
 *  - The renderer (`collection-view.tsx`) reads the schema event back
 *    via `foldSchema` and uses `entity.title_field`, per-field `display`
 *    slots, and `list_view.filters` / `search` to organize the view.
 *
 * Workspaces can deep-merge over this default by appending additional
 * `{"op":"schema",...}` lines (see four-types.md §3.6). The default
 * `tags.options` and `category.options` are intentionally empty — users
 * grow their own vocabulary through inline-edit.
 */

import type { SchemaLine } from "@/lib/jsonl/parse";

/**
 * Closed set of `op` values the renderer projects to a `status` value.
 * Custom ops fall through to the prior status (see tasks.md §4).
 *
 * v3.3: a task can run multiple times (resume after pause / failure /
 * confirm). Each dispatch starts a fresh `run_id`; every subsequent
 * event the bridge writes during that run carries the same id, so
 * consumers can fold a per-run view without re-deriving from
 * timestamps. `run_id` is OPTIONAL on every op — events written before
 * v3.3 lack it and render as a single "default run".
 */
export const TASK_OPS = [
  "create",
  "ingest",
  "dispatch",
  "agent_turn",
  "tool_use",
  "tool_result",
  "confirm_requested",
  "user_action",
  "result",
  "status",
  "run_paused",
  "run_resumed",
  "archive",
] as const;
export type TaskOp = (typeof TASK_OPS)[number];

/**
 * Inbox ops. v3.3 collapses the inbox to a pure raw layer — only
 * `ingest` is written by new code. `routed` / `dismissed` are listed
 * here for back-compat: old inbox.jsonl files contain those events,
 * the fold step must tolerate them, but the canonical schema no
 * longer surfaces `status` and renderers compute triage state from
 * referential relationships (see spec §4.3).
 */
export const INBOX_OPS = ["ingest", "routed", "dismissed"] as const;
export type InboxOp = (typeof INBOX_OPS)[number];

/**
 * The only inbox op new code may write going forward. Use this where
 * you're emitting an inbox event (vs `INBOX_OPS` which includes legacy
 * ops kept solely for back-compat parsing).
 */
export const INBOX_CANONICAL_OPS = ["ingest"] as const;
export type InboxCanonicalOp = (typeof INBOX_CANONICAL_OPS)[number];

/** Source values the v3.3 inbox schema declares. */
export const INBOX_SOURCES = [
  "email",
  "webhook",
  "upload",
  "clip",
  "manual",
  "handoff",
] as const;
export type InboxSource = (typeof INBOX_SOURCES)[number];

export const TASK_STATUSES = [
  "pending",
  "working",
  "awaiting_user",
  "done",
  "archived",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ["email", "webhook", "manual", "slack"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

/**
 * v1 ships with Claude Code only. The daemon protocol (`tasks.md` §8)
 * is agent-agnostic — Codex / OpenClaw / Hermes are P2 and will be added
 * by extending this enum and appending a schema event with the new
 * agent options. Until then keep the enum and the canonical schema
 * mutually consistent so the renderer's filter chip never shows an
 * unreachable agent.
 */
export const TASK_AGENTS = ["claude-code"] as const;
export type TaskAgent = (typeof TASK_AGENTS)[number];

/**
 * The schema payload itself — kept as a plain JSON object so it can be
 * serialized verbatim into a `{"op":"schema",...}` line.
 *
 * Field types and display slots are documented in `four-types.md` §3.6.
 * Keep this shape in sync with the §5 example in `tasks.md`.
 */
export const CANONICAL_TASK_SCHEMA = {
  title: "Tasks",
  entity: {
    title_field: "subject",
    subtitle_field: "from",
    avatar_field: "source_icon",
  },
  fields: {
    subject: { type: "text", label: "Subject", display: "headline", searchable: true },
    from: { type: "email", label: "From", display: "subheadline" },
    source: {
      type: "select",
      label: "Source",
      display: "aside",
      filterable: true,
      options: [
        { value: "email", label: "Email" },
        { value: "webhook", label: "Webhook" },
        { value: "manual", label: "Manual" },
        { value: "slack", label: "Slack" },
      ],
    },
    status: {
      type: "select",
      label: "Status",
      display: "aside",
      filterable: true,
      options: [
        { value: "pending", label: "Pending", color: "gray" },
        { value: "working", label: "Working", color: "blue" },
        { value: "awaiting_user", label: "Awaiting", color: "amber" },
        { value: "done", label: "Done", color: "green" },
        { value: "archived", label: "Archived", color: "slate" },
      ],
    },
    agent: {
      type: "select",
      label: "Agent",
      display: "aside",
      filterable: true,
      options: [{ value: "claude-code", label: "Claude Code" }],
    },
    tags: { type: "multi_select", label: "Tags", display: "meta", filterable: true, options: [] },
    category: { type: "select", label: "Category", display: "meta", filterable: true, options: [] },
    cost_usd: { type: "number", label: "Cost", display: "meta" },
    body: { type: "richtext", label: "Body", display: "body" },
  },
  list_view: {
    filters: ["status", "agent", "source", "tags", "category"],
    search: ["subject", "from", "body"],
    sort: "-_updated_at",
    row: {
      title: "subject",
      status: "status",
      timestamp: "_updated_at",
      subtitle: "from",
      preview: "body",
    },
  },
} as const;

/**
 * v3.3 inbox schema — workspace-level raw event log.
 *
 * Differs from CANONICAL_TASK_SCHEMA:
 *   - no `status` field (triage state is computed from referential
 *     relationships at render time; see spec §4.3)
 *   - source enum expanded (email / webhook / upload / clip / manual /
 *     handoff) to cover all v3.3 ingest origins
 *   - adds `attachments` (paths into __assets__/) and `to_hint`
 *     (project hint from plus-suffix addressing, advisory only)
 */
export const CANONICAL_INBOX_SCHEMA = {
  title: "Inbox",
  entity: {
    title_field: "subject",
    subtitle_field: "from",
    avatar_field: "source_icon",
  },
  fields: {
    subject: { type: "text", label: "Subject", display: "headline", searchable: true },
    from: { type: "email", label: "From", display: "subheadline" },
    source: {
      type: "select",
      label: "Source",
      display: "aside",
      filterable: true,
      options: [
        { value: "email", label: "Email" },
        { value: "webhook", label: "Webhook" },
        { value: "upload", label: "Upload" },
        { value: "clip", label: "Clip" },
        { value: "manual", label: "Manual" },
        { value: "handoff", label: "Handoff" },
      ],
    },
    body: { type: "richtext", label: "Body", display: "body", searchable: true },
    attachments: {
      type: "multi_select",
      label: "Attachments",
      display: "meta",
    },
    to_hint: {
      type: "text",
      label: "To",
      display: "aside",
    },
  },
  list_view: {
    filters: ["source"],
    search: ["subject", "from", "body"],
    sort: "-_updated_at",
    row: {
      title: "subject",
      subtitle: "from",
      timestamp: "_updated_at",
      preview: "body",
    },
  },
} as const;

/**
 * Build the first-line schema event for a fresh Tasks Collection.
 * Returns the JSON-encoded string (no trailing newline) — callers append
 * `\n` and the first entity event when seeding a file.
 */
export function buildInitialSchemaLine(
  options: { at?: string; by?: string; version?: number } = {},
): string {
  const event = {
    op: "schema",
    at: options.at ?? new Date().toISOString(),
    by: options.by ?? "system",
    version: options.version ?? 1,
    schema: CANONICAL_TASK_SCHEMA,
  };
  return JSON.stringify(event);
}

/**
 * Build the first-line schema event for a fresh Inbox Collection
 * (`inbox.jsonl`). Uses the v3.3 CANONICAL_INBOX_SCHEMA which omits
 * `status` and adds attachments / to_hint.
 */
export function buildInitialInboxSchemaLine(
  options: { at?: string; by?: string; version?: number } = {},
): string {
  const event = {
    op: "schema",
    at: options.at ?? new Date().toISOString(),
    by: options.by ?? "system",
    version: options.version ?? 1,
    schema: CANONICAL_INBOX_SCHEMA,
  };
  return JSON.stringify(event);
}

/**
 * Type-narrow a parsed SchemaLine into a Tasks schema. Returns null if
 * the schema event lacks the canonical entity.title_field — useful for
 * "is this a Tasks Collection?" checks in renderers that conditionally
 * surface the confirm CTA, etc.
 */
export function isTaskSchema(line: SchemaLine): boolean {
  const entity = line.schema?.entity as Record<string, unknown> | undefined;
  return entity?.title_field === "subject";
}

/**
 * Project a sequence of `op` values to the latest `status` per tasks.md
 * §4. Scans from the end backwards and returns the first projection that
 * matches; falls through to "pending" if no events project. Custom ops
 * are passed over silently, matching the renderer rule.
 */
export function projectStatus(ops: readonly string[]): TaskStatus {
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i];
    switch (op) {
      case "archive":
        return "archived";
      case "result":
        return "done";
      case "confirm_requested":
        return "awaiting_user";
      case "user_action":
      case "dispatch":
      case "agent_turn":
      case "tool_use":
      case "tool_result":
        return "working";
      case "create":
      case "ingest":
        return "pending";
      default:
        continue;
    }
  }
  return "pending";
}
