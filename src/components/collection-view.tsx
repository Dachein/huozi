"use client";

/**
 * Renderer for `.jsonl` Collection files. See `app/docs/four-types.md`.
 *
 * Two views, navigation between them:
 *   - List   : one card per entity (latest folded state) — the default
 *   - Detail : one entity's full record + chronological timeline
 *
 * Click a card on the list to drill into detail. Click "← Back" in
 * detail to return to the list.
 *
 * If the file contains schema events (`op:"schema"`), they are folded
 * (deep-merge, latest-wins per field) and used to drive rendering:
 * which field is the title, which is the avatar, where each field
 * appears in the layout (headline / subheadline / meta / aside / body).
 * Without a schema, the renderer falls back to id-as-title and shows
 * the first few fields as a generic key/value list.
 *
 * Empty file → onboarding hint with a copy-pasteable agent prompt.
 * Parse errors are surfaced inline (not thrown) so a partially-broken
 * file still shows the lines that did parse.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useT } from "@/lib/i18n/context";
import {
  parseJsonl,
  type CollectionLine,
  type ParseError,
} from "@/lib/jsonl/parse";
import { foldByEntity, foldSchema, type EntityState } from "@/lib/jsonl/fold";
import { useEditableSurface } from "@/components/workspace/inline-edit";
import { ListDetailLayout } from "@/components/list-detail-layout";
import { useEntityNavigator } from "@/components/use-entity-navigator";
import {
  FieldValue,
  type FieldDef,
} from "@/components/jsonl-field-widgets";

/** A select-type option as declared in the schema. */
interface FieldOption {
  value: string;
  label?: string;
  color?: string;
}

/** Subset of the schema config that this renderer consumes. */
interface SchemaConfig {
  entity?: {
    title_field?: string;
    subtitle_field?: string;
    avatar_field?: string;
  };
  fields?: Record<
    string,
    {
      label?: string;
      display?: "headline" | "subheadline" | "avatar" | "body" | "meta" | "aside";
      type?: string;
      filterable?: boolean;
      searchable?: boolean;
      options?: FieldOption[];
      /** Hide this field from the detail view entirely. List-pane chips
       *  and card kvs honor this too. Useful for internal ids / timestamps
       *  the author doesn't want surfaced to readers. */
      hide?: boolean;
      /** Custom placeholder shown in place of the default `—` when the
       *  field's value is empty (null / undefined / "" / []). */
      empty_placeholder?: string;
      /** Conditional display: only render this field when another field
       *  on the same entity equals the given value. Simple equality only;
       *  for richer expressions, drop to a dashboard format. */
      show_when?: { field: string; equals: unknown };
      /** Force cardinality. `false` = always render as single (uses first
       *  item of an array); `true` = always render as array (wraps single
       *  values). When unset, auto-detected from value shape. */
      multi?: boolean;
      /** For `type: "datetime"` only. Picks a curated rendering format:
       *  `relative` (5d/17h/now), `date` (2026/05/20), `month_day` (05/20),
       *  `month` (2026/05), `year` (2026), `time` (10:20), `datetime`
       *  (2026/05/20 10:20), `datetime_full` (2026/05/20 10:20:44),
       *  `zh_date` (2026 年 5 月 20 日), `zh_datetime` (with seconds).
       *  List-row timestamps default to `relative`; detail defaults to
       *  `datetime` unless this is set. */
      format?: string;
    }
  >;
  /**
   * Detail-view groups — Notion-style sectioned layout. When present,
   * `fields[].display` slot allocation is IGNORED for the detail view
   * (XOR with slots). Fields listed in any group render in that group;
   * declared fields NOT in any group still render in a tail "Other"
   * pseudo-section so authors don't accidentally hide them by forgetting
   * to list them. Within a group, fields render in the order given.
   */
  groups?: {
    title: string;
    fields: string[];
    /** Default-collapsed group. User can expand from the chevron. */
    collapsed?: boolean;
  }[];
  detail_view?: {
    /** Hide the small `<code>entity_id</code>` line under the title. */
    show_id?: boolean;
    /** Explicit display order for groups (defaults to the array order
     *  in `groups`). Strings must match `group.title` exactly. */
    groups_order?: string[];
  };
  list_view?: {
    /** Field keys to expose as filter dropdowns. */
    filters?: string[];
    /** Field keys to substring-match against when the user types in the search box. */
    search?: string[];
    /** Up to ~2 field keys to surface as compact type-aware chips on each
     *  list row. Each chip renders via the field's declared widget (status
     *  gets its color, options get their label, datetime gets formatted,
     *  etc.). When unset, EntityRow falls back to auto-picking the first
     *  two display:meta/aside fields.
     *
     *  Superseded by `row` when both are set (row's 4-slot layout takes over).
     */
    row_chips?: string[];
    /**
     * 5-slot named layout for the list row (mail-client style — same
     * vocabulary you'd see in Outlook, Linear, Apple Mail). Overrides
     * the legacy title+subtitle+row_chips fallback. Each slot maps to
     * a field key on the entity; the value renders via that field's
     * type-aware widget.
     *
     *   ┌────────────────────────────────────────────┐
     *   │ title (bold)                  tag   time   │
     *   │ subtitle (medium gray)                     │
     *   │ preview (small gray, 2 lines)              │
     *   └────────────────────────────────────────────┘
     *
     * - `title`     defaults to `entity.title_field`. Falls back to
     *               `entity.id` only when the mapped field is empty.
     * - `subtitle`  defaults to `entity.subtitle_field`.
     * - `preview`   no default — multi-line excerpt (line-clamped at 2).
     * - `tag`       no default — single subtle chip via the field's
     *               type widget (status colors carry as dots).
     * - `timestamp` no default — always rendered as RELATIVE time on
     *               the list row (`5d`, `17h`, `now`) regardless of the
     *               field's declared type. Fallback when omitted = the
     *               entity's commit `at`.
     */
    row?: {
      title?: string;
      subtitle?: string;
      preview?: string;
      tag?: string;
      timestamp?: string;
    };
    /**
     * Initial layout for the entity list. `"block"` (default) is the
     * grid of cards; `"list"` is a compact one-row-per-entity layout.
     * Authors set this in the schema event; users can switch from the
     * header toggle.
     */
    default_view?: "list" | "block";
  };
}

export interface CollectionViewProps {
  /** Raw .jsonl file content. */
  content: string;
}

