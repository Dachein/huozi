/**
 * huozi_read — v1.
 *
 * Aligns with SPEC §4.1. Supports the three output types we ship in v1:
 *   - text          (normal decode + cat -n formatting)
 *   - file_unchanged (cache hit)
 *   - binary_ref   (placeholder: v1 emits when size > MAX_INLINE_BINARY_BYTES
 *                   with a stub URL; real R2 signing comes in later wiring)
 *
 * Image/PDF/Notebook variants are NOT YET emitted — binary content for those
 * falls into the "large → binary_ref" path. They're listed in the output
 * schema so the contract stays stable when we add them.
 *
 * ---
 *
 * Behavior checklist (all covered by smoke.ts):
 *   • Read same (path, offset, limit) twice when blob_sha is unchanged → file_unchanged
 *   • Different offset or limit → new full read even if blob_sha identical
 *   • Different blob_sha (file was edited elsewhere) → new read
 *   • File not found → errorCode 4
 *   • Empty file → text with empty content + warning hint
 *   • Over 256 KB full file → errorCode 10
 *   • Large binary (>4 MB) → binary_ref
 */

import { addLineNumbers, readBytesWithMetadata } from '../../cc-compat/index.js'
import { ERR } from '../../errors.js'
import type { StorageBackend } from '../../storage/types.js'
import {
  buildTool,
} from '../../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../../types.js'
import {
  description,
  MAX_INLINE_BINARY_BYTES,
  MAX_LINES_TO_READ,
  MAX_OUTPUT_SIZE_BYTES,
  prompt,
  READ_TOOL_NAME,
  READ_TOOL_USER_FACING_NAME,
} from './prompt.js'
import { guessMime, isAlwaysBinaryMime } from './mime.js'
import { readInputSchema, readOutputSchema, type ReadInput, type ReadOutput } from './schema.js'

/**
 * We leave the actual URL generation to the production storage adapter; the
 * in-memory backend returns a placeholder URL so smoke tests can still
 * exercise the code path.
 */
export interface BinaryRefSigner {
  signUrl(args: {
    workspaceId: string
    path: string
    blob_sha: string
    ttlSeconds: number
  }): Promise<{ url: string; expiresAt: number; mimeType: string }>
}

/** Dependencies the ReadTool needs. Injected at build time. */
export interface ReadToolDeps {
  storage: StorageBackend
  /** Optional; required only if you want binary_ref emission to produce real URLs. */
  binarySigner?: BinaryRefSigner
}

// MIME detection lives in ./mime.ts; the worker's blob-download endpoint
// shares the same map so signed download URLs serve files with the right
// content-type without re-deriving it.

/**
 * Canonical path handling. v1 PoC:
 *   - strip leading slashes (treat them as workspace-relative)
 *   - reject `..` segments
 *   - reject empty paths
 *
 * Real scope enforcement (SPEC §7.4) happens one layer higher — this function
 * is the baseline, not the final security boundary.
 */
function canonicalizePath(raw: string): { ok: true; path: string } | { ok: false; message: string } {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, message: 'file_path must be a non-empty string' }
  }
  // Normalize: strip leading /
  const stripped = raw.replace(/^\/+/, '')
  if (stripped.length === 0) {
    return { ok: false, message: 'file_path cannot be the workspace root itself' }
  }
  // Reject .. segments
  const segments = stripped.split('/')
  if (segments.some((s) => s === '..')) {
    return { ok: false, message: 'file_path cannot contain `..` segments' }
  }
  return { ok: true, path: stripped }
}

/**
 * Factory: given deps, return the built Tool.
 */
