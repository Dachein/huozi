/**
 * huozi_edit — v1.
 *
 * Aligns with SPEC §4.2. Full CC-flavored lifecycle:
 *   1. canonicalize path
 *   2. validate (file exists, was Read first, blob_sha matches, old ≠ new,
 *      old_string found exactly once unless replace_all)
 *   3. quote-normalize via findActualString / preserveQuoteStyle
 *   4. apply edit → compute structuredPatch
 *   5. write via StorageBackend (staleness-checked atomic critical section)
 *   6. refresh ReadFileState with new content + new blob_sha
 *
 * Key invariant: NO whitespace-tolerant fallback (SPEC §4.2 reverse-pattern
 * note). Strict exact match, fail with errorCode 8 if not found.
 */

import { z } from 'zod'
import {
  findActualString,
  getPatchForEdit,
  normalizeFileEditInput,
  preserveQuoteStyle,
  readBytesWithMetadata,
  type StructuredPatchHunk,
} from '../cc-compat/index.js'
import { ERR } from '../errors.js'
import { formatSecretError, scanForSecrets } from '../security/secrets.js'
import { StaleError, type StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult, ToolUseContext } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const EDIT_TOOL_NAME = 'huozi_edit'

// ── Schemas ──────────────────────────────────────────────────────────────

// Schema keeps `replace_all` as plain optional (no `.default`) — the tool
// impl applies the `false` default explicitly. This keeps zod's Input and
// Output types identical, which `ToolDef<I, O>` requires.
export const editInputSchema = z.object({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
})

export type EditInput = z.infer<typeof editInputSchema>

const hunkSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(z.string()),
})

export const editOutputSchema = z.object({
  filePath: z.string(),
  oldString: z.string(),
  newString: z.string(),
  originalFile: z.string(),
  structuredPatch: z.array(hunkSchema),
  userModified: z.boolean(),
  replaceAll: z.boolean(),
  commit_sha: z.string(),
  new_blob_sha: z.string(),
})

export type EditOutput = z.infer<typeof editOutputSchema>

// ── Prompt ───────────────────────────────────────────────────────────────

export function editPrompt(): string {
  return `Performs exact string replacements in files.

Usage:
- You must use the Read tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: 6-char line number + tab. Everything after that is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if old_string is not unique in the file. Either provide a larger old_string with more surrounding context, or use replace_all: true to change every instance.
- Use the smallest old_string that's clearly unique — usually 2-4 adjacent lines is sufficient. Avoid including 10+ lines of context when less uniquely identifies the target.
- Use replace_all for renaming variables or other symbol-level substitutions.`
}

// ── Tool ─────────────────────────────────────────────────────────────────

export interface EditToolDeps {
  storage: StorageBackend
}

