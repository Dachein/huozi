"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileIcon } from "@/components/workspace/file-icon";
import { useT } from "@/lib/i18n/context";

const MAX_LOCAL_HITS = 12;
const MIN_CONTENT_QUERY_LEN = 3;
const DEBOUNCE_MS = 250;

export interface WorkspaceSearchProps {
  /** Workspace-relative paths, full file list visible to current user. */
  paths: string[];
}

interface ContentState {
  status: "idle" | "loading" | "ok" | "error";
  filenames: string[];
  truncated: boolean;
  message?: string;
}

export function WorkspaceSearch({ paths }: WorkspaceSearchProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [content, setContent] = useState<ContentState>({
    status: "idle",
    filenames: [],
    truncated: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  const localHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matched: string[] = [];
    for (const p of paths) {
      if (p.toLowerCase().includes(q)) {
        matched.push(p);
        if (matched.length >= MAX_LOCAL_HITS) break;
      }
    }
    return matched;
  }, [paths, query]);

  // Debounced content search via Worker FTS5. Worker enforces scope + folder
  // ACLs — anything we render here is already what the user is allowed to see.
  // Render-time gating on query length hides any stale content state, so the
  // effect only kicks off network work and avoids cascading renders.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CONTENT_QUERY_LEN) {
      abortRef.current?.abort();
      return;
    }
    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setContent({ status: "loading", filenames: [], truncated: false });
      void fetch("/api/app/drive/grep", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          // Treat user input as a literal substring, not regex.
          pattern: escapeRegex(q),
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              message?: string;
            };
            setContent({
              status: "error",
              filenames: [],
              truncated: false,
              message: body.message ?? `HTTP ${res.status}`,
            });
            return;
          }
          const body = (await res.json()) as {
            ok: boolean;
            filenames: string[];
            truncated: boolean;
          };
          setContent({
            status: "ok",
            filenames: body.filenames ?? [],
            truncated: !!body.truncated,
          });
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setContent({
            status: "error",
            filenames: [],
            truncated: false,
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Content hits exclusive of filename hits, so we don't list the same path twice.
  const localSet = useMemo(() => new Set(localHits), [localHits]);
  const contentOnlyHits = useMemo(
    () => content.filenames.filter((p) => !localSet.has(p)),
    [content.filenames, localSet],
  );

  const trimmed = query.trim();
  const showResults = trimmed.length > 0;

  return (
    <div className="huozi-card rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
      <h2 className="text-sm font-semibold mb-3">{t("ws.search.title")}</h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("ws.search.placeholder")}
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground/70 focus:outline-none focus:border-accent/60"
        autoComplete="off"
      />

      {showResults && (
        <div className="mt-3 space-y-3">
          <PathGroup
            label={t("ws.search.fileMatches")}
            paths={localHits}
            query={trimmed}
          />

          {trimmed.length >= MIN_CONTENT_QUERY_LEN && (
            <PathGroup
              label={t("ws.search.contentMatches")}
              paths={contentOnlyHits}
              query={trimmed}
              emptyHint={
                content.status === "loading"
                  ? t("ws.search.searching")
                  : content.status === "error"
                    ? content.message ?? t("ws.search.error")
                    : content.status === "ok" && contentOnlyHits.length === 0
                      ? t("ws.search.noContentMatch")
                      : null
              }
              footer={
                content.truncated ? t("ws.search.truncated") : null
              }
            />
          )}

          {/* Short-query fallback: when the input is below the content-search
              threshold, the content group never renders, so we show the global
              "no match" message here. For ≥3-char queries the content group's
              own empty hint covers the case, so we don't double up. */}
          {localHits.length === 0 &&
            trimmed.length < MIN_CONTENT_QUERY_LEN && (
              <p className="text-xs text-muted-foreground px-1">
                {t("ws.search.noMatch")}
              </p>
            )}
        </div>
      )}
    </div>
  );
}

function PathGroup({
  label,
  paths,
  query,
  emptyHint,
  footer,
}: {
  label: string;
  paths: string[];
  query: string;
  emptyHint?: string | null;
  footer?: string | null;
}) {
  if (paths.length === 0 && !emptyHint) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5 px-1">
        {label}
      </p>
      {paths.length === 0 ? (
        emptyHint ? (
          <p className="text-xs text-muted-foreground px-1">{emptyHint}</p>
        ) : null
      ) : (
        <ul className="divide-y divide-border/40 rounded-md border border-border/60 bg-background overflow-hidden">
          {paths.map((p) => {
            const base = p.split("/").pop() ?? p;
            const parent = p.includes("/")
              ? p.slice(0, p.lastIndexOf("/"))
              : "";
            return (
              <li key={p}>
                <Link
                  href={`/workspace/view?path=${encodeURIComponent(p)}`}
                  className="huozi-row flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted/60 transition-colors"
                >
                  <span className="shrink-0">
                    <FileIcon name={base} isDir={false} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono">
                      {renderHighlighted(base, query)}
                    </span>
                    {parent && (
                      <span className="block truncate text-[10px] text-muted-foreground/70">
                        {parent}/
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {footer && (
        <p className="text-[10px] text-muted-foreground/70 mt-1 px-1">
          {footer}
        </p>
      )}
    </div>
  );
}

function renderHighlighted(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const ql = query.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark
        key={key++}
        className="rounded bg-accent/30 text-foreground px-0.5"
      >
        {text.slice(idx, idx + ql.length)}
      </mark>,
    );
    i = idx + ql.length;
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
