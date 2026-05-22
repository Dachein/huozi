/**
 * huozi_batch_edit — huozi extension (SPEC §4.6).
 *
 * One MCP tool call applies N edits atomically. Contrast with N sequential
 * `huozi_edit` calls: batch produces ONE commit, single audit line, no half-
 * applied state if any edit fails.
 *
 * Flow:
 *   1. Canonicalize every path, group edits by file_path
 *   2. For each file:
 *        - Fetch current FileRecord
 *        - Check readFileState entry exists + blob_sha matches
 *        - Apply all edits for that file (via getPatchForEdits, which
 *          enforces "later old_string can't be substring of earlier new_string")
 *        - Compute structuredPatch
 *   3. If any file fails AND all_or_nothing=true → abort, return per-file errors
 *   4. Otherwise call storage.writeBatch with all updates
 *   5. Refresh readFileState for every successfully written file
 */

import { z } from 'zod'
import {
  countLinesChanged,
  encodeContentForWrite,
  findActualString,
  getPatchFromContents,
  normalizeFileEditInput,
  preserveQuoteStyle,
  readBytesWithMetadata,
  type StructuredPatchHunk,
} from '../cc-compat/index.js'
import { ERR } from '../errors.js'
import { formatSecretError, scanForSecrets } from '../security/secrets.js'
import type { BatchWriteArgs, StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { canonicalizePath } from '../utils/path.js'
import { gateHtmlWrite } from '../validate/html-gate.js'
import type { ValidationIssue } from '../validate/html-validate.js'

export const BATCH_EDIT_TOOL_NAME = 'huozi_batch_edit'

export const batchEditInputSchema = z.object({
  edits: z
    .array(
      z.object({
        file_path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
        replace_all: z.boolean().optional(),
      }),
    )
    .min(1),
  message: z.string().optional(),
  all_or_nothing: z.boolean().optional(),
})

export type BatchEditInput = z.infer<typeof batchEditInputSchema>

const hunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(z.string()),
})

const validationIssueSchema = z.object({
  level: z.enum(['error', 'warning', 'hint']),
  code: z.string(),
  message: z.string(),
  line: z.number().int().positive().optional(),
  remedy: z.string().optional(),
  docRef: z.string().optional(),
})

const batchItemResultSchema = z.object({
  file_path: z.string(),
  success: z.boolean(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      issues: z.array(validationIssueSchema).optional(),
    })
    .optional(),
  structuredPatch: z.array(hunkSchema).optional(),
  oldString: z.string().optional(),
  newString: z.string().optional(),
  originalFile: z.string().optional(),
  new_blob_sha: z.string().optional(),
  /** Non-error lint issues on the post-edit content (HTML files only). */
  validation_warnings: z.array(validationIssueSchema).optional(),
})

export const batchEditOutputSchema = z.object({
  commit_sha: z.string().nullable(),
  aborted: z.boolean(),
  results: z.array(batchItemResultSchema),
  allOrNothing: z.boolean(),
})

export type BatchEditOutput = z.infer<typeof batchEditOutputSchema>

function batchEditPrompt(): string {
  return `Apply multiple file edits as a single atomic commit.

Usage:
- Every file in the edits array must have been Read before calling this tool (the batch enforces staleness per file).
- The same file may appear multiple times in edits; later edits see the result of earlier ones (like running Edit sequentially on that file).
- With all_or_nothing: true (default), if ANY edit can't be applied (stale, old_string not found, ambiguous match, or HTML lint error), nothing is written. Check results[] for per-file errors.
- With all_or_nothing: false, failed edits are reported but successful ones are committed together.
- The entire batch produces ONE commit_sha. Use this tool instead of many sequential huozi_edit calls when you want a clean audit trail for a logical grouping.

HTML lint gate (.html / .htm files in the batch):
- After computing each file's post-edit content, the validator runs over it.
- A file with error-level issues (code 120) is marked failed in results[]; results[i].error.issues lists the structured findings.
- Warning and hint issues do not fail the file; they appear on the success entry as validation_warnings[] so you can clean them up next pass.
- Call huozi_validate_rules to enumerate the full rule catalog ahead of time.`
}

