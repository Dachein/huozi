"use client";

/**
 * Type-aware value renderers for jsonl Collection schemas.
 *
 * The `<FieldValue>` component dispatches on the schema-declared
 * field type and (when no schema is declared) auto-detects from the
 * runtime value shape. Each type widget natively handles BOTH single
 * values and arrays — jsonl data is uncurated and the same field
 * may appear as a string on one entity and an array of strings on
 * another, so widgets adapt at render time. Schema can override the
 * auto-detection via `multi: true | false` on the field def.
 *
 * Vocabulary (Phase A of L2.5 self-customization, see
 * project_huozi_layout_lexicon memory):
 *
 *   text       paragraph    markdown    link
 *   email      image        datetime    duration
 *   status     options      progress    rating
 *   relation   object       url_map (legacy, kept for back-compat)
 *
 * Empty values (null / undefined / "" / []) render as a muted "—"
 * placeholder. Phase B will let schemas override that per field via
 * `empty_placeholder`.
 *
 * Markdown rendering is currently inline-grade (bold / italic / links
 * / code) via the existing InlineMarkdown helper in collection-view.
 * Block-level markdown (lists, headings, code fences) is TODO — would
 * need to plug in the async @/lib/markdown/renderer.
 */

import { type ReactNode, useMemo } from "react";

export interface FieldOption {
  value: string;
  label?: string;
  color?: string;
}

/**
 * Subset of the schema field definition that widgets consume.
 * Mirrors `SchemaConfig.fields[key]` in collection-view; kept narrow
 * so the widgets file can stay self-contained.
 */
export type DatetimeFormat =
  | "relative"       // "5d", "17h", "now"
  | "date"           // "2026/05/20"
  | "month_day"      // "05/20"
  | "month"          // "2026/05"
  | "year"           // "2026"
  | "time"           // "10:20"
  | "datetime"       // "2026/05/20 10:20"
  | "datetime_full"  // "2026/05/20 10:20:44"
  | "zh_date"        // "2026 年 5 月 20 日"
  | "zh_datetime";   // "2026 年 5 月 20 日 10:20:44"

export interface FieldDef {
  type?: string;
  label?: string;
  options?: FieldOption[];
  /** Custom text to show in place of the default `—` for empty values. */
  empty_placeholder?: string;
  /** Force cardinality. `false` = always single (first item if value
   *  is an array); `true` = always array (wraps single in `[value]`).
   *  When unset, auto-detected from `Array.isArray(value)`. */
  multi?: boolean;
  /** For `type: "datetime"` only. Picks the rendering style. Open string
   *  at parse-time (the schema is untyped JSON); the widget narrows to
   *  the curated set and falls back to `datetime` on unknown values.
   *  Defaults: `relative` for list-row timestamps, `datetime` for detail. */
  format?: string;
}

export interface FieldValueProps {
  value: unknown;
  type?: string;
  fieldDef?: FieldDef;
}

const DEFAULT_EMPTY = <span className="text-muted-foreground/50">—</span>;

function emptyPlaceholder(fieldDef?: FieldDef) {
  const custom = fieldDef?.empty_placeholder;
  if (custom && custom.length > 0) {
    return <span className="text-muted-foreground/70 text-sm">{custom}</span>;
  }
  return DEFAULT_EMPTY;
}

/**
 * Backward-compat aliases for type names that pre-dated the L2.5
 * widget rework. Old schemas (`select` / `richtext` / `date` /
 * `multi_select` / `number`) keep rendering correctly without
 * touching any author data.
 */
const TYPE_ALIASES: Record<string, string> = {
  select: "status",
  multi_select: "options",
  date: "datetime",
  richtext: "markdown",
  number: "text",
  url: "link",
};

/**
 * Top-level dispatcher. Resolves type (declared > inferred), normalises
 * the value to single or array based on `multi` override, then routes
 * to the matching widget.
 */
