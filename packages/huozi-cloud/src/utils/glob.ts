/**
 * Minimal glob → RegExp converter.
 *
 * Zero-dep. Covers the subset Agents actually use in CC's Grep/Glob:
 *   *        — any chars except `/`
 *   **       — any chars including `/`
 *   ?        — exactly one char except `/`
 *   [abc]    — character class
 *   {a,b,c}  — alternation (flat, non-nested)
 *   !prefix  — negation (applied at list-level by caller, not in regex)
 *
 * Cases NOT supported (matches ripgrep's conservative set):
 *   - Nested alternations `{a,{b,c}}`
 *   - Extended glob `@(...)`, `+(...)` (Bash extglob)
 *
 * For v1 PoC this is sufficient. Worker-safe, synchronous.
 */

/** Escape regex special chars *except* those we interpret as glob syntax. */
function escapeForRegex(ch: string): string {
  // `. ( ) + ^ $ | \` — but leave `*`, `?`, `[`, `]`, `{`, `}` alone as we
  // handle them ourselves.
  if (/[.+^$|()\\]/.test(ch)) return '\\' + ch
  return ch
}

/** Compile one glob pattern to a regex anchored on full path. */
export function globToRegex(
  pattern: string,
  opts: { caseInsensitive?: boolean } = {},
): RegExp {
  let re = '^'
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]!

    // `**` — zero-or-more directory segments
    if (c === '*' && pattern[i + 1] === '*') {
      // `**/` → zero-or-more path segments including separators, optional
      if (pattern[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 3
      } else {
        re += '.*'
        i += 2
      }
      continue
    }

    // `*` — any chars except `/`
    if (c === '*') {
      re += '[^/]*'
      i++
      continue
    }

    // `?` — exactly one char except `/`
    if (c === '?') {
      re += '[^/]'
      i++
      continue
    }

    // `[abc]` char class — pass through but ensure `]` closes
    if (c === '[') {
      const close = pattern.indexOf(']', i + 1)
      if (close > i + 1) {
        re += pattern.slice(i, close + 1)
        i = close + 1
        continue
      }
      // unclosed — treat as literal
      re += '\\['
      i++
      continue
    }

    // `{a,b,c}` alternation
    if (c === '{') {
      const close = pattern.indexOf('}', i + 1)
      if (close > i + 1) {
        const alts = pattern.slice(i + 1, close).split(',')
        const altRe = alts
          .map((a) =>
            a
              .split('')
              .map((ch) => {
                if (ch === '*') return '[^/]*'
                if (ch === '?') return '[^/]'
                return escapeForRegex(ch)
              })
              .join(''),
          )
          .join('|')
        re += `(?:${altRe})`
        i = close + 1
        continue
      }
      // unclosed — treat as literal
      re += '\\{'
      i++
      continue
    }

    re += escapeForRegex(c)
    i++
  }
  re += '$'

  return new RegExp(re, opts.caseInsensitive ? 'i' : undefined)
}

/** Convenience: test a path against a glob. */
export function matchGlob(
  pattern: string,
  path: string,
  opts?: { caseInsensitive?: boolean },
): boolean {
  return globToRegex(pattern, opts).test(path)
}

/**
 * CC's `type` param for Grep — `js`, `py`, `rust`, etc. — maps to a small
 * built-in set of extensions. This is the v1 subset; enough for the common
 * languages Agents search for.
 */
export const GREP_TYPE_GLOBS: Record<string, string[]> = {
  js: ['**/*.js', '**/*.mjs', '**/*.cjs', '**/*.jsx'],
  ts: ['**/*.ts', '**/*.tsx'],
  py: ['**/*.py'],
  rust: ['**/*.rs'],
  go: ['**/*.go'],
  java: ['**/*.java'],
  c: ['**/*.c', '**/*.h'],
  cpp: ['**/*.cpp', '**/*.hpp', '**/*.cc', '**/*.hh'],
  cs: ['**/*.cs'],
  rb: ['**/*.rb'],
  php: ['**/*.php'],
  swift: ['**/*.swift'],
  kotlin: ['**/*.kt', '**/*.kts'],
  md: ['**/*.md', '**/*.mdx'],
  json: ['**/*.json'],
  yaml: ['**/*.yaml', '**/*.yml'],
  toml: ['**/*.toml'],
  html: ['**/*.html', '**/*.htm'],
  css: ['**/*.css', '**/*.scss', '**/*.sass', '**/*.less'],
  sh: ['**/*.sh', '**/*.bash', '**/*.zsh'],
  csv: ['**/*.csv'],
}
