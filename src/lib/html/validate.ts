/**
 * HTML validation for huozi-templated documents.
 *
 * Returns a list of issues an author / agent should know about. None of
 * these abort rendering — they're advisory feedback surfaced in the
 * workspace UI (banner above the preview) and via Agent-facing tool
 * responses. The publish surface intentionally hides them: end-readers
 * shouldn't see dev hints.
 *
 * Rule taxonomy (HTML-specific; other content types have their own
 * validators living next to their renderers).
 *
 *   error     —— author wrote something that breaks render contract
 *                (paginated format with zero pages, duplicate page ids,
 *                unknown huozi:format value)
 *   warning   —— action will succeed but result probably isn't what the
 *                author intended (CDN <script> will be stripped by the
 *                sandbox, format meta disagrees with class)
 *   hint      —— best-practice nudges (missing data-title, no explicit
 *                huozi:format meta)
 *
 * Each issue carries a stable `code` for docs / i18n and an optional
 * source `line` so the workspace UI can deep-link.
 *
 * Spec: `dev/2026-05-10-share-viewer-norms.html` §8 (forthcoming).
 */

import { type HuoziFormat, isPaginated } from "./detect-format";

export type ValidationLevel = "error" | "warning" | "hint";

export interface ValidationIssue {
  level: ValidationLevel;
  /** Stable identifier for docs + i18n. kebab-case. */
  code: string;
  /** Human-readable. zh-first; UI can swap by locale via `code`. */
  message: string;
  /** 1-based source line, when locatable. */
  line?: number;
  /** Optional next-step hint. */
  remedy?: string;
  /** Anchor in spec docs (e.g. "norms#3-format-types"). */
  docRef?: string;
}

const ALL_FORMATS = new Set<HuoziFormat>([
  "deck",
  "story",
  "paper",
  "mobile",
  "web",
]);

const KNOWN_BUNDLES = new Set<string>([
  // Tier 1 (toolbox v1 spec §2)
  "mermaid",
  "highlight",
  "katex",
  "marked",
  // Tier 2
  "echarts",
  "uplot",
  "chartjs",
  "vega-lite",
]);

/** 1-based line number for a string offset. */
function lineFor(html: string, offset: number): number {
  if (offset <= 0) return 1;
  let line = 1;
  for (let i = 0; i < offset && i < html.length; i++) {
    if (html.charCodeAt(i) === 10 /* \n */) line += 1;
  }
  return line;
}

interface FormatMetaMatch {
  value: string;
  index: number;
}

/**
 * Build skip-ranges for inert HTML regions: comments, <pre>, <code>,
 * <style>, <script>. Patterns inside these aren't real HTML — they're
 * displayed as text (code examples) or are CSS / scripts in their own
 * grammar. Without this, a spec doc that shows `<meta huozi:format=...>`
 * inside `<pre><code>` would self-report as a deck.
 */
function buildSkipRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const sources: RegExp[] = [
    /<!--[\s\S]*?-->/g,
    /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
    /<code\b[^>]*>[\s\S]*?<\/code>/gi,
    /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  ];
  for (const src of sources) {
    const r = new RegExp(src.source, src.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(html)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function isInRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true;
  }
  return false;
}

function readFormatMeta(
  html: string,
  skip: Array<[number, number]>,
): FormatMetaMatch | null {
  const re = /<meta\s+name=["']huozi:format["']\s+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (isInRanges(m.index, skip)) continue;
    return { value: m[1].trim().toLowerCase(), index: m.index };
  }
  return null;
}