export function FieldValue({ value, type, fieldDef }: FieldValueProps) {
  // Empty value across all shapes.
  if (isEmpty(value)) return emptyPlaceholder(fieldDef);

  const raw = type ?? fieldDef?.type ?? inferType(value);
  const resolvedType = TYPE_ALIASES[raw] ?? raw;
  const isArr = Array.isArray(value);
  const multi = fieldDef?.multi;

  // Multi override: schema wants single → coerce array to its first
  // non-empty item.
  if (isArr && multi === false) {
    const first = (value as unknown[]).find((v) => !isEmpty(v));
    return (
      <SingleValue
        value={first}
        type={resolvedType}
        fieldDef={fieldDef}
      />
    );
  }

  // Schema wants multi → coerce single to [value].
  const effective =
    isArr || multi === true ? (isArr ? (value as unknown[]) : [value]) : value;

  if (Array.isArray(effective)) {
    return (
      <ArrayValue items={effective} type={resolvedType} fieldDef={fieldDef} />
    );
  }
  return (
    <SingleValue value={effective} type={resolvedType} fieldDef={fieldDef} />
  );
}

/* ── Single-value dispatch ───────────────────────────────────────── */

function SingleValue({
  value,
  type,
  fieldDef,
}: {
  value: unknown;
  type: string;
  fieldDef?: FieldDef;
}) {
  if (isEmpty(value)) return emptyPlaceholder(fieldDef);

  switch (type) {
    case "markdown":
      return <MarkdownValue source={String(value)} />;
    case "paragraph":
      return <ParagraphValue text={String(value)} />;
    case "link":
    case "url":
      return looksLikeUrl(value) ? (
        <LinkValue href={String(value)} />
      ) : (
        <TextValue text={String(value)} />
      );
    case "email":
      return looksLikeEmail(value) ? (
        <EmailValue email={String(value)} />
      ) : (
        <TextValue text={String(value)} />
      );
    case "image":
      return typeof value === "string" ? (
        <ImageValue src={value} />
      ) : (
        <TextValue text={String(value)} />
      );
    case "datetime":
      return (
        <DateTimeValue
          iso={String(value)}
          format={normalizeDatetimeFormat(fieldDef?.format) ?? "datetime"}
        />
      );
    case "duration":
      return <DurationValue value={value} />;
    case "status":
      return <StatusValue value={String(value)} options={fieldDef?.options} />;
    case "options":
      return <OptionsValue value={String(value)} options={fieldDef?.options} />;
    case "progress":
      return <ProgressValue value={Number(value)} />;
    case "rating":
      return <RatingValue value={Number(value)} />;
    case "relation":
      return <RelationValue id={String(value)} />;
    case "object":
      return (
        <ObjectValue value={value as Record<string, unknown>} depth={0} />
      );
    case "url_map":
      return <UrlMapValue value={value as Record<string, unknown>} />;
    case "text":
    default:
      return <TextValue text={formatScalar(value)} />;
  }
}

/* ── Array adaptation ────────────────────────────────────────────── */

function ArrayValue({
  items,
  type,
  fieldDef,
}: {
  items: unknown[];
  type: string;
  fieldDef?: FieldDef;
}) {
  const filtered = items.filter((v) => !isEmpty(v));
  if (filtered.length === 0) return emptyPlaceholder(fieldDef);

  // Compact "chip" layout for short scalar types — fits naturally as a
  // run of inline pills (tags, options, statuses, short text).
  const chipTypes = new Set([
    "text",
    "options",
    "status",
    "email",
    "duration",
    "datetime",
    "rating",
  ]);
  if (chipTypes.has(type)) {
    return (
      <span className="inline-flex flex-wrap gap-1 max-w-full">
        {filtered.map((item, i) => (
          <span key={i} className="inline-block">
            <SingleValue value={item} type={type} fieldDef={fieldDef} />
          </span>
        ))}
      </span>
    );
  }

  // Image arrays → horizontal gallery (thumbnails).
  if (type === "image") {
    return (
      <div className="flex flex-wrap gap-2">
        {filtered.map((item, i) =>
          typeof item === "string" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={item}
              alt=""
              className="h-16 w-16 object-cover rounded border border-border/40"
            />
          ) : null,
        )}
      </div>
    );
  }

  // Everything else (link, markdown, paragraph, object, url_map,
  // relation) → vertical list. Each item gets its full single-value
  // render and reads as a discrete entry.
  return (
    <ul className="space-y-1.5">
      {filtered.map((item, i) => (
        <li key={i} className="min-w-0">
          <SingleValue value={item} type={type} fieldDef={fieldDef} />
        </li>
      ))}
    </ul>
  );
}

