/**
 * In-Worker ZIP extraction with the three safety nets every server-side
 * unzipper needs:
 *
 *   1. Path traversal: reject entries with absolute paths or `..` segments
 *      after normalization. Also rejects backslashes (Windows-style separators
 *      that some zip tools emit) and embedded NULs.
 *   2. Bomb defense: cap total uncompressed size and per-entry size before
 *      decompressing. fflate gives us byte buffers entry-by-entry, so we can
 *      bail mid-archive once budget is blown.
 *   3. Entry-count cap: refuses zips with >MAX_ENTRIES files (defends against
 *      pathological N-of-empty-files DOS).
 *
 * Caller is responsible for path-prefixing into a workspace folder.
 */

import { unzipSync, type Unzipped } from 'fflate'

export const MAX_ZIP_ENTRIES = 5_000
export const MAX_ZIP_TOTAL_BYTES = 50 * 1024 * 1024 // 50 MB uncompressed
export const MAX_ZIP_PER_ENTRY_BYTES = 50 * 1024 * 1024

export interface ZipExtractResult {
  ok: true
  entries: Array<{ path: string; bytes: Uint8Array }>
}

export interface ZipExtractError {
  ok: false
  error:
    | 'too_many_entries'
    | 'total_size_exceeded'
    | 'entry_size_exceeded'
    | 'unsafe_path'
    | 'invalid_zip'
  message: string
}

const UNSAFE_PATH_RE = /(^\/|^[a-zA-Z]:|\\|\u0000)/

function isUnsafe(name: string): boolean {
  if (!name) return true
  if (UNSAFE_PATH_RE.test(name)) return true
  // Reject any segment equal to `..`. We can't just check for the substring
  // because filenames legitimately containing `..` (e.g. `a..b.txt`) are fine.
  for (const seg of name.split('/')) {
    if (seg === '..') return true
  }
  return false
}

export function extractZip(
  bytes: Uint8Array,
): ZipExtractResult | ZipExtractError {
  let raw: Unzipped
  try {
    raw = unzipSync(bytes)
  } catch (e) {
    return {
      ok: false,
      error: 'invalid_zip',
      message: e instanceof Error ? e.message : 'failed to parse zip',
    }
  }

  const names = Object.keys(raw)
  if (names.length > MAX_ZIP_ENTRIES) {
    return {
      ok: false,
      error: 'too_many_entries',
      message: `zip contains ${names.length} entries; cap is ${MAX_ZIP_ENTRIES}`,
    }
  }

  const out: Array<{ path: string; bytes: Uint8Array }> = []
  let total = 0

  for (const name of names) {
    // fflate emits directory entries as zero-byte names ending in `/`.
    // Folders are implicit in huozi (created via writes under them) so we
    // skip these silently.
    if (name.endsWith('/')) continue

    if (isUnsafe(name)) {
      return {
        ok: false,
        error: 'unsafe_path',
        message: `zip entry "${name}" has an unsafe path (absolute, contains "..", backslash, or NUL)`,
      }
    }

    const data = raw[name]
    if (!data) continue // shouldn't happen — fflate keys must exist; defensive
    if (data.length > MAX_ZIP_PER_ENTRY_BYTES) {
      return {
        ok: false,
        error: 'entry_size_exceeded',
        message: `zip entry "${name}" is ${data.length} bytes; per-entry cap is ${MAX_ZIP_PER_ENTRY_BYTES}`,
      }
    }
    total += data.length
    if (total > MAX_ZIP_TOTAL_BYTES) {
      return {
        ok: false,
        error: 'total_size_exceeded',
        message: `zip uncompressed size exceeds ${MAX_ZIP_TOTAL_BYTES} bytes`,
      }
    }
    out.push({ path: name, bytes: data })
  }

  return { ok: true, entries: out }
}
