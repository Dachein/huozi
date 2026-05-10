/**
 * HTML validation — port of `app/src/lib/html/validate.ts`.
 *
 * Same rule set, same diagnostic shape. Lives here so the worker-side
 * `huozi_validate` MCP tool can run without reaching back into the
 * Next.js app's source tree (the worker is a separate package with its
 * own rootDir; the two trees can't share modules directly).
 *
 * KEEP IN SYNC with the frontend copy. Both files duplicate intentionally
 * — the alternative (a shared sub-package) is more ceremony than two
 * ~300-line pure functions warrant. If a rule is added or tightened on
 * one side, mirror it on the other.
 */

export type ValidationLevel = 'error' | 'warning' | 'hint'

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

type HuoziFormat = 'deck' | 'story' | 'paper' | 'mobile' | 'web'

const ALL_FORMATS = new Set<HuoziFormat>([
  'deck',
  'story',
  'paper',
  'mobile',
  'web',
])

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

  const formatMeta = readFormatMeta(html, skip)
  if (formatMeta && !ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
    issues.push({
      level: 'error',
      code: 'format-unknown',
      message: `huozi:format="${formatMeta.value}" 不在已知 5 种类型里，已退化为 web`,
      line: lineFor(html, formatMeta.index),
      remedy: '使用 deck / story / paper / mobile / web 之一',
      docRef: 'norms#1-format-types',
    })
  }

  const effectiveFormat: HuoziFormat = (() => {
    if (formatMeta && ALL_FORMATS.has(formatMeta.value as HuoziFormat)) {
      return formatMeta.value as HuoziFormat
    }
    return readClassFormat(html, skip) ?? 'web'
  })()

  const classFormat = readClassFormat(html, skip)
  if (
    formatMeta &&
    ALL_FORMATS.has(formatMeta.value as HuoziFormat) &&
    classFormat &&
    classFormat !== formatMeta.value
  ) {
    issues.push({
      level: 'warning',
      code: 'format-meta-class-mismatch',
      message: `huozi:format=${formatMeta.value} 与 class="huozi-${classFormat}" 不一致；meta 优先生效`,
      line: lineFor(html, formatMeta.index),
      remedy: `统一为 huozi-${formatMeta.value} 或调整 meta 值`,
      docRef: 'norms#1-3-format-declaration',
    })
  }

  if (!formatMeta && classFormat) {
    issues.push({
      level: 'hint',
      code: 'format-meta-missing',
      message: `推荐显式写 <meta name="huozi:format" content="${classFormat}">`,
      remedy: 'class 嗅探是 legacy 兜底，meta 是 authoritative declaration',
      docRef: 'norms#1-3-format-declaration',
    })
  }

  const sections = findDataPageSections(html, skip)
  if (isPaginated(effectiveFormat) && sections.length === 0) {
    issues.push({
      level: 'error',
      code: 'paginated-no-pages',
      message: `huozi:format=${effectiveFormat} 但找不到任何 <section data-page>，分页器和大纲都不会工作`,
      remedy:
        '把每页内容包在 <section data-page id="..." data-title="..."> 里',
      docRef: 'norms#2-page-marker',
    })
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
      issues.push({
        level: 'error',
        code: 'page-id-duplicate',
        message: `id="${id}" 在 ${indices.length} 个 <section data-page> 上重复，scrollIntoView 会永远跳到第一个`,
        line: lineFor(html, first.offset),
        remedy: '每个 data-page 给唯一 id，或留空让 huozi 自动注入 s${N}',
        docRef: 'norms#2-page-marker',
      })
    }
  }

  const sectionsWithoutTitle = sections.filter((s) => !s.hasTitle)
  if (sectionsWithoutTitle.length > 0) {
    issues.push({
      level: 'hint',
      code: 'data-title-missing',
      message: `${sectionsWithoutTitle.length} 个 <section data-page> 缺 data-title，大纲菜单会 fallback 到页内 h1/h2/h3`,
      line: lineFor(html, sectionsWithoutTitle[0]!.offset),
      remedy: 'data-title 让大纲更稳，不依赖标题层级',
      docRef: 'norms#2-page-marker',
    })
  }

  const bundleMeta = readBundleMeta(html, skip)
  if (bundleMeta) {
    const keys = bundleMeta.value
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const unknown = keys.filter((k) => !KNOWN_BUNDLES.has(k))
    if (unknown.length > 0) {
      issues.push({
        level: 'warning',
        code: 'bundle-unknown-key',
        message: `huozi:bundle 含未识别 key: ${unknown.join(', ')}`,
        line: lineFor(html, bundleMeta.index),
        remedy: `已知 keys: ${[...KNOWN_BUNDLES].join(', ')}`,
        docRef: 'toolbox-spec#2-bundles',
      })
    }
  }

  const re = new RegExp(SCRIPT_SRC_RE.source, SCRIPT_SRC_RE.flags)
  const displaySkip = skip.filter(([s, e]) => {
    const slice = html.slice(s, Math.min(e, s + 8)).toLowerCase()
    return !slice.startsWith('<script')
  })
  let scriptMatch: RegExpExecArray | null
  const externalScripts: Array<{ url: string; offset: number }> = []
  while ((scriptMatch = re.exec(html)) !== null) {
    if (isInRanges(scriptMatch.index, displaySkip)) continue
    const url = scriptMatch[1]
    if (url === undefined) continue
    externalScripts.push({ url, offset: scriptMatch.index })
  }
  if (externalScripts.length > 0) {
    issues.push({
      level: 'warning',
      code: 'external-script-blocked',
      message: `检测到 ${externalScripts.length} 个 <script src="https://...">，发布时会被沙箱 strip`,
      line: lineFor(html, externalScripts[0]!.offset),
      remedy:
        '如果是 mermaid / echarts 等已知库，改用 <meta name="huozi:bundle"> 声明加载',
      docRef: 'toolbox-spec#3-2-author-constraints',
    })
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
