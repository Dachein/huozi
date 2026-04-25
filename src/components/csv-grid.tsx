"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DataEditor,
  GridCellKind,
  emptyGridSelection,
  type DataEditorProps,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
  type Theme,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import {
  parseDelimited,
  inferNumericColumns,
  isNumeric,
} from "@/lib/csv/parse";
import { useT } from "@/lib/i18n/context";
import { useFullscreen } from "@/components/workspace/fullscreen-context";

export interface CsvGridProps {
  /** Raw file content. */
  content: string;
  /** Delimiter. Defaults to "," — pass "\t" for TSV. */
  delim?: string;
  /** Absolute fallback cap in pixels. Used before viewport is measured and as a hard ceiling. */
  maxHeight?: number;
}

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const MIN_COL_WIDTH = 100;
const MAX_COL_WIDTH = 480;
const CHAR_PX = 7;
const COL_PADDING_PX = 24;
const VIEWPORT_CHROME_PX = 180;
const WIDTH_SAMPLE_ROWS = 100;
const HANDLE_SIZE = 22;

function measureColWidth(head: string, body: string[][], col: number): number {
  let longest = head.length;
  const sampleSize = Math.min(body.length, WIDTH_SAMPLE_ROWS);
  for (let i = 0; i < sampleSize; i++) {
    const len = (body[i]?.[col] ?? "").length;
    if (len > longest) longest = len;
  }
  return Math.max(
    MIN_COL_WIDTH,
    Math.min(MAX_COL_WIDTH, longest * CHAR_PX + COL_PADDING_PX),
  );
}

