/**
 * huozi_upload — binary-friendly write surface.
 *
 * Why this tool exists alongside huozi_write:
 *   - huozi_write takes a `string` content (UTF-8). Binaries (PDFs, images,
 *     ZIPs, audio) don't survive the encode/decode round-trip.
 *   - huozi_write enforces "Read first" staleness for existing paths. For an
 *     upload, the agent has never seen the existing bytes; staleness is the
 *     wrong contract — last-write-wins matches user intent.
 *   - Zip auto-extraction needs a dedicated entry point so the safety nets
 *     (path-traversal, bomb defense, entry-count cap) sit in one place.
 *
 * Out of scope for v1:
 *   - Resumable / signed-PUT-URL uploads for >10 MB. Tracked separately.
 *   - Office (.docx/.xlsx/.pptx) auto-conversion. That requires a side service
 *     (Gotenberg / similar) and lives in Phase 3.
 *
 * Inline budget: 10 MB raw bytes (≈ 13.4 MB base64 over the wire).
 */

import { z } from 'zod'
import { ERR } from '../../errors.js'
import type { StorageBackend } from '../../storage/types.js'
import { buildTool } from '../../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../../types.js'
import { canonicalizePath } from '../../utils/path.js'
import { classifyOfficeUpload } from './convert/office-detect.js'
import { convertDocxToMarkdown } from './convert/docx-to-md.js'
import { convertXlsxToSheets } from './convert/xlsx-to-sheets.js'
import { extractZip } from './zip.js'

export const UPLOAD_TOOL_NAME = 'huozi_upload'

export const MAX_INLINE_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_BASE64_LENGTH =
  Math.ceil((MAX_INLINE_UPLOAD_BYTES / 3) * 4) + 16 // small slack for padding/newlines

export const uploadInputSchema = z.object({
  file_path: z
    .string()
    .describe('Destination path in the workspace (e.g. "uploads/cat.png").'),
  content_base64: z
    .string()
    .describe(
      'Standard base64-encoded bytes. Inline cap: 10 MB raw / ~13.4 MB encoded.',
    ),
  content_type: z
    .string()
    .optional()
    .describe(
      'Optional MIME type (e.g. "image/png"). When omitted the server falls back to extension-based detection on read.',
    ),
  extract: z
    .boolean()
    .optional()
    .describe(
      'If true and file_path ends with .zip, the archive is unpacked and the zip itself is NOT stored. Default false.',
    ),
})

export type UploadInput = z.infer<typeof uploadInputSchema>

const extractedEntrySchema = z.object({
  path: z.string(),
  size: z.number(),
  blob_sha: z.string(),
})

const derivativeSchema = z.object({
  path: z.string(),
  size: z.number(),
  blob_sha: z.string(),
  kind: z.enum(['markdown', 'csv', 'image', 'readme']),
})

export const uploadOutputSchema = z.object({
  ok: z.literal(true),
  kind: z.enum(['file', 'archive', 'office']),
  file_path: z.string(),
  size: z.number(),
  blob_sha: z.string().optional(), // unset for archives + office (per-entry shas live in `extracted` / `derivatives`)
  content_type: z.string().optional(),
  commit_sha: z.string(),
  // Populated only when extract=true and file_path is a zip.
  extracted: z
    .object({
      dest_prefix: z.string(),
      count: z.number(),
      entries: z.array(extractedEntrySchema),
      total_bytes: z.number(),
    })
    .optional(),
  // Populated only for Office uploads (.docx / .xlsx). Lists the converted
  // files actually written to the workspace; the original Office bytes are
  // NOT retained.
  derivatives: z.array(derivativeSchema).optional(),
  // Soft warnings from converters (formula resolution loss, dropped images,
  // empty sheets, etc.). Empty when conversion was clean.
  warnings: z.array(z.string()).optional(),
})

export type UploadOutput = z.infer<typeof uploadOutputSchema>