export function CollectionView({ content }: CollectionViewProps) {
  const t = useT();

  const { lines, schemas, errors } = useMemo(() => parseJsonl(content), [content]);
  const folded = useMemo(() => foldByEntity(lines), [lines]);
  const schema = useMemo(
    () => (foldSchema(schemas) as SchemaConfig | null) ?? null,
    [schemas],
  );

  const [drillEntityId, setDrillEntityId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Index into the drilled entity's history (chronologically ordered).
  // `null` = "follow latest" — when set, the detail view renders that
  // event as the as-of point. Reset whenever the drilled entity changes
  // so switching candidates doesn't carry a stale index.
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  useEffect(() => {
    setHistoryIndex(null);
  }, [drillEntityId]);

  // Diff-peek: while the user holds Space (in detail view, outside of
  // form fields), the entity's snapshot is overlaid with subtle diff
  // markers for fields that were added / modified by the active event.
  // Default off so the snapshot reads cleanly; pressing Space is a
  // momentary "show me what changed at this step."
  const [peekDiff, setPeekDiff] = useState(false);

  // Searched entity list. This is the navigation scope — both the list
  // and detail prev/next walk this slice. (Schema-declared `filters` are
  // currently dormant — the search box is the single entry-point. Adding
  // a dropdown surface back later just means re-wiring this with a
  // `filters` state and the loop.)
  const filteredEntities = useMemo(() => {
    if (search.trim().length === 0) return folded;
    const q = search.toLowerCase();
    const searchFields = schema?.list_view?.search ?? null;
    return folded.filter((e) => {
      if (e.id.toLowerCase().includes(q)) return true;
      if (searchFields) {
        return searchFields.some((f) => {
          const v = e.state[f];
          return typeof v === "string" && v.toLowerCase().includes(q);
        });
      }
      // No schema → fall back to id + every string field on the entity.
      return Object.values(e.state).some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      );
    });
  }, [folded, search, schema]);

  // The drilled entity is resolved against the *unfiltered* set so a
  // direct link / saved id still works even if the current filters
  // would exclude it. The prev/next walk, however, uses the filtered
  // set so navigation always lands on something the user is viewing.
  const drillEntity = drillEntityId
    ? folded.find((e) => e.id === drillEntityId) ?? null
    : null;

  const entityId = useCallback((e: EntityState) => e.id, []);
  const nav = useEntityNavigator(
    filteredEntities,
    drillEntityId,
    entityId,
    setDrillEntityId,
  );

  // History-version cursor: `null` follows latest. The "effective"
  // index resolved against the current drilledEntity's history length.
  const historyLen = drillEntity?.history.length ?? 0;
  const effectiveHistoryIndex =
    historyIndex === null ? historyLen - 1 : historyIndex;
  const canGoOlder = drillEntity ? effectiveHistoryIndex > 0 : false;
  const canGoNewer = drillEntity ? effectiveHistoryIndex < historyLen - 1 : false;

  const goBack = useCallback(() => setDrillEntityId(null), []);
  const goOlderVersion = useCallback(() => {
    setHistoryIndex((cur) => {
      const eff = cur === null ? historyLen - 1 : cur;
      return Math.max(0, eff - 1);
    });
  }, [historyLen]);
  const goNewerVersion = useCallback(() => {
    setHistoryIndex((cur) => {
      const eff = cur === null ? historyLen - 1 : cur;
      const next = Math.min(historyLen - 1, eff + 1);
      // Snap back to "follow latest" when at the head — clears the
      // "viewing historical version" hint without an extra state.
      return next === historyLen - 1 ? null : next;
    });
  }, [historyLen]);

  // Keyboard (collection-specific only — ↑/↓/Esc are owned by
  // ListDetailLayout's chrome since they're generic list+detail
  // shortcuts; the list is vertical so ↑/↓ walks items):
  //   /          focus the search input (GitHub-style, no modifier)
  //   ⌘/Ctrl+K   alt focus (often intercepted by browsers though, so
  //              `/` is the primary)
  //   ←/→        older / newer version of this entity's history
  //              (timeline scrubs horizontally)
  //   Space      hold to highlight diff at the active event
  // Inputs / textareas opt out so typing isn't hijacked.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
        return;
      }

      if (drillEntity) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goOlderVersion();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          goNewerVersion();
        } else if (e.code === "Space" && !e.repeat) {
          // Hold-to-peek: highlight diff while pressed. Prevent the
          // browser's default page-down on Space.
          e.preventDefault();
          setPeekDiff(true);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setPeekDiff(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [drillEntity, goOlderVersion, goNewerVersion]);

  // Drop the peek state whenever we leave detail view, so re-entering
  // doesn't show stale highlights.
  useEffect(() => {
    if (!drillEntity) setPeekDiff(false);
  }, [drillEntity]);

  // Empty state — no parsed lines at all (and no schema either).
  if (lines.length === 0 && schemas.length === 0 && errors.length === 0) {
    return <EmptyState t={t} />;
  }

  // Email/Linear-style 3-pane: list is always a narrow vertical column,
  // detail pane is always rendered to the right (empty state when nothing
  // is selected). Grid (block) view doesn't make sense in a narrow
  // column, so the toggle is hidden and we force the row layout.
  // The list wraps its own overflow container so it scrolls inside the
  // pane (not the whole page).
  // List pane: search input pinned at the top + scrollable rows below.
  // Search is always available (regardless of schema) — falls back to
  // matching id + every string field when no schema search is declared
  // (see `filteredEntities` upstream).
  const listNode = (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="shrink-0 px-2 py-2 border-b border-border/40">
        <input
          ref={searchInputRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`${t("ws.coll.search")}  /`}
          className="w-full text-xs px-2 py-1.5 rounded border border-border/60 bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
      </div>
      <div className="huozi-scrollarea flex-1 min-h-0 overflow-y-auto">
        <RowListView
          entities={filteredEntities}
          schema={schema}
          onDrill={setDrillEntityId}
          selectedId={drillEntityId}
          t={t}
        />
      </div>
    </div>
  );

  const detailNode = drillEntity ? (
    <DetailView
      entity={drillEntity}
      schema={schema}
      historyIndex={effectiveHistoryIndex}
      isLatest={historyIndex === null}
      canGoOlder={canGoOlder}
      canGoNewer={canGoNewer}
      onOlder={goOlderVersion}
      onNewer={goNewerVersion}
      peekDiff={peekDiff}
      t={t}
    />
  ) : null;

  const detailLabel =
    drillEntity && nav.index >= 0
      ? `${nav.index + 1}/${filteredEntities.length}`
      : null;

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/50">
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span>
            {t("ws.coll.entities").replace(
              "{n}",
              String(filteredEntities.length),
            )}
            {filteredEntities.length !== folded.length ? (
              <span className="opacity-60"> / {folded.length}</span>
            ) : null}
          </span>
          <span className="opacity-50">·</span>
          <span>
            {t("ws.coll.events").replace("{n}", String(lines.length))}
          </span>
          {errors.length > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span className="text-amber-600">
                {t("ws.coll.errors").replace("{n}", String(errors.length))}
              </span>
            </>
          )}
        </div>

      </header>

      {errors.length > 0 && <ErrorsStrip errors={errors} />}

      <ListDetailLayout
        list={listNode}
        detail={detailNode}
        onClose={goBack}
        navigator={{
          goPrev: nav.goPrev,
          goNext: nav.goNext,
          canGoPrev: nav.canGoPrev,
          canGoNext: nav.canGoNext,
        }}
        detailHeader={detailLabel}
        defaultOpen={true}
        selectionKey={drillEntityId}
        emptyDetail={
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
            {filteredEntities.length === 0
              ? "—"
              : t("ws.coll.selectToRead")}
          </div>
        }
        storageKey="huozi.coll.list.width"
        defaultWidth={320}
        minWidth={240}
        maxWidth={480}
      />
    </div>
  );
}

/* ── Filter / search bar ─────────────────────────────────────────── */

/* FilterBar removed — `list_view.filters` schema entries still parse
 * but no longer surface a dropdown. The list-pane search input is the
 * single entry-point for narrowing the list (lower visual complexity,
 * one mental model). Schema's `filters` is preserved for future use. */

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
    <details className="rounded border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-amber-800 dark:text-amber-300">
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

/* ── Row list view: compact one-row-per-entity layout ─────────────── */