export function CsvGrid({ content, delim = ",", maxHeight = 720 }: CsvGridProps) {
  const t = useT();

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

  const [widths, setWidths] = useState<number[]>([]);
  useEffect(() => {
    setWidths(header.map((h, i) => measureColWidth(h, rows, i)));
  }, [header, rows]);

  const [viewportCap, setViewportCap] = useState<number | null>(null);
  useEffect(() => {
    const update = () =>
      setViewportCap(Math.max(320, window.innerHeight - VIEWPORT_CHROME_PX));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const { fullscreen } = useFullscreen();

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

  // Controlled cell selection — lets us anchor the row-handle to whichever
  // row the user just clicked. Reset whenever the displayed rows shift
  // (filter/sort), because the numeric index we stored points into the old
  // `sorted` array.
  const [gridSel, setGridSel] = useState<GridSelection>(emptyGridSelection);
  const [detailRowIndex, setDetailRowIndex] = useState<number | null>(null);
  const [visible, setVisible] = useState<{
    y: number;
    height: number;
    ty: number;
  }>({ y: 0, height: 0, ty: 0 });

  // Selection is stored as a numeric index into `sorted`; invalidate it
  // whenever the visible row order changes so the handle and modal don't
  // dangle on the wrong row.
  const resetRowFocus = useCallback(() => {
    setGridSel(emptyGridSelection);
    setDetailRowIndex(null);
  }, []);

  const columns = useMemo<GridColumn[]>(() => {
    return header.map((h, i) => {
      const active = sort?.col === i;
      const arrow = active ? (sort!.dir === "asc" ? " ▲" : " ▼") : "";
      return {
        title: (h || `col ${i + 1}`) + arrow,
        id: `c${i}`,
        width: widths[i] ?? MIN_COL_WIDTH,
      };
    });
  }, [header, sort, widths]);

  const onColumnResize = useCallback<
    NonNullable<DataEditorProps["onColumnResize"]>
  >((_col, newSize, colIndex) => {
    setWidths((prev) => {
      const next = prev.slice();
      next[colIndex] = newSize;
      return next;
    });
  }, []);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const value = sorted[row]?.[col] ?? "";
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: true,
        readonly: true,
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
  >(
    (col) => {
      setSort((prev) => {
        if (!prev || prev.col !== col) return { col, dir: "asc" };
        if (prev.dir === "asc") return { col, dir: "desc" };
        return null;
      });
      resetRowFocus();
    },
    [resetRowFocus],
  );

  const onVisibleRegionChanged = useCallback(
    (range: Rectangle, _tx: number, ty: number) => {
      setVisible({ y: range.y, height: range.height, ty });
    },
    [],
  );

  const onGridSelectionChange = useCallback((sel: GridSelection) => {
    setGridSel(sel);
  }, []);

  const theme = useMemo<Partial<Theme>>(
    () => ({
      fontFamily:
        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      baseFontStyle: "12px",
      headerFontStyle: "600 12px",
      cellHorizontalPadding: 10,
      headerIconSize: 14,
      accentColor: "#c4594a",
      accentLight: "rgba(196, 89, 74, 0.14)",
      accentFg: "#faf8f3",
      // Warm-cream palette to blend with the page (--background #faf8f3 +
      // --muted #f3efe6 + --border #ddd4c2). Pure-white default felt
      // jarring against the paper-grain backdrop.
      bgCell: "#faf8f3",
      bgCellMedium: "#f6f2e9",
      bgHeader: "#f3efe6",
      bgHeaderHovered: "#ece6d6",
      bgHeaderHasFocus: "#ece6d6",
      borderColor: "#ddd4c2",
      horizontalBorderColor: "#e4dccb",
      textDark: "#2d2519",
      textMedium: "#6b5d4b",
      textLight: "#8b7d68",
      textHeader: "#2d2519",
      textGroupHeader: "#2d2519",
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

  const effectiveCap = fullscreen
    ? Math.max(320, (typeof window !== "undefined" ? window.innerHeight : 0) - 100)
    : (viewportCap ?? maxHeight);
  const gridHeight = fullscreen
    ? effectiveCap
    : Math.min(
        effectiveCap,
        sorted.length * ROW_HEIGHT + HEADER_HEIGHT + 2,
      );

  const selectedRow = gridSel.current?.cell[1];
  // onVisibleRegionChanged may not fire before the user's first click; if
  // we have no region yet, accept any selected row and render relative
  // to row 0. Once a region is known, gate on it so scrolled-out rows
  // don't leave a dangling handle.
  const hasVisible = visible.height > 0;
  const handleVisible =
    selectedRow !== undefined &&
    (!hasVisible ||
      (selectedRow >= visible.y &&
        selectedRow < visible.y + visible.height));
  const handleTop = handleVisible
    ? HEADER_HEIGHT +
      (selectedRow - (hasVisible ? visible.y : 0)) * ROW_HEIGHT +
      (hasVisible ? visible.ty : 0) +
      (ROW_HEIGHT - HANDLE_SIZE) / 2
    : 0;

  const grid = (
    <div className={fullscreen ? "flex flex-col h-full" : "space-y-2"}>
      <div className="flex items-center gap-2 text-xs">
        <input
          type="text"
          placeholder="Filter…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            resetRowFocus();
          }}
          className="flex-1 min-w-0 rounded border border-border bg-background px-2 py-1 outline-none focus:border-foreground/40"
        />
        <span className="text-muted-foreground whitespace-nowrap">
          {sorted.length.toLocaleString()} / {rows.length.toLocaleString()} row
          {rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        className={`${fullscreen ? "flex-1 min-h-0" : ""} relative rounded-lg border border-border overflow-hidden`}
        style={fullscreen ? undefined : { height: gridHeight }}
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
          onColumnResize={onColumnResize}
          gridSelection={gridSel}
          onGridSelectionChange={onGridSelectionChange}
          onVisibleRegionChanged={onVisibleRegionChanged}
          freezeColumns={1}
          getCellsForSelection={true}
          keybindings={{ copy: true }}
          theme={theme}
          rowMarkers="none"
        />
        {handleVisible && (
          <button
            type="button"
            onMouseDown={(e) => {
              // Prevent glide's canvas from swallowing the click and
              // re-selecting the underlying cell.
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setDetailRowIndex(selectedRow!);
            }}
            aria-label={t("csv.rowDetail.open")}
            title={t("csv.rowDetail.open")}
            className="pointer-events-auto absolute flex items-center justify-center rounded border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors"
            style={{
              top: handleTop,
              left: 4,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              zIndex: 30,
            }}
          >
            <HandleIcon />
          </button>
        )}
      </div>
    </div>
  );

  const detailValues =
    detailRowIndex !== null ? sorted[detailRowIndex] : undefined;

  const modal = detailValues ? (
    <RowDetailModal
      header={header}
      values={detailValues}
      numericCols={numericCols}
      rowNumber={detailRowIndex! + 1}
      totalRows={sorted.length}
      onClose={() => setDetailRowIndex(null)}
    />
  ) : null;

  return (
    <>
      {grid}
      {modal}
    </>
  );
}

interface RowDetailModalProps {
  header: string[];
  values: string[];
  numericCols: boolean[];
  rowNumber: number;
  totalRows: number;
  onClose: () => void;
}

function RowDetailModal({
  header,
  values,
  numericCols,
  rowNumber,
  totalRows,
  onClose,
}: RowDetailModalProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const subtitle = t("csv.rowDetail.rowOf")
    .replace("{n}", rowNumber.toLocaleString())
    .replace("{total}", totalRows.toLocaleString());
  const emptyPlaceholder = t("csv.rowDetail.empty");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-background shadow-xl p-6
                   animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {t("csv.rowDetail.title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("csv.rowDetail.close")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4">
          {header.map((name, i) => {
            const value = values[i] ?? "";
            const isEmpty = value.length === 0;
            return (
              <div key={i}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {name || `col ${i + 1}`}
                </div>
                <div
                  className={`mt-1 text-sm break-words whitespace-pre-wrap ${
                    isEmpty
                      ? "text-muted-foreground"
                      : numericCols[i]
                        ? "font-mono"
                        : ""
                  }`}
                >
                  {isEmpty ? emptyPlaceholder : value}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HandleIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="6" cy="4" r="1.1" />
      <circle cx="10" cy="4" r="1.1" />
      <circle cx="6" cy="8" r="1.1" />
      <circle cx="10" cy="8" r="1.1" />
      <circle cx="6" cy="12" r="1.1" />
      <circle cx="10" cy="12" r="1.1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4 L12 12 M12 4 L4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
