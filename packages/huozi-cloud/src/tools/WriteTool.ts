/**
 * huozi_write — v1.
 *
 * Aligns with SPEC §4.3.
 *
 * Key difference from Edit:
 *   - New files: Read not required; create directly.
 *   - Existing files: Read IS required; staleness enforced.
 *   - Always writes with LF line endings (SPEC §4.3 — matches CC's cc:305
 *     decision to undo the previous-version's auto-preserve behavior that
 *     silently corrupted bash scripts on Linux).
 */

import { z } from 'zod'
import {
  getPatchFromContents,
  readBytesWithMetadata,
  type StructuredPatchHunk,
} from '../cc-compat/index.js'
import { ERR } from '../errors.js'
import { formatSecretError, scanForSecrets } from '../security/secrets.js'
import { StaleError, type StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { canonicalizePath } from '../utils/path.js'
import { gateHtmlWrite } from '../validate/html-gate.js'
import type { ValidationIssue } from '../validate/html-validate.js'

export const WRITE_TOOL_NAME = 'huozi_write'

// ── Schemas ──────────────────────────────────────────────────────────────

export const writeInputSchema = z.object({
  file_path: z.string(),
  content: z.string(),
})

export type WriteInput = z.infer<typeof writeInputSchema>

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

export const writeOutputSchema = z.object({
  type: z.enum(['create', 'update']),
  filePath: z.string(),
  content: z.string(),
  structuredPatch: z.array(hunkSchema),
  originalFile: z.string().nullable(),
  commit_sha: z.string(),
  new_blob_sha: z.string(),
  userModified: z.boolean().optional(),
  /** Non-error lint issues (warning + hint) detected on the written
   *  content. Errors block the write entirely; this field never carries
   *  them. Omitted when the file is not HTML or has no findings. */
  validation_warnings: z.array(validationIssueSchema).optional(),
})

export type WriteOutput = z.infer<typeof writeOutputSchema>

export function writePrompt(): string {
  return `Writes a file to the cloud workspace.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- Prefer the Edit tool for modifying existing files — it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.
- The content you provide will be written with LF line endings regardless of what the file currently uses.

HTML lint gate (.html / .htm files only):
- Before writing, the tool runs the huozi HTML validator on the new content.
- If any error-level issues are detected (e.g. format-unknown, paginated-no-pages, page-id-duplicate), the write is REFUSED with errorCode 120 and meta.issues containing the structured findings. Apply each issue's remedy and call huozi_write again.
- Warning and hint issues do not block the write; they are returned in the success payload as validation_warnings[] so you can fix them on the next pass.
- Call huozi_validate_rules to enumerate the full rule catalog with each rule's why/remedy ahead of time.`
}

export interface WriteToolDeps {
  storage: StorageBackend
}

export function createWriteTool(
  deps: WriteToolDeps,
): Tool<WriteInput, WriteOutput> {
  return buildTool<WriteInput, WriteOutput>({
    name: WRITE_TOOL_NAME,
    userFacingName: 'Write',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: writeInputSchema,
    outputSchema: writeOutputSchema,
    async description() {
      return 'Write a file to the cloud workspace.'
    },
    async prompt() {
      return writePrompt()
    },

    renderResult(data: WriteOutput): string {
      return data.type === 'create'
        ? `File created successfully at: ${data.filePath}`
        : `The file ${data.filePath} has been updated successfully.`
    },

    async validateInput(input, ctx) {
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return { result: false, errorCode: ERR.INVALID_URI, message: canon.message }
      }
      if (canon.path.endsWith('.ipynb')) {
        return {
          result: false,
          errorCode: ERR.USE_NOTEBOOK_EDIT,
          message:
            'File is a Jupyter Notebook. Use huozi_notebook_edit (v2, not yet available).',
        }
      }
      // Secret scan on whole content (SPEC §7.5).
      const secret = scanForSecrets(input.content)
      if (secret) {
        return {
          result: false,
          errorCode: ERR.SECRET_DETECTED,
          message: formatSecretError(secret),
          meta: { rule: secret.rule, line: secret.lineNumber, column: secret.column },
        }
      }
      // HTML lint gate (.html / .htm only): refuse writes that would
      // introduce error-level issues. Warnings/hints don't block — they
      // ride along on the success payload in `call`.
      const gate = gateHtmlWrite(canon.path, input.content)
      if (gate.kind === 'block') {
        return {
          result: false,
          errorCode: ERR.HTML_VALIDATION_FAILED,
          message: gate.message,
          meta: { issues: gate.errors, warnings: gate.warnings },
        }
      }
      const existing = await deps.storage.readFile(ctx.workspaceId, canon.path)
      if (!existing) {
        // New file: no Read required.
        return { result: true }
      }
      // Existing file: Read required; staleness enforced.
      const cached = ctx.readFileState.get(canon.path)
      if (!cached || cached.offset !== undefined || cached.limit !== undefined) {
        return {
          result: false,
          errorCode: ERR.NOT_READ_FIRST,
          message:
            'File has not been read yet (or only a partial view was read). Read it in full before writing to it.',
        }
      }
      if (cached.blob_sha !== existing.blob_sha) {
        return {
          result: false,
          errorCode: ERR.MODIFIED_SINCE_READ,
          message:
            'File has been modified since read, either by the user or by another agent. Read it again before attempting to write it.',
        }
      }
      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<WriteOutput>> {
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const path = canon.path

      const existing = await deps.storage.readFile(ctx.workspaceId, path)
      const parent_sha = existing?.blob_sha ?? null

      // SPEC §4.3: Write always uses LF line endings (matches CC's
      // post-CRLF-bug revert). No line-ending preservation.
      const bytes = new TextEncoder().encode(input.content)

      let writeResult
      try {
        writeResult = await deps.storage.writeFile({
          workspaceId: ctx.workspaceId,
          path,
          content: bytes,
          author: { id: ctx.principalId, type: ctx.principalType },
          parent_sha,
          message: `${existing ? 'write' : 'create'}: ${path} via ${ctx.principalId}`,
        })
      } catch (e) {
        if (e instanceof StaleError) {
          return {
            kind: 'error',
            errorCode: ERR.MODIFIED_SINCE_READ,
            message: e.message,
          }
        }
        throw e
      }

      let originalFile: string | null = null
      let structuredPatch: StructuredPatchHunk[] = []
      if (existing) {
        const decoded = readBytesWithMetadata(existing.content)
        originalFile = decoded.content
        structuredPatch = getPatchFromContents({
          filePath: path,
          oldContent: decoded.content,
          newContent: input.content,
        })
      }

      // Refresh ReadFileState so subsequent Edits see the fresh state.
      ctx.readFileState.set(path, {
        blob_sha: writeResult.record.blob_sha,
        offset: undefined,
        limit: undefined,
        readAt: Date.now(),
      })

      // Re-run the gate to capture any warnings on a now-non-blocking
      // write. (validateInput's gate call already proved there are no
      // errors; we re-run to pull the warning slice for the payload.)
      const postGate = gateHtmlWrite(path, input.content)
      const warnings: ValidationIssue[] | undefined =
        postGate.kind === 'ok' && postGate.warnings.length > 0
          ? postGate.warnings
          : undefined

      return {
        kind: 'success',
        data: {
          type: writeResult.operation,
          filePath: path,
          content: input.content,
          structuredPatch,
          originalFile,
          commit_sha: writeResult.commit_sha,
          new_blob_sha: writeResult.record.blob_sha,
          userModified: ctx.principalType === 'user' ? true : false,
          ...(warnings ? { validation_warnings: warnings } : {}),
        },
      }
    },
  })
}