export function uploadPrompt(): string {
  return `Upload binary or text bytes to the cloud workspace.

Usage:
- ${UPLOAD_TOOL_NAME} is the right tool for non-text uploads (PDF, image, audio, zip, docx, xlsx). For UTF-8 text use huozi_write — its diff/render path is richer.
- \`file_path\` is the destination. Last-write-wins; no Read-first requirement (you didn't author the file, you're uploading it).
- \`content_base64\` is standard base64. Inline cap: ${MAX_INLINE_UPLOAD_BYTES / 1024 / 1024} MB raw bytes. Larger files: split, stream via the signed-URL endpoint (see SPEC), or compress.
- \`content_type\` is optional but recommended for binaries the UI will render — e.g. "image/png", "application/pdf", "audio/mpeg". Without it, downloads fall back to mime-by-extension.
- \`extract: true\` requires a .zip path. The archive is unpacked into a sibling folder named after the zip (e.g. \`pkg.zip\` → entries under \`pkg/\`); the zip itself is NOT stored. Safety: rejects path traversal (\`../\`), absolute paths, files >50 MB uncompressed each, archives >50 MB total or >5000 entries.
- Office files are auto-converted (the original is NOT retained):
    .docx → \`<basename>.md\` plus an \`<basename>.images/\` folder if the doc had images.
    .xlsx → \`<basename>.sheets/\` folder containing one \`.csv\` per sheet plus a \`README.md\` index. Formulas resolve to their last cached value; cell formatting / charts / merged-cell visuals are lost.
- Office formats NOT accepted (returned as an error so the user knows to convert): .pptx / .ppt / .doc / .xls / .odt / .ods / .odp / .pages / .numbers / .key. The error message tells the user what to convert to (PDF or .docx/.xlsx) and re-upload.
- Returned \`file_path\` is the path the agent / user requested. For Office uploads the actual written paths live in \`derivatives[]\`; pass any of those into huozi_share to publish, or huozi_read to fetch the converted text.`
}

