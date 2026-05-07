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
    }
  >;
  list_view?: {
    /** Field keys to expose as filter dropdowns. */
    filters?: string[];
    /** Field keys to substring-match against when the user types in the search box. */
    search?: string[];
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
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Filtered + searched entity list. This is the navigation scope —
  // both the list and detail prev/next walk this slice.
  const filteredEntities = useMemo(() => {
    let out = folded;
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      out = out.filter((e) => e.state[key] === value);
    }
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      const searchFields =
        schema?.list_view?.search ??
        // No schema → fall back to id + every string field on the entity.
        null;
      out = out.filter((e) => {
        if (e.id.toLowerCase().includes(q)) return true;
        if (searchFields) {
          return searchFields.some((f) => {
            const v = e.state[f];
            return typeof v === "string" && v.toLowerCase().includes(q);
          });
        }
        return Object.values(e.state).some(
          (v) => typeof v === "string" && v.toLowerCase().includes(q),
        );
      });
    }
    return out;
  }, [folded, filters, search, schema]);

  // The drilled entity is resolved against the *unfiltered* set so a
  // direct link / saved id still works even if the current filters
  // would exclude it. The prev/next walk, however, uses the filtered
  // set so navigation always lands on something the user is viewing.
  const drillEntity = drillEntityId
    ? folded.find((e) => e.id === drillEntityId) ?? null
    : null;
  const drillIndex = drillEntity
    ? filteredEntities.findIndex((e) => e.id === drillEntity.id)
    : -1;
  const prevEntity =
    drillIndex > 0 ? (filteredEntities[drillIndex - 1] ?? null) : null;
  const nextEntity =
    drillIndex >= 0 && drillIndex < filteredEntities.length - 1
      ? (filteredEntities[drillIndex + 1] ?? null)
      : null;

  const goPrev = useCallback(() => {
    if (prevEntity) setDrillEntityId(prevEntity.id);
  }, [prevEntity]);
  const goNext = useCallback(() => {
    if (nextEntity) setDrillEntityId(nextEntity.id);
  }, [nextEntity]);
  const goBack = useCallback(() => setDrillEntityId(null), []);

  // Keyboard: j/k = next/prev in detail, esc = back to list, cmd/ctrl+k
  // = focus the search input on the list. Inputs/textareas opt out so
  // typing isn't hijacked.
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

      if (drillEntity) {
        if (e.key === "j") {
          e.preventDefault();
          goNext();
        } else if (e.key === "k") {
          e.preventDefault();
          goPrev();
        } else if (e.key === "Escape") {
          e.preventDefault();
          goBack();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drillEntity, goNext, goPrev, goBack]);

  // Empty state — no parsed lines at all (and no schema either).
  if (lines.length === 0 && schemas.length === 0 && errors.length === 0) {
    return <EmptyState t={t} />;
  }

  const filterFieldKeys = schema?.list_view?.filters ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Header: counts + (when in detail) back / prev / next */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/50">
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span>
            {t("ws.coll.entities").replace(
              "{n}",
              String(
                drillEntity ? folded.length : filteredEntities.length,
              ),
            )}
            {!drillEntity &&
            filteredEntities.length !== folded.length ? (
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
              <span className="text-amber-600 dark:text-amber-400">
                {t("ws.coll.errors").replace("{n}", String(errors.length))}
              </span>
            </>
          )}
        </div>

        {drillEntity && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goBack}
              className="text-[11px] px-2.5 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors"
              title="esc"
            >
              {t("ws.coll.backToList")}
            </button>
            <button
              type="button"
              onClick={goPrev}
              disabled={!prevEntity}
              className="text-[11px] px-2 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="k"
              aria-label="Previous"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!nextEntity}
              className="text-[11px] px-2 py-1 rounded border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              title="j"
              aria-label="Next"
            >
              ↓
            </button>
            {drillIndex >= 0 && (
              <span className="text-[10px] text-muted-foreground/60 font-mono ml-1">
                {drillIndex + 1}/{filteredEntities.length}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Filter / search bar — list view only */}
      {!drillEntity &&
        schema &&
        (filterFieldKeys.length > 0 || schema?.list_view?.search) && (
          <FilterBar
            schema={schema}
            filterFieldKeys={filterFieldKeys}
            filters={filters}
            onFiltersChange={setFilters}
            search={search}
            onSearchChange={setSearch}
            searchInputRef={searchInputRef}
            t={t}
          />
        )}

      {/* Parse errors strip — always visible above the chosen view */}
      {errors.length > 0 && <ErrorsStrip errors={errors} />}

      {/* Body */}
      {drillEntity ? (
        <DetailView entity={drillEntity} schema={schema} t={t} />
      ) : (
        <ListView
          entities={filteredEntities}
          schema={schema}
          onDrill={setDrillEntityId}
          t={t}
        />
      )}
    </div>
  );
}

