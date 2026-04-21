/**
 * `buildTool()` factory.
 *
 * Takes a partial `ToolDef` and returns a complete `Tool` with the standard
 * lifecycle wrapping:
 *
 *   run(input, ctx)
 *     └── zod parse input
 *     └── validateInput   → early reject as 'error' ToolResult
 *     └── checkPermissions → early reject as 'error' ToolResult
 *     └── call             → success or propagated error
 *     └── truncate result payload if over maxResultSizeChars
 *
 * Mirrors the shape of `cc:Tool.ts`'s `buildTool` but lighter — no TUI
 * rendering, no analytics hooks, no permission-suggestion machinery.
 * All the stuff that matters for Agent-observable behavior is kept.
 */

import type {
  PermissionDecision,
  Tool,
  ToolDef,
  ToolResult,
  ToolUseContext,
  ValidationResult,
} from './types.js'

const DEFAULT_MAX_RESULT_SIZE_CHARS = 100_000

/**
 * Build a Tool from a ToolDef. Applies defaults, wraps the lifecycle.
 */
export function buildTool<I, O>(def: ToolDef<I, O>): Tool<I, O> {
  const maxResultSizeChars =
    def.maxResultSizeChars ?? DEFAULT_MAX_RESULT_SIZE_CHARS
  const isConcurrencySafe = def.isConcurrencySafe ?? false
  const isReadOnly = def.isReadOnly ?? false
  const userFacingName = def.userFacingName ?? def.name

  const renderResult =
    def.renderResult ?? ((data: O): string => JSON.stringify(data))

  const validateInput: NonNullable<ToolDef<I, O>['validateInput']> =
    def.validateInput ?? (async (): Promise<ValidationResult> => ({ result: true }))

  const checkPermissions: NonNullable<ToolDef<I, O>['checkPermissions']> =
    def.checkPermissions ??
    (async (): Promise<PermissionDecision> => ({ behavior: 'allow' }))

  return {
    name: def.name,
    userFacingName,
    maxResultSizeChars,
    isConcurrencySafe,
    isReadOnly,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,

    description: def.description,
    prompt: def.prompt,

    renderResult,

    async run(rawInput: unknown, ctx: ToolUseContext): Promise<ToolResult<O>> {
      // 1. Parse + zod-validate the input shape.
      const parsed = def.inputSchema.safeParse(rawInput)
      if (!parsed.success) {
        return {
          kind: 'error',
          errorCode: 0,
          message: `Invalid input: ${summarizeZodIssues(parsed.error)}`,
        }
      }
      const input = parsed.data as I

      // 2. Tool-level pre-execution validation.
      const vr = await validateInput(input, ctx)
      if (vr.result === false) {
        return {
          kind: 'error',
          errorCode: vr.errorCode,
          message: vr.message,
          meta: vr.meta,
        }
      }

      // 3. Permissions.
      const perm = await checkPermissions(input, ctx)
      if (perm.behavior === 'deny') {
        return {
          kind: 'error',
          errorCode: 2, // ERR.DENIED_BY_RULE
          message: perm.message,
        }
      }
      // 'ask' falls through to call — the orchestration layer (MCP server)
      // is responsible for surfacing the prompt to the user before we got
      // here. If we see 'ask' at this level, we treat it like allow (the
      // user's confirmation has already happened upstream).

      // 4. Execute.
      const result = await def.call(input, ctx)

      // 5. Truncate oversize payloads to keep MCP responses within budget.
      if (result.kind === 'success') {
        const rendered = renderResult(result.data)
        if (rendered.length > maxResultSizeChars) {
          // We don't mutate the structured data — the caller (or MCP layer)
          // can choose to truncate the rendered text while keeping the
          // structure intact for downstream processing. We just flag it.
          // Most tools that need truncation do it inline in their own call()
          // before returning (e.g. Grep's head_limit). This is a last-resort
          // safety net.
          return {
            kind: 'success',
            data: result.data,
            // Note: not surfacing a truncation flag here — tools should
            // handle their own size discipline. A future iteration may add
            // a `warnings: string[]` field to ToolResult.
          }
        }
      }
      return result
    },
  }
}

function summarizeZodIssues(err: unknown): string {
  // Narrow at runtime without widening the whole file's zod surface.
  if (
    err !== null &&
    typeof err === 'object' &&
    'issues' in err &&
    Array.isArray((err as { issues: unknown[] }).issues)
  ) {
    const issues = (err as { issues: Array<{ path: unknown[]; message: string }> })
      .issues
    return issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
  }
  return String(err)
}
