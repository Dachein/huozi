/**
 * Small inline utilities pulled from Claude Code's `src/utils/*` to keep
 * cc-compat self-contained. These are pure functions with no platform
 * dependencies.
 *
 * Sources:
 *   - addLineNumbers, convertLeadingTabsToSpaces → cc:utils/file.ts
 *   - countCharInString → cc:utils/stringUtils.ts
 *   - count → cc:utils/array.ts
 */

/** Count occurrences of a predicate in an array. */
export function count<T>(arr: readonly T[], pred: (x: T) => boolean): number {
  let n = 0
  for (const x of arr) if (pred(x)) n++
  return n
}

/** Count occurrences of `ch` in `s`, starting from index `from`. */
export function countCharInString(s: string, ch: string, from = 0): number {
  let n = 0
  for (let i = from; i < s.length; i++) if (s[i] === ch) n++
  return n
}

/**
 * Convert leading tabs on each line to spaces (tab-width = 4 in CC).
 * Used for diff *display* only — not applied to the actual written content.
 */
export function convertLeadingTabsToSpaces(content: string): string {
  return content.replace(/^\t+/gm, (m) => '    '.repeat(m.length))
}

/**
 * Add `cat -n`-style line numbers to content.
 * Matches CC's default formatting: right-aligned 6-char width + tab + content.
 *
 * CC actually has two formats (compact = "line\tcontent" vs padded = "      line→content")
 * controlled by a feature flag. We ship the padded form by default — this is
 * what all public CC prompts document.
 */
export function addLineNumbers(args: {
  content: string
  startLine?: number
}): string {
  const { content, startLine = 1 } = args
  const lines = content.split(/\r?\n/)
  return lines
    .map((line, i) => {
      const n = String(startLine + i).padStart(6, ' ')
      return `${n}\t${line}`
    })
    .join('\n')
}

/**
 * Simple single-key memoize. CC uses lodash-es/memoize; keeping it zero-dep.
 */
export function memoizeSingle<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R {
  let cached: { key: string; value: R } | null = null
  return (...args: Args): R => {
    const key = JSON.stringify(args)
    if (cached && cached.key === key) return cached.value
    const value = fn(...args)
    cached = { key, value }
    return value
  }
}