/* ── Filter / search bar ─────────────────────────────────────────── */

function FilterBar({
  schema,
  filterFieldKeys,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  searchInputRef,
  t,
}: {
  schema: SchemaConfig;
  filterFieldKeys: readonly string[];
  filters: Record<string, string>;
  onFiltersChange: (next: Record<string, string>) => void;
  search: string;
  onSearchChange: (next: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  t: (k: string) => string;
}) {
  const hasSearch =
    schema.list_view?.search && schema.list_view.search.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filterFieldKeys.map((key) => {
        const def = schema.fields?.[key];
        const options = def?.options ?? [];
        if (options.length === 0) return null;
        const label = def?.label ?? key;
        const current = filters[key] ?? "";
        return (
          <select
            key={key}
            value={current}
            onChange={(e) => {
              const v = e.target.value;
              const next = { ...filters };
              if (v) next[key] = v;
              else delete next[key];
              onFiltersChange(next);
            }}
            className="text-[11px] px-2 py-1 rounded border border-border/60 bg-background text-foreground hover:border-border focus:outline-none focus:ring-1 focus:ring-foreground/20"
          >
            <option value="">{label}: all</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {label}: {opt.label ?? opt.value}
              </option>
            ))}
          </select>
        );
      })}
      {hasSearch && (
        <input
          ref={searchInputRef}
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={`${t("ws.coll.search")}  ⌘K`}
          className="text-[11px] px-2 py-1 rounded border border-border/60 bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/20 ml-auto min-w-[180px]"
        />
      )}
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

/* ── List view: one card per folded entity ───────────────────────── */

function ListView({
  entities,
  schema,
  onDrill,
  t,
}: {
  entities: readonly EntityState[];
  schema: SchemaConfig | null;
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
        <EntityCard
          key={e.id}
          entity={e}
          schema={schema}
          onDrill={onDrill}
          t={t}
        />
      ))}
    </div>
  );
}

