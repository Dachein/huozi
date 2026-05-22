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
import { KNOWN_BUNDLE_KEYS } from "./asset-registry";
import { getRule, type ValidationLevel } from "./validate-rules";

export type { ValidationLevel } from "./validate-rules";
export { listValidationRules } from "./validate-rules";

export interface ValidationIssue {
  level: ValidationLevel;
  /** Stable identifier for docs + i18n. kebab-case. Look up the full
   *  rule via `getRule(code)` for title / why / remedy / docRef. */
  code: string;
  /** Human-readable, with file-specific context (line numbers, values).
   *  Generic guidance lives in the catalog's `title` + `why`. */
  message: string;
  /** 1-based source line, when locatable. */
  line?: number;
  /** Optional next-step hint, file-specific. Falls back to the catalog's
   *  generic `remedy` when not set. */
  remedy?: string;
  /** Anchor in spec docs (e.g. "norms#3-format-types"). Falls back to
   *  the catalog entry. */
  docRef?: string;
}

/** Helper: pull metadata defaults from the catalog so detection sites
 *  only need to provide context-specific fields (message, line). */
function issueFromRule(
  code: string,
  context: { message: string; line?: number; remedy?: string },
): ValidationIssue {
  const rule = getRule(code);
  if (!rule) {
    // Programmer error — every emitted code must exist in validate-rules.
    return { level: "warning", code, message: context.message, line: context.line };
  }
  return {
    level: rule.level,
    code,
    message: context.message,
    line: context.line,
    remedy: context.remedy ?? rule.remedy,
    docRef: rule.docRef,
  };
}

const ALL_FORMATS = new Set<HuoziFormat>([
  "deck",
  "story",
  "paper",
  "dashboard",
  "blog",
]);

/** Deprecated `huozi:format` values that still parse at render time
 *  (aliased to "blog" by detect-format) but should warn the author. */
const DEPRECATED_FORMAT_VALUES = new Set<string>(["mobile", "web"]);

