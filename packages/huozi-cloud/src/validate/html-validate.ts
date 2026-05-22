/**
 * HTML validation — port of `app/src/lib/html/validate.ts`.
 *
 * Same rule set, same diagnostic shape. Lives here so the worker-side
 * `huozi_validate` / `huozi_validate_rules` MCP tools can run without
 * reaching back into the Next.js app's source tree (the worker is a
 * separate package with its own rootDir; the two trees can't share
 * modules directly).
 *
 * KEEP IN SYNC with the frontend copy. If a rule is added or tightened
 * on one side, mirror it on the other.
 */

import {
  getRule,
  type HuoziFormat,
  type ValidationLevel,
} from './validate-rules.js'

export type { ValidationLevel } from './validate-rules.js'
export { listValidationRules, VALIDATION_RULES } from './validate-rules.js'

export interface ValidationIssue {
  level: ValidationLevel
  code: string
  message: string
  line?: number
  remedy?: string
  docRef?: string
}

export interface ValidationSummary {
  error: number
  warning: number
  hint: number
  total: number
}

const ALL_FORMATS = new Set<HuoziFormat>([
  'deck',
  'story',
  'paper',
  'dashboard',
  'blog',
])
const DEPRECATED_FORMAT_VALUES = new Set<string>(['mobile', 'web'])
const PAGINATED_FORMATS = new Set<HuoziFormat>(['deck', 'story', 'paper'])
const KNOWN_BUNDLES = new Set<string>([
  'mermaid',
  'highlight',
  'katex',
  'marked',
  'echarts',
  'uplot',
  'chartjs',
  'vega-lite',
])

function isPaginated(f: HuoziFormat): boolean {
  return PAGINATED_FORMATS.has(f)
}

function lineFor(html: string, offset: number): number {
  if (offset <= 0) return 1
  let line = 1
  for (let i = 0; i < offset && i < html.length; i++) {
    if (html.charCodeAt(i) === 10) line += 1
  }
  return line
}

/** Helper: pull metadata defaults from the catalog so detection sites
 *  only need to provide context-specific fields (message, line). */
function issueFromRule(
  code: string,
  context: { message: string; line?: number; remedy?: string },
): ValidationIssue {
  const rule = getRule(code)
  if (!rule) {
    return {
      level: 'warning',
      code,
      message: context.message,
      ...(context.line !== undefined ? { line: context.line } : {}),
    }
  }
  return {
    level: rule.level,
    code,
    message: context.message,
    ...(context.line !== undefined ? { line: context.line } : {}),
    remedy: context.remedy ?? rule.remedy,
    ...(rule.docRef !== undefined ? { docRef: rule.docRef } : {}),
  }
}

interface FormatMetaMatch {
  value: string
  index: number
}

function buildSkipRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const sources: RegExp[] = [
    /<!--[\s\S]*?-->/g,
    /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
    /<code\b[^>]*>[\s\S]*?<\/code>/gi,
    /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  ]
  for (const src of sources) {
    const r = new RegExp(src.source, src.flags)
    let m: RegExpExecArray | null
    while ((m = r.exec(html)) !== null) {
      ranges.push([m.index, m.index + m[0].length])
    }
  }
  return ranges
}

function isInRanges(pos: number, ranges: Array<[number, number]>): boolean {
  for (const [s, e] of ranges) {
    if (pos >= s && pos < e) return true
  }
  return false
}

function readFormatMeta(
  html: string,
  skip: Array<[number, number]>,
): FormatMetaMatch | null {
  const re = /<meta\s+name=["']huozi:format["']\s+content=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (isInRanges(m.index, skip)) continue
    const value = m[1]
    if (value === undefined) continue
    return { value: value.trim().toLowerCase(), index: m.index }
  }
  return null
}

