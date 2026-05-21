import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import {
  cloudGlob,
  cloudRead,
  HUOZI_CLOUD_KEY_COOKIE,
} from "@/lib/drive/mcp-client";
import { deriveChannel } from "./channel";
import { MailShell, type MailRow, type Tab } from "./mail-shell";

export const metadata: Metadata = {
  title: "Mail — huozi Cloud",
};

const INBOX_PATH = "inbox.jsonl";

type SearchParams = {
  searchParams?: Promise<{ tab?: string; id?: string }>;
};

/**
 * /workspace/mail — Outlook-style inbox.
 *
 * SSR: one `cloudRead` of `inbox.jsonl`, fold events to per-id state,
 * then pre-bucket into the three tabs (inbox/todo/archive) in a single
 * pass. The client shell only handles tab state — no client-side fetch
 * on tab switch.
 */
export default async function MailInboxPage({ searchParams }: SearchParams) {
  const params = (await searchParams) ?? {};
  const initialTab = normalizeTab(params.tab);
  const initialSelectedId = params.id?.trim() || null;

  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect(`/api/app/session/refresh?next=${encodeURIComponent("/workspace/mail")}`);
  }

  const identity = await getIdentity();
  const supported = identity.supportsEmailIngest();
  const ws = await identity.getPrimaryWorkspace();

  let buckets: { inbox: MailRow[]; todo: MailRow[]; archive: MailRow[] } = {
    inbox: [],
    todo: [],
    archive: [],
  };
  let loadError: string | null = null;
  let inboxExists = false;

  // Upgraded Projects power the Promote picker; their tasks.jsonl files
  // power the "Promoted" chip via source_refs. We load both alongside
  // the inbox so the whole page renders from a single round trip per
  // file. Empty result = no Projects upgraded yet, Promote disabled.
  let projects: ProjectInfo[] = [];
  let taskRefs: Record<string, TaskRef[]> = {};

  if (ws) {
    const [inboxR, sentinelR] = await Promise.all([
      cloudRead(key, INBOX_PATH),
      cloudGlob(key, "**/.huozi/memory.md"),
    ]);

    if (
      inboxR.ok &&
      inboxR.data.type === "text" &&
      typeof inboxR.data.file.content === "string"
    ) {
      inboxExists = true;
      buckets = parseAndBucket(inboxR.data.file.content);
    } else if (inboxR.ok && inboxR.data.type === "file_unchanged") {
      inboxExists = true;
    } else if (!inboxR.ok) {
      const code = inboxR.errorCode;
      if (code === 8 || /not found|FILE_NOT_FOUND/i.test(inboxR.message ?? "")) {
        inboxExists = false;
      } else {
        loadError = inboxR.message ?? `error_${code}`;
      }
    }

    if (sentinelR.ok) {
      const projectNames = sentinelR.data.filenames
        .map((p) => {
          const segs = p.split("/");
          if (segs.length === 3 && segs[1] === ".huozi") return segs[0] ?? "";
          return "";
        })
        .filter((n): n is string => n.length > 0);
      projects = projectNames.map((name) => ({ name }));

      // Pull each Project's tasks.jsonl in parallel and extract every
      // create event's source_refs that points back into inbox.jsonl.
      // Skipping files that 404 (a freshly-upgraded Project may not
      // have an op:"create" yet; tasks.jsonl will just be the schema
      // header).
      const taskReads = await Promise.all(
        projectNames.map(async (name) => {
          const r = await cloudRead(key, `${name}/tasks.jsonl`);
          if (
            r.ok &&
            r.data.type === "text" &&
            typeof r.data.file.content === "string"
          ) {
            return {
              name,
              content: r.data.file.content,
            };
          }
          return null;
        }),
      );
      taskRefs = collectTaskRefs(taskReads);
    }
  }

  const isEmpty =
    buckets.inbox.length === 0 &&
    buckets.todo.length === 0 &&
    buckets.archive.length === 0;

  // If a deep-link `?id=` lands on the "wrong" tab (i.e. the ticket
  // lives in a different bucket), resolve it server-side so the client
  // shell mounts on the correct tab without a transient setTab.
  let resolvedTab = initialTab;
  if (initialSelectedId) {
    for (const t of ["inbox", "todo", "archive"] as Tab[]) {
      if (buckets[t].some((r) => r.id === initialSelectedId)) {
        resolvedTab = t;
        break;
      }
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-4 mb-3 shrink-0">
        <h1 className="font-serif text-2xl font-bold tracking-[0.05em]">Mail</h1>
        <Link
          href="/workspace/mail/settings"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <span aria-hidden="true">⚙</span> Settings
        </Link>
      </div>

      {!supported && (
        <section className="rounded border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          Mail forwarding is a Cloud-only feature.
        </section>
      )}

      {supported && !ws && (
        <section className="rounded border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          Create a workspace first.
        </section>
      )}

      {supported && ws && (
        <div className="flex flex-1 min-h-0 flex-col">
          {loadError ? (
            <section className="rounded border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              Couldn&rsquo;t load inbox: {loadError}
            </section>
          ) : isEmpty ? (
            <EmptyInbox inboxExists={inboxExists} />
          ) : (
            <MailShell
              buckets={applyTaskRefs(buckets, taskRefs)}
              initialTab={resolvedTab}
              initialSelectedId={initialSelectedId}
              projects={projects}
            />
          )}
        </div>
      )}
    </div>
  );
}