/* ── Widgets ─────────────────────────────────────────────────────── */

function TextValue({ text }: { text: string }) {
  return <span className="text-sm break-words">{text}</span>;
}

function ParagraphValue({ text }: { text: string }) {
  return (
    <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {text}
    </span>
  );
}

/**
 * Inline-grade markdown — handles **bold**, *italic*, `code`,
 * [link](url). Block constructs (headings, lists, code fences) fall
 * through as plain text for now; upgrade path is to swap in the
 * async @/lib/markdown/renderer when block fidelity becomes
 * worth the cost.
 */
function MarkdownValue({ source }: { source: string }) {
  const nodes = useMemo(() => parseInlineMarkdown(source), [source]);
  return (
    <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {nodes}
    </span>
  );
}

function LinkValue({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-foreground hover:text-accent transition-colors break-all"
    >
      {href}
    </a>
  );
}

function EmailValue({ email }: { email: string }) {
  return (
    <a
      href={`mailto:${email}`}
      className="text-sm font-mono text-foreground hover:text-accent transition-colors break-all"
    >
      {email}
    </a>
  );
}

function ImageValue({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="max-w-full h-auto rounded border border-border/40"
    />
  );
}

/**
 * Best-effort datetime formatter. Accepts ISO 8601 strings, partial
 * ISO ("2024", "2024-10", "2024-10-15"), or epoch numbers. Falls
 * back to raw string when unparseable.
 *
 * Format is the curated set from DatetimeFormat — picks how granular
 * the display gets. List rows default to `relative` (mail style);
 * detail rows default to `datetime`. Schema authors override per
 * field via `fields[k].format`.
 */
function DateTimeValue({
  iso,
  format,
}: {
  iso: string;
  format: DatetimeFormat;
}) {
  const parsed = parseDateLike(iso);
  if (!parsed) return <TextValue text={iso} />;
  const out = formatDatetime(parsed, format);
  return (
    <time
      dateTime={iso}
      className="text-sm text-foreground tabular-nums"
      suppressHydrationWarning
    >
      {out}
    </time>
  );
}

const DATETIME_FORMATS: ReadonlySet<DatetimeFormat> = new Set([
  "relative",
  "date",
  "month_day",
  "month",
  "year",
  "time",
  "datetime",
  "datetime_full",
  "zh_date",
  "zh_datetime",
]);

/** Narrow an open string from the schema to the curated format set. */
function normalizeDatetimeFormat(
  raw: string | undefined,
): DatetimeFormat | null {
  if (!raw) return null;
  return DATETIME_FORMATS.has(raw as DatetimeFormat)
    ? (raw as DatetimeFormat)
    : null;
}

