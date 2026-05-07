"use client";

/**
 * Renderer for `.jsonl` Collection files. See `app/docs/four-types.md`.
 *
 * Four toggleable views over the same parsed data:
 *   - Current  : one card per id, latest folded state (default)
 *   - Stream   : every line as its own card, latest first
 *   - Table    : top-level fields union'd into columns (glide-data-grid)
 *   - Timeline : drill-down into one entity's lifeline
 *
 * Empty file → onboarding hint with a copy-pasteable agent prompt.
 * Parse errors are surfaced inline (not thrown) so a partially-broken
 * file still shows the lines that did parse.
 */

import { useMemo, useState, useCallback } from "react";
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useT } from "@/lib/i18n/context";
import {
  parseJsonl,
  type CollectionLine,
  type ParseError,
} from "@/lib/jsonl/parse";
import { fieldUnion, foldByEntity, type EntityState } from "@/lib/jsonl/fold";

type ViewMode = "current" | "stream" | "table" | "timeline";

const VIEW_MODES: readonly ViewMode[] = [
  "current",
  "stream",
  "table",
  "timeline",
];

const EMPTY_GRID_SELECTION: GridSelection = Object.freeze({
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
}) as GridSelection;

export interface CollectionViewProps {
  /** Raw .jsonl file content. */
  content: string;
}

export function CollectionView({ content }: CollectionViewProps) {
  const t = useT();

  const { lines, errors } = useMemo(() => parseJsonl(content), [content]);
  const folded = useMemo(() => foldByEntity(lines), [lines]);

  const [view, setView] = useState<ViewMode>("current");
  const [drillEntityId, setDrillEntityId] = useState<string | null>(null);

  // Empty state — no parsed lines at all.
  if (lines.length === 0 && errors.length === 0) {
    return <EmptyState t={t} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header: counts + view switcher */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/50">
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span>
            {t("ws.coll.entities").replace("{n}", String(folded.length))}
          </span>
          <span className="opacity-50">·</span>
          <span>
            {t("ws.coll.events").replace("{n}", String(lines.length))}
          </span>
          {errors.length > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span className="text-amber-600 dark:text-amber-400">
                {t("ws.coll.errors").replace("{n}", String(errors.length))}
              </span>
            </>
          )}
        </div>

        <ViewSwitcher
          mode={view}
          onChange={(m) => {
            setView(m);
            // Leaving timeline without an entity selected returns to a
            // sane default; entering timeline picks the first entity.
            if (m === "timeline" && !drillEntityId && folded.length > 0) {
              setDrillEntityId(folded[0]!.id);
            }
          }}
          t={t}
        />
      </header>

      {/* Parse errors strip — always visible above the chosen view */}
      {errors.length > 0 && <ErrorsStrip errors={errors} />}

      {/* Body */}
      {view === "current" && (
        <CurrentView
          entities={folded}
          onDrill={(id) => {
            setDrillEntityId(id);
            setView("timeline");
          }}
          t={t}
        />
      )}
      {view === "stream" && <StreamView lines={lines} />}
      {view === "table" && <TableView lines={lines} />}
      {view === "timeline" && (
        <TimelineView
          entities={folded}
          activeId={drillEntityId}
          onPick={setDrillEntityId}
          t={t}
        />
      )}
    </div>
  );
}

/* ── View switcher ────────────────────────────────────────────────── */