// Bundle key list is the registry's responsibility — single source of
// truth. Importing here keeps the validator's "unknown key" warning in
// sync with what's actually injectable at render time.
const KNOWN_BUNDLES = KNOWN_BUNDLE_KEYS;

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
  if (formatMeta) {
    if (DEPRECATED_FORMAT_VALUES.has(formatMeta.value)) {
      // mobile / web were collapsed into "blog" — renderer still aliases
      // them, but we surface the deprecation so the next save updates
      // the marker.
      issues.push({
        level: "error",
        code: "format-deprecated",
        message: `huozi:format="${formatMeta.value}" 已废弃，已并入 blog`,
        line: lineFor(html, formatMeta.index),
        remedy: "改写为 huozi:format=\"blog\"（响应式长文，自适应桌面与手机）",
        docRef: "norms#1-format-types",
      });
    } else if (!ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
      issues.push({
        level: "error",
        code: "format-unknown",
        message: `huozi:format="${formatMeta.value}" 不在已知 5 种类型里，已退化为 blog`,
        line: lineFor(html, formatMeta.index),
        remedy: "使用 deck / story / paper / dashboard / blog 之一",
        docRef: "norms#1-format-types",
      });
    }
  }

  // Effective format used by the rest of the rules. Mirrors detect-format.ts
  // resolution order: meta → class → "blog". Deprecated values resolve to
  // their alias so subsequent rules don't get confused.
  const effectiveFormat: HuoziFormat = (() => {
    if (formatMeta) {
      if (ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
        return formatMeta.value as HuoziFormat;
      }
      if (DEPRECATED_FORMAT_VALUES.has(formatMeta.value)) return "blog";
    }
    return readClassFormat(html, skip) ?? "blog";
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
    issues.push(
      issueFromRule("external-script-blocked", {
        message: `检测到 ${externalScripts.length} 个 <script src="https://...">，发布时会被沙箱 strip`,
        line: lineFor(html, externalScripts[0].offset),
      }),
    );
  }

  // ── Rule: inline <script> blocks will be stripped ──
  // Match <script>…</script> where the opening tag has NO src attribute.
  // We're not looking inside skip ranges (which include <script> itself),
  // so we run our own scan over the raw html. Skip code-example regions
  // (pre/code) but not script regions themselves.
  const INLINE_SCRIPT_RE = /<script\b([^>]*)>/gi;
  const codeOnlySkip = displaySkip;
  const inlineScripts: number[] = [];
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = INLINE_SCRIPT_RE.exec(html)) !== null) {
    if (isInRanges(inlineMatch.index, codeOnlySkip)) continue;
    // Has src? Already covered by external-script-blocked.
    if (/\bsrc\s*=/i.test(inlineMatch[1])) continue;
    inlineScripts.push(inlineMatch.index);
  }
  if (inlineScripts.length > 0) {
    issues.push(
      issueFromRule("inline-script-blocked", {
        message: `检测到 ${inlineScripts.length} 个内联 <script>，发布时会被沙箱 strip`,
        line: lineFor(html, inlineScripts[0]),
      }),
    );
  }

  // ── Rule: <iframe> / <embed> / <object> will be stripped ──
  const EMBED_RE = /<(iframe|embed|object)\b[^>]*>/gi;
  const embeds: Array<{ tag: string; offset: number }> = [];
  let embedMatch: RegExpExecArray | null;
  while ((embedMatch = EMBED_RE.exec(html)) !== null) {
    if (isInRanges(embedMatch.index, codeOnlySkip)) continue;
    embeds.push({ tag: embedMatch[1].toLowerCase(), offset: embedMatch.index });
  }
  if (embeds.length > 0) {
    const tags = [...new Set(embeds.map((e) => `<${e.tag}>`))].join(" / ");
    issues.push(
      issueFromRule("iframe-or-embed-stripped", {
        message: `检测到 ${embeds.length} 个 ${tags}，发布时会被沙箱 strip，留下空洞`,
        line: lineFor(html, embeds[0].offset),
      }),
    );
  }

  // ── Rule: vw / vh units inside a paginated format ──
  // Author writes the file targeting a fixed canvas; the platform
  // transform-scales it to fit the viewport. vw/vh resolve against the
  // viewport (NOT the canvas), so any size or position using them
  // de-syncs from the rest of the layout — exactly the bug that bit us
  // when stories were rendered on desktop.
  if (
    effectiveFormat === "deck" ||
    effectiveFormat === "story" ||
    effectiveFormat === "dashboard"
  ) {
    // Match the units only inside CSS contexts. We scan <style> blocks
    // and inline style attributes. (The skip ranges normally EXCLUDE
    // these regions for us — for THIS rule we want to scan them.)
    const cssContexts: Array<{ text: string; baseOffset: number }> = [];
    const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = STYLE_BLOCK_RE.exec(html)) !== null) {
      // Skip if the <style> tag itself is inside a code example.
      if (isInRanges(sm.index, codeOnlySkip)) continue;
      cssContexts.push({
        text: sm[1],
        baseOffset: sm.index + sm[0].indexOf(sm[1]),
      });
    }
    const STYLE_ATTR_RE = /\sstyle\s*=\s*"([^"]*)"|\sstyle\s*=\s*'([^']*)'/gi;
    let am: RegExpExecArray | null;
    while ((am = STYLE_ATTR_RE.exec(html)) !== null) {
      if (isInRanges(am.index, skip)) continue;
      const inner = am[1] ?? am[2] ?? "";
      const innerStart = am[0].indexOf(inner);
      cssContexts.push({ text: inner, baseOffset: am.index + innerStart });
    }
    const VW_VH_RE = /\b\d+(?:\.\d+)?(vw|vh)\b/gi;
    const vwHits: number[] = [];
    for (const ctx of cssContexts) {
      let vm: RegExpExecArray | null;
      const re = new RegExp(VW_VH_RE.source, VW_VH_RE.flags);
      while ((vm = re.exec(ctx.text)) !== null) {
        // 100vh on .huozi-X root rules is OK — the canvas wrapper
        // overrides them with !important. Be slightly forgiving: only
        // flag obvious in-content uses by checking proximity to common
        // root selectors is overkill, so just count ALL and let the
        // agent decide. A future iteration can be smarter.
        vwHits.push(ctx.baseOffset + vm.index);
      }
    }
    if (vwHits.length > 0) {
      issues.push(
        issueFromRule("vw-vh-in-paginated", {
          message: `paginated format ${effectiveFormat} 内检测到 ${vwHits.length} 处 vw/vh 使用；cqw/cqh 才能跨内嵌/全屏/发布稳定`,
          line: lineFor(html, vwHits[0]),
        }),
      );
    }
  }

  // ── Rule: <title> missing ──
  if (!/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    issues.push(
      issueFromRule("title-missing", { message: "<head> 缺少 <title>" }),
    );
  }

  // ── Rule: og:image missing ──
  if (
    !/<meta\s+property=["']og:image["']/i.test(html) &&
    !/<meta\s+name=["']twitter:image["']/i.test(html)
  ) {
    issues.push(
      issueFromRule("og-image-missing", {
        message: "<head> 缺少 og:image / twitter:image",
      }),
    );
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