function RowListView({
  entities,
  schema,
  onDrill,
  selectedId,
  t,
}: {
  entities: readonly EntityState[];
  schema: SchemaConfig | null;
  onDrill: (id: string) => void;
  selectedId: string | null;
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
    <ul className="divide-y divide-border/40 border-y border-border/40">
      {entities.map((e) => (
        <EntityRow
          key={e.id}
          entity={e}
          schema={schema}
          onDrill={onDrill}
          selected={e.id === selectedId}
          t={t}
        />
      ))}
    </ul>
  );
}

function EntityRow({
  entity,
  schema,
  onDrill,
  selected,
  t,
}: {
  entity: EntityState;
  schema: SchemaConfig | null;
  onDrill: (id: string) => void;
  selected: boolean;
  t: (k: string) => string;
}) {
  const isDeleted = entity.status === "deleted";
  const fields = stripConventions(entity.state);

  // Resolve the 5 named slots. `list_view.row` is the authoritative
  // mapping; for the slots the schema doesn't pin, fall back to
  // entity-level title_field / subtitle_field.
  const rowSlots = schema?.list_view?.row;
  const titleField = rowSlots?.title ?? schema?.entity?.title_field;
  const subtitleField = rowSlots?.subtitle ?? schema?.entity?.subtitle_field;
  const previewField = rowSlots?.preview;
  const tagField = rowSlots?.tag;
  const timestampField = rowSlots?.timestamp;

  const titleStr = titleField ? pickString(fields, titleField) : null;
  // Final fallback: when no title slot resolves, fall through to id so
  // the row isn't blank — but a schema that maps `title` to an existing
  // field should never hit this.
  const title = titleStr ?? entity.id;
  const subtitle = subtitleField ? pickString(fields, subtitleField) : null;
  const preview = previewField ? pickString(fields, previewField) : null;
  const tagValue = tagField ? fields[tagField] : undefined;
  const tagDef = tagField ? schema?.fields?.[tagField] : undefined;
  // Timestamp: always rendered as relative format on list rows (mail
  // pattern). Strip to a parsable string regardless of the field's
  // declared `datetime` widget.
  const tsRaw = timestampField ? fields[timestampField] : undefined;
  const tsString =
    typeof tsRaw === "string" || typeof tsRaw === "number"
      ? String(tsRaw)
      : null;
  const useNamedSlots = !!rowSlots;

  // Compact row chips. Prefers schema-declared `list_view.row_chips`
  // (explicit author intent — pick exactly the fields they want
  // surfaced on each row). Falls back to auto-picking the first two
  // display:meta/aside fields when not declared. Each chip's value
  // renders through FieldValue so status colors / option labels /
  // formatted dates show up correctly.
  const chips = useMemo(() => {
    if (!schema?.fields) return [];
    const declared = schema.list_view?.row_chips;
    const used = new Set(
      [titleField, subtitleField, schema.entity?.avatar_field].filter(
        Boolean,
      ) as string[],
    );
    const picked: { key: string; label: string; value: unknown }[] = [];

    if (declared && declared.length > 0) {
      for (const k of declared) {
        if (used.has(k)) continue;
        const def = schema.fields[k];
        if (!def || def.hide) continue;
        if (!evalShowWhen(def.show_when, fields)) continue;
        if (!(k in fields)) continue;
        picked.push({ key: k, label: def.label ?? k, value: fields[k] });
      }
    } else {
      for (const [k, def] of Object.entries(schema.fields)) {
        if (used.has(k)) continue;
        if (def.hide) continue;
        if (!evalShowWhen(def.show_when, fields)) continue;
        if (def.display === "meta" || def.display === "aside") {
          if (k in fields) {
            picked.push({ key: k, label: def.label ?? k, value: fields[k] });
          }
        }
        if (picked.length >= 2) break;
      }
    }
    return picked;
  }, [fields, schema, titleField, subtitleField]);

  // Keep the selected row visible as the user keyboard-navigates with
  // ↑/↓. `block: "nearest"` only scrolls when the row is off-screen,
  // so clicking a visible row doesn't trigger a jump.
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) btnRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // ─── Render ────────────────────────────────────────────────────
  // Two layouts share the same hover / selected / accent-bar shell:
  //   - Named-slots (when schema.list_view.row is set): title +
  //     timestamp on the first row, subtitle + tag on the second.
  //   - Legacy: title + subtitle + auto-picked chips + entity.at +
  //     history count on a single line (backward-compatible).
  const rowShell =
    `relative w-full text-left px-3 py-2 transition-colors outline-none ${
      selected
        ? "bg-[var(--surface-elevated)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--accent)]"
        : "hover:bg-foreground/5"
    } ${isDeleted ? "opacity-60" : ""}`;

  if (useNamedSlots) {
    // Timestamp: list rows always render relative-style by default
    // (mail pattern). Schema can override per field via `format`.
    // Fallback chain: explicit `timestamp` field → entity.latest.at.
    const tsToShow = tsString ?? (entity.latest.at ?? null);
    const tsFieldDef = timestampField ? schema?.fields?.[timestampField] : undefined;
    const tsRenderDef = {
      type: "datetime" as const,
      format: tsFieldDef?.format ?? "relative",
    };
    return (
      <li>
        <button
          ref={btnRef}
          type="button"
          onClick={() => onDrill(entity.id)}
          aria-current={selected ? "true" : undefined}
          className={`${rowShell} flex flex-col gap-0.5`}
        >
          <div className="flex items-baseline gap-2 min-w-0">
            {/* Title cluster: title truncates, tag sits inline immediately
                after the title (mail/Gmail label pattern). When the title
                is long it shrinks but the tag stays visible. */}
            <div className="flex items-baseline gap-1.5 min-w-0 flex-1 overflow-hidden">
              <span className="text-[14px] font-semibold text-foreground truncate min-w-0">
                <InlineMarkdown source={title} />
              </span>
              {tagValue !== undefined && (
                <span className="shrink-0">
                  <FieldValue value={tagValue} fieldDef={tagDef} />
                </span>
              )}
            </div>
            {tsToShow && (
              <span className="shrink-0 text-[10px] text-muted-foreground/80 tabular-nums">
                <FieldValue value={tsToShow} fieldDef={tsRenderDef} />
              </span>
            )}
          </div>
          {subtitle && (
            <div className="text-[12px] text-muted-foreground truncate mt-0.5">
              {subtitle}
            </div>
          )}
          {preview && (
            <div className="text-[12px] text-muted-foreground/80 mt-1 line-clamp-2 break-words">
              {preview}
            </div>
          )}
          {isDeleted && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
              {t("ws.coll.deleted")}
            </div>
          )}
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        ref={btnRef}
        type="button"
        onClick={() => onDrill(entity.id)}
        aria-current={selected ? "true" : undefined}
        className={`${rowShell} flex items-baseline gap-3`}
      >
        <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1">
          <InlineMarkdown source={title} />
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground truncate hidden sm:inline-block max-w-[40%]">
            {subtitle}
          </span>
        )}
        {chips.map((c) => (
          <span
            key={c.key}
            className="hidden md:inline-flex items-baseline gap-1 text-[11px] text-muted-foreground shrink-0"
            title={c.label}
          >
            <span className="text-foreground/80 truncate max-w-[180px] inline-block">
              <FieldValue
                value={c.value}
                fieldDef={schema?.fields?.[c.key]}
              />
            </span>
          </span>
        ))}
        {isDeleted && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
            {t("ws.coll.deleted")}
          </span>
        )}
        {entity.latest.at && (
          <time className="text-[10px] font-mono text-muted-foreground shrink-0">
            {shortAt(entity.latest.at)}
          </time>
        )}
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {entity.history.length}↺
        </span>
      </button>
    </li>
  );
}

