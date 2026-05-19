"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme/context";
import { ListDetailLayout } from "@/components/list-detail-layout";
import { useEntityNavigator } from "@/components/use-entity-navigator";
import { senderEmail, type Channel } from "./channel";

export interface MailRow {
  id: string;
  from: string;
  subject: string;
  /** First ~180 chars; shown in the list row. */
  preview: string;
  /** Full body — shown in the detail pane. */
  body: string;
  channel: Channel;
  at: string;
  // Pre-computed on the server so hydration doesn't drift seconds-level.
  relTime: string;
  /** Pre-formatted absolute timestamp for the detail header (avoids hydration drift). */
  receivedAt: string;
  source: string;
  /** Reason text when status === "dismissed". */
  dismissReason?: string;
  status: "pending" | "routed" | "dismissed";
  task_id?: string;
}

export type Tab = "inbox" | "todo" | "archive";

interface Buckets {
  inbox: MailRow[];
  todo: MailRow[];
  archive: MailRow[];
}

const TAB_LABELS: Record<Tab, string> = {
  inbox: "Inbox",
  todo: "Todo",
  archive: "Archive",
};

const TAB_ORDER: Tab[] = ["inbox", "todo", "archive"];

export function MailShell({
  buckets,
  initialTab,
  initialSelectedId,
}: {
  buckets: Buckets;
  initialTab: Tab;
  /** Pre-selected ticket id from `?id=` searchParam (deep link). */
  initialSelectedId?: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? null,
  );
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const theme = useTheme();
  const isOffice = theme === "office";

  const counts = useMemo(
    () => ({
      inbox: buckets.inbox.length,
      todo: buckets.todo.length,
      archive: buckets.archive.length,
    }),
    [buckets],
  );

  // `/` (GitHub/Twitter style) focuses the search input from anywhere
  // on the mail page. ⌘/Ctrl+K kept as a fallback, though most
  // browsers intercept it for the omnibox.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Filter the current tab's rows by the search query. Empty query
  // = pass-through. Match on subject + sender + preview (case-insensitive).
  const rows = useMemo(() => {
    const all = buckets[tab];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => {
      if (r.subject.toLowerCase().includes(q)) return true;
      if (r.from.toLowerCase().includes(q)) return true;
      if (r.preview.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [buckets, tab, search]);
  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    // Look across all buckets so a selection survives a tab switch.
    return (
      buckets.inbox.find((r) => r.id === selectedId) ??
      buckets.todo.find((r) => r.id === selectedId) ??
      buckets.archive.find((r) => r.id === selectedId) ??
      null
    );
  }, [selectedId, buckets]);

  // Keep URL in sync with tab + selection. `replace` (not push) so
  // back-button doesn't accumulate one history entry per row click.
  const syncUrl = useCallback(
    (nextTab: Tab, nextId: string | null) => {
      const qs = new URLSearchParams();
      if (nextTab !== "inbox") qs.set("tab", nextTab);
      if (nextId) qs.set("id", nextId);
      const query = qs.toString();
      const url = query ? `/workspace/mail?${query}` : "/workspace/mail";
      startTransition(() => {
        router.replace(url, { scroll: false });
      });
    },
    [router],
  );

  const rowId = useCallback((r: MailRow) => r.id, []);
  // Prev/next walk the *current tab's* rows — switching tabs implicitly
  // changes the navigation scope, matching the user's mental model.
  const nav = useEntityNavigator(rows, selectedId, rowId, (id) => {
    setSelectedId(id);
    syncUrl(tab, id);
  });

  const onTabClick = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      setTab(next);
      // If the previously-selected ticket isn't in the new tab, clear
      // selection — otherwise prev/next would walk an invisible list.
      const stillVisible = buckets[next].some((r) => r.id === selectedId);
      const nextId = stillVisible ? selectedId : null;
      if (!stillVisible) setSelectedId(null);
      syncUrl(next, nextId);
    },
    [tab, selectedId, buckets, syncUrl],
  );

  const onSelectRow = useCallback(
    (id: string) => {
      setSelectedId(id);
      syncUrl(tab, id);
    },
    [tab, syncUrl],
  );

  const onClose = useCallback(() => {
    setSelectedId(null);
    syncUrl(tab, null);
  }, [tab, syncUrl]);

  const listNode = (
    <div className="flex flex-1 min-h-0 flex-col">
      <TabBar tab={tab} counts={counts} onTabClick={onTabClick} isOffice={isOffice} />
      <div className="shrink-0 px-3 py-2 border-b border-border/40">
        <input
          ref={searchInputRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search mail  /"
          className="w-full text-xs px-2 py-1.5 rounded border border-border/60 bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
      </div>
      <div className="huozi-scrollarea flex-1 min-h-0 overflow-y-auto border-b border-border bg-background">
        {rows.length === 0 ? (
          <EmptyTab tab={tab} hasSearch={search.trim().length > 0} />
        ) : (
          <MailList rows={rows} selectedId={selectedId} onSelect={onSelectRow} />
        )}
      </div>
    </div>
  );

  const detailNode = selectedRow ? <MailDetail row={selectedRow} /> : null;

  return (
    <ListDetailLayout
      list={listNode}
      detail={detailNode}
      onClose={onClose}
      navigator={{
        goPrev: nav.goPrev,
        goNext: nav.goNext,
        canGoPrev: nav.canGoPrev,
        canGoNext: nav.canGoNext,
      }}
      detailHeader={
        selectedRow && nav.index >= 0
          ? `${nav.index + 1}/${rows.length}`
          : null
      }
      defaultOpen={true}
      selectionKey={selectedId}
      emptyDetail={
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
          Select a message to read
        </div>
      }
      storageKey="huozi.mail.list.width"
      defaultWidth={400}
      minWidth={320}
      maxWidth={600}
    />
  );
}

