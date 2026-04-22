"use client";

import { useMemo, useState } from "react";
import {
  parseDelimited,
  inferNumericColumns,
  isNumeric,
} from "@/lib/csv/parse";

export interface CsvTableProps {
  /** Raw file content. */
  content: string;
  /** Delimiter. Defaults to "," — pass "\t" for TSV. */
  delim?: string;
  /** Rows per page. Defaults to 50. */
  pageSize?: number;
}

const MAX_PARSE_BYTES = 5 * 1024 * 1024; // 5 MB — above this we show a warning.

export function CsvTable({ content, delim = ",", pageSize = 50 }: CsvTableProps) {
  const tooLarge = content.length > MAX_PARSE_BYTES;

  const { header, rows, numericCols } = useMemo(() => {
    const all = parseDelimited(content, delim);
    if (all.length === 0) {
      return { header: [] as string[], rows: [] as string[][], numericCols: [] as boolean[] };
    }
    const head = all[0]!;
    const body = all.slice(1);
    const nums = inferNumericColumns(body, head.length);
    return { header: head, rows: body, numericCols: nums };
  }, [content, delim]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q)));
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { col, dir } = sort;
    const numeric = numericCols[col];
    const copy = filtered.slice();
    copy.sort((a, b) => {
      const av = a[col] ?? "";
      const bv = b[col] ?? "";
      let cmp: number;
      if (numeric) {
        const an = isNumeric(av) ? Number(av.replace(/,/g, "").replace(/%$/, "")) : Number.POSITIVE_INFINITY;
        const bn = isNumeric(bv) ? Number(bv.replace(/,/g, "").replace(/%$/, "")) : Number.POSITIVE_INFINITY;
        cmp = an - bn;
      } else {
        cmp = av.localeCompare(bv);
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, numericCols]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  if (header.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Empty file.
      </div>
    );
  }

  const toggleSort = (col: number) => {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
    setPage(0);
  };

  return (
    <div className="space-y-2">
      {tooLarge && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Large file ({(content.length / (1024 * 1024)).toFixed(1)} MB) — rendering may be slow.
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        <input
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 outline-none focus:border-foreground/40"
        />
        <span className="text-muted-foreground whitespace-nowrap">
          {sorted.length.toLocaleString()} / {rows.length.toLocaleString()} row
          {rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-muted">
            <tr>
              {header.map((h, i) => {
                const active = sort?.col === i;
                const arrow = active ? (sort!.dir === "asc" ? "▲" : "▼") : "";
                return (
                  <th
                    key={i}
                    onClick={() => toggleSort(i)}
                    className={`px-3 py-2 text-left font-medium border-b border-border cursor-pointer select-none hover:bg-muted-foreground/10 ${
                      numericCols[i] ? "text-right" : ""
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {h || <span className="opacity-40">col {i + 1}</span>}
                      {arrow && <span className="text-[9px] opacity-70">{arrow}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className="odd:bg-muted/30">
                {header.map((_, j) => {
                  const cell = row[j] ?? "";
                  return (
                    <td
                      key={j}
                      className={`px-3 py-1.5 border-b border-border/40 font-mono whitespace-nowrap ${
                        numericCols[j] ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={header.length}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No matching rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:border-foreground/40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
              className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:border-foreground/40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