/* ── Tasks confirm CTA (additive overlay on Tasks Collections) ──────
 *
 * When the latest event in this entity is `op:"confirm_requested"` (a
 * Tasks-specific signal, see `app/docs/tasks.md` §9), surface an inline
 * Approve / Reject banner. Clicking POSTs to `/api/app/tasks/<id>/confirm`,
 * which appends a `user_action` event; the daemon's WebSocket subscription
 * then resumes the Claude session with the user's verdict.
 *
 * Heuristic gate: entity.id must look like a UUID v4 (the format daemon
 * + ingest use for task_id). Any non-Tasks Collection that happens to use
 * `op:"confirm_requested"` won't have UUID ids; the CTA stays hidden.
 */

const TASK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function TaskConfirmCTA({ entity }: { entity: EntityState }) {
  const last = entity.history[entity.history.length - 1];
  const visible =
    !!last && last.op === "confirm_requested" && TASK_ID_RE.test(entity.id);

  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!visible || !last) return null;

  const prompt =
    typeof last.fields["prompt"] === "string"
      ? (last.fields["prompt"] as string)
      : null;

  async function submit(action: "approve" | "reject") {
    if (pending) return;
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/app/tasks/${entity.id}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          note.trim().length > 0
            ? { action, note: note.trim() }
            : { action },
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body.message === "string"
            ? body.message
            : `Request failed (${res.status}).`,
        );
        setPending(null);
        return;
      }
      // Success — the WS commit event triggers router.refresh upstream,
      // which re-fetches the file and re-renders this Collection. The
      // last event will then be `user_action`, hiding this CTA.
      // We don't reset `pending` here because the imminent re-render
      // unmounts the component; resetting causes a brief "buttons live
      // again" flash on slow networks.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setPending(null);
    }
  }

  return (
    <section className="rounded-md border border-amber-500 bg-amber-50 px-4 py-3 dark:bg-amber-500/10 dark:border-amber-400/60">
      <div className="flex items-start gap-3 mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200">
          Waiting for your decision
        </div>
      </div>
      {prompt && (
        <p className="text-sm text-amber-950 dark:text-amber-100 mb-3 whitespace-pre-wrap break-words">
          {prompt}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (passed to the agent)…"
          rows={2}
          className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:bg-amber-950/30 dark:border-amber-700"
          disabled={pending !== null}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submit("approve")}
            disabled={pending !== null}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending === "approve" ? "Sending…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => submit("reject")}
            disabled={pending !== null}
            className="rounded border border-rose-600 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
          >
            {pending === "reject" ? "Sending…" : "Reject"}
          </button>
        </div>
        {error && (
          <div className="text-xs text-rose-700 dark:text-rose-300">{error}</div>
        )}
      </div>
    </section>
  );
}

/* ── Detail view: one entity's full record + lifeline ────────────── */

