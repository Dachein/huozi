"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileIcon } from "@/components/workspace/file-icon";
import { useT } from "@/lib/i18n/context";

const MAX_LOCAL_HITS = 12;
const MIN_CONTENT_QUERY_LEN = 3;
const DEBOUNCE_MS = 250;
const SNIPPET_MAX_CHARS = 160;

export interface WorkspaceSearchProps {
  /** Workspace-relative paths, full file list visible to current user. */
  paths: string[];
}

interface Snippet {
  line: number;
  text: string;
}
interface Hit {
  path: string;
  total: number;
  snippets: Snippet[];
}
interface ContentState {
  status: "idle" | "loading" | "ok" | "error";
  hits: Hit[];
  truncated: boolean;
  message?: string;
}

export function WorkspaceSearch({ paths }: WorkspaceSearchProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [content, setContent] = useState<ContentState>({
    status: "idle",
    hits: [],
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
      setContent({ status: "loading", hits: [], truncated: false });
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
              hits: [],
              truncated: false,
              message: body.message ?? `HTTP ${res.status}`,
            });
            return;
          }
          const body = (await res.json()) as {
            ok: boolean;
            hits: Hit[];
            truncated: boolean;
          };
          setContent({
            status: "ok",
            hits: body.hits ?? [],
            truncated: !!body.truncated,
          });
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setContent({
            status: "error",
            hits: [],
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
    () => content.hits.filter((h) => !localSet.has(h.path)),
    [content.hits, localSet],
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
          <FilenameGroup
            label={t("ws.search.fileMatches")}
            paths={localHits}
            query={trimmed}
          />

          {trimmed.length >= MIN_CONTENT_QUERY_LEN && (
            <ContentGroup
              label={t("ws.search.contentMatches")}
              hits={contentOnlyHits}
              query={trimmed}
              status={content.status}
              message={content.message}
              truncated={content.truncated}
              t={t}
            />
          )}

          {/* Short-query fallback: when the input is below the content-search
              threshold, the ContentGroup never renders, so we show the global
              "no match" message here. For ≥3-char queries the ContentGroup's
              own empty hint ("没有内容命中") covers the case, so we don't
              double up. */}
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

function FilenameGroup({
  label,
  paths,
  query,
}: {
  label: string;
  paths: string[];
  query: string;
}) {
  if (paths.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5 px-1">
        {label}
      </p>
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
    </div>
  );
}

function ContentGroup({
  label,
  hits,
  query,
  status,
  message,
  truncated,
  t,
}: {
  label: string;
  hits: Hit[];
  query: string;
  status: ContentState["status"];
  message?: string;
  truncated: boolean;
  t: (k: string) => string;
}) {
  const emptyHint =
    status === "loading"
      ? t("ws.search.searching")
      : status === "error"
        ? message ?? t("ws.search.error")
        : status === "ok" && hits.length === 0
          ? t("ws.search.noContentMatch")
          : null;

  if (hits.length === 0 && !emptyHint) return null;

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5 px-1">
        {label}
      </p>
      {hits.length === 0 ? (
        emptyHint ? (
          <p className="text-xs text-muted-foreground px-1">{emptyHint}</p>
        ) : null
      ) : (
        <ul className="divide-y divide-border/40 rounded-md border border-border/60 bg-background overflow-hidden">
          {hits.map((h) => (
            <ContentHit key={h.path} hit={h} query={query} t={t} />
          ))}
        </ul>
      )}
      {truncated && (
        <p className="text-[10px] text-muted-foreground/70 mt-1 px-1">
          {t("ws.search.truncated")}
        </p>
      )}
    </div>
  );
}

function ContentHit({
  hit,
  query,
  t,
}: {
  hit: Hit;
  query: string;
  t: (k: string) => string;
}) {
  const base = hit.path.split("/").pop() ?? hit.path;
  const parent = hit.path.includes("/")
    ? hit.path.slice(0, hit.path.lastIndexOf("/"))
    : "";
  const totalLabel = t("ws.search.totalMatches").replace(
    "{n}",
    String(hit.total),
  );
  return (
    <li>
      <Link
        href={`/workspace/view?path=${encodeURIComponent(hit.path)}`}
        className="huozi-row block px-2.5 py-2 text-xs hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0">
            <FileIcon name={base} isDir={false} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono">{base}</span>
            {parent && (
              <span className="block truncate text-[10px] text-muted-foreground/70">
                {parent}/
              </span>
            )}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
            {totalLabel}
          </span>
        </div>
        {hit.snippets.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 pl-6">
            {hit.snippets.map((s) => (
              <li
                key={`${s.line}:${s.text.slice(0, 16)}`}
                className="flex gap-2 text-[11px] text-muted-foreground/90"
              >
                <span className="shrink-0 font-mono text-muted-foreground/50 tabular-nums">
                  {s.line}
                </span>
                <span className="font-mono truncate">
                  {renderHighlighted(clampSnippet(s.text, query), query)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </li>
  );
}

/* ── helpers ───────────────────────────────────────────────────────── */

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

/**
 * Clamp a long line down to ~SNIPPET_MAX_CHARS centered on the first match.
 * Adds an ellipsis prefix/suffix so the user can see a window around the hit.
 */
function clampSnippet(text: string, query: string): string {
  if (text.length <= SNIPPET_MAX_CHARS) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, SNIPPET_MAX_CHARS) + "…";
  const around = SNIPPET_MAX_CHARS - query.length;
  const start = Math.max(0, idx - Math.floor(around / 2));
  const end = Math.min(text.length, start + SNIPPET_MAX_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