function decodeBase64(s: string): Uint8Array {
  const cleaned = s.replace(/\s+/g, '')
  const bin = atob(cleaned)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Strip a leading directory + trailing extension. "blog/q1.docx" → "q1". */
function basenameNoExt(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** "blog/q1.docx" → "blog/" (with trailing slash, or "" if at root). */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i >= 0 ? path.slice(0, i + 1) : ''
}

export interface UploadToolDeps {
  storage: StorageBackend
}

async function runDocxUpload(
  deps: UploadToolDeps,
  ctx: ToolUseContext,
  origPath: string,
  bytes: Uint8Array,
): Promise<ToolResult<UploadOutput>> {
  const dir = dirOf(origPath)
  const stem = basenameNoExt(origPath)
  // Image folder lives next to the .md file. mammoth needs the relative
  // src= attribute, which is just `./<stem>.images/` from the .md's POV.
  const imagesDirRel = `./${stem}.images/`
  const imagesDirAbs = `${dir}${stem}.images/`
  const mdPath = `${dir}${stem}.md`

  let conversion
  try {
    conversion = await convertDocxToMarkdown(bytes, imagesDirRel)
  } catch (e) {
    return {
      kind: 'error',
      errorCode: ERR.INVALID_URI,
      message: `Could not parse .docx: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const edits: Array<{
    path: string
    content: Uint8Array
    parent_sha?: string | null
  }> = [
    {
      path: mdPath,
      content: new TextEncoder().encode(conversion.markdown),
    },
  ]
  for (const img of conversion.images) {
    edits.push({
      path: imagesDirAbs + img.filename,
      content: img.bytes,
    })
  }

  const batch = await deps.storage.writeBatch({
    workspaceId: ctx.workspaceId,
    edits,
    author: { id: ctx.principalId, type: ctx.principalType },
    message: `upload: ${origPath} → ${mdPath}${conversion.images.length ? ` (+ ${conversion.images.length} images)` : ''}`,
    allOrNothing: true,
  })

  if (batch.aborted || batch.commit_sha === null) {
    return {
      kind: 'error',
      errorCode: ERR.INTERNAL,
      message: 'docx conversion write was aborted',
    }
  }

  // Refresh ReadFileState for the markdown file so subsequent huozi_edit
  // calls don't trip NOT_READ_FIRST.
  const mdResult = batch.results.find((r) => r.path === mdPath)
  if (mdResult?.success && mdResult.record) {
    ctx.readFileState.set(mdPath, {
      blob_sha: mdResult.record.blob_sha,
      offset: undefined,
      limit: undefined,
      readAt: Date.now(),
    })
  }

  const derivatives = batch.results
    .filter(
      (r): r is typeof r & { record: NonNullable<typeof r.record> } =>
        r.success && !!r.record,
    )
    .map((r) => ({
      path: r.path,
      size: r.record.size,
      blob_sha: r.record.blob_sha,
      kind: (r.path === mdPath ? 'markdown' : 'image') as 'markdown' | 'image',
    }))

  return {
    kind: 'success',
    data: {
      ok: true,
      kind: 'office',
      file_path: origPath,
      size: bytes.length,
      commit_sha: batch.commit_sha,
      derivatives,
      ...(conversion.warnings.length
        ? { warnings: conversion.warnings }
        : {}),
    },
  }
}

async function runXlsxUpload(
  deps: UploadToolDeps,
  ctx: ToolUseContext,
  origPath: string,
  bytes: Uint8Array,
): Promise<ToolResult<UploadOutput>> {
  const dir = dirOf(origPath)
  const stem = basenameNoExt(origPath)
  const sheetsDirAbs = `${dir}${stem}.sheets/`

  let conversion
  try {
    conversion = await convertXlsxToSheets(bytes)
  } catch (e) {
    return {
      kind: 'error',
      errorCode: ERR.INVALID_URI,
      message: `Could not parse .xlsx: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (conversion.sheets.length === 0) {
    return {
      kind: 'error',
      errorCode: ERR.INVALID_URI,
      message: `xlsx had no usable sheets (all empty?)`,
    }
  }

  const readmePath = `${sheetsDirAbs}README.md`
  const edits: Array<{
    path: string
    content: Uint8Array
    parent_sha?: string | null
  }> = [
    {
      path: readmePath,
      content: new TextEncoder().encode(conversion.readme),
    },
  ]
  for (const s of conversion.sheets) {
    edits.push({
      path: sheetsDirAbs + s.filename,
      content: new TextEncoder().encode(s.csv),
    })
  }

  const batch = await deps.storage.writeBatch({
    workspaceId: ctx.workspaceId,
    edits,
    author: { id: ctx.principalId, type: ctx.principalType },
    message: `upload: ${origPath} → ${sheetsDirAbs} (${conversion.sheets.length} sheets)`,
    allOrNothing: true,
  })

  if (batch.aborted || batch.commit_sha === null) {
    return {
      kind: 'error',
      errorCode: ERR.INTERNAL,
      message: 'xlsx conversion write was aborted',
    }
  }

  const derivatives = batch.results
    .filter(
      (r): r is typeof r & { record: NonNullable<typeof r.record> } =>
        r.success && !!r.record,
    )
    .map((r) => ({
      path: r.path,
      size: r.record.size,
      blob_sha: r.record.blob_sha,
      kind: (r.path === readmePath ? 'readme' : 'csv') as 'readme' | 'csv',
    }))

  return {
    kind: 'success',
    data: {
      ok: true,
      kind: 'office',
      file_path: origPath,
      size: bytes.length,
      commit_sha: batch.commit_sha,
      derivatives,
      ...(conversion.warnings.length
        ? { warnings: conversion.warnings }
        : {}),
    },
  }
}

export function createUploadTool(
  deps: UploadToolDeps,
): Tool<UploadInput, UploadOutput> {
  return buildTool<UploadInput, UploadOutput>({
    name: UPLOAD_TOOL_NAME,
    userFacingName: 'Upload',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: uploadInputSchema,
    outputSchema: uploadOutputSchema,
    async description() {
      return 'Upload a binary or text file to the cloud workspace. Supports zip auto-extraction.'
    },
    async prompt() {
      return uploadPrompt()
    },

    renderResult(data) {
      if (data.kind === 'archive' && data.extracted) {
        return `✓ Extracted ${data.extracted.count} files from ${data.file_path} → ${data.extracted.dest_prefix} (${data.extracted.total_bytes} bytes)`
      }
      if (data.kind === 'office' && data.derivatives) {
        const lines = [
          `✓ Converted ${data.file_path} (original not retained)`,
          ...data.derivatives.map((d) => `  - ${d.path}`),
        ]
        if (data.warnings && data.warnings.length) {
          lines.push('Warnings:')
          for (const w of data.warnings) lines.push(`  • ${w}`)
        }
        return lines.join('\n')
      }
      return `✓ Uploaded ${data.file_path} (${data.size} bytes${data.content_type ? `, ${data.content_type}` : ''})`
    },

    async call(input, ctx: ToolUseContext): Promise<ToolResult<UploadOutput>> {
      // ── 1. Validate path ────────────────────────────────────────────
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const path = canon.path

      // ── 2. Validate size before we even decode ──────────────────────
      if (input.content_base64.length > MAX_BASE64_LENGTH) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_TOO_LARGE,
          message: `Inline upload exceeds the ${MAX_INLINE_UPLOAD_BYTES / 1024 / 1024} MB cap. Split the file or use the signed-URL upload endpoint.`,
        }
      }

      // ── 3. Decode ───────────────────────────────────────────────────
      let bytes: Uint8Array
      try {
        bytes = decodeBase64(input.content_base64)
      } catch {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: 'content_base64 is not valid base64',
        }
      }
      if (bytes.length > MAX_INLINE_UPLOAD_BYTES) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_TOO_LARGE,
          message: `Decoded payload is ${bytes.length} bytes; cap is ${MAX_INLINE_UPLOAD_BYTES}.`,
        }
      }

      // ── 4. Office classification — convert / reject / passthrough ───
      // Decided BEFORE extract because (a) extract: true on a .docx is a
      // category error worth failing fast, (b) zip auto-extract for an
      // archive that happens to contain Office files is still passthrough
      // — we don't recursively convert.
      const office = classifyOfficeUpload(path)

      if (office.kind === 'rejected' && !input.extract) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: office.rejectReason ?? 'Unsupported Office format',
          meta: { ext: office.ext },
        }
      }

      if (office.kind === 'docx' && !input.extract) {
        return await runDocxUpload(deps, ctx, path, bytes)
      }

      if (office.kind === 'xlsx' && !input.extract) {
        return await runXlsxUpload(deps, ctx, path, bytes)
      }

      // ── 5. Extract branch ───────────────────────────────────────────
      if (input.extract) {
        if (!path.toLowerCase().endsWith('.zip')) {
          return {
            kind: 'error',
            errorCode: ERR.INVALID_URI,
            message: 'extract: true requires a file_path ending in .zip',
          }
        }
        const result = extractZip(bytes)
        if (!result.ok) {
          return {
            kind: 'error',
            errorCode:
              result.error === 'unsafe_path' ||
                result.error === 'invalid_zip'
                ? ERR.INVALID_URI
                : ERR.FILE_TOO_LARGE,
            message: result.message,
            meta: { reason: result.error },
          }
        }

        // Compute dest prefix: strip the .zip suffix and treat as a folder.
        // E.g. "in/pkg.zip" → "in/pkg/". Rooted bases and trailing-slash
        // edge cases are pre-canonicalized away by canonicalizePath.
        const destPrefix = path.replace(/\.zip$/i, '') + '/'
        const edits = result.entries.map((e) => ({
          path: destPrefix + e.path,
          content: e.bytes,
          // No parent_sha → opt out of staleness; an upload-extract is a
          // "drop new files" operation, not a "reconcile against known
          // state" operation.
          parent_sha: undefined as string | null | undefined,
        }))

        const batch = await deps.storage.writeBatch({
          workspaceId: ctx.workspaceId,
          edits,
          author: { id: ctx.principalId, type: ctx.principalType },
          message: `upload-extract: ${path} → ${destPrefix}`,
          allOrNothing: true,
        })

        if (batch.aborted || batch.commit_sha === null) {
          return {
            kind: 'error',
            errorCode: ERR.INTERNAL,
            message: 'zip extract write was aborted',
          }
        }

        const totalBytes = result.entries.reduce(
          (s, e) => s + e.bytes.length,
          0,
        )
        return {
          kind: 'success',
          data: {
            ok: true,
            kind: 'archive',
            file_path: path,
            size: bytes.length,
            commit_sha: batch.commit_sha,
            extracted: {
              dest_prefix: destPrefix,
              count: result.entries.length,
              total_bytes: totalBytes,
              entries: batch.results
                .filter((r): r is typeof r & { record: NonNullable<typeof r.record> } =>
                  r.success && !!r.record,
                )
                .map((r) => ({
                  path: r.path,
                  size: r.record.size,
                  blob_sha: r.record.blob_sha,
                })),
            },
          },
        }
      }

      // ── 5. Plain single-file write ──────────────────────────────────
      const writeResult = await deps.storage.writeFile({
        workspaceId: ctx.workspaceId,
        path,
        content: bytes,
        author: { id: ctx.principalId, type: ctx.principalType },
        // No parent_sha — uploads are last-write-wins. Editing existing
        // text files goes through huozi_write/_edit, which DO enforce
        // staleness.
        message: `upload: ${path}`,
        content_type: input.content_type,
      })

      // Refresh ReadFileState so a subsequent huozi_edit on the same path
      // doesn't get NOT_READ_FIRST. (Aligned with huozi_write behavior.)
      ctx.readFileState.set(path, {
        blob_sha: writeResult.record.blob_sha,
        offset: undefined,
        limit: undefined,
        readAt: Date.now(),
      })

      return {
        kind: 'success',
        data: {
          ok: true,
          kind: 'file',
          file_path: path,
          size: bytes.length,
          blob_sha: writeResult.record.blob_sha,
          content_type: input.content_type,
          commit_sha: writeResult.commit_sha,
        },
      }
    },
  })
}