function EntityCard({
  entity,
  schema,
  onDrill,
  t,
}: {
  entity: EntityState;
  schema: SchemaConfig | null;
  onDrill: (id: string) => void;
  t: (k: string) => string;
}) {
  const isDeleted = entity.status === "deleted";
  const fields = stripConventions(entity.state);

  const titleField = schema?.entity?.title_field;
  const subtitleField = schema?.entity?.subtitle_field;
  const avatarField = schema?.entity?.avatar_field;

  const title = (titleField && pickString(fields, titleField)) ?? entity.id;
  const subtitle = subtitleField ? pickString(fields, subtitleField) : null;
  const avatar = avatarField ? pickString(fields, avatarField) : null;

  // Fields to show as a small kv list in the card body. If a schema
  // declares display slots, prefer "meta" + "subheadline" fields (skip
  // any already used as title/subtitle/avatar). Without a schema, fall
  // back to first six raw fields.
  const cardKvs = useMemo(() => {
    if (schema?.fields) {
      const used = new Set(
        [titleField, subtitleField, avatarField].filter(Boolean) as string[],
      );
      const picked: [string, unknown][] = [];
      for (const [k, def] of Object.entries(schema.fields)) {
        if (used.has(k)) continue;
        if (def.display === "meta" || def.display === "aside") {
          if (k in fields) picked.push([def.label ?? k, fields[k]]);
        }
      }
      return picked.slice(0, 6);
    }
    return Object.entries(fields).slice(0, 6);
  }, [fields, schema, titleField, subtitleField, avatarField]);

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
      <div className="flex items-center gap-3 mb-2">
        {avatar && (
          // Avatar render: a small round image when the field resolves
          // to a URL string. Fallback initials are not implemented yet.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            className="w-10 h-10 rounded-full object-cover bg-muted shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {title}
            </span>
            {isDeleted && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                {t("ws.coll.deleted")}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground truncate">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {cardKvs.length > 0 && (
        <dl className="space-y-1 mb-2">
          {cardKvs.map(([k, v]) => (
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

/* ── Detail view: one entity's full record + lifeline ────────────── */

function DetailView({
  entity,
  schema,
  t,
}: {
  entity: EntityState;
  schema: SchemaConfig | null;
  t: (k: string) => string;
}) {
  const fields = stripConventions(entity.state);
  const titleField = schema?.entity?.title_field;
  const subtitleField = schema?.entity?.subtitle_field;
  const avatarField = schema?.entity?.avatar_field;

  const title = (titleField && pickString(fields, titleField)) ?? entity.id;
  const subtitle = subtitleField ? pickString(fields, subtitleField) : null;
  const avatar = avatarField ? pickString(fields, avatarField) : null;

  const slotted = useMemo(
    () => slotFields(fields, schema, titleField, subtitleField, avatarField),
    [fields, schema, titleField, subtitleField, avatarField],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
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
            <code className="text-[10px] font-mono text-muted-foreground/70">
              {entity.id}
            </code>
          </div>
        </header>

        {slotted.body.length > 0 && (
          <section className="space-y-3">
            {slotted.body.map(([k, v, label]) => (
              <div key={k}>
                <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  {label}
                </h3>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {formatScalar(v)}
                </div>
              </div>
            ))}
          </section>
        )}

        {slotted.unslotted.length > 0 && (
          <section>
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              {t("ws.coll.fields")}
            </h3>
            <dl className="space-y-1.5">
              {slotted.unslotted.map(([k, v, label]) => (
                <div key={k} className="flex gap-3 text-xs">
                  <dt className="text-muted-foreground shrink-0 w-32 font-mono">
                    {label}
                  </dt>
                  <dd className="text-foreground font-mono break-all">
                    {formatScalar(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            {t("ws.coll.view.timeline")} · {entity.history.length}
          </h3>
          <ol className="relative pl-5 border-l-2 border-border/40 space-y-3">
            {entity.history.map((ln) => (
              <li key={ln.lineNumber} className="relative">
                <span
                  className="absolute -left-[27px] top-2 w-3 h-3 rounded-full bg-background border-2 border-border"
                  aria-hidden
                />
                <EventCard line={ln} />
              </li>
            ))}
          </ol>
        </section>
      </main>

      {/* Aside */}
      <aside className="space-y-4 md:border-l md:pl-6 md:border-border/40">
        {slotted.aside.length > 0 && (
          <dl className="space-y-3">
            {slotted.aside.map(([k, v, label]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                  {label}
                </dt>
                <dd className="text-sm break-all">{formatScalar(v)}</dd>
              </div>
            ))}
          </dl>
        )}
      </aside>
    </div>
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
  // Any extra fields not declared in schema.
  const declared = new Set(Object.keys(schema.fields));
  for (const [k, v] of Object.entries(fields)) {
    if (used.has(k) || declared.has(k)) continue;
    unslotted.push([k, v, k]);
  }
  return { body, aside, unslotted };
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
  const m = at.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m) return at;
  return m[2] ? `${m[1]} ${m[2]}` : m[1]!;
}
