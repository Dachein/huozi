"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DataEditor,
  GridCellKind,
  type DataEditorProps,
  type GridCell,
  type GridColumn,
  type Item,
  type Theme,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import {
  parseDelimited,
  inferNumericColumns,
  isNumeric,
} from "@/lib/csv/parse";

export interface CsvGridProps {
  /** Raw file content. */
  content: string;
  /** Delimiter. Defaults to "," — pass "\t" for TSV. */
  delim?: string;
  /** Max grid height in pixels. Defaults to 720. */
  maxHeight?: number;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const DEFAULT_COL_WIDTH = 160;

export function CsvGrid({ content, delim = ",", maxHeight = 720 }: CsvGridProps) {
  const { header, rows, numericCols } = useMemo(() => {
    const all = parseDelimited(content, delim);
    if (all.length === 0) {
      return {
        header: [] as string[],
        rows: [] as string[][],
        numericCols: [] as boolean[],
      };
    }
    const head = all[0]!;
    const body = all.slice(1);
    const nums = inferNumericColumns(body, head.length);
    return { header: head, rows: body, numericCols: nums };
  }, [content, delim]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: "asc" | "desc" } | null>(
    null,
  );

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
        const an = isNumeric(av)
          ? Number(av.replace(/,/g, "").replace(/%$/, ""))
          : Number.POSITIVE_INFINITY;
        const bn = isNumeric(bv)
          ? Number(bv.replace(/,/g, "").replace(/%$/, ""))
          : Number.POSITIVE_INFINITY;
        cmp = an - bn;
      } else {
        cmp = av.localeCompare(bv);
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, numericCols]);

  const columns = useMemo<GridColumn[]>(() => {
    return header.map((h, i) => {
      const active = sort?.col === i;
      const arrow = active ? (sort!.dir === "asc" ? " ▲" : " ▼") : "";
      return {
        title: (h || `col ${i + 1}`) + arrow,
        id: `c${i}`,
        width: DEFAULT_COL_WIDTH,
      };
    });
  }, [header, sort]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const value = sorted[row]?.[col] ?? "";
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        contentAlign: numericCols[col] ? "right" : "left",
        themeOverride: numericCols[col]
          ? { fontFamily: "var(--font-mono, ui-monospace, monospace)" }
          : undefined,
      };
    },
    [sorted, numericCols],
  );

  const onHeaderClicked = useCallback<
    NonNullable<DataEditorProps["onHeaderClicked"]>
  >((col) => {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  }, []);

  const theme = useMemo<Partial<Theme>>(
    () => ({
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      baseFontStyle: "12px",
      headerFontStyle: "600 12px",
      cellHorizontalPadding: 10,
      headerIconSize: 14,
    }),
    [],
  );

  if (header.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Empty file.
      </div>
    );
  }

  const gridHeight = Math.min(
    maxHeight,
    sorted.length * ROW_HEIGHT + HEADER_HEIGHT + 2,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <input
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 outline-none focus:border-foreground/40"
        />
        <span className="text-muted-foreground whitespace-nowrap">
          {sorted.length.toLocaleString()} / {rows.length.toLocaleString()} row
          {rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        className="rounded-lg border border-border overflow-hidden"
        style={{ height: gridHeight }}
      >
        <DataEditor
          columns={columns}
          getCellContent={getCellContent}
          rows={sorted.length}
          width="100%"
          height={gridHeight}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          smoothScrollX
          smoothScrollY
          onHeaderClicked={onHeaderClicked}
          getCellsForSelection={true}
          keybindings={{ copy: true }}
          theme={theme}
          rowMarkers="none"
        />
      </div>
    </div>
  );
}