function DetailView({
  entity,
  schema,
  historyIndex,
  isLatest,
  canGoOlder,
  canGoNewer,
  onOlder,
  onNewer,
  peekDiff,
  t,
}: {
  entity: EntityState;
  schema: SchemaConfig | null;
  historyIndex: number;
  isLatest: boolean;
  canGoOlder: boolean;
  canGoNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
  /** When true, fields added/modified by the active event get a
   *  colored left-edge bar so the user can spot what changed at this
   *  step without leaving the snapshot view. Toggled by holding
   *  Space — momentary "diff peek." */
  peekDiff: boolean;
  t: (k: string) => string;
}) {
  // Resolve as-of state: when not following latest, fold only the
  // events up to and including `historyIndex`. When following latest
  // we use the parent-computed `entity.state` directly.
  const asOfState = useMemo(
    () =>
      isLatest
        ? entity.state
        : foldHistorySlice(entity.history, historyIndex),
    [entity, historyIndex, isLatest],
  );

  const fields = stripConventions(asOfState);
  const titleField = schema?.entity?.title_field;
  const subtitleField = schema?.entity?.subtitle_field;
  const avatarField = schema?.entity?.avatar_field;

  // Inline-edit surface (workspace view only; null on /p/<slug>).
  // We only emit data-obj-src markers when looking at the **latest**
  // snapshot — historical views are read-only, since the line we'd
  // modify is the latest line, not the as-of one. The selection-driven
  // edit pill (rendered by EditableSurface) is the only entry point;
  // there's no per-field click handler in this component anymore — the
  // selection hook reads our data-obj-src marker, the surface
  // reconstructs lineText/lineRaw from the inlined data-source, and
  // builds the EditRequest itself.
  const surface = useEditableSurface();
  const canEditField = (value: unknown): value is string =>
    isLatest && surface !== null && typeof value === "string";

  const title = (titleField && pickString(fields, titleField)) ?? entity.id;
  const subtitle = subtitleField ? pickString(fields, subtitleField) : null;
  const avatar = avatarField ? pickString(fields, avatarField) : null;

  // Groups + slots are XOR: if the schema declares `groups`, we use
  // the grouped path (Notion-style); otherwise we use the legacy slot
  // path (headline/subheadline/body/aside/meta/avatar). Schema authors
  // must pick one model — mixing leads to double-rendering of fields
  // listed in both.
  const useGroups = !!schema?.groups && schema.groups.length > 0;
  const slotted = useMemo(
    () => slotFields(fields, schema, titleField, subtitleField, avatarField),
    [fields, schema, titleField, subtitleField, avatarField],
  );
  const grouped = useMemo(
    () => groupFields(fields, schema, titleField, subtitleField, avatarField),
    [fields, schema, titleField, subtitleField, avatarField],
  );
  const showEntityId = schema?.detail_view?.show_id !== false;

  const activeEvent = entity.history[historyIndex];
  // Folded state right *before* the active event — used by the
  // diff peek (hold Space) to mark fields that were added or
  // modified at this step.
  const priorState = useMemo(() => {
    if (historyIndex <= 0) return {};
    return foldHistorySlice(entity.history, historyIndex - 1);
  }, [entity.history, historyIndex]);

  // Aside is jsonl's standard right column. We render it when there's
  // something for it to hold — declared aside fields, or the historical-
  // view chip when scrubbed back. Otherwise the main column takes the
  // full width. When present, the user can collapse the aside from
  // its header chevron; collapse state is per-entity (resets when the
  // user drills into a different one).
  const hasAsideFields = slotted.aside.length > 0;
  const historicalChip = !isLatest && !!activeEvent;
  const asideHasContent = hasAsideFields || historicalChip;
  const [asideCollapsed, setAsideCollapsed] = useState(false);
  useEffect(() => {
    setAsideCollapsed(false);
  }, [entity.id]);
  const asideOpen = asideHasContent && !asideCollapsed;

  return (
    <div className="flex flex-col gap-8 flex-1 min-h-0 px-4 py-4">
    <div className="flex flex-col gap-6">
      {/* Main column */}
      <main className="space-y-4">
        <header className="flex items-center gap-4 pb-3 border-b border-border/40">
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="w-16 h-16 rounded-full object-cover bg-muted shrink-0"
            />
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">
                {subtitle}
              </p>
            )}
            {showEntityId && (
              <code className="text-[10px] font-mono text-muted-foreground/70">
                {entity.id}
              </code>
            )}
          </div>
        </header>

        {isLatest && <TaskConfirmCTA entity={entity} />}

        {useGroups ? (
          <GroupedSections
            groups={grouped}
            schema={schema}
            entity={entity}
            priorState={priorState}
            peekDiff={peekDiff}
            canEditField={canEditField}
          />
        ) : (
          <>
            {slotted.body.length > 0 && (
              <section className="space-y-3 min-w-0">
                {slotted.body.map(([k, v, label]) => {
                  const status = peekDiff ? fieldDiffStatus(k, v, priorState) : null;
                  const editable = canEditField(v);
                  const objSrc = jsonlObjSrc(editable, entity.history, k);
                  return (
                    <div key={k} className="min-w-0 group">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          <InlineMarkdown source={label} />
                        </h3>
                      </div>
                      <div
                        className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                        {...(objSrc ? { "data-obj-src": objSrc } : {})}
                      >
                        <DiffValue
                          value={v}
                          priorValue={priorState[k]}
                          status={status}
                          fieldDef={schema?.fields?.[k]}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {slotted.unslotted.length > 0 && (
              <section className="min-w-0">
                <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  {t("ws.coll.fields")}
                </h3>
                <dl className="space-y-1.5">
                  {slotted.unslotted.map(([k, v, label]) => {
                    const status = peekDiff ? fieldDiffStatus(k, v, priorState) : null;
                    const editable = canEditField(v);
                    const objSrc = jsonlObjSrc(editable, entity.history, k);
                    return (
                      <div key={k} className="flex gap-3 text-xs min-w-0 group">
                        <dt className="text-muted-foreground shrink-0 w-32 font-mono">
                          <InlineMarkdown source={label} />
                        </dt>
                        <dd className="text-foreground font-mono break-all min-w-0 flex-1">
                          <span
                            className="min-w-0 break-all"
                            {...(objSrc ? { "data-obj-src": objSrc } : {})}
                          >
                            <DiffValue
                              value={v}
                              priorValue={priorState[k]}
                              status={status}
                              fieldDef={schema?.fields?.[k]}
                            />
                          </span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            )}
          </>
        )}

        {asideHasContent && asideCollapsed && (
          <button
            type="button"
            onClick={() => setAsideCollapsed(false)}
            className="self-start text-[11px] px-2 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors font-mono"
            title="Expand aside"
            aria-label="Expand aside"
          >
            ▸ aside
          </button>
        )}
      </main>

      {/* Aside — stacks below the main column inside the sidebar pane.
          Hidden when empty; collapsible via the chevron when present. */}
      {asideOpen && (
      <aside className="space-y-4 min-w-0 pt-4 border-t border-border/40">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setAsideCollapsed(true)}
            className="text-[11px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors font-mono"
            title="Collapse aside"
            aria-label="Collapse aside"
          >
            ▾
          </button>
        </div>
        {!isLatest && activeEvent && (
          // High-contrast amber chip. Past iterations tried
          // amber-500/5 + amber-700 text (vanished on brutal-mono cream)
          // then amber-500/90 fill + text-white (text rendered as
          // pale amber on warm-cream paper themes — still invisible).
          // Land on the standard "warning chip" pattern: pale amber
          // fill, dark amber text, mid amber border. Reads cleanly on
          // both default (paper) and brutal-mono cream backgrounds.
          <div className="rounded border border-amber-500 bg-amber-100 px-2.5 py-2 text-xs font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-400/60 break-words">
            {t("ws.coll.historicalView")} —{" "}
            <span className="font-mono">
              {activeEvent.at ? shortAt(activeEvent.at) : `line ${activeEvent.lineNumber}`}
            </span>
          </div>
        )}
        {slotted.aside.length > 0 && (
          <dl className="space-y-3">
            {slotted.aside.map(([k, v, label]) => {
              const status = peekDiff ? fieldDiffStatus(k, v, priorState) : null;
              const editable = canEditField(v);
              const objSrc = jsonlObjSrc(editable, entity.history, k);
              return (
                <div key={k} className="min-w-0 group">
                  <div className="flex items-center gap-2 mb-1">
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      <InlineMarkdown source={label} />
                    </dt>
                  </div>
                  <dd
                    className="break-words min-w-0"
                    {...(objSrc ? { "data-obj-src": objSrc } : {})}
                  >
                    <DiffValue
                      value={v}
                      priorValue={priorState[k]}
                      status={status}
                      fieldDef={schema?.fields?.[k]}
                    />
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </aside>
      )}
    </div>

    {/* History controls — pinned to the bottom of the page (replaces
        the read-only banner's old slot). `mt-auto` pushes this strip
        down when the snapshot is short; flex-1 cascade through the
        FileBody / CollectionView / DetailView wrappers gives it the
        room to do so. */}
    <section className="mt-auto pt-4 border-t border-border/40">
      <header className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {t("ws.coll.view.timeline")} · {entity.history.length}
        </h3>
        {entity.history.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOlder}
              disabled={!canGoOlder}
              className="text-[11px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="↑"
              aria-label="Older version"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onNewer}
              disabled={!canGoNewer}
              className="text-[11px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="↓"
              aria-label="Newer version"
            >
              ↓
            </button>
            <span className="text-[10px] text-muted-foreground/60 font-mono ml-1">
              v{historyIndex + 1}/{entity.history.length}
              {!isLatest && (
                <span className="ml-1 text-amber-800 dark:text-amber-400">
                  · {t("ws.coll.historicalView")}
                </span>
              )}
            </span>
            <span
              className={`hidden md:inline text-[10px] font-mono ml-2 transition-colors ${
                peekDiff
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-muted-foreground/70"
              }`}
              title="Hold Space to highlight added / modified fields"
            >
              {peekDiff ? "▣" : "□"} {t("ws.coll.peekDiff")}
            </span>
          </div>
        )}
      </header>
      <div className="relative">
        {/* Older versions, peeking from behind/above the active card. */}
        {historyIndex >= 2 && (
          <StackPeek position="above" depth={2} onClick={onOlder} />
        )}
        {historyIndex >= 1 && (
          <StackPeek position="above" depth={1} onClick={onOlder} />
        )}

        {activeEvent && (
          <EventBanner
            line={activeEvent}
            prior={priorState}
            schema={schema}
          />
        )}

        {/* Newer versions, peeking from below/in front. */}
        {historyIndex < entity.history.length - 1 && (
          <StackPeek position="below" depth={1} onClick={onNewer} />
        )}
        {historyIndex < entity.history.length - 2 && (
          <StackPeek position="below" depth={2} onClick={onNewer} />
        )}
      </div>
    </section>
    </div>
  );
}

/**
 * Replay a slice of an entity's history up to (and including) `upTo`.
 * Mirrors `foldByEntity` semantics for one entity's events: later
 * lines override earlier on per-key conflicts; absent keys are
 * unchanged. Used when the user has scrubbed back to a historical
 * version of a single entity.
 */
function foldHistorySlice(
  history: readonly CollectionLine[],
  upTo: number,
): Record<string, unknown> {
  const end = Math.min(upTo, history.length - 1);
  let merged: Record<string, unknown> = {};
  for (let i = 0; i <= end; i++) {
    const ln = history[i]!;
    merged = { ...merged, ...ln.fields };
    if (ln.at) merged.at = ln.at;
    if (ln.by) merged.by = ln.by;
    if (ln.op) merged.op = ln.op;
  }
  return merged;
}

/**
 * Notion-style grouped detail layout. Each group is its own collapsible
 * section with a small chevron next to the title. Inside a group,
 * fields render in schema-declared order with the same compact
 * `label : value` shape used by `slotted.unslotted`. Used when the
 * schema declares `groups`; mutually exclusive with the slot-driven
 * `slotted` path above (XOR — see DetailView).
 */
function GroupedSections({
  groups,
  schema,
  entity,
  priorState,
  peekDiff,
  canEditField,
}: {
  groups: GroupedSection[];
  schema: SchemaConfig | null;
  entity: EntityState;
  priorState: Record<string, unknown>;
  peekDiff: boolean;
  canEditField: (v: unknown) => v is string;
}) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <GroupSection
          key={g.title}
          group={g}
          schema={schema}
          entity={entity}
          priorState={priorState}
          peekDiff={peekDiff}
          canEditField={canEditField}
        />
      ))}
    </div>
  );
}

function GroupSection({
  group,
  schema,
  entity,
  priorState,
  peekDiff,
  canEditField,
}: {
  group: GroupedSection;
  schema: SchemaConfig | null;
  entity: EntityState;
  priorState: Record<string, unknown>;
  peekDiff: boolean;
  canEditField: (v: unknown) => v is string;
}) {
  const [collapsed, setCollapsed] = useState(group.collapsed);
  // Minimal section header: small uppercase title with a thin divider
  // below (Notion property-group style). The header is the full-width
  // click target for collapse — no chevron clutter in the open state;
  // a small ▸ appears only when collapsed so users can re-open.
  return (
    <section className="min-w-0">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full text-left mb-2 outline-none group/sec"
        aria-expanded={!collapsed}
      >
        <div className="flex items-baseline gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/80 pb-1.5 border-b border-border/40">
          <span>{group.title}</span>
          {collapsed && (
            <span aria-hidden className="font-mono text-[10px]">
              ▸
            </span>
          )}
        </div>
      </button>
      {!collapsed && (
        <dl className="space-y-1.5">
          {group.rows.map(([k, v, label]) => {
            const status = peekDiff ? fieldDiffStatus(k, v, priorState) : null;
            const editable = canEditField(v);
            const objSrc = jsonlObjSrc(editable, entity.history, k);
            return (
              <div key={k} className="flex gap-3 text-xs min-w-0 group">
                <dt className="text-muted-foreground shrink-0 w-32 font-mono">
                  <InlineMarkdown source={label} />
                </dt>
                <dd className="text-foreground break-words min-w-0 flex-1">
                  <span
                    className="min-w-0 break-words"
                    {...(objSrc ? { "data-obj-src": objSrc } : {})}
                  >
                    <DiffValue
                      value={v}
                      priorValue={priorState[k]}
                      status={status}
                      fieldDef={schema?.fields?.[k]}
                    />
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

/**
 * One half of the "deck of cards" visual for the version-scrubbed
 * timeline. The active EventCard sits in the center; up to two
 * StackPeek bars sit above (older versions, deeper = narrower /
 * dimmer) and below (newer versions). Each is a clickable thin bar
 * that nudges one step toward that side — same as the ↑/↓ keys.
 */
function StackPeek({
  position,
  depth,
  onClick,
}: {
  position: "above" | "below";
  depth: 1 | 2;
  onClick: () => void;
}) {
  const inset = depth === 1 ? "mx-3" : "mx-6";
  const tone =
    depth === 1
      ? "bg-muted/60 border-border/50"
      : "bg-muted/30 border-border/30";
  const shape =
    position === "above"
      ? "rounded-t-md border-b-0 -mb-px"
      : "rounded-b-md border-t-0 -mt-px";
  const ariaLabel =
    position === "above" ? "Older version" : "Newer version";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`block ${inset} h-2 border ${tone} ${shape} hover:opacity-70 transition-opacity cursor-pointer`}
    />
  );
}

/**
 * Banner for the active version in the timeline footer. By default
 * shows a single-line summary of what changed in this event (truncated
 * with ellipsis). `[expand]` reveals the full per-field diff using
 * the same DiffValue vocabulary as the snapshot peek.
 *
 * `prior` is the folded entity state immediately before this event;
 * it lets us color each field key with the right diff status.
 */
function EventBanner({
  line,
  prior,
  schema,
}: {
  line: CollectionLine;
  prior: Record<string, unknown>;
  schema: SchemaConfig | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = stripConventions(line.fields);
  const fieldEntries = Object.entries(fields);
  const hasFields = fieldEntries.length > 0;

  return (
    <article className="rounded-lg border border-foreground/40 bg-muted/40">
      <header className="flex flex-wrap items-baseline gap-2 px-3 py-2.5">
        <code className="text-xs font-mono shrink-0">{line.id}</code>
        {line.op && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground font-mono shrink-0">
            {line.op}
          </span>
        )}

        {/* One-line summary of the patch. Hidden when expanded so the
            user doesn't see the same diff twice. */}
        {!expanded && hasFields && (
          <span className="text-[11px] font-mono text-muted-foreground truncate flex-1 min-w-[0]">
            <PatchSummary fields={fieldEntries} prior={prior} />
          </span>
        )}

        {hasFields && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 border border-border/50 rounded shrink-0"
          >
            {expanded ? "[collapse]" : "[expand]"}
          </button>
        )}

        {line.at && (
          <time className="text-[10px] text-muted-foreground font-mono shrink-0 ml-auto">
            {shortAt(line.at)}
          </time>
        )}
        {line.by && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {line.by}
          </span>
        )}
      </header>

      {expanded && hasFields && (
        <dl className="px-3 pb-2.5 pt-2 border-t border-border/40 space-y-1 text-[11px] font-mono">
          {fieldEntries.map(([k, v]) => {
            const status = fieldDiffStatus(k, v, prior) ?? "added";
            return (
              <div
                key={k}
                className="flex gap-2 leading-relaxed min-w-0"
              >
                <span className="text-muted-foreground shrink-0">{k}:</span>
                <span className="break-all min-w-0 flex-1">
                  <DiffValue
                    value={v}
                    priorValue={prior[k]}
                    status={status}
                    fieldDef={schema?.fields?.[k]}
                  />
                </span>
              </div>
            );
          })}
        </dl>
      )}
    </article>
  );
}

/**
 * One-liner that lists each patched field with its sigil and a brief
 * value preview. The parent gives this `truncate` so the whole line
 * collapses with ellipsis when it gets too long.
 */
function PatchSummary({
  fields,
  prior,
}: {
  fields: [string, unknown][];
  prior: Record<string, unknown>;
}) {
  return (
    <>
      {fields.map(([k, v], i) => {
        const status = fieldDiffStatus(k, v, prior) ?? "added";
        const sigil =
          status === "added"
            ? "+"
            : status === "modified"
              ? "~"
              : status === "deleted"
                ? "−"
                : "·";
        const tone =
          status === "added"
            ? "text-emerald-700 dark:text-emerald-400"
            : status === "modified"
              ? "text-amber-700 dark:text-amber-400"
              : status === "deleted"
                ? "text-red-700 dark:text-red-400"
                : "text-muted-foreground";
        const valueText =
          status === "modified"
            ? `${formatScalar(prior[k])} → ${formatScalar(v)}`
            : status === "deleted"
              ? formatScalar(prior[k])
              : formatScalar(v);
        return (
          <span key={k}>
            {i > 0 && <span className="opacity-50">, </span>}
            <span className={`${tone} font-semibold`}>{sigil}</span>
            <span className="ml-0.5">{k}: </span>
            <span>{valueText}</span>
          </span>
        );
      })}
    </>
  );
}

/**
 * Classify a field as added / modified / deleted / unchanged relative
 * to the prior folded state.
 *
 *   added     — key absent in prior, has a non-empty value now
 *   modified  — key present in both, values differ
 *   deleted   — key had a non-empty value in prior, now empty/null
 *   null      — same value (or both empty); no diff to show
 *
 * Used by the "hold Space" diff peek on the snapshot view.
 */
/**
 * Build the `data-obj-src` value for a jsonl field span — the marker
 * that lets the EditableSurface's selection hook resolve a text
 * selection inside a value back to (lineNumber, fieldKey) without a
 * separate React handler. See docs/inline-edit.md §3.2.
 *
 * Returns null when the field isn't editable (historical view,
 * non-string value, or no surface mounted), so callers spread the
 * attribute conditionally.
 *
 * The marker's lineNumber points to the line that **currently holds**
 * the field's value — i.e. the most recent event line where this
 * fieldKey appeared. This matters for semantic-patch style files
 * (the recommended pattern in four-types.md §3.3) where the latest
 * event line carries only the fields that *changed*. Editing
 * `background` on the entity should rewrite the line that set
 * `background`, not the latest line that lives there for some other
 * reason. Without this, the surface's lineText reconstruction would
 * find the field undefined on the latest line and silently drop the
 * edit request.
 */
function jsonlObjSrc(
  editable: boolean,
  history: readonly CollectionLine[] | undefined,
  fieldKey: string,
): string | null {
  if (!editable || !history) return null;
  const owner = findFieldOwnerLine(history, fieldKey);
  if (!owner) return null;
  return `jsonl:${owner.lineNumber}:${fieldKey}`;
}

/**
 * Walk an entity's history latest-to-earliest, return the first line
 * that has `fieldKey` set. That's the line whose bytes contribute
 * `fieldKey` to the folded entity state — i.e. the line we need to
 * rewrite when the user edits this field's value.
 */
function findFieldOwnerLine(
  history: readonly CollectionLine[],
  fieldKey: string,
): CollectionLine | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const line = history[i];
    if (line && fieldKey in line.raw) return line;
  }
  return undefined;
}

function fieldDiffStatus(
  key: string,
  value: unknown,
  prior: Record<string, unknown> | null,
): "added" | "modified" | "deleted" | null {
  if (!prior) return null;
  const inPrior = key in prior;
  const priorVal = inPrior ? prior[key] : undefined;
  const cur = isEmpty(value);
  const old = isEmpty(priorVal);
  if (!inPrior && !cur) return "added";
  if (inPrior && !old && cur) return "deleted";
  if (inPrior && !valueEquals(priorVal, value)) return "modified";
  return null;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/** Plain-JSON deep equality for entity field values (objects + arrays
 *  + scalars). Sufficient for diff display; not a general-purpose
 *  equality check. */
function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
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

/**
 * Read a field as string. Returns null when missing or not a string —
 * keeps the renderer cleanly typed when the schema points at a field
 * that turns out empty for a given entity.
 */
function pickString(
  fields: Record<string, unknown>,
  key: string,
): string | null {
  const v = fields[key];
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

/**
 * Bucket fields into layout slots driven by schema.fields[k].display.
 * Fields used as title/subtitle/avatar are excluded. Any field not
 * declared in the schema (or declared without a display slot) lands
 * in `unslotted`, which the detail view renders as a generic kv list.
 */
/**
 * Evaluate a schema-declared show_when condition against the folded
 * entity state. Returns true when the field should render. Uses strict
 * equality on the dependent field's current value — for richer logic,
 * authors should pre-compute a derived boolean field upstream.
 */
function evalShowWhen(
  cond: { field: string; equals: unknown } | undefined,
  state: Record<string, unknown>,
): boolean {
  if (!cond) return true;
  return state[cond.field] === cond.equals;
}

/**
 * Bucket fields into schema-declared groups for the Notion-style
 * grouped detail layout. Each group renders as its own collapsible
 * section. Declared fields not listed in any group are collected
 * into a tail "Other" pseudo-group so the author doesn't accidentally
 * lose data by forgetting to list a field.
 *
 * Honors `hide` and `show_when` just like `slotFields`.
 */
interface GroupedSection {
  title: string;
  collapsed: boolean;
  rows: [string, unknown, string][]; // [key, value, label]
}
function groupFields(
  fields: Record<string, unknown>,
  schema: SchemaConfig | null,
  titleField: string | undefined,
  subtitleField: string | undefined,
  avatarField: string | undefined,
): GroupedSection[] {
  if (!schema?.groups || !schema?.fields) return [];
  const used = new Set(
    [titleField, subtitleField, avatarField].filter(Boolean) as string[],
  );

  const includeField = (k: string): boolean => {
    if (used.has(k)) return false;
    if (!(k in fields)) return false;
    const def = schema.fields?.[k];
    if (!def) return false;
    if (def.hide) return false;
    if (!evalShowWhen(def.show_when, fields)) return false;
    return true;
  };

  const labelFor = (k: string): string => schema.fields?.[k]?.label ?? k;

  const groupTitles = schema.groups.map((g) => g.title);
  const orderedTitles = schema.detail_view?.groups_order
    ? schema.detail_view.groups_order.filter((t) => groupTitles.includes(t))
    : groupTitles;
  const grouped: GroupedSection[] = [];
  const consumed = new Set<string>();

  for (const t of orderedTitles) {
    const def = schema.groups.find((g) => g.title === t);
    if (!def) continue;
    const rows: [string, unknown, string][] = [];
    for (const k of def.fields) {
      if (consumed.has(k)) continue;
      if (!includeField(k)) continue;
      rows.push([k, fields[k], labelFor(k)]);
      consumed.add(k);
    }
    if (rows.length > 0) {
      grouped.push({ title: t, collapsed: !!def.collapsed, rows });
    }
  }

  // Tail: declared fields not in any group.
  const tail: [string, unknown, string][] = [];
  for (const k of Object.keys(schema.fields)) {
    if (consumed.has(k)) continue;
    if (!includeField(k)) continue;
    tail.push([k, fields[k], labelFor(k)]);
  }
  if (tail.length > 0) {
    grouped.push({ title: "·", collapsed: false, rows: tail });
  }

  return grouped;
}

function slotFields(
  fields: Record<string, unknown>,
  schema: SchemaConfig | null,
  titleField: string | undefined,
  subtitleField: string | undefined,
  avatarField: string | undefined,
): {
  body: [string, unknown, string][];
  aside: [string, unknown, string][];
  unslotted: [string, unknown, string][];
} {
  const used = new Set(
    [titleField, subtitleField, avatarField].filter(Boolean) as string[],
  );
  const body: [string, unknown, string][] = [];
  const aside: [string, unknown, string][] = [];
  const unslotted: [string, unknown, string][] = [];

  if (!schema?.fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (used.has(k)) continue;
      unslotted.push([k, v, k]);
    }
    return { body, aside, unslotted };
  }

  // Declared fields first, in schema-order.
  for (const [k, def] of Object.entries(schema.fields)) {
    if (used.has(k)) continue;
    if (!(k in fields)) continue;
    if (def.hide) continue;
    if (!evalShowWhen(def.show_when, fields)) continue;
    const label = def.label ?? k;
    if (def.display === "body") {
      body.push([k, fields[k], label]);
    } else if (def.display === "aside") {
      aside.push([k, fields[k], label]);
    } else if (def.display === "meta" || def.display === undefined) {
      unslotted.push([k, fields[k], label]);
    }
    // headline/subheadline/avatar are already consumed; skip.
  }
  // When a schema is provided, undeclared fields are intentionally
  // hidden from the entity view. The fold accumulates event-payload
  // keys (`from`/`to` from a stage_change event, `text` from a note
  // event, etc.); those are *event metadata*, not entity state, and
  // showing them as if they were entity fields creates confusion. The
  // schema is the source of truth on what an entity is shaped like.
  return { body, aside, unslotted };
}

/**
 * Inline diff renderer used during a Space-peek. Picks the right
 * visual for each diff status:
 *
 *   added    — `+` in emerald, then the new value
 *   modified — old value strike-through (muted), then new value
 *   deleted  — `−` in red, old value strike-through
 *
 * No status (null) → renders the value normally via renderFieldValue.
 * Colors deliberately use 700-weight tints so they read on the
 * cream background; the previous 500/70 tints were washed out.
 */
function DiffValue({
  value,
  priorValue,
  status,
  fieldDef,
}: {
  value: unknown;
  priorValue: unknown;
  status: "added" | "modified" | "deleted" | null;
  /** Full field schema definition — type / options / multi all live
   *  on it. Optional so callers without schema context (e.g. event
   *  banner) still render via type auto-detection. */
  fieldDef?: FieldDef;
}) {
  if (status === null) {
    return <FieldValue value={value} fieldDef={fieldDef} />;
  }

  if (status === "added") {
    return (
      <span className="inline-flex items-baseline gap-1.5 max-w-full">
        <span
          className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold shrink-0"
          aria-label="added"
        >
          +
        </span>
        <span className="min-w-0 break-words">
          <FieldValue value={value} fieldDef={fieldDef} />
        </span>
      </span>
    );
  }

  if (status === "deleted") {
    return (
      <span className="inline-flex items-baseline gap-1.5 max-w-full">
        <span
          className="font-mono text-red-700 dark:text-red-400 font-semibold shrink-0"
          aria-label="deleted"
        >
          −
        </span>
        <span className="line-through text-red-700/70 dark:text-red-400/70 min-w-0 break-words">
          <FieldValue value={priorValue} fieldDef={fieldDef} />
        </span>
      </span>
    );
  }

  // modified
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 max-w-full">
      <span className="line-through text-muted-foreground/70 break-words">
        <FieldValue value={priorValue} fieldDef={fieldDef} />
      </span>
      <span className="text-emerald-700 dark:text-emerald-400 break-words">
        <FieldValue value={value} fieldDef={fieldDef} />
      </span>
    </span>
  );
}

/* Field value rendering moved to `@/components/jsonl-field-widgets`.
 * DiffValue routes value/priorValue through `<FieldValue>`, which
 * handles type dispatch (markdown, link, datetime, status, object, …)
 * and array adaptation. */

/**
 * Inline-only markdown for field labels (`schema.fields[k].label`) and
 * entity titles. Handles the four marks an author actually reaches for
 * in a column header: `**bold**`, `*italic*`, `` `code` ``, and
 * `[text](url)`. Everything else stays as-is, so a plain label like
 * `subject` still renders as the literal text.
 *
 * Inline-only by design — labels are single-line; block constructs
 * (lists, headings, fences) don't make sense here and would only
 * blow up the row height. Renders to JSX nodes (no
 * dangerouslySetInnerHTML, no async pipeline) so it composes cleanly
 * inside `<dt>` / `<h3>` without a Suspense boundary.
 */
function InlineMarkdown({ source }: { source: string }): React.ReactNode {
  return <>{parseInlineMarkdown(source)}</>;
}

type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "bold"; children: InlineNode[] }
  | { kind: "italic"; children: InlineNode[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; children: InlineNode[] };

function parseInlineMarkdown(input: string): React.ReactNode[] {
  const nodes = tokenizeInline(input);
  return renderInlineNodes(nodes);
}

function tokenizeInline(input: string): InlineNode[] {
  // Walk a single pass, greedily matching the four supported constructs.
  // Code spans are claimed first (they suppress nested markup); then
  // links; then bold (longer delimiter); then italic. Unmatched
  // delimiters fall through as literal text.
  const out: InlineNode[] = [];
  let i = 0;
  let buf = "";
  const flushText = () => {
    if (buf.length > 0) {
      out.push({ kind: "text", value: buf });
      buf = "";
    }
  };
  while (i < input.length) {
    const ch = input[i]!;

    // backtick code span: `…`
    if (ch === "`") {
      const end = input.indexOf("`", i + 1);
      if (end > i) {
        flushText();
        out.push({ kind: "code", value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // link: [text](href)
    if (ch === "[") {
      const close = input.indexOf("]", i + 1);
      if (close > i && input[close + 1] === "(") {
        const hrefEnd = input.indexOf(")", close + 2);
        if (hrefEnd > close + 1) {
          const text = input.slice(i + 1, close);
          const href = input.slice(close + 2, hrefEnd);
          flushText();
          out.push({
            kind: "link",
            href,
            children: tokenizeInline(text),
          });
          i = hrefEnd + 1;
          continue;
        }
      }
    }

    // bold: **…**
    if (ch === "*" && input[i + 1] === "*") {
      const end = input.indexOf("**", i + 2);
      if (end > i + 1) {
        flushText();
        out.push({
          kind: "bold",
          children: tokenizeInline(input.slice(i + 2, end)),
        });
        i = end + 2;
        continue;
      }
    }

    // italic: *…*  (single-star, not part of a **) and _…_
    if (ch === "*" || ch === "_") {
      const end = input.indexOf(ch, i + 1);
      // Require non-empty content and end not immediately followed by
      // another same-char (which would be a stray **/__ run).
      if (end > i + 1 && input[end + 1] !== ch) {
        flushText();
        out.push({
          kind: "italic",
          children: tokenizeInline(input.slice(i + 1, end)),
        });
        i = end + 1;
        continue;
      }
    }

    buf += ch;
    i++;
  }
  flushText();
  return out;
}

function renderInlineNodes(nodes: InlineNode[]): React.ReactNode[] {
  return nodes.map((n, i) => {
    if (n.kind === "text") return n.value;
    if (n.kind === "bold")
      return (
        <strong key={i} className="font-semibold">
          {renderInlineNodes(n.children)}
        </strong>
      );
    if (n.kind === "italic")
      return <em key={i}>{renderInlineNodes(n.children)}</em>;
    if (n.kind === "code")
      return (
        <code key={i} className="font-mono bg-muted/60 rounded px-1 py-px">
          {n.value}
        </code>
      );
    // link — only http(s) and mailto pass through; anything else
    // degrades to the link text to keep this safe inside inline labels.
    const safe = /^(https?:|mailto:)/i.test(n.href);
    if (!safe) return <span key={i}>{renderInlineNodes(n.children)}</span>;
    return (
      <a
        key={i}
        href={n.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-accent"
      >
        {renderInlineNodes(n.children)}
      </a>
    );
  });
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

/** Compact `at` display: keep the date and HH:MM if present. */
function shortAt(at: string): string {
  const m = at.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m) return at;
  return m[2] ? `${m[1]} ${m[2]}` : m[1]!;
}