function readClassFormat(
  html: string,
  skip: Array<[number, number]>,
): HuoziFormat | null {
  for (const f of ALL_FORMATS) {
    const re = new RegExp(`class=["'][^"']*\\bhuozi-${f}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      if (isInRanges(m.index, skip)) continue
      return f
    }
  }
  return null
}

function readBundleMeta(
  html: string,
  skip: Array<[number, number]>,
): FormatMetaMatch | null {
  const re = /<meta\s+name=["']huozi:bundle["']\s+content=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (isInRanges(m.index, skip)) continue
    const value = m[1]
    if (value === undefined) continue
    return { value: value.trim(), index: m.index }
  }
  return null
}

interface DataPageSection {
  id: string | null
  index: number
  offset: number
  hasTitle: boolean
}

const SECTION_OPEN_RE = /<(section|article)\b([^>]*\bdata-page\b[^>]*)>/gi

function readAttr(attrs: string, name: string): string | null {
  const m = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'),
  )
  if (!m) return null
  const v = m[1] ?? m[2]
  return v ?? ''
}

function findDataPageSections(
  html: string,
  skip: Array<[number, number]>,
): DataPageSection[] {
  const out: DataPageSection[] = []
  const re = new RegExp(SECTION_OPEN_RE.source, SECTION_OPEN_RE.flags)
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(html)) !== null) {
    if (isInRanges(m.index, skip)) continue
    const attrs = m[2]
    if (attrs === undefined) continue
    i += 1
    out.push({
      id: readAttr(attrs, 'id'),
      index: i,
      offset: m.index,
      hasTitle: readAttr(attrs, 'data-title') !== null,
    })
  }
  return out
}

const SCRIPT_SRC_RE =
  /<script\b[^>]*\ssrc\s*=\s*["']?(https?:[^"'\s>]+)["']?[^>]*>/gi

export function validateHuoziHtml(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const skip = buildSkipRanges(html)

  // Format declaration
  const formatMeta = readFormatMeta(html, skip)
  if (formatMeta) {
    if (DEPRECATED_FORMAT_VALUES.has(formatMeta.value)) {
      issues.push(
        issueFromRule('format-deprecated', {
          message: `huozi:format="${formatMeta.value}" 已废弃，已并入 blog`,
          line: lineFor(html, formatMeta.index),
          remedy: '改写为 huozi:format="blog"（响应式长文，自适应桌面与手机）',
        }),
      )
    } else if (!ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
      issues.push(
        issueFromRule('format-unknown', {
          message: `huozi:format="${formatMeta.value}" 不在已知 5 种类型里，已退化为 blog`,
          line: lineFor(html, formatMeta.index),
        }),
      )
    }
  }

  const effectiveFormat: HuoziFormat = (() => {
    if (formatMeta) {
      if (ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
        return formatMeta.value as HuoziFormat
      }
      if (DEPRECATED_FORMAT_VALUES.has(formatMeta.value)) return 'blog'
    }
    return readClassFormat(html, skip) ?? 'blog'
  })()

  const classFormat = readClassFormat(html, skip)
  if (
    formatMeta &&
    ALL_FORMATS.has(formatMeta.value as HuoziFormat) &&
    classFormat &&
    classFormat !== formatMeta.value
  ) {
    issues.push(
      issueFromRule('format-meta-class-mismatch', {
        message: `huozi:format=${formatMeta.value} 与 class="huozi-${classFormat}" 不一致；meta 优先生效`,
        line: lineFor(html, formatMeta.index),
      }),
    )
  }

  if (!formatMeta && classFormat) {
    issues.push(
      issueFromRule('format-meta-missing', {
        message: `推荐显式写 <meta name="huozi:format" content="${classFormat}">`,
      }),
    )
  }

  // Paginated structure
  const sections = findDataPageSections(html, skip)
  if (isPaginated(effectiveFormat) && sections.length === 0) {
    issues.push(
      issueFromRule('paginated-no-pages', {
        message: `huozi:format=${effectiveFormat} 但找不到任何 <section data-page>，分页器和大纲都不会工作`,
      }),
    )
  }

  const idCounts = new Map<string, number[]>()
  for (const s of sections) {
    if (!s.id) continue
    const arr = idCounts.get(s.id) ?? []
    arr.push(s.index)
    idCounts.set(s.id, arr)
  }
  for (const [id, indices] of idCounts) {
    if (indices.length > 1) {
      const first = sections.find((s) => s.id === id)!
      issues.push(
        issueFromRule('page-id-duplicate', {
          message: `id="${id}" 在 ${indices.length} 个 <section data-page> 上重复`,
          line: lineFor(html, first.offset),
        }),
      )
    }
  }

  const sectionsWithoutTitle = sections.filter((s) => !s.hasTitle)
  if (sectionsWithoutTitle.length > 0) {
    issues.push(
      issueFromRule('data-title-missing', {
        message: `${sectionsWithoutTitle.length} 个 <section data-page> 缺 data-title`,
        line: lineFor(html, sectionsWithoutTitle[0]!.offset),
      }),
    )
  }

  // Bundle keys
  const bundleMeta = readBundleMeta(html, skip)
  if (bundleMeta) {
    const keys = bundleMeta.value
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const unknown = keys.filter((k) => !KNOWN_BUNDLES.has(k))
    if (unknown.length > 0) {
      issues.push(
        issueFromRule('bundle-unknown-key', {
          message: `huozi:bundle 含未识别 key: ${unknown.join(', ')}`,
          line: lineFor(html, bundleMeta.index),
          remedy: `已知 keys: ${[...KNOWN_BUNDLES].join(', ')}`,
        }),
      )
    }
  }

  // Script / iframe stripping
  const displaySkip = skip.filter(([s, e]) => {
    const slice = html.slice(s, Math.min(e, s + 8)).toLowerCase()
    return !slice.startsWith('<script')
  })

  // External scripts
  const reExt = new RegExp(SCRIPT_SRC_RE.source, SCRIPT_SRC_RE.flags)
  let scriptMatch: RegExpExecArray | null
  const externalScripts: Array<{ url: string; offset: number }> = []
  while ((scriptMatch = reExt.exec(html)) !== null) {
    if (isInRanges(scriptMatch.index, displaySkip)) continue
    const url = scriptMatch[1]
    if (url === undefined) continue
    externalScripts.push({ url, offset: scriptMatch.index })
  }
  if (externalScripts.length > 0) {
    issues.push(
      issueFromRule('external-script-blocked', {
        message: `检测到 ${externalScripts.length} 个 <script src="https://...">，发布时会被沙箱 strip`,
        line: lineFor(html, externalScripts[0]!.offset),
      }),
    )
  }

  // Inline scripts (without src)
  const INLINE_SCRIPT_RE = /<script\b([^>]*)>/gi
  const inlineScripts: number[] = []
  let inlineMatch: RegExpExecArray | null
  while ((inlineMatch = INLINE_SCRIPT_RE.exec(html)) !== null) {
    if (isInRanges(inlineMatch.index, displaySkip)) continue
    const attrs = inlineMatch[1] ?? ''
    if (/\bsrc\s*=/i.test(attrs)) continue
    inlineScripts.push(inlineMatch.index)
  }
  if (inlineScripts.length > 0) {
    issues.push(
      issueFromRule('inline-script-blocked', {
        message: `检测到 ${inlineScripts.length} 个内联 <script>，发布时会被沙箱 strip`,
        line: lineFor(html, inlineScripts[0]!),
      }),
    )
  }

  // iframe / embed / object
  const EMBED_RE = /<(iframe|embed|object)\b[^>]*>/gi
  const embeds: Array<{ tag: string; offset: number }> = []
  let embedMatch: RegExpExecArray | null
  while ((embedMatch = EMBED_RE.exec(html)) !== null) {
    if (isInRanges(embedMatch.index, displaySkip)) continue
    const tag = embedMatch[1]
    if (tag === undefined) continue
    embeds.push({ tag: tag.toLowerCase(), offset: embedMatch.index })
  }
  if (embeds.length > 0) {
    const tags = [...new Set(embeds.map((e) => `<${e.tag}>`))].join(' / ')
    issues.push(
      issueFromRule('iframe-or-embed-stripped', {
        message: `检测到 ${embeds.length} 个 ${tags}，发布时会被沙箱 strip，留下空洞`,
        line: lineFor(html, embeds[0]!.offset),
      }),
    )
  }

  // vw / vh inside paginated/dashboard
  if (
    effectiveFormat === 'deck' ||
    effectiveFormat === 'story' ||
    effectiveFormat === 'dashboard'
  ) {
    const cssContexts: Array<{ text: string; baseOffset: number }> = []
    const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
    let sm: RegExpExecArray | null
    while ((sm = STYLE_BLOCK_RE.exec(html)) !== null) {
      if (isInRanges(sm.index, displaySkip)) continue
      const inner = sm[1]
      if (inner === undefined) continue
      cssContexts.push({
        text: inner,
        baseOffset: sm.index + sm[0].indexOf(inner),
      })
    }
    const STYLE_ATTR_RE = /\sstyle\s*=\s*"([^"]*)"|\sstyle\s*=\s*'([^']*)'/gi
    let am: RegExpExecArray | null
    while ((am = STYLE_ATTR_RE.exec(html)) !== null) {
      if (isInRanges(am.index, skip)) continue
      const inner = am[1] ?? am[2] ?? ''
      const innerStart = am[0].indexOf(inner)
      cssContexts.push({ text: inner, baseOffset: am.index + innerStart })
    }
    const VW_VH_RE = /\b\d+(?:\.\d+)?(vw|vh)\b/gi
    const vwHits: number[] = []
    for (const ctx of cssContexts) {
      let vm: RegExpExecArray | null
      const re = new RegExp(VW_VH_RE.source, VW_VH_RE.flags)
      while ((vm = re.exec(ctx.text)) !== null) {
        vwHits.push(ctx.baseOffset + vm.index)
      }
    }
    if (vwHits.length > 0) {
      issues.push(
        issueFromRule('vw-vh-in-paginated', {
          message: `paginated format ${effectiveFormat} 内检测到 ${vwHits.length} 处 vw/vh 使用；cqw/cqh 才能跨内嵌/全屏/发布稳定`,
          line: lineFor(html, vwHits[0]!),
        }),
      )
    }
  }

  // <title> + og:image
  if (!/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) {
    issues.push(
      issueFromRule('title-missing', { message: '<head> 缺少 <title>' }),
    )
  }
  if (
    !/<meta\s+property=["']og:image["']/i.test(html) &&
    !/<meta\s+name=["']twitter:image["']/i.test(html)
  ) {
    issues.push(
      issueFromRule('og-image-missing', {
        message: '<head> 缺少 og:image / twitter:image',
      }),
    )
  }

  return issues
}

export function summarize(issues: ValidationIssue[]): ValidationSummary {
  const s: ValidationSummary = { error: 0, warning: 0, hint: 0, total: 0 }
  for (const i of issues) {
    s[i.level] += 1
    s.total += 1
  }
  return s
}
