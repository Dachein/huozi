/**
 * Permission rule parsing and matching.
 *
 * Ported 1:1 from Claude Code: cc:utils/permissions/shellRuleMatching.ts
 * Only diff: dropped the `suggestionFor*` helpers (they pull in
 * PermissionUpdate types we don't use). Core matching logic is byte-identical.
 *
 * Why we port verbatim: permission rule semantics (wildcards, `:*` legacy
 * prefix, escape-sequence handling) must match CC's exactly — any Agent that
 * has learned the pattern syntax elsewhere should see the same behavior here.
 */

const ESCAPED_STAR_PLACEHOLDER = '\x00ESCAPED_STAR\x00'
const ESCAPED_BACKSLASH_PLACEHOLDER = '\x00ESCAPED_BACKSLASH\x00'
const ESCAPED_STAR_PLACEHOLDER_RE = new RegExp(ESCAPED_STAR_PLACEHOLDER, 'g')
const ESCAPED_BACKSLASH_PLACEHOLDER_RE = new RegExp(
  ESCAPED_BACKSLASH_PLACEHOLDER,
  'g',
)

export type ShellPermissionRule =
  | { type: 'exact'; command: string }
  | { type: 'prefix'; prefix: string }
  | { type: 'wildcard'; pattern: string }

/** Extract prefix from legacy `:*` syntax (e.g. "npm:*" -> "npm"). */
export function permissionRuleExtractPrefix(
  permissionRule: string,
): string | null {
  const match = permissionRule.match(/^(.+):\*$/)
  return match?.[1] ?? null
}

/**
 * True if the pattern contains any unescaped `*` (i.e. real wildcards,
 * not `:*` legacy prefix syntax and not literal `\*`).
 */
export function hasWildcards(pattern: string): boolean {
  if (pattern.endsWith(':*')) return false
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*') {
      let backslashCount = 0
      let j = i - 1
      while (j >= 0 && pattern[j] === '\\') {
        backslashCount++
        j--
      }
      if (backslashCount % 2 === 0) return true
    }
  }
  return false
}

/**
 * Match a command against a wildcard pattern.
 *   *   → any sequence of characters (including newlines; dotAll flag)
 *   \*  → literal asterisk
 *   \\  → literal backslash
 *
 * Special-case: a single trailing ` *` makes the trailing argument optional,
 * so `git *` matches both `git add` and bare `git`. Aligns with `git:*`
 * prefix-rule semantics. Multi-wildcard patterns do NOT get this treatment.
 */
export function matchWildcardPattern(
  pattern: string,
  command: string,
  caseInsensitive = false,
): boolean {
  const trimmedPattern = pattern.trim()

  let processed = ''
  let i = 0
  while (i < trimmedPattern.length) {
    const char = trimmedPattern[i]
    if (char === '\\' && i + 1 < trimmedPattern.length) {
      const next = trimmedPattern[i + 1]
      if (next === '*') {
        processed += ESCAPED_STAR_PLACEHOLDER
        i += 2
        continue
      } else if (next === '\\') {
        processed += ESCAPED_BACKSLASH_PLACEHOLDER
        i += 2
        continue
      }
    }
    processed += char
    i++
  }

  const escaped = processed.replace(/[.+?^${}()|[\]\\'"]/g, '\\$&')
  const withWildcards = escaped.replace(/\*/g, '.*')
  let regexPattern = withWildcards
    .replace(ESCAPED_STAR_PLACEHOLDER_RE, '\\*')
    .replace(ESCAPED_BACKSLASH_PLACEHOLDER_RE, '\\\\')

  const unescapedStarCount = (processed.match(/\*/g) || []).length
  if (regexPattern.endsWith(' .*') && unescapedStarCount === 1) {
    regexPattern = regexPattern.slice(0, -3) + '( .*)?'
  }

  const flags = 's' + (caseInsensitive ? 'i' : '')
  const regex = new RegExp(`^${regexPattern}$`, flags)
  return regex.test(command)
}

/** Parse a rule string into a discriminated union. */
export function parsePermissionRule(
  permissionRule: string,
): ShellPermissionRule {
  const prefix = permissionRuleExtractPrefix(permissionRule)
  if (prefix !== null) return { type: 'prefix', prefix }
  if (hasWildcards(permissionRule))
    return { type: 'wildcard', pattern: permissionRule }
  return { type: 'exact', command: permissionRule }
}
