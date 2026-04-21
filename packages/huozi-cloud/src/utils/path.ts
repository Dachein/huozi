/**
 * Path canonicalization — shared by all tools.
 *
 * v1 semantics (SPEC §2.3, §7.4 simplified):
 *   - Leading `/` stripped (workspace-relative)
 *   - `..` segments rejected (crude but safe for PoC)
 *   - Empty path rejected
 *   - Backslashes converted to forward slashes
 *   - Collapsed: `//` → `/`, `./` → removed
 *
 * Real scope enforcement (§7.4) belongs one layer up — this helper is the
 * minimum hygiene every tool must apply.
 */

export type CanonicalizeResult =
  | { ok: true; path: string }
  | { ok: false; message: string }

export function canonicalizePath(raw: string): CanonicalizeResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, message: 'file_path must be a non-empty string' }
  }

  // Normalize separators; collapse `./` and `//`.
  let s = raw.replace(/\\/g, '/')
  s = s.replace(/\/+/g, '/')
  s = s.replace(/(^|\/)\.\//g, (_m, p) => p)

  // Strip leading slashes (workspace-relative).
  s = s.replace(/^\/+/, '')

  if (s.length === 0) {
    return { ok: false, message: 'file_path cannot be the workspace root itself' }
  }

  const segments = s.split('/')
  if (segments.some((seg) => seg === '..')) {
    return { ok: false, message: 'file_path cannot contain `..` segments' }
  }

  return { ok: true, path: s }
}
