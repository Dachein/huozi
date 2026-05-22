/**
 * huozi_validate — huozi extension, lint.
 *
 * Validates a file against type-specific design conventions and returns
 * structured diagnostics (level / code / message / line / remedy /
 * docRef). Currently only HTML is wired; other types fall back to "no
 * validator yet" without blocking.
 *
 * Why this exists: the publish pipeline silently strips dangerous tags,
 * silently retypes unknown formats to "web", and silently no-ops the
 * pager when [data-page] is missing. Without an explicit lint pass the
 * Agent has no way to know its HTML is broken before huozi_share. This
 * tool surfaces those failure modes so an Agent can self-correct.
 *
 * Recommended usage from the Agent: call BEFORE huozi_share when
 * creating new HTML. Treat `level: error` as a blocker; the `remedy`
 * field tells the Agent what to fix.
 */

import { z } from 'zod'
import {
  type ValidationIssue,
  summarize,
  validateHuoziHtml,
} from '../validate/html-validate.js'
import { ERR } from '../errors.js'
import { buildTool } from '../Tool.js'
import type { StorageBackend } from '../storage/types.js'
import type { Tool, ToolResult } from '../types.js'

export const VALIDATE_TOOL_NAME = 'huozi_validate'

export const validateInputSchema = z
  .object({
    file_path: z
      .string()
      .min(1, 'file_path is required')
      .describe('Workspace-relative path of the file to validate.'),
  })
  .strict()
export type ValidateInput = z.infer<typeof validateInputSchema>

const issueSchema = z.object({
  level: z.enum(['error', 'warning', 'hint']),
  code: z.string(),
  message: z.string(),
  line: z.number().int().positive().optional(),
  remedy: z.string().optional(),
  docRef: z.string().optional(),
})

export const validateOutputSchema = z.object({
  file_path: z.string(),
  validator: z.enum(['html', 'none']),
  summary: z.object({
    error: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    hint: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  issues: z.array(issueSchema),
  blob_sha: z.string(),
})
export type ValidateOutput = z.infer<typeof validateOutputSchema>

export interface ValidateToolDeps {
  storage: StorageBackend
}

function extOf(path: string): string {
  const i = path.lastIndexOf('.')
  return i < 0 ? '' : path.slice(i + 1).toLowerCase()
}

function canonicalizePath(raw: string): string {
  // Match the rest of the toolset: leading slash is workspace-relative,
  // dots are forbidden, no scheme.
  let p = raw.trim()
  if (p.startsWith('/')) p = p.slice(1)
  return p
}

function validatePrompt(): string {
  return `Validate a workspace file against huozi design conventions.

Runs the HTML rule set on .html / .htm files (14 rules across format
declaration, paginated structure, sandbox/strip behavior, geometry, and
share-card metadata). Call \`huozi_validate_rules\` to enumerate the
full catalog with each rule's \`why\` and \`remedy\` — recommended once
per session before authoring HTML.

For non-HTML files, returns validator: "none" with empty issues.

Returns:
  - issues[] — each with level / code / message / line / remedy / docRef
  - summary — counts by level (error / warning / hint)
  - blob_sha — content identity (use it to detect drift before huozi_share)

Severity contract:
  - error    write WILL produce broken render. huozi_write refuses these.
  - warning  write succeeds but the result probably isn't what the author
             intended.
  - hint     best-practice nudge.

Recommended flow when generating HTML:
  1. (Optional, once per session) huozi_validate_rules() → learn the catalog
  2. huozi_write({ file_path, content })
     ↳ write is rejected if it would introduce error-level issues
  3. huozi_validate({ file_path })
  4. If summary.warning > 0 → fix using each issue's \`remedy\` and goto 2
  5. huozi_share({ file_path })

The tool is read-only — it always returns even if issues exist.`
}

export function createValidateTool(
  deps: ValidateToolDeps,
): Tool<ValidateInput, ValidateOutput> {
  return buildTool<ValidateInput, ValidateOutput>({
    name: VALIDATE_TOOL_NAME,
    userFacingName: 'Validate',
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: validateInputSchema,
    outputSchema: validateOutputSchema,
    async description() {
      return 'Validate a file against huozi design conventions; returns issues + summary.'
    },
    async prompt() {
      return validatePrompt()
    },
    renderResult(data) {
      const s = data.summary
      if (data.validator === 'none') {
        return `${data.file_path}: no validator for this file type`
      }
      if (s.total === 0) return `${data.file_path}: clean ✓`
      return `${data.file_path}: ${s.error}E · ${s.warning}W · ${s.hint}H`
    },
    async call(input, ctx): Promise<ToolResult<ValidateOutput>> {
      const path = canonicalizePath(input.file_path)
      if (!path) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: 'file_path must not be empty',
        }
      }

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

      const ext = extOf(path)
      if (ext !== 'html' && ext !== 'htm') {
        return {
          kind: 'success',
          data: {
            file_path: path,
            validator: 'none',
            summary: { error: 0, warning: 0, hint: 0, total: 0 },
            issues: [],
            blob_sha: record.blob_sha,
          },
        }
      }

      // record.content is a Uint8Array; decode as UTF-8 for validation.
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const html = decoder.decode(record.content)
      const issues: ValidationIssue[] = validateHuoziHtml(html)
      return {
        kind: 'success',
        data: {
          file_path: path,
          validator: 'html',
          summary: summarize(issues),
          issues,
          blob_sha: record.blob_sha,
        },
      }
    },
  })
}