/** Parse "2024", "2024-10", "2024-10-15", full ISO, or epoch numbers. */
function parseDateLike(input: string): Date | null {
  if (!input) return null;
  // YYYY only — Date.parse treats "2024" as Jan 1 UTC. Force month=Jan.
  if (/^\d{4}$/.test(input)) return new Date(Number(input), 0, 1);
  // YYYY-MM — month-only.
  const ym = /^(\d{4})-(\d{1,2})$/.exec(input);
  if (ym) return new Date(Number(ym[1]), Number(ym[2]) - 1, 1);
  // Date.parse handles YYYY-MM-DD, full ISO, etc.
  const ts = Date.parse(input);
  if (Number.isFinite(ts)) return new Date(ts);
  return null;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatDatetime(d: Date, format: DatetimeFormat): string {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  switch (format) {
    case "relative":
      return relativeAgo(d.getTime());
    case "date":
      return `${y}/${m}/${day}`;
    case "month_day":
      return `${m}/${day}`;
    case "month":
      return `${y}/${m}`;
    case "year":
      return `${y}`;
    case "time":
      return `${hh}:${mm}`;
    case "datetime":
      return `${y}/${m}/${day} ${hh}:${mm}`;
    case "datetime_full":
      return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
    case "zh_date":
      return `${y} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
    case "zh_datetime":
      return `${y} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hh}:${mm}:${ss}`;
  }
}

/** "5d", "17h", "3m", "now" — mail-client style. */
function relativeAgo(ts: number): string {
  const ms = Date.now() - ts;
  const s = Math.floor(ms / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  const y = Math.floor(d / 365);
  return `${y}y`;
}

/**
 * Duration accepts a number (seconds) or an ISO 8601 duration-like
 * string. Falls back to raw display when neither parses.
 */
function DurationValue({ value }: { value: unknown }) {
  let seconds: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    seconds = value;
  } else if (typeof value === "string") {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) seconds = n;
  }
  if (seconds === null) return <TextValue text={String(value)} />;

  const s = Math.floor(seconds);
  if (s < 60) return <TextValue text={`${s}s`} />;
  const m = Math.floor(s / 60);
  if (m < 60) return <TextValue text={`${m}m ${s % 60}s`} />;
  const h = Math.floor(m / 60);
  if (h < 24) return <TextValue text={`${h}h ${m % 60}m`} />;
  const d = Math.floor(h / 24);
  return <TextValue text={`${d}d ${h % 24}h`} />;
}

/**
 * Shared chip styling for status + options widgets.
 *
 * When the schema declares a per-option `color` (hex/rgb/etc.), we
 * alpha-blend that color via `color-mix(in srgb, …)` so the chip
 * carries the declared hue without throwing a vibrant green/red onto
 * the paper theme's cream bg. Background = 14% color, foreground = 70%
 * color mixed into `--foreground` so the text still reads against the
 * tinted bg in every theme.
 *
 * No color → fall back to the theme-owned `--chip-bg` / `--chip-fg`
 * tokens (defined per theme in globals.css), so each theme keeps its
 * own neutral chip palette: paper = warm cream, brutal-mono = signature
 * yellow, office = neutral gray. The tokens are the customization
 * surface — themes override them centrally, not per widget.
 */
function chipStyleFromColor(color: string | undefined): React.CSSProperties {
  if (color) {
    return {
      backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      color: `color-mix(in srgb, ${color} 70%, var(--foreground))`,
    };
  }
  return {
    backgroundColor: "var(--chip-bg)",
    color: "var(--chip-fg)",
  };
}

/**
 * Status chip — small (10px), inline-with-title sizing. Same color
 * pipeline as OptionsValue; the only difference is dimensions.
 */
function StatusValue({
  value,
  options,
}: {
  value: string;
  options?: FieldOption[];
}) {
  const opt = options?.find((o) => o.value === value);
  const label = opt?.label ?? value;
  return (
    <span
      className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-tight"
      style={chipStyleFromColor(opt?.color)}
    >
      {label}
    </span>
  );
}

/**
 * Tag chip — larger (12px), looser padding for standalone pill use.
 * Shares the color pipeline with StatusValue via chipStyleFromColor,
 * so schema-declared `options[].color` paints the background + text
 * uniformly across both widgets.
 */
function OptionsValue({
  value,
  options,
}: {
  value: string;
  options?: FieldOption[];
}) {
  const opt = options?.find((o) => o.value === value);
  const label = opt?.label ?? value;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs"
      style={chipStyleFromColor(opt?.color)}
    >
      {label}
    </span>
  );
}

/** Horizontal bar, value clamped 0-100. Accepts 0..1 too (auto-detect). */
function ProgressValue({ value }: { value: number }) {
  if (!Number.isFinite(value)) return DEFAULT_EMPTY;
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="inline-block h-1.5 w-24 rounded-full bg-muted/60 overflow-hidden">
        <span
          className="block h-full bg-[var(--accent)]"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="font-mono text-muted-foreground tabular-nums">
        {clamped}%
      </span>
    </span>
  );
}

/** ★ stars out of 5 (configurable cap via fieldDef.options[0].value="N"). */
function RatingValue({ value }: { value: number }) {
  if (!Number.isFinite(value)) return DEFAULT_EMPTY;
  const max = 5;
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span className="inline-flex items-baseline gap-0.5 text-sm">
      <span aria-label={`${filled} of ${max}`}>
        {"★".repeat(filled)}
        <span className="text-muted-foreground/40">{"☆".repeat(max - filled)}</span>
      </span>
    </span>
  );
}

/**
 * Cross-entity link. For now, just a styled badge — clicking does
 * nothing until cross-collection navigation (planned). When that
 * lands we'll resolve `id` against a target jsonl declared on the
 * schema (e.g. `target_collection: "people.jsonl"`).
 */
function RelationValue({ id }: { id: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
      <span aria-hidden>→</span>
      {id}
    </span>
  );
}

/**
 * Object as a markdown-style indented KV list. Each leaf goes back
 * through `<FieldValue>` with its inferred type so nested URLs /
 * dates / etc. still render correctly. Recursive — nested objects
 * indent further. Caps recursion at depth 3 to avoid runaway trees
 * (display becomes `{ N keys }`).
 */
function ObjectValue({
  value,
  depth,
}: {
  value: Record<string, unknown>;
  depth: number;
}) {
  const entries = Object.entries(value);
  if (entries.length === 0) return DEFAULT_EMPTY;
  if (depth >= 3) {
    return (
      <span className="text-xs text-muted-foreground font-mono">
        {`{ ${entries.length} keys }`}
      </span>
    );
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {entries.map(([k, v]) => (
        <li
          key={k}
          className="flex items-baseline gap-2 min-w-0"
          style={{ paddingLeft: depth > 0 ? "0.75rem" : 0 }}
        >
          <span className="text-muted-foreground/80 font-mono text-xs shrink-0">
            {k}:
          </span>
          <span className="min-w-0 flex-1 break-words">
            {v !== null &&
            typeof v === "object" &&
            !Array.isArray(v) ? (
              <ObjectValue
                value={v as Record<string, unknown>}
                depth={depth + 1}
              />
            ) : (
              <FieldValue value={v} />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Legacy: object whose values are all URLs. Renders as link list. */
function UrlMapValue({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(
    ([, v]) => typeof v === "string" && v.length > 0,
  );
  if (entries.length === 0) return DEFAULT_EMPTY;
  return (
    <ul className="space-y-1">
      {entries.map(([label, url]) => (
        <li key={label} className="min-w-0">
          <a
            href={url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-baseline gap-1 text-sm text-foreground hover:text-accent transition-colors max-w-full"
            title={url as string}
          >
            <span className="font-mono text-[11px] text-muted-foreground shrink-0">
              {label}
            </span>
            <span aria-hidden className="text-muted-foreground/60 text-[10px]">
              ↗
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/**
 * Infer a reasonable type from a runtime value when no schema is
 * declared. Conservative — only commits to a type when the shape is
 * unambiguous. Falls back to "text" otherwise.
 */
function inferType(value: unknown): string {
  if (Array.isArray(value)) {
    // Array: infer from first non-empty element
    const first = value.find((v) => !isEmpty(v));
    if (first === undefined) return "text";
    return inferType(first);
  }
  if (typeof value === "string") {
    if (looksLikeUrl(value)) return "link";
    if (looksLikeEmail(value)) return "email";
    if (looksLikeISODate(value)) return "datetime";
    return "text";
  }
  if (typeof value === "number") return "text";
  if (typeof value === "boolean") return "text";
  if (typeof value === "object" && value !== null) {
    if (looksLikeUrlMap(value as Record<string, unknown>)) return "url_map";
    return "object";
  }
  return "text";
}

export function looksLikeUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

export function looksLikeEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function looksLikeISODate(v: string): boolean {
  // YYYY-MM-DD or full ISO 8601 — Date.parse alone isn't reliable
  // (it'll parse "2026" as a date), so require at least YYYY-MM-DD.
  return /^\d{4}-\d{2}-\d{2}/.test(v);
}

function looksLikeUrlMap(v: Record<string, unknown>): boolean {
  const entries = Object.entries(v);
  if (entries.length === 0) return false;
  let hasUrl = false;
  for (const [, val] of entries) {
    if (val === null || val === undefined || val === "") continue;
    if (looksLikeUrl(val)) {
      hasUrl = true;
      continue;
    }
    return false;
  }
  return hasUrl;
}

function formatScalar(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* ── Inline markdown (bold / italic / code / link) ──────────────── */

type InlineNode = string | { kind: "bold" | "italic" | "code"; text: string } | {
  kind: "link";
  text: string;
  href: string;
};

/**
 * Lean parser for the four marks that show up in jsonl field values:
 * **bold**, *italic*, `code`, [text](url). Mirrors the InlineMarkdown
 * helper in collection-view but kept local here so this file has no
 * upward dependency.
 */
function parseInlineMarkdown(source: string): ReactNode[] {
  const tokens = tokenize(source);
  return tokens.map((tok, i) => {
    if (typeof tok === "string") return <span key={i}>{tok}</span>;
    if (tok.kind === "bold")
      return (
        <strong key={i} className="font-semibold">
          {tok.text}
        </strong>
      );
    if (tok.kind === "italic")
      return (
        <em key={i} className="italic">
          {tok.text}
        </em>
      );
    if (tok.kind === "code")
      return (
        <code
          key={i}
          className="rounded bg-muted/60 px-1 py-0.5 text-[0.9em] font-mono"
        >
          {tok.text}
        </code>
      );
    if (tok.kind === "link")
      return (
        <a
          key={i}
          href={tok.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-accent"
        >
          {tok.text}
        </a>
      );
    return null;
  });
}

function tokenize(src: string): InlineNode[] {
  const out: InlineNode[] = [];
  let i = 0;
  while (i < src.length) {
    // [text](url)
    if (src[i] === "[") {
      const close = src.indexOf("]", i + 1);
      if (close > i && src[close + 1] === "(") {
        const paren = src.indexOf(")", close + 2);
        if (paren > close) {
          out.push({
            kind: "link",
            text: src.slice(i + 1, close),
            href: src.slice(close + 2, paren),
          });
          i = paren + 1;
          continue;
        }
      }
    }
    // **bold**
    if (src.startsWith("**", i)) {
      const close = src.indexOf("**", i + 2);
      if (close > i + 2) {
        out.push({ kind: "bold", text: src.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    // *italic*
    if (src[i] === "*") {
      const close = src.indexOf("*", i + 1);
      if (close > i + 1) {
        out.push({ kind: "italic", text: src.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    // `code`
    if (src[i] === "`") {
      const close = src.indexOf("`", i + 1);
      if (close > i + 1) {
        out.push({ kind: "code", text: src.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    // Plain run — accumulate until the next markdown sigil.
    let j = i;
    while (
      j < src.length &&
      src[j] !== "[" &&
      src[j] !== "*" &&
      src[j] !== "`"
    ) {
      j++;
    }
    out.push(src.slice(i, j));
    i = j === i ? j + 1 : j;
  }
  return out;
}