function normalizeTab(raw: string | undefined): Tab {
  if (raw === "todo" || raw === "archive" || raw === "inbox") return raw;
  return "inbox";
}

function EmptyInbox({ inboxExists }: { inboxExists: boolean }) {
  return (
    <section className="rounded border border-border/60 bg-muted/20 px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground mb-3">
        {inboxExists
          ? "No tickets yet — mail you send here will show up below."
          : "Inbox empty. Claim an address and forward mail to it to get started."}
      </p>
      <Link
        href="/workspace/mail/settings"
        className="inline-block rounded border border-border/60 bg-card px-3 py-1.5 text-sm hover:bg-muted/50"
      >
        Open Settings
      </Link>
    </section>
  );
}

// ── Projects + task references (v3.3 Promote linkage) ──────────────────

export interface ProjectInfo {
  name: string;
}

export interface TaskRef {
  project: string;
  task_id: string;
}

/**
 * Scan every Project's tasks.jsonl for `op:"create"` events whose
 * `source_refs` point back to the workspace inbox. The resulting map
 * is `inbox_event_id → TaskRef[]` — any inbox ticket with a non-empty
 * array is "Promoted" (the v3.3 replacement for the legacy
 * `op:"routed"` event on inbox).
 *
 * Tolerates missing files (a freshly-upgraded Project with no tasks
 * yet just contributes nothing).
 */
function collectTaskRefs(
  reads: Array<{ name: string; content: string } | null>,
): Record<string, TaskRef[]> {
  const out: Record<string, TaskRef[]> = {};
  for (const r of reads) {
    if (!r) continue;
    const content = stripLineNumbers(r.content);
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (evt.op !== "create") continue;
      if (typeof evt.id !== "string") continue;
      const refs = evt.source_refs;
      if (!Array.isArray(refs)) continue;
      for (const ref of refs) {
        if (typeof ref !== "string") continue;
        const m = ref.match(/^inbox\.jsonl#([0-9a-zA-Z-]+)$/);
        if (!m || !m[1]) continue;
        const inboxId = m[1];
        const arr = out[inboxId] ?? [];
        arr.push({ project: r.name, task_id: evt.id });
        out[inboxId] = arr;
      }
    }
  }
  return out;
}

/**
 * Re-bucket parsed inbox rows by task reference: anything with at least
 * one entry in `taskRefs` is "Promoted" and moves to the Todo tab
 * (overriding the legacy `routed`/`dismissed` derivation). The
 * `task_id` field gets populated so the detail panel can link to the
 * destination tasks.jsonl.
 */