function TabBar({
  tab,
  counts,
  onTabClick,
  isOffice,
}: {
  tab: Tab;
  counts: Record<Tab, number>;
  onTabClick: (t: Tab) => void;
  isOffice: boolean;
}) {
  return (
    <div
      role="tablist"
      className={
        "flex items-center gap-1 shrink-0 " +
        (isOffice
          ? "border-b border-border bg-[var(--surface-elevated)]"
          : "border-b border-border/60 mb-2")
      }
    >
      {TAB_ORDER.map((t) => {
        const active = t === tab;
        const accent = isOffice
          ? active
            ? "text-[var(--primary)] font-semibold"
            : "text-foreground/80 hover:text-foreground"
          : active
            ? "text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground";
        const barColor = isOffice ? "bg-[var(--primary)]" : "bg-foreground";
        return (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onTabClick(t)}
            className={"relative px-3 py-2 text-[13px] transition-colors " + accent}
          >
            {TAB_LABELS[t]}
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
              {counts[t]}
            </span>
            {active && (
              <span
                aria-hidden="true"
                className={"absolute left-2 right-2 -bottom-px h-[2px] " + barColor}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function EmptyTab({ tab, hasSearch }: { tab: Tab; hasSearch?: boolean }) {
  if (hasSearch) {
    return (
      <section className="px-6 py-10 text-center text-sm text-muted-foreground">
        No matches.
      </section>
    );
  }
  const msg =
    tab === "inbox"
      ? "Inbox is clear. New mail will land here."
      : tab === "todo"
        ? "No active tasks. Routed mail will show up here."
        : "Nothing archived yet.";
  return (
    <section className="px-6 py-10 text-center text-sm text-muted-foreground">
      {msg}
    </section>
  );
}

function MailList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: MailRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <MailItem
          key={r.id}
          row={r}
          selected={r.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

const MailItem = memo(function MailItem({
  row,
  selected,
  onSelect,
}: {
  row: MailRow;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const email = senderEmail(row.from);
  // Keep the selected row in view as ↑/↓ moves through the list.
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) btnRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <li>
      <button
        ref={btnRef}
        type="button"
        onClick={() => onSelect(row.id)}
        aria-current={selected ? "true" : undefined}
        className={`relative block w-full text-left px-4 py-3 transition-colors outline-none ${
          selected
            ? "bg-[var(--surface-elevated)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--accent)]"
            : "hover:bg-foreground/5"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-foreground">
              {row.subject || "(no subject)"}
            </div>
            <div className="truncate text-[12px] text-muted-foreground mt-0.5">
              {email}
            </div>
            {row.preview && (
              <div className="line-clamp-2 text-[12px] text-muted-foreground/80 mt-1 break-words">
                {row.preview}
              </div>
            )}
          </div>
          <span
            className="shrink-0 text-xs text-muted-foreground tabular-nums leading-5"
            suppressHydrationWarning
          >
            {row.relTime}
          </span>
        </div>
      </button>
    </li>
  );
});

function MailDetail({ row }: { row: MailRow }) {
  const email = senderEmail(row.from);
  return (
    <article className="flex flex-col">
      <header className="px-5 pt-5 pb-4 border-b border-border">
        <h1 className="text-[20px] font-semibold leading-snug text-foreground">
          {row.subject || "(no subject)"}
        </h1>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <span className="text-muted-foreground">From</span>
          <span className="text-foreground/90 truncate">{email}</span>
          <span className="text-muted-foreground">Received</span>
          <span className="text-foreground/90">{row.receivedAt}</span>
          <span className="text-muted-foreground">Source</span>
          <span className="text-foreground/90 capitalize">{row.source}</span>
          <span className="text-muted-foreground">Status</span>
          <span className="text-foreground/90">
            <DetailStatusLabel status={row.status} />
          </span>
          {row.status === "dismissed" && row.dismissReason && (
            <>
              <span className="text-muted-foreground">Reason</span>
              <span className="text-foreground/90">{row.dismissReason}</span>
            </>
          )}
        </div>
      </header>

      <section className="px-5 py-5">
        {row.body ? (
          <div className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {row.body}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">(empty body)</div>
        )}
      </section>

      {row.status === "routed" && row.task_id && (
        <section className="px-5 pb-6 border-t border-border/40 pt-4">
          <Link
            href={`/workspace/view?path=${encodeURIComponent(`tasks/${row.task_id}.jsonl`)}`}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Open task timeline →
          </Link>
        </section>
      )}
    </article>
  );
}

function DetailStatusLabel({ status }: { status: MailRow["status"] }) {
  if (status === "routed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--primary)]">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--primary)]" />
        Routed to task
      </span>
    );
  }
  if (status === "dismissed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/60" />
        Dismissed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
      Pending
    </span>
  );
}