function ViewSwitcher({
  mode,
  onChange,
  t,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex gap-1">
      {VIEW_MODES.map((m) => {
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
              active
                ? "border-foreground/40 bg-foreground text-background"
                : "border-border/60 text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {t(`ws.coll.view.${m}`)}
          </button>
        );
      })}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */

function EmptyState({ t }: { t: (k: string) => string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-6">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-serif text-3xl text-accent leading-none">集</span>
        <h3 className="font-serif text-base font-bold">
          {t("ws.coll.empty.title")}
        </h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {t("ws.coll.empty.body")}
      </p>
      <pre className="text-[11px] text-muted-foreground font-mono whitespace-pre-wrap break-words bg-background/60 rounded p-3 border border-border/40">
        {t("ws.coll.empty.prompt")}
      </pre>
    </div>
  );
}

/* ── Errors strip ─────────────────────────────────────────────────── */

function ErrorsStrip({ errors }: { errors: readonly ParseError[] }) {
  return (
    <details className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
        {errors.length} parse error{errors.length === 1 ? "" : "s"} —
        click to inspect
      </summary>
      <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto font-mono">
        {errors.map((e) => (
          <li key={e.lineNumber} className="text-muted-foreground">
            <span className="text-amber-600 dark:text-amber-400">
              line {e.lineNumber}
            </span>{" "}
            <span className="opacity-60">[{e.reason}]</span>{" "}
            <span className="break-all">{e.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ── Current view: one card per folded entity ────────────────────── */

function CurrentView({
  entities,
  onDrill,
  t,
}: {
  entities: readonly EntityState[];
  onDrill: (id: string) => void;
  t: (k: string) => string;
}) {
  if (entities.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        No entities (only parse errors above).
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {entities.map((e) => (
        <EntityCard key={e.id} entity={e} onDrill={onDrill} t={t} />
      ))}
    </div>
  );
}

function EntityCard({
  entity,
  onDrill,
  t,
}: {
  entity: EntityState;
  onDrill: (id: string) => void;
  t: (k: string) => string;
}) {
  const isDeleted = entity.status === "deleted";
  const fields = stripConventions(entity.state);
  const fieldEntries = Object.entries(fields).slice(0, 6);

  return (
    <button
      type="button"
      onClick={() => onDrill(entity.id)}
      className={`text-left rounded-lg border bg-background p-3 transition-colors hover:bg-muted/30 ${
        isDeleted
          ? "border-border/30 opacity-60"
          : "border-border/60"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <code className="text-xs font-mono text-foreground truncate">
          {entity.id}
        </code>
        {isDeleted && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
            {t("ws.coll.deleted")}
          </span>
        )}
      </div>

      {fieldEntries.length > 0 && (
        <dl className="space-y-1 mb-2">
          {fieldEntries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[11px] leading-tight">
              <dt className="text-muted-foreground shrink-0 font-mono">
                {k}
              </dt>
              <dd className="text-foreground truncate font-mono">
                {formatScalar(v)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <footer className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-border/30 mt-2">
        {entity.latest.at && (
          <time className="font-mono">{shortAt(entity.latest.at)}</time>
        )}
        {entity.latest.by && (
          <>
            <span className="opacity-40">·</span>
            <span className="font-mono">{entity.latest.by}</span>
          </>
        )}
        <span className="ml-auto text-muted-foreground/60">
          {entity.history.length}↺
        </span>
      </footer>
    </button>
  );
}

/* ── Stream view: every line as its own card, latest first ────────── */

function StreamView({ lines }: { lines: readonly CollectionLine[] }) {
  // Latest first — file order is typically chronological so reverse works.
  const reversed = useMemo(() => [...lines].reverse(), [lines]);
  return (
    <ul className="space-y-2">
      {reversed.map((ln) => (
        <li key={ln.lineNumber}>
          <EventCard line={ln} />
        </li>
      ))}
    </ul>
  );
}

function EventCard({ line }: { line: CollectionLine }) {
  const fields = stripConventions(line.fields);
  const hasFields = Object.keys(fields).length > 0;
  return (
    <article className="rounded-lg border border-border/60 bg-background px-3 py-2.5">
      <header className="flex flex-wrap items-baseline gap-2 mb-1.5">
        <code className="text-xs font-mono">{line.id}</code>
        {line.op && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground font-mono">
            {line.op}
          </span>
        )}
        {line.at && (
          <time className="text-[10px] text-muted-foreground font-mono ml-auto">
            {shortAt(line.at)}
          </time>
        )}
        {line.by && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {line.by}
          </span>
        )}
      </header>
      {hasFields && (
        <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
          {formatFields(fields)}
        </pre>
      )}
    </article>
  );
}

/* ── Table view: glide-data-grid over union of fields ─────────────── */

function TableView({ lines }: { lines: readonly CollectionLine[] }) {
  const fieldCols = useMemo(() => fieldUnion([...lines]), [lines]);

  // Conventions first, then union'd fields.
  const columns: GridColumn[] = useMemo(
    () => [
      { id: "id", title: "id", width: 180 },
      { id: "at", title: "at", width: 180 },
      { id: "by", title: "by", width: 140 },
      { id: "op", title: "op", width: 120 },
      ...fieldCols.map((f) => ({ id: f, title: f, width: 160 })),
    ],
    [fieldCols],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const ln = lines[row]!;
      const colId = columns[col]!.id ?? "";
      let raw: unknown;
      switch (colId) {
        case "id":
          raw = ln.id;
          break;
        case "at":
          raw = ln.at ?? "";
          break;
        case "by":
          raw = ln.by ?? "";
          break;
        case "op":
          raw = ln.op ?? "";
          break;
        default:
          raw = ln.fields[colId];
      }
      const display = formatScalar(raw);
      return {
        kind: GridCellKind.Text,
        data: display,
        displayData: display,
        allowOverlay: false,
      };
    },
    [lines, columns],
  );

  return (
    <div
      className="rounded-lg border border-border/60 overflow-hidden"
      style={{ height: "min(70vh, 600px)" }}
    >
      <DataEditor
        columns={columns}
        rows={lines.length}
        getCellContent={getCellContent}
        smoothScrollX
        smoothScrollY
        rowMarkers="number"
        gridSelection={EMPTY_GRID_SELECTION}
        width="100%"
        height="100%"
      />
    </div>
  );
}

/* ── Timeline view: pick an entity → vertical lifeline ────────────── */

function TimelineView({
  entities,
  activeId,
  onPick,
  t,
}: {
  entities: readonly EntityState[];
  activeId: string | null;
  onPick: (id: string | null) => void;
  t: (k: string) => string;
}) {
  if (entities.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        No entities to chart.
      </div>
    );
  }

  const active =
    entities.find((e) => e.id === activeId) ?? entities[0]!;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
      {/* Left: entity picker */}
      <aside className="rounded-lg border border-border/60 max-h-[60vh] overflow-y-auto">
        <ul>
          {entities.map((e) => {
            const selected = e.id === active.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onPick(e.id)}
                  className={`w-full text-left px-3 py-2 text-xs font-mono border-b border-border/30 transition-colors ${
                    selected
                      ? "bg-accent/10 text-accent"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <div className="truncate">{e.id}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex justify-between">
                    <span>{e.history.length}↺</span>
                    {e.status === "deleted" && (
                      <span>{t("ws.coll.deleted")}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Right: timeline of the chosen entity */}
      <div>
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <code className="text-sm font-mono">{active.id}</code>
          <span className="text-[11px] text-muted-foreground">
            {active.history.length} events
          </span>
        </header>
        <ol className="relative pl-5 border-l-2 border-border/40 space-y-3">
          {active.history.map((ln) => (
            <li key={ln.lineNumber} className="relative">
              <span
                className="absolute -left-[27px] top-2 w-3 h-3 rounded-full bg-background border-2 border-border"
                aria-hidden
              />
              <EventCard line={ln} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Strip the four conventions (id/at/by/op) from a state object. */
function stripConventions(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (k === "id" || k === "at" || k === "by" || k === "op") continue;
    out[k] = obj[k];
  }
  return out;
}

/** Render a scalar value to a one-line display string. */
function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Objects / arrays render as compact JSON; renderer will truncate.
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Pretty-print a fields object for the event card body. */
function formatFields(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    const display =
      typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v, null, 0);
    lines.push(`${k}: ${display}`);
  }
  return lines.join("\n");
}

/** Compact `at` display: keep the date and HH:MM if present. */
function shortAt(at: string): string {
  // Very small heuristic — full parsing is overkill for v1. If the
  // string starts with YYYY-MM-DD, also keep HH:MM if a "T" separator
  // is found. Otherwise show as-is.
  const m = at.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m) return at;
  return m[2] ? `${m[1]} ${m[2]}` : m[1]!;
}