function applyTaskRefs(
  buckets: { inbox: MailRow[]; todo: MailRow[]; archive: MailRow[] },
  taskRefs: Record<string, TaskRef[]>,
): { inbox: MailRow[]; todo: MailRow[]; archive: MailRow[] } {
  if (Object.keys(taskRefs).length === 0) return buckets;
  const all: MailRow[] = [...buckets.inbox, ...buckets.todo, ...buckets.archive];
  const inbox: MailRow[] = [];
  const todo: MailRow[] = [];
  const archive: MailRow[] = [];
  for (const row of all) {
    const refs = taskRefs[row.id];
    if (refs && refs.length > 0) {
      const first = refs[0]!;
      todo.push({
        ...row,
        status: "routed",
        task_id: first.task_id,
        task_project: first.project,
      });
    } else if (row.status === "dismissed") {
      archive.push(row);
    } else if (row.status === "routed") {
      // Legacy op:"routed" event without a discoverable task ref —
      // keep in Todo for back-compat.
      todo.push(row);
    } else {
      inbox.push(row);
    }
  }
  const byAtDesc = (a: MailRow, b: MailRow) =>
    Date.parse(b.at) - Date.parse(a.at);
  inbox.sort(byAtDesc);
  todo.sort(byAtDesc);
  archive.sort(byAtDesc);
  return { inbox, todo, archive };
}

// ── inbox.jsonl parsing + bucketing ─────────────────────────────────────

/**
 * MCP huozi_read returns content with cat -n line numbers prepended to
 * every line (6-char padded number + tab). Strip them before treating
 * lines as NDJSON. See huozi-cloud/src/cc-compat/internal.ts.
 */
function stripLineNumbers(content: string): string {
  return content.replace(/^ *\d+\t/gm, "");
}

interface InboxEvent {
  id?: string;
  at?: string;
  by?: string;
  op?: string;
  source?: string;
  from?: string;
  subject?: string;
  body?: string;
  task_id?: string;
  reason?: string;
}

function parseAndBucket(rawContent: string): {
  inbox: MailRow[];
  todo: MailRow[];
  archive: MailRow[];
} {
  const content = stripLineNumbers(rawContent);
  const byId = new Map<
    string,
    {
      ingest?: InboxEvent;
      latest?: InboxEvent;
      latestAt: number;
    }
  >();

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let evt: InboxEvent;
    try {
      evt = JSON.parse(trimmed) as InboxEvent;
    } catch {
      continue;
    }
    if (typeof evt.id !== "string" || evt.id.length === 0) continue;
    const at = evt.at ? Date.parse(evt.at) : 0;
    const entry = byId.get(evt.id) ?? { latestAt: 0 };
    if (evt.op === "ingest") {
      entry.ingest = evt;
    }
    if (at > entry.latestAt) {
      entry.latest = evt;
      entry.latestAt = at;
    }
    byId.set(evt.id, entry);
  }

  const inbox: MailRow[] = [];
  const todo: MailRow[] = [];
  const archive: MailRow[] = [];

  const now = Date.now();

  for (const [id, e] of byId) {
    if (!e.ingest) continue;
    const latestOp = e.latest?.op ?? "ingest";
    let status: MailRow["status"];
    if (latestOp === "routed") status = "routed";
    else if (latestOp === "dismissed") status = "dismissed";
    else status = "pending";

    const from = e.ingest.from ?? "(unknown)";
    const source = e.ingest.source ?? "manual";
    const body = e.ingest.body ?? "";
    const row: MailRow = {
      id,
      from,
      subject: e.ingest.subject ?? "(no subject)",
      preview: body.trim().slice(0, 180),
      body,
      channel: deriveChannel(source, from),
      at: e.ingest.at ?? "",
      relTime: relativeTime(e.ingest.at ?? "", now),
      receivedAt: absoluteTime(e.ingest.at ?? ""),
      source,
      dismissReason:
        status === "dismissed" ? (e.latest?.reason ?? undefined) : undefined,
      status,
      task_id: status === "routed" ? e.latest?.task_id : undefined,
    };

    if (status === "pending") inbox.push(row);
    else if (status === "routed") todo.push(row);
    else archive.push(row);
  }

  const byAtDesc = (a: MailRow, b: MailRow) => Date.parse(b.at) - Date.parse(a.at);
  inbox.sort(byAtDesc);
  todo.sort(byAtDesc);
  archive.sort(byAtDesc);

  return { inbox, todo, archive };
}

function absoluteTime(iso: string): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  // Server-side formatted, sent down as a string so the client doesn't
  // re-format with a different locale and trigger hydration drift.
  return new Date(ts).toLocaleString();
}

function relativeTime(iso: string, now: number): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const ms = now - ts;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}
