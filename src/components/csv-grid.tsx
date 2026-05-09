"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CompactSelection,
  DataEditor,
  type DataEditorRef,
  GridCellKind,
  type DataEditorProps,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Rectangle,
  type Theme,
} from "@glideapps/glide-data-grid";

// glide-data-grid v6 dropped the `emptyGridSelection` named export.
// The shape stayed the same; we just construct it from the empty
// CompactSelection helper now. Frozen because both fields are
// referentially compared by glide on every render.
const EMPTY_GRID_SELECTION: GridSelection = Object.freeze({
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
}) as GridSelection;
import "@glideapps/glide-data-grid/dist/index.css";
import {
  parseDelimitedWithSpans,
  inferNumericColumns,
  isNumeric,
  type CellSpan,
} from "@/lib/csv/parse";
import { useT } from "@/lib/i18n/context";
import { useFullscreen } from "@/components/workspace/fullscreen-context";
import { useEditableSurface } from "@/components/workspace/inline-edit";
import type { EditRequest } from "@/components/workspace/inline-edit";

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

  const { header, rows, numericCols, headerSpans, bodySpans, bomBytes } = useMemo(() => {
    const parsed = parseDelimitedWithSpans(content, delim);
    if (parsed.values.length === 0) {
      return {
        header: [] as string[],
        rows: [] as string[][],
        numericCols: [] as boolean[],
        headerSpans: [] as CellSpan[],
        bodySpans: [] as CellSpan[][],
        bomBytes: parsed.bomBytes,
      };
    }
    const head = parsed.values[0]!;
    const body = parsed.values.slice(1);
    const nums = inferNumericColumns(body, head.length);
    return {
      header: head,
      rows: body,
      numericCols: nums,
      headerSpans: parsed.spans[0] ?? [],
      bodySpans: parsed.spans.slice(1),
      bomBytes: parsed.bomBytes,
    };
  }, [content, delim]);
  void headerSpans; // header cell editing not in v1; keep parsed for future use.

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

  // `sourceIndex` is the row's position in the unfiltered, unsorted body
  // — what `bodySpans[i]` indexes against. We thread it through filter
  // + sort so the inline-edit modal can resolve a displayed-row click
  // back to the right source bytes.
  interface IndexedRow {
    values: string[];
    sourceIndex: number;
  }
  const indexed = useMemo<IndexedRow[]>(
    () => rows.map((values, sourceIndex) => ({ values, sourceIndex })),
    [rows],
  );
  const filtered = useMemo(() => {
    if (!query.trim()) return indexed;
    const q = query.toLowerCase();
    return indexed.filter((r) =>
      r.values.some((cell) => cell.toLowerCase().includes(q)),
    );
  }, [indexed, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { col, dir } = sort;
    const numeric = numericCols[col];
    const copy = filtered.slice();
    copy.sort((a, b) => {
      const av = a.values[col] ?? "";
      const bv = b.values[col] ?? "";
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
  const [gridSel, setGridSel] = useState<GridSelection>(EMPTY_GRID_SELECTION);
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
    setGridSel(EMPTY_GRID_SELECTION);
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
      const value = sorted[row]?.values[col] ?? "";
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

  // Two-state cell model — mirrors Excel's "Selected vs Edit Mode"
  // (Google Sheets calls it "Active vs Editing"; glide's term is
  // "selection vs activated"). State A = `gridSel.current.cell` is set
  // but `activeCell` is null; State B = activeCell matches the current
  // selection.
  //
  // A → B is ONLY via Enter or double-click. We deliberately don't use
  // "re-click on same cell" — trackpads frequently produce two events
  // for what users perceive as one click, and the resulting accidental
  // state-B was the original UX bug report. Sticking to Enter / double-
  // click (the canonical Excel "F2 vs double-click" trigger) gives the
  // user explicit control.
  //
  // B → A happens automatically when selection moves to a different
  // cell (handled in onGridSelectionChange below).
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null);

  const sameCell = (
    a: [number, number] | null,
    b: readonly [number, number] | undefined,
  ): boolean => !!a && !!b && a[0] === b[0] && a[1] === b[1];

  const onGridSelectionChange = useCallback(
    (sel: GridSelection) => {
      setGridSel(sel);
      // Drop active state if selection moves off the active cell. We
      // intentionally don't clear when selection shrinks to "no cell"
      // because that fires during glide's internal click handling
      // before it sets the new cell — clearing here would cancel state B
      // on every click. Instead, only clear when there IS a new cell
      // and it doesn't match.
      const cell = sel.current?.cell;
      if (activeCell && cell && !sameCell(activeCell, cell)) {
        setActiveCell(null);
      }
    },
    [activeCell],
  );

  // Enter / double-click → state B. Glide fires this regardless of
  // `allowOverlay`, so we get the activation event even with the
  // overlay editor disabled.
  const onCellActivated: NonNullable<DataEditorProps["onCellActivated"]> = (
    cell,
  ) => {
    setActiveCell([cell[0], cell[1]]);
  };

  // Surface for the inline-edit modal — null on the public /p/<slug>
  // viewer where the EditableSurface isn't mounted. The same hook is
  // re-read inside RowDetailModal because that modal portals out of
  // this component's DOM subtree, so children below need their own
  // context lookup.
  const surface = useEditableSurface();

  // Build an EditRequest for cell (sourceRowIndex, col) with the cell's
  // current parsed value. Shared between the row-detail modal pencil
  // and the new floating edit button on the grid itself, so both paths
  // produce identical bytes for `huozi_edit`.
  const requestCellEdit = useCallback(
    (sourceRowIndex: number, col: number, value: string) => {
      if (!surface) return;
      const span = bodySpans[sourceRowIndex]?.[col];
      if (!span) return;
      // Spans are post-BOM offsets; we add bomBytes back to get
      // file-absolute byte positions for huozi_edit.
      const fileStart = span[0] + bomBytes;
      const fileEnd = span[1] + bomBytes;
      const req: EditRequest = {
        objectKind: "csv-cell",
        initialText: value,
        locator: {
          kind: "csv-cell",
          start: fileStart,
          end: fileEnd,
          delim,
        },
      };
      surface.requestEdit(req);
    },
    [surface, bodySpans, bomBytes, delim],
  );

  // Glide ref so we can call getBounds() to position the floating Edit
  // pill next to whichever cell the user has selected. Recomputes on
  // selection change and when the visible region scrolls.
  //
  // gotcha: glide's getBounds() returns VIEWPORT-relative coords (it
  // adds the canvas's getBoundingClientRect off the top), but our pill
  // is `position: absolute` inside the grid wrapper div — meaning we
  // need WRAPPER-relative coords. Without subtracting the wrapper's
  // own boundingRect, the pill drifted hundreds of pixels off in
  // default mode (where the wrapper sits below the page header).
  // Fullscreen happened to look right because the wrapper's rect is
  // (0, 0) — fixed inset-0 — so subtraction was a no-op.
  const editorRef = useRef<DataEditorRef>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [editBtnRect, setEditBtnRect] = useState<Rectangle | null>(null);
  useEffect(() => {
    const cell = gridSel.current?.cell;
    const range = gridSel.current?.range;
    // Only show for single-cell selection. Multi-cell drag → no button
    // (one save = one cell).
    const single =
      cell && range && range.width === 1 && range.height === 1;
    if (!single || !editorRef.current) {
      setEditBtnRect(null);
      return;
    }
    // Defer one frame so glide commits its render before we ask for
    // the cell bounds — otherwise getBounds may return stale
    // pre-selection coords.
    const id = requestAnimationFrame(() => {
      const b = editorRef.current?.getBounds(cell[0], cell[1]);
      const wrapper = wrapperRef.current?.getBoundingClientRect();
      if (!b || !wrapper) {
        setEditBtnRect(null);
        return;
      }
      setEditBtnRect({
        x: b.x - wrapper.x,
        y: b.y - wrapper.y,
        width: b.width,
        height: b.height,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [gridSel, visible]);

  // Resolve CSS theme tokens at mount. Glide renders to a canvas so
  // it can't consume CSS custom properties directly — we read the
  // computed values once and pass them as concrete hex strings. A
  // theme change triggers a full reload (see `theme-grid.tsx`), so
  // we don't need a MutationObserver here.
  const theme = useMemo<Partial<Theme>>(() => {
    if (typeof window === "undefined") {
      return {
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        baseFontStyle: "12px",
        headerFontStyle: "600 12px",
        cellHorizontalPadding: 10,
        headerIconSize: 14,
      };
    }
    const cs = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    const background = get("--background", "#faf8f3");
    const muted = get("--muted", "#f3efe6");
    const border = get("--border", "#ddd4c2");
    const foreground = get("--foreground", "#2d2519");
    const mutedFg = get("--muted-foreground", "#6b5d4b");
    const accent = get("--accent", "#c4594a");
    const accentFg = get("--accent-foreground", "#faf8f3");
    const fontSans = get("--font-sans-stack", "");
    return {
      fontFamily:
        fontSans ||
        "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      baseFontStyle: "12px",
      headerFontStyle: "600 12px",
      cellHorizontalPadding: 10,
      headerIconSize: 14,
      accentColor: accent,
      accentLight: hexWithAlpha(accent, 0.14),
      accentFg,
      // Match the page surface tokens so the grid feels native to
      // whichever theme is active (warm cream in default, vivid
      // yellow + black in brutal).
      bgCell: background,
      bgCellMedium: muted,
      bgHeader: muted,
      bgHeaderHovered: muted,
      bgHeaderHasFocus: muted,
      borderColor: border,
      horizontalBorderColor: border,
      textDark: foreground,
      textMedium: mutedFg,
      textLight: mutedFg,
      textHeader: foreground,
      textGroupHeader: foreground,
    };
  }, []);

  // Space-key shortcut to open row detail — only fires in State A
  // (cell selected, not yet activated). In State B (`activeCell` set),
  // Space is a no-op so the user can press it without surprise.
  // Plain inline function — not a hot path, no need for memoization.
  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== " " && e.code !== "Space") return;
    if (activeCell) return; // State B → Space is inert
    const cell = gridSel.current?.cell;
    if (!cell) return;
    e.preventDefault();
    e.stopPropagation();
    setDetailRowIndex(cell[1]);
  };

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
  const hasSelection = selectedRow !== undefined;

  const grid = (
    <div
      className={
        fullscreen ? "flex flex-col h-full gap-3" : "space-y-2"
      }
      onKeyDown={onGridKeyDown}
    >
      <div
        // In fullscreen the FullscreenContent wrapper places its
        // top-right action chrome (Share / close) at fixed top-4 right-4.
        // Reserve enough right-padding here so the filter input doesn't
        // run under those buttons. 9rem covers Share + close + pager
        // with room to spare; default mode keeps the natural width.
        className={`flex items-center gap-2 text-xs ${
          fullscreen ? "pr-36" : ""
        }`}
      >
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
        {hasSelection && !activeCell && (
          <span
            className="text-muted-foreground whitespace-nowrap hidden sm:inline"
            title={t("csv.rowDetail.open")}
          >
            {t("csv.rowDetail.openHint")}
          </span>
        )}
        <span className="text-muted-foreground whitespace-nowrap">
          {sorted.length.toLocaleString()} / {rows.length.toLocaleString()} row
          {rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        ref={wrapperRef}
        className={`huozi-csv-grid ${fullscreen ? "flex-1 min-h-0" : ""} relative rounded-lg border border-border overflow-hidden`}
        style={fullscreen ? undefined : { height: gridHeight }}
      >
        <DataEditor
          ref={editorRef}
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
          onCellActivated={onCellActivated}
          onVisibleRegionChanged={onVisibleRegionChanged}
          freezeColumns={1}
          getCellsForSelection={true}
          // Override glide's default activateCell binding (which is
          // " |Enter|shift+Enter") to drop Space — Space is reserved
          // for our "view row detail" shortcut. Enter / Shift+Enter
          // still trigger glide's activation → onCellActivated → state B.
          keybindings={{ copy: true, activateCell: "Enter|shift+Enter" }}
          theme={theme}
          rowMarkers="none"
        />
        {editBtnRect &&
          surface &&
          detailRowIndex === null &&
          (() => {
            // Edit pill only shows in State B (activated cell), and
            // only when the activated cell matches the currently-
            // selected one. State A presents nothing — keeps
            // first-click selection visually quiet.
            const cell = gridSel.current?.cell;
            if (!cell) return null;
            if (!sameCell(activeCell, cell)) return null;
            const [col, row] = cell;
            const value = sorted[row]?.values[col] ?? "";
            const sourceIndex = sorted[row]?.sourceIndex;
            if (sourceIndex === undefined) return null;
            const PILL_W = 44;
            const PILL_H = 22;
            // Sit just above the cell's top-right corner; if there's
            // no room above (top row), fall back to inside the cell.
            const above = editBtnRect.y - PILL_H - 2 > HEADER_HEIGHT;
            const top = above
              ? editBtnRect.y - PILL_H - 2
              : editBtnRect.y + 2;
            const left = Math.max(
              0,
              editBtnRect.x + editBtnRect.width - PILL_W - 2,
            );
            return (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  requestCellEdit(sourceIndex, col, value);
                }}
                title={t("editor.inline.button")}
                aria-label={t("editor.inline.button")}
                className="huozi-edit-pill pointer-events-auto absolute flex items-center justify-center rounded text-xs font-medium bg-accent text-accent-foreground hover:opacity-90 border border-border shadow-sm"
                style={{
                  top,
                  left,
                  width: PILL_W,
                  height: PILL_H,
                  zIndex: 30,
                }}
              >
                {t("editor.inline.button")}
              </button>
            );
          })()}
      </div>
    </div>
  );

  const detailRow =
    detailRowIndex !== null ? sorted[detailRowIndex] : undefined;

  const modal = detailRow ? (
    <RowDetailModal
      header={header}
      values={detailRow.values}
      sourceRowIndex={detailRow.sourceIndex}
      numericCols={numericCols}
      rowNumber={detailRowIndex! + 1}
      totalRows={sorted.length}
      requestCellEdit={(sourceIndex, col, value) => {
        requestCellEdit(sourceIndex, col, value);
        setDetailRowIndex(null);
      }}
      canEdit={surface !== null}
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
  sourceRowIndex: number;
  numericCols: boolean[];
  rowNumber: number;
  totalRows: number;
  /** Same `requestCellEdit` the parent grid uses — sharing it keeps the
   *  edit flow identical whether the user clicked a cell directly or
   *  drilled into the row detail. */
  requestCellEdit: (sourceRowIndex: number, col: number, value: string) => void;
  /** Truthy iff an EditableSurface is mounted above us — when null,
   *  hide the per-field pencils. */
  canEdit: boolean;
  onClose: () => void;
}

function RowDetailModal({
  header,
  values,
  sourceRowIndex,
  numericCols,
  rowNumber,
  totalRows,
  requestCellEdit,
  canEdit,
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

        <div className="divide-y divide-border/40">
          {header.map((name, i) => {
            const value = values[i] ?? "";
            const isEmpty = value.length === 0;
            return (
              <div
                key={i}
                className="group flex items-start gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0">
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
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => requestCellEdit(sourceRowIndex, i, value)}
                    title={t("editor.inline.button")}
                    aria-label={t("editor.inline.button")}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-foreground mt-1"
                  >
                    <PencilIcon />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/** Convert a CSS color string into rgba(...) with the given alpha.
 *  Accepts #rgb, #rrggbb, or any rgb()/hsl() — for non-hex inputs we
 *  fall back to a transparent overlay since Glide accepts any CSS
 *  color string for accentLight. */
function hexWithAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return c;
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 2 L14 5 L5 14 L2 14 L2 11 Z" />
      <path d="M9 4 L12 7" />
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