export interface BatchEditToolDeps {
  storage: StorageBackend
}

interface PerFileResult {
  file_path: string
  success: boolean
  error?: { code: number; message: string; issues?: ValidationIssue[] }
  // when success:
  actualOldString?: string
  actualNewString?: string
  originalFile?: string
  structuredPatch?: StructuredPatchHunk[]
  updatedFile?: string
  encoding?: 'utf8' | 'utf16le'
  lineEndings?: 'LF' | 'CRLF'
  parent_sha?: string
  additions?: number
  deletions?: number
  /** Non-error lint findings; passed through to the per-file result on
   *  success. Errors short-circuit to the `error` field. */
  validationWarnings?: ValidationIssue[]
}

export function createBatchEditTool(
  deps: BatchEditToolDeps,
): Tool<BatchEditInput, BatchEditOutput> {
  return buildTool<BatchEditInput, BatchEditOutput>({
    name: BATCH_EDIT_TOOL_NAME,
    userFacingName: 'Batch Edit',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: batchEditInputSchema,
    outputSchema: batchEditOutputSchema,
    async description() {
      return 'Apply multiple file edits atomically in one commit.'
    },
    async prompt() {
      return batchEditPrompt()
    },

    renderResult(data: BatchEditOutput): string {
      if (data.aborted) {
        const errs = data.results
          .filter((r) => !r.success)
          .map((r) => `  ${r.file_path}: ${r.error?.message ?? 'unknown error'}`)
          .join('\n')
        return `Batch aborted (all_or_nothing=${data.allOrNothing}). Errors:\n${errs}`
      }
      const successCount = data.results.filter((r) => r.success).length
      const failCount = data.results.length - successCount
      const parts = [`Batch committed as ${data.commit_sha ?? '<none>'}.`]
      parts.push(`${successCount} file${successCount === 1 ? '' : 's'} updated.`)
      if (failCount > 0) parts.push(`${failCount} failed (see results[]).`)
      return parts.join(' ')
    },

    async call(input, ctx): Promise<ToolResult<BatchEditOutput>> {
      const allOrNothing = input.all_or_nothing ?? true

      // Group edits by canonical path, preserving order.
      const grouped = new Map<
        string,
        Array<{
          old_string: string
          new_string: string
          replace_all: boolean
          raw_file_path: string
        }>
      >()
      const pathOrder: string[] = []
      for (const e of input.edits) {
        const canon = canonicalizePath(e.file_path)
        if (!canon.ok) {
          return {
            kind: 'error',
            errorCode: ERR.INVALID_URI,
            message: `${e.file_path}: ${canon.message}`,
          }
        }
        if (canon.path.endsWith('.ipynb')) {
          return {
            kind: 'error',
            errorCode: ERR.USE_NOTEBOOK_EDIT,
            message: `${canon.path}: Jupyter notebooks are not editable in v1.`,
          }
        }
        if (!grouped.has(canon.path)) {
          grouped.set(canon.path, [])
          pathOrder.push(canon.path)
        }
        grouped.get(canon.path)!.push({
          old_string: e.old_string,
          new_string: e.new_string,
          replace_all: e.replace_all ?? false,
          raw_file_path: e.file_path,
        })
      }

      // Phase 1: validate + compute per-file.
      const perFile: PerFileResult[] = []

      for (const path of pathOrder) {
        const edits = grouped.get(path)!
        const out: PerFileResult = { file_path: path, success: false }

        const record = await deps.storage.readFile(ctx.workspaceId, path)
        if (!record) {
          out.error = {
            code: ERR.FILE_NOT_FOUND,
            message: `File does not exist: ${path}. Use huozi_write to create it.`,
          }
          perFile.push(out)
          continue
        }
        const cached = ctx.readFileState.get(path)
        if (!cached) {
          out.error = {
            code: ERR.NOT_READ_FIRST,
            message: `File has not been read yet: ${path}.`,
          }
          perFile.push(out)
          continue
        }
        if (cached.blob_sha !== record.blob_sha) {
          out.error = {
            code: ERR.MODIFIED_SINCE_READ,
            message: `File has been modified since read: ${path}.`,
          }
          perFile.push(out)
          continue
        }

        const { content: originalContent, encoding, lineEndings } =
          readBytesWithMetadata(record.content)

        // Normalize input per-file (handles markdown trailing space + desanitize).
        const normalized = normalizeFileEditInput({
          file_path: path,
          fileContent: originalContent,
          edits: edits.map((e) => ({
            old_string: e.old_string,
            new_string: e.new_string,
            replace_all: e.replace_all,
          })),
        })

        // Per-edit quote resolution. First edit resolves against original;
        // subsequent edits resolve against the in-memory running content.
        let running = originalContent
        const resolved: Array<{
          old_string: string
          new_string: string
          replace_all: boolean
        }> = []
        let firstEditError: { code: number; message: string } | null = null
        for (const e of normalized.edits) {
          // Secret scan on the new content being introduced (SPEC §7.5).
          // Consistent with EditTool — only scan the inbound slice.
          const secret = scanForSecrets(e.new_string)
          if (secret) {
            firstEditError = {
              code: ERR.SECRET_DETECTED,
              message: `${formatSecretError(secret)} (in ${path})`,
            }
            break
          }
          const actualOld = findActualString(running, e.old_string)
          if (!actualOld) {
            firstEditError = {
              code: ERR.STRING_NOT_FOUND,
              message: `String to replace not found in ${path}.\nString: ${e.old_string}`,
            }
            break
          }
          const matches = running.split(actualOld).length - 1
          if (matches > 1 && !e.replace_all) {
            firstEditError = {
              code: ERR.AMBIGUOUS_MATCH,
              message: `Found ${matches} matches in ${path}, but replace_all is false.`,
            }
            break
          }
          const actualNew = preserveQuoteStyle(
            e.old_string,
            actualOld,
            e.new_string,
          )
          const replaceAll = e.replace_all ?? false
          resolved.push({
            old_string: actualOld,
            new_string: actualNew,
            replace_all: replaceAll,
          })
          running = replaceAll
            ? running.replaceAll(actualOld, () => actualNew)
            : running.replace(actualOld, () => actualNew)
        }

        if (firstEditError) {
          out.error = firstEditError
          perFile.push(out)
          continue
        }

        // We already applied edits sequentially into `running` above, including
        // conflict validation. `getPatchForEdits` would re-run the edits and
        // re-apply the "later old_string cannot be substring of earlier
        // new_string" invariant — but that invariant is too strict for the
        // same-file chaining case (e.g. edit adds `const y = 1`, subsequent
        // edit changes it to `const y = 2`). Since we've already computed
        // the final content, compute the diff directly from before/after.
        const updatedFile = running
        const patch: StructuredPatchHunk[] = getPatchFromContents({
          filePath: path,
          oldContent: originalContent,
          newContent: updatedFile,
        })

        // HTML lint gate per file. Errors fail the file (the batch
        // aborts under all_or_nothing); warnings/hints ride out on the
        // per-file success entry. Skips non-HTML paths.
        const gate = gateHtmlWrite(path, updatedFile)
        if (gate.kind === 'block') {
          out.error = {
            code: ERR.HTML_VALIDATION_FAILED,
            message: `${path}: ${gate.message}`,
            issues: gate.errors,
          }
          perFile.push(out)
          continue
        }

        const lineCounts = countLinesChanged(patch)
        out.success = true
        out.actualOldString = resolved[0]?.old_string ?? ''
        out.actualNewString = resolved[resolved.length - 1]?.new_string ?? ''
        out.originalFile = originalContent
        out.structuredPatch = patch
        out.updatedFile = updatedFile
        out.encoding = encoding
        out.lineEndings = lineEndings
        out.parent_sha = record.blob_sha
        out.additions = lineCounts.additions
        out.deletions = lineCounts.removals
        if (gate.kind === 'ok' && gate.warnings.length > 0) {
          out.validationWarnings = gate.warnings
        }
        perFile.push(out)
      }

      const anyFailure = perFile.some((f) => !f.success)

      // Abort pre-write if all-or-nothing and any failure.
      if (allOrNothing && anyFailure) {
        return {
          kind: 'success',
          data: {
            commit_sha: null,
            aborted: true,
            results: perFile.map((f) => ({
              file_path: f.file_path,
              success: f.success,
              ...(f.error
                ? {
                    error: {
                      code: f.error.code,
                      message: f.error.message,
                      ...(f.error.issues ? { issues: f.error.issues } : {}),
                    },
                  }
                : {}),
            })),
            allOrNothing,
          },
        }
      }

      // Phase 2: commit successful writes.
      const writeEdits: BatchWriteArgs['edits'] = []
      for (const f of perFile) {
        if (!f.success || f.updatedFile == null) continue
        writeEdits.push({
          path: f.file_path,
          content: encodeContentForWrite(
            f.updatedFile,
            f.encoding!,
            f.lineEndings!,
          ),
          parent_sha: f.parent_sha!,
          additions: f.additions,
          deletions: f.deletions,
        })
      }

      let batchResult
      if (writeEdits.length === 0) {
        // Nothing to write (every file errored in allOrNothing=false mode).
        return {
          kind: 'success',
          data: {
            commit_sha: null,
            aborted: false,
            results: perFile.map((f) => ({
              file_path: f.file_path,
              success: f.success,
              ...(f.error
                ? {
                    error: {
                      code: f.error.code,
                      message: f.error.message,
                      ...(f.error.issues ? { issues: f.error.issues } : {}),
                    },
                  }
                : {}),
            })),
            allOrNothing,
          },
        }
      }
      batchResult = await deps.storage.writeBatch({
        workspaceId: ctx.workspaceId,
        edits: writeEdits,
        author: { id: ctx.principalId, type: ctx.principalType },
        message:
          input.message ?? `batch_edit: ${writeEdits.length} files via ${ctx.principalId}`,
        allOrNothing,
      })

      // Refresh ReadFileState for every successfully written file + update
      // per-file result records with new_blob_sha.
      const shaByPath = new Map<string, string>()
      for (const r of batchResult.results) {
        if (r.success && r.record) {
          shaByPath.set(r.path, r.record.blob_sha)
        }
      }
      for (const f of perFile) {
        if (!f.success) continue
        const newSha = shaByPath.get(f.file_path)
        if (newSha && f.updatedFile != null) {
          ctx.readFileState.set(f.file_path, {
            blob_sha: newSha,
            offset: undefined,
            limit: undefined,
            readAt: Date.now(),
          })
        }
      }

      return {
        kind: 'success',
        data: {
          commit_sha: batchResult.commit_sha,
          aborted: batchResult.aborted,
          results: perFile.map((f) => ({
            file_path: f.file_path,
            success: f.success,
            ...(f.error
              ? {
                  error: {
                    code: f.error.code,
                    message: f.error.message,
                    ...(f.error.issues ? { issues: f.error.issues } : {}),
                  },
                }
              : {}),
            ...(f.success
              ? {
                  structuredPatch: f.structuredPatch,
                  oldString: f.actualOldString,
                  newString: f.actualNewString,
                  originalFile: f.originalFile,
                  new_blob_sha: shaByPath.get(f.file_path),
                  ...(f.validationWarnings && f.validationWarnings.length > 0
                    ? { validation_warnings: f.validationWarnings }
                    : {}),
                }
              : {}),
          })),
          allOrNothing,
        },
      }
    },
  })
}
