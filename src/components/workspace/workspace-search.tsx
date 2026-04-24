"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileIcon } from "@/components/workspace/file-icon";
import { useT } from "@/lib/i18n/context";

const MAX_HITS = 12;

export interface WorkspaceSearchProps {
  /** Workspace-relative paths, full file list. */
  paths: string[];
}

export function WorkspaceSearch({ paths }: WorkspaceSearchProps) {
  const t = useT();
  const [query, setQuery] = useState("");

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matched: string[] = [];
    for (const p of paths) {
      if (p.toLowerCase().includes(q)) {
        matched.push(p);
        if (matched.length >= MAX_HITS) break;
      }
    }
    return matched;
  }, [paths, query]);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
      <h2 className="text-sm font-semibold mb-3">{t("ws.search.title")}</h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("ws.search.placeholder")}
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm font-mono placeholder:text-muted-foreground/70 focus:outline-none focus:border-accent/60"
        autoComplete="off"
      />

      {query.trim() && (
        <div className="mt-3">
          {hits.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">
              {t("ws.search.noMatch")}
            </p>
          ) : (
            <ul className="divide-y divide-border/40 rounded-md border border-border/60 bg-background overflow-hidden">
              {hits.map((p) => {
                const base = p.split("/").pop() ?? p;
                const parent = p.includes("/")
                  ? p.slice(0, p.lastIndexOf("/"))
                  : "";
                return (
                  <li key={p}>
                    <Link
                      href={`/workspace/view?path=${encodeURIComponent(p)}`}
                      className="flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted/60 transition-colors"
                    >
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
