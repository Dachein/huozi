/**
 * Scope enforcement at the Worker boundary.
 *
 * Implements SPEC §2.4 / §7.4:
 *   - An API key can carry a scope_path (e.g. "funds/fund-A/").
 *   - Every path the Agent sends is interpreted RELATIVE to that scope.
 *   - Paths that escape scope (via `..` or bogus absolute segments) are rejected.
 *   - Paths in tool RESPONSES are rewritten scope-relative, so the Agent
 *     never sees prefixes it couldn't have written.
 *
 * Design 1 (from the design options considered): tools remain scope-unaware
 * internally. The Worker scopes args in, unscopes result out. This keeps the
 * tool code simple; a scope-unrelated deploy (stdio in-process test) can
 * short-circuit the entire scope layer by passing `scope=null`.
 */

// ── Path-level helpers (testable in isolation) ──────────────────────────

export function applyScopeToPath(
  scope: string | null,
  userPath: string,
):
  | { ok: true; absolutePath: string }
  | { ok: false; message: string } {
  if (typeof userPath !== 'string' || userPath.length === 0) {
    return { ok: false, message: 'path must be a non-empty string' }
  }

  if (scope === null) {
    // No scope binding — pass through. Downstream canonicalizePath catches
    // `..` and other hygiene failures.
    return { ok: true, absolutePath: userPath }
  }

  // Strip leading slashes — inside scope, `/foo.md` means "foo.md relative
  // to scope root", mirroring POSIX current-working-directory semantics.
  const userRel = userPath.replace(/^\/+/, '')

  if (userRel.length === 0) {
    return {
      ok: false,
      message: 'path cannot be the scope root itself',
    }
  }

  // Reject any `..` segment outright. Even a segment that mathematically
  // cancels out (e.g. `foo/../foo/bar`) is rejected — no ambiguity, no
  // string-game attacks.
  if (userRel.split('/').some((seg) => seg === '..')) {
    return {
      ok: false,
      message: 'path contains `..` segment — scope escape attempt rejected',
    }
  }

  const scopePrefix = scope.endsWith('/') ? scope : scope + '/'
  return { ok: true, absolutePath: scopePrefix + userRel }
}

export function unscopePath(
  scope: string | null,
  absolutePath: string,
): string {
  if (scope === null) return absolutePath
  const scopePrefix = scope.endsWith('/') ? scope : scope + '/'
  if (absolutePath.startsWith(scopePrefix)) {
    return absolutePath.slice(scopePrefix.length)
  }
  // If a response path somehow slipped out of scope (shouldn't happen in
  // normal flow), surface it as-is rather than hiding it.
  return absolutePath
}

/**
 * Strip scope prefix from each line of grep's "content" output.
 * Format is one of:
 *   path:lineno:matchText     (match line, with -n)
 *   path-lineno-contextText   (context line, with -n)
 *   path:matchText            (match line, without -n)
 *   path-contextText          (context line, without -n)
 *
 * We just strip the scope prefix when a line starts with it; the separator
 * after is preserved unchanged.
 */
export function unscopeGrepContent(
  scope: string | null,
  content: string,
): string {
  if (scope === null) return content
  const scopePrefix = scope.endsWith('/') ? scope : scope + '/'
  return content
    .split('\n')
    .map((line) =>
      line.startsWith(scopePrefix) ? line.slice(scopePrefix.length) : line,
    )
    .join('\n')
}

// ── Tool-arg transforms ────────────────────────────────────────────────

type Args = Record<string, unknown>

/**
 * Rewrite every path-bearing field in `args` through `applyScopeToPath`.
 *
 * Known path fields:
 *   - `file_path` (read/edit/write/history)
 *   - `path` (glob/grep — directory scope)
 *   - `edits[].file_path` (batch_edit)
 *
 * For glob/grep, if no `path` is given, inject the scope root so the query
 * doesn't accidentally see the whole workspace.
 */
export function applyScopeToArgs(
  toolName: string,
  args: Args,
  scope: string | null,
):
  | { ok: true; args: Args }
  | { ok: false; message: string } {
  if (scope === null) return { ok: true, args }

  const out: Args = { ...args }

  if (typeof args['file_path'] === 'string') {
    const r = applyScopeToPath(scope, args['file_path'] as string)
    if (!r.ok) return r
    out['file_path'] = r.absolutePath
  }

  if (typeof args['path'] === 'string') {
    const r = applyScopeToPath(scope, args['path'] as string)
    if (!r.ok) return r
    out['path'] = r.absolutePath
  } else if (toolName === 'huozi_glob' || toolName === 'huozi_grep') {
    // Inject scope root so queries are bounded to the Agent's sandbox.
    out['path'] = scope.endsWith('/') ? scope.slice(0, -1) : scope
  }

  if (Array.isArray(args['edits'])) {
    const scopedEdits: unknown[] = []
    for (const edit of args['edits'] as unknown[]) {
      if (edit && typeof edit === 'object' && 'file_path' in edit) {
        const e = edit as Record<string, unknown>
        if (typeof e['file_path'] === 'string') {
          const r = applyScopeToPath(scope, e['file_path'] as string)
          if (!r.ok) return r
          scopedEdits.push({ ...e, file_path: r.absolutePath })
          continue
        }
      }
      scopedEdits.push(edit)
    }
    out['edits'] = scopedEdits
  }

  return { ok: true, args: out }
}

/**
 * Rewrite every path-bearing field in a tool result to be scope-relative.
 *
 * Tool-specific fields handled:
 *   - Read : data.file.filePath
 *   - Edit : data.filePath
 *   - Write: data.filePath
 *   - Glob : data.filenames[]
 *   - Grep : data.filenames[], data.content (line-level strip)
 *   - BatchEdit: data.results[].file_path
 *   - History: nothing (no path fields in output)
 */
export function unscopeResult(
  toolName: string,
  result: unknown,
  scope: string | null,
): unknown {
  if (scope === null || result === null || typeof result !== 'object') {
    return result
  }

  const out: Record<string, unknown> = { ...(result as Record<string, unknown>) }

  // Read: data.file.filePath
  if (
    out['file'] &&
    typeof out['file'] === 'object' &&
    typeof (out['file'] as Record<string, unknown>)['filePath'] === 'string'
  ) {
    const file = out['file'] as Record<string, unknown>
    out['file'] = {
      ...file,
      filePath: unscopePath(scope, file['filePath'] as string),
    }
  }

  // Edit / Write: top-level filePath
  if (typeof out['filePath'] === 'string') {
    out['filePath'] = unscopePath(scope, out['filePath'] as string)
  }

  // Glob / Grep: filenames[]
  if (Array.isArray(out['filenames'])) {
    out['filenames'] = (out['filenames'] as unknown[]).map((p) =>
      typeof p === 'string' ? unscopePath(scope, p) : p,
    )
  }

  // Grep content mode: strip scope prefix on each line
  if (
    toolName === 'huozi_grep' &&
    typeof out['content'] === 'string' &&
    out['mode'] === 'content'
  ) {
    out['content'] = unscopeGrepContent(scope, out['content'] as string)
  }

  // batch_edit: results[].file_path
  if (Array.isArray(out['results'])) {
    out['results'] = (out['results'] as unknown[]).map((r) => {
      if (
        r &&
        typeof r === 'object' &&
        typeof (r as Record<string, unknown>)['file_path'] === 'string'
      ) {
        const rr = r as Record<string, unknown>
        return {
          ...rr,
          file_path: unscopePath(scope, rr['file_path'] as string),
        }
      }
      return r
    })
  }

  return out
}