export function createEditTool(deps: EditToolDeps): Tool<EditInput, EditOutput> {
  return buildTool<EditInput, EditOutput>({
    name: EDIT_TOOL_NAME,
    userFacingName: 'Edit',
    maxResultSizeChars: 100_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: editInputSchema,
    outputSchema: editOutputSchema,
    async description() {
      return 'A tool for editing files'
    },
    async prompt() {
      return editPrompt()
    },

    renderResult(data: EditOutput): string {
      if (data.replaceAll) {
        return `The file ${data.filePath} has been updated. All occurrences were successfully replaced.`
      }
      return `The file ${data.filePath} has been updated successfully.`
    },

    async validateInput(input, ctx): Promise<
      | { result: true }
      | { result: false; message: string; errorCode: number }
    > {
      if (input.old_string === input.new_string) {
        return {
          result: false,
          errorCode: ERR.NO_CHANGES,
          message:
            'No changes to make: old_string and new_string are exactly the same.',
        }
      }
      // Secret scan on the new content being introduced (SPEC §7.5).
      // We only scan new_string — pre-existing secrets in old_string are
      // outside our scope (the file already had them).
      const secret = scanForSecrets(input.new_string)
      if (secret) {
        return {
          result: false,
          errorCode: ERR.SECRET_DETECTED,
          message: formatSecretError(secret),
        }
      }
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

      const record = await deps.storage.readFile(ctx.workspaceId, canon.path)

      // Empty old_string + nonexistent file → creation shortcut (caller should
      // use Write instead; we don't support Edit-as-create in v1 to keep the
      // two tools cleanly separated).
      if (!record) {
        if (input.old_string === '') {
          return {
            result: false,
            errorCode: ERR.FILE_NOT_FOUND,
            message: `File does not exist: ${canon.path}. Use huozi_write to create it.`,
          }
        }
        return {
          result: false,
          errorCode: ERR.FILE_NOT_FOUND,
          message: `File does not exist: ${canon.path}`,
        }
      }
      // Empty old_string + existing non-empty file → rejection (CC parity).
      if (input.old_string === '' && record.size > 0) {
        return {
          result: false,
          errorCode: ERR.CANNOT_CREATE_FILE_EXISTS,
          message: 'Cannot create new file - file already exists.',
        }
      }

      // Must have been Read first; blob_sha must match.
      const cached = ctx.readFileState.get(canon.path)
      if (!cached) {
        return {
          result: false,
          errorCode: ERR.NOT_READ_FIRST,
          message:
            'File has not been read yet. Read it first before writing to it.',
        }
      }
      if (cached.blob_sha !== record.blob_sha) {
        return {
          result: false,
          errorCode: ERR.MODIFIED_SINCE_READ,
          message:
            'File has been modified since read, either by the user or by another agent. Read it again before attempting to write it.',
        }
      }

      // Pre-run matching feasibility check on decoded content.
      const { content } = readBytesWithMetadata(record.content)
      const actual = findActualString(content, input.old_string)
      if (!actual) {
        return {
          result: false,
          errorCode: ERR.STRING_NOT_FOUND,
          message: `String to replace not found in file.\nString: ${input.old_string}`,
        }
      }
      const matches = content.split(actual).length - 1
      if (matches > 1 && !(input.replace_all ?? false)) {
        return {
          result: false,
          errorCode: ERR.AMBIGUOUS_MATCH,
          message: `Found ${matches} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, provide more context to uniquely identify the instance.\nString: ${input.old_string}`,
        }
      }

      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<EditOutput>> {
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const path = canon.path

      // Fetch current record (staleness re-check — validateInput already saw
      // it, but there's a window between validate and call in CC too).
      const record = await deps.storage.readFile(ctx.workspaceId, path)
      if (!record) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message: `File does not exist: ${path}`,
        }
      }

      const { content: originalContent, encoding, lineEndings } =
        readBytesWithMetadata(record.content)

      // Normalize edit input using desanitize + markdown trailing-space policy.
      const normalized = normalizeFileEditInput({
        file_path: path,
        fileContent: originalContent,
        edits: [
          {
            old_string: input.old_string,
            new_string: input.new_string,
            replace_all: (input.replace_all ?? false),
          },
        ],
      })
      const edit0 = normalized.edits[0]!

      // Resolve actual string (accounts for curly vs straight quotes).
      const actualOldString =
        findActualString(originalContent, edit0.old_string) ?? edit0.old_string

      // Preserve file's quote style in new_string.
      const actualNewString = preserveQuoteStyle(
        edit0.old_string,
        actualOldString,
        edit0.new_string,
      )

      // Compute patch + updated content.
      let patch: StructuredPatchHunk[]
      let updatedFile: string
      try {
        const r = getPatchForEdit({
          filePath: path,
          fileContents: originalContent,
          oldString: actualOldString,
          newString: actualNewString,
          replaceAll: (input.replace_all ?? false),
        })
        patch = r.patch
        updatedFile = r.updatedFile
      } catch (e) {
        // Shouldn't happen post-validation; be defensive.
        return {
          kind: 'error',
          errorCode: ERR.STRING_NOT_FOUND,
          message:
            e instanceof Error ? e.message : 'Failed to apply edit',
        }
      }

      // Preserve original encoding + line endings (Edit keeps them; Write
      // forces LF, per SPEC §4.2 CRLF/编码 约定).
      const { encodeContentForWrite } = await import('../cc-compat/index.js')
      const finalBytes = encodeContentForWrite(
        updatedFile,
        encoding,
        lineEndings,
      )

      // Commit via StorageBackend (staleness-protected).
      let writeResult
      try {
        writeResult = await deps.storage.writeFile({
          workspaceId: ctx.workspaceId,
          path,
          content: finalBytes,
          author: { id: ctx.principalId, type: ctx.principalType },
          parent_sha: record.blob_sha,
          message: `edit: ${path} via ${ctx.principalId}`,
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

      // Refresh ReadFileState so subsequent edits in the same turn see the
      // new blob_sha (content no longer stored — see types.ts).
      ctx.readFileState.set(path, {
        blob_sha: writeResult.record.blob_sha,
        offset: undefined,
        limit: undefined,
        readAt: Date.now(),
      })

      return {
        kind: 'success',
        data: {
          filePath: path,
          oldString: actualOldString,
          newString: actualNewString,
          originalFile: originalContent,
          structuredPatch: patch,
          userModified: ctx.principalType === 'user',
          replaceAll: (input.replace_all ?? false),
          commit_sha: writeResult.commit_sha,
          new_blob_sha: writeResult.record.blob_sha,
        },
      }
    },
  })
}
