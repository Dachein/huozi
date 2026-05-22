/**
 * Write-path validation gate for HTML files.
 *
 * Wraps `validateHuoziHtml` with the policy the Write / Edit / BatchEdit
 * tools enforce uniformly:
 *
 *   - non-HTML files            → { kind: 'skip' } (no-op)
 *   - HTML, no error issues     → { kind: 'ok',    warnings }
 *   - HTML, one or more errors  → { kind: 'block', errors, warnings, message }
 *
 * The agent contract is in the tool prompts: errors REFUSE the write
 * (returned as ToolResult.error with errorCode HTML_VALIDATION_FAILED).
 * Warnings + hints pass through to ToolResult.success as
 * `validation_warnings`, so the next pass can clean them up without
 * re-saving.
 *
 * Hints are bundled into the warnings array (the wire shape carries the
 * `level` field; the agent can filter). Keeping it as one optional field
 * keeps the output schema small.
 */

import {
  type ValidationIssue,
  validateHuoziHtml,
} from './html-validate.js'

export type HtmlGateResult =
  | { kind: 'skip' }
  | { kind: 'ok'; warnings: ValidationIssue[] }
  | {
      kind: 'block'
      errors: ValidationIssue[]
      warnings: ValidationIssue[]
      /** One-line summary, suitable for ToolResult.message. */
      message: string
    }

function isHtmlPath(path: string): boolean {
  const i = path.lastIndexOf('.')
  if (i < 0) return false
  const ext = path.slice(i + 1).toLowerCase()
  return ext === 'html' || ext === 'htm'
}

function summarizeBlockingErrors(errors: ValidationIssue[]): string {
  // Show the first 2 codes inline; tail with "(+N more)" if longer.
  const codes = errors.slice(0, 2).map((e) => e.code)
  const rest = errors.length - codes.length
  const tail = rest > 0 ? ` (+${rest} more)` : ''
  return `HTML write blocked by ${errors.length} error issue${
    errors.length === 1 ? '' : 's'
  }: ${codes.join(', ')}${tail}. Inspect meta.issues for details and apply each issue's remedy. Call huozi_validate_rules for the full rule catalog.`
}

/**
 * Run the validator over the post-write content and partition the
 * issues. Path is used for the .html / .htm extension check only.
 */
export function gateHtmlWrite(
  path: string,
  content: string,
): HtmlGateResult {
  if (!isHtmlPath(path)) return { kind: 'skip' }
  const issues = validateHuoziHtml(content)
  const errors = issues.filter((i) => i.level === 'error')
  // Warnings + hints both pass through; tools surface them under the
  // same key. The level field on each issue lets the agent filter.
  const warnings = issues.filter((i) => i.level !== 'error')
  if (errors.length === 0) {
    return { kind: 'ok', warnings }
  }
  return {
    kind: 'block',
    errors,
    warnings,
    message: summarizeBlockingErrors(errors),
  }
}