export function createReadTool(deps: ReadToolDeps): Tool<ReadInput, ReadOutput> {
  return buildTool<ReadInput, ReadOutput>({
    name: READ_TOOL_NAME,
    userFacingName: READ_TOOL_USER_FACING_NAME,
    maxResultSizeChars: 100_000,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: readInputSchema,
    outputSchema: readOutputSchema,
    async description() {
      return description()
    },
    async prompt() {
      return prompt()
    },

    renderResult(data: ReadOutput): string {
      switch (data.type) {
        case 'file_unchanged':
          // Load-bearing text — Agent learned to recognize this.
          return (
            'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.'
          )
        case 'text': {
          const { content, totalLines, numLines, startLine } = data.file
          if (totalLines === 0) {
            return '(the file exists but the contents are empty)'
          }
          if (numLines === 0) {
            return `(requested range empty; file has ${totalLines} lines)`
          }
          return content + (numLines < totalLines - startLine + 1
            ? `\n\n[showing lines ${startLine}..${startLine + numLines - 1} of ${totalLines}]`
            : '')
        }
        case 'binary_ref':
          return `[binary file ${data.file.size} bytes, mime=${data.file.mimeType}, signed url=${data.file.url} expires=${new Date(data.file.expiresAt).toISOString()}]`
      }
    },

    async call(input: ReadInput, ctx: ToolUseContext): Promise<ToolResult<ReadOutput>> {
      // 1. Canonicalize path.
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      const path = canon.path

      // 2. Fetch from storage.
      const record = await deps.storage.readFile(
        ctx.workspaceId,
        path,
        ctx.abortSignal,
      )
      if (!record) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message: `File does not exist: ${path}`,
        }
      }

      // 3. file_unchanged check (SPEC §4.1).
      const existing = ctx.readFileState.get(path)
      if (
        existing &&
        existing.offset === input.offset &&
        existing.limit === input.limit &&
        existing.blob_sha === record.blob_sha
      ) {
        return {
          kind: 'success',
          data: {
            type: 'file_unchanged',
            file: {
              filePath: path,
              blob_sha: record.blob_sha,
            },
          },
        }
      }

      // 4. Binary short circuit → binary_ref.
      //    Two triggers:
      //    (a) any file > MAX_INLINE_BINARY_BYTES (covers oversize text too;
      //        4 MB is safely above the 256 KB text cap),
      //    (b) any file with a known-binary mime regardless of size — small
      //        PNGs / PDFs would otherwise utf-8-decode into garbage and
      //        render as mojibake in the Web UI viewer.
      if (record.size > MAX_INLINE_BINARY_BYTES || isAlwaysBinaryMime(path)) {
        const mimeType = guessMime(path)
        let url = `huozi-binary-ref://placeholder/${record.blob_sha}`
        let expiresAt = Date.now() + 20 * 60 * 1000
        if (deps.binarySigner) {
          const signed = await deps.binarySigner.signUrl({
            workspaceId: ctx.workspaceId,
            path,
            blob_sha: record.blob_sha,
            ttlSeconds: 20 * 60,
          })
          url = signed.url
          expiresAt = signed.expiresAt
        }
        return {
          kind: 'success',
          data: {
            type: 'binary_ref',
            file: {
              filePath: path,
              mimeType,
              size: record.size,
              sha: record.blob_sha,
              url,
              expiresAt,
            },
          },
        }
      }

      // 5. Full-file size guard for text decoding.
      //    Default cap = 256 KB (matches CC). When the caller explicitly
      //    paginates with offset/limit, we raise the cap to the inline-binary
      //    threshold (4 MB) so paginated reads work on medium-large files.
      //    Beyond 4 MB the earlier `binary_ref` branch has already claimed it.
      const isPaginating = input.offset !== undefined || input.limit !== undefined
      const sizeCap = isPaginating ? MAX_INLINE_BINARY_BYTES : MAX_OUTPUT_SIZE_BYTES
      if (record.size > sizeCap) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_TOO_LARGE,
          message: `File is ${record.size} bytes; the per-call cap for text reads is ${sizeCap}${isPaginating ? ' (paginated)' : ''}. ${isPaginating ? 'File exceeds even the paginated cap — read via binary_ref signed URL.' : 'Use offset/limit to read a range.'}`,
          meta: { size: record.size },
        }
      }

      // 6. Decode bytes and extract line metadata.
      const decoded = readBytesWithMetadata(record.content)
      const content = decoded.content
      const allLines = content.split('\n')
      // `split('\n')` on an empty string returns [''] — normalize to []
      // when the file is truly empty so totalLines is 0.
      const totalLines =
        content.length === 0 ? 0 : allLines.length

      // 7. Apply offset/limit. Default: read from line 1, limit = 2000 lines.
      const startLine = input.offset ?? 1
      const wantLimit = input.limit ?? MAX_LINES_TO_READ

      if (totalLines > 0 && startLine > totalLines) {
        // Caller asked for a range past EOF. Return empty slice with totalLines
        // so they know where the file actually ends.
        const entry = {
          blob_sha: record.blob_sha,
          offset: input.offset,
          limit: input.limit,
          readAt: Date.now(),
        }
        ctx.readFileState.set(path, entry)
        return {
          kind: 'success',
          data: {
            type: 'text',
            file: {
              filePath: path,
              content: '',
              numLines: 0,
              startLine,
              totalLines,
              blob_sha: record.blob_sha,
            },
          },
        }
      }

      const sliceStart = Math.max(0, startLine - 1)
      const sliceEnd = Math.min(totalLines, sliceStart + wantLimit)
      const slicedLines = allLines.slice(sliceStart, sliceEnd)
      const numbered = addLineNumbers({
        content: slicedLines.join('\n'),
        startLine,
      })

      // 8. Update ReadFileState (blob_sha only — see types.ts).
      ctx.readFileState.set(path, {
        blob_sha: record.blob_sha,
        offset: input.offset,
        limit: input.limit,
        readAt: Date.now(),
      })

      return {
        kind: 'success',
        data: {
          type: 'text',
          file: {
            filePath: path,
            content: numbered,
            numLines: slicedLines.length,
            startLine,
            totalLines,
            blob_sha: record.blob_sha,
          },
        },
      }
    },
  })
}
