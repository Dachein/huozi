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

function readFormatMeta(html: string): FormatMetaMatch | null {
  const re = /<meta\s+name=["']huozi:format["']\s+content=["']([^"']+)["']/i;
  const m = html.match(re);
  if (!m) return null;
  return { value: m[1].trim().toLowerCase(), index: m.index ?? 0 };
}

function readClassFormat(html: string): HuoziFormat | null {
  for (const f of ALL_FORMATS) {
    if (new RegExp(`class=["'][^"']*\\bhuozi-${f}\\b`).test(html)) {
      return f;
    }
  }
  return null;
}

function readBundleMeta(html: string): FormatMetaMatch | null {
  const re = /<meta\s+name=["']huozi:bundle["']\s+content=["']([^"']+)["']/i;
  const m = html.match(re);
  if (!m) return null;
  return { value: m[1].trim(), index: m.index ?? 0 };
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

function findDataPageSections(html: string): DataPageSection[] {
  // Strip comments so `<!-- <section data-page> -->` examples don't count.
  const commentRanges: Array<[number, number]> = [];
  const cre = /<!--[\s\S]*?-->/g;
  let cm: RegExpExecArray | null;
  while ((cm = cre.exec(html)) !== null) {
    commentRanges.push([cm.index, cm.index + cm[0].length]);
  }
  const inComment = (pos: number) => {
    for (const [s, e] of commentRanges) {
      if (pos >= s && pos < e) return true;
    }
    return false;
  };

  const out: DataPageSection[] = [];
  const re = new RegExp(SECTION_OPEN_RE.source, SECTION_OPEN_RE.flags);
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    if (inComment(m.index)) continue;
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

  // ── Rule: huozi:format value must be in the 5 known types ──
  const formatMeta = readFormatMeta(html);
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
    return readClassFormat(html) ?? "web";
  })();

  // ── Rule: meta vs class disagreement ──
  const classFormat = readClassFormat(html);
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
  const sections = findDataPageSections(html);
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
  const bundleMeta = readBundleMeta(html);
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
  const re = new RegExp(SCRIPT_SRC_RE.source, SCRIPT_SRC_RE.flags);
  let scriptMatch: RegExpExecArray | null;
  const externalScripts: Array<{ url: string; offset: number }> = [];
  while ((scriptMatch = re.exec(html)) !== null) {
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