function readClassFormat(
  html: string,
  skip: Array<[number, number]>,
): HuoziFormat | null {
  for (const f of ALL_FORMATS) {
    const re = new RegExp(`class=["'][^"']*\\bhuozi-${f}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      if (isInRanges(m.index, skip)) continue;
      return f;
    }
  }
  return null;
}

function readBundleMeta(
  html: string,
  skip: Array<[number, number]>,
): FormatMetaMatch | null {
  const re = /<meta\s+name=["']huozi:bundle["']\s+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (isInRanges(m.index, skip)) continue;
    return { value: m[1].trim(), index: m.index };
  }
  return null;
}

interface DataPageSection {
  id: string | null;
  index: number;
  /** Source offset of the opening tag. */
  offset: number;
  /** Whether `data-title` was set. */
  hasTitle: boolean;
}

const SECTION_OPEN_RE =
  /<(section|article)\b([^>]*\bdata-page\b[^>]*)>/gi;

function readAttr(attrs: string, name: string): string | null {
  const m = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return m ? (m[1] ?? m[2] ?? "") : null;
}

function findDataPageSections(
  html: string,
  skip: Array<[number, number]>,
): DataPageSection[] {
  // skip ranges already include comments + pre/code/style/script — see
  // buildSkipRanges. Sections inside any of those are inert text.
  const out: DataPageSection[] = [];
  const re = new RegExp(SECTION_OPEN_RE.source, SECTION_OPEN_RE.flags);
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    if (isInRanges(m.index, skip)) continue;
    i += 1;
    out.push({
      id: readAttr(m[2], "id"),
      index: i,
      offset: m.index,
      hasTitle: readAttr(m[2], "data-title") !== null,
    });
  }
  return out;
}

const SCRIPT_SRC_RE =
  /<script\b[^>]*\ssrc\s*=\s*["']?(https?:[^"'\s>]+)["']?[^>]*>/gi;

/**
 * Run the full HTML rule set. Order is stable so the UI can render issues
 * in declaration order.
 */
export function validateHuoziHtml(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Inert regions (comments / pre / code / style / script) — we look for
  // huozi:* meta and class hits OUTSIDE these. Without it a spec doc that
  // shows `<meta huozi:format=...>` inside <pre><code> would falsely
  // self-report as a deck.
  const skip = buildSkipRanges(html);

  // ── Rule: huozi:format value must be in the 5 known types ──
  const formatMeta = readFormatMeta(html, skip);
  if (formatMeta && !ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
    issues.push({
      level: "error",
      code: "format-unknown",
      message: `huozi:format="${formatMeta.value}" 不在已知 5 种类型里，已退化为 web`,
      line: lineFor(html, formatMeta.index),
      remedy: "使用 deck / story / paper / mobile / web 之一",
      docRef: "norms#1-format-types",
    });
  }

  // Effective format used by the rest of the rules. Mirrors detect-format.ts
  // resolution order: meta → class → "web".
  const effectiveFormat: HuoziFormat = (() => {
    if (formatMeta && ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
      return formatMeta.value as HuoziFormat;
    }
    return readClassFormat(html, skip) ?? "web";
  })();

  // ── Rule: meta vs class disagreement ──
  const classFormat = readClassFormat(html, skip);
  if (
    formatMeta &&
    ALL_FORMATS.has(formatMeta.value as HuoziFormat) &&
    classFormat &&
    classFormat !== formatMeta.value
  ) {
    issues.push({
      level: "warning",
      code: "format-meta-class-mismatch",
      message: `huozi:format=${formatMeta.value} 与 class="huozi-${classFormat}" 不一致；meta 优先生效`,
      line: lineFor(html, formatMeta.index),
      remedy: `统一为 huozi-${formatMeta.value} 或调整 meta 值`,
      docRef: "norms#1-3-format-declaration",
    });
  }

  // ── Rule: class-only declaration (no meta) ──
  if (!formatMeta && classFormat) {
    issues.push({
      level: "hint",
      code: "format-meta-missing",
      message: `推荐显式写 <meta name="huozi:format" content="${classFormat}">`,
      remedy: "class 嗅探是 legacy 兜底，meta 是 authoritative declaration",
      docRef: "norms#1-3-format-declaration",
    });
  }

  // ── Rule: paginated format must have at least one [data-page] ──
  const sections = findDataPageSections(html, skip);
  if (isPaginated(effectiveFormat) && sections.length === 0) {
    issues.push({
      level: "error",
      code: "paginated-no-pages",
      message: `huozi:format=${effectiveFormat} 但找不到任何 <section data-page>，分页器和大纲都不会工作`,
      remedy:
        '把每页内容包在 <section data-page id="..." data-title="..."> 里',
      docRef: "norms#2-page-marker",
    });
  }

  // ── Rule: duplicate page ids (only count author-supplied ones) ──
  const idCounts = new Map<string, number[]>();
  for (const s of sections) {
    if (!s.id) continue;
    const arr = idCounts.get(s.id) ?? [];
    arr.push(s.index);
    idCounts.set(s.id, arr);
  }
  for (const [id, indices] of idCounts) {
    if (indices.length > 1) {
      const first = sections.find((s) => s.id === id)!;
      issues.push({
        level: "error",
        code: "page-id-duplicate",
        message: `id="${id}" 在 ${indices.length} 个 <section data-page> 上重复，scrollIntoView 会永远跳到第一个`,
        line: lineFor(html, first.offset),
        remedy: "每个 data-page 给唯一 id，或留空让 huozi 自动注入 s${N}",
        docRef: "norms#2-page-marker",
      });
    }
  }

  // ── Rule: data-title missing (hint, low severity) ──
  const sectionsWithoutTitle = sections.filter((s) => !s.hasTitle);
  if (sectionsWithoutTitle.length > 0) {
    issues.push({
      level: "hint",
      code: "data-title-missing",
      message: `${sectionsWithoutTitle.length} 个 <section data-page> 缺 data-title，大纲菜单会 fallback 到页内 h1/h2/h3`,
      line: lineFor(html, sectionsWithoutTitle[0].offset),
      remedy: "data-title 让大纲更稳，不依赖标题层级",
      docRef: "norms#2-page-marker",
    });
  }

  // ── Rule: huozi:bundle has unknown keys ──
  const bundleMeta = readBundleMeta(html, skip);
  if (bundleMeta) {
    const keys = bundleMeta.value
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const unknown = keys.filter((k) => !KNOWN_BUNDLES.has(k));
    if (unknown.length > 0) {
      issues.push({
        level: "warning",
        code: "bundle-unknown-key",
        message: `huozi:bundle 含未识别 key: ${unknown.join(", ")}`,
        line: lineFor(html, bundleMeta.index),
        remedy: `已知 keys: ${[...KNOWN_BUNDLES].join(", ")}`,
        docRef: "toolbox-spec#2-bundles",
      });
    }
  }

  // ── Rule: external <script src="http(s):..."> will be stripped ──
  // Note: this rule needs to scan the WHOLE html (not skip-aware) because
  // <script> blocks themselves are part of the skip set — but only the
  // ones with raw src="http(s)" attributes are the real-author concern.
  // Examples shown inside <pre><code> are still skipped (they're inside
  // the code skip range, not the script skip range).
  const re = new RegExp(SCRIPT_SRC_RE.source, SCRIPT_SRC_RE.flags);
  // Skip only inert *display* regions (comments / pre / code / style),
  // NOT <script> itself — we want to flag real script tags.
  const displaySkip = skip.filter(([s, e]) => {
    const slice = html.slice(s, Math.min(e, s + 8)).toLowerCase();
    return !slice.startsWith("<script");
  });
  let scriptMatch: RegExpExecArray | null;
  const externalScripts: Array<{ url: string; offset: number }> = [];
  while ((scriptMatch = re.exec(html)) !== null) {
    if (isInRanges(scriptMatch.index, displaySkip)) continue;
    externalScripts.push({ url: scriptMatch[1], offset: scriptMatch.index });
  }
  if (externalScripts.length > 0) {
    issues.push({
      level: "warning",
      code: "external-script-blocked",
      message: `检测到 ${externalScripts.length} 个 <script src="https://...">，发布时会被沙箱 strip`,
      line: lineFor(html, externalScripts[0].offset),
      remedy:
        '如果是 mermaid / echarts 等已知库，改用 <meta name="huozi:bundle"> 声明加载',
      docRef: "toolbox-spec#3-2-author-constraints",
    });
  }

  return issues;
}

/** Compact summary for banner header. */
export interface ValidationSummary {
  error: number;
  warning: number;
  hint: number;
  total: number;
}

export function summarize(issues: ValidationIssue[]): ValidationSummary {
  const s: ValidationSummary = { error: 0, warning: 0, hint: 0, total: 0 };
  for (const i of issues) {
    s[i.level] += 1;
    s.total += 1;
  }
  return s;
}
