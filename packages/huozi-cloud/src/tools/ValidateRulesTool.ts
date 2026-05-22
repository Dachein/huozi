/**
 * huozi_validate_rules — read-only catalog of every lint rule.
 *
 * Why this exists separately from huozi_validate: agents discover the
 * platform's expectations BEFORE writing, not just after a failed write.
 * `huozi_validate` tells you what's wrong with a specific file; this
 * tool tells you what could ever be wrong, with the why/remedy/docRef
 * for each. Listing rules is cheap, file-independent, and ideal as a
 * one-shot warm-up at session start.
 *
 * Input is optional. With no args, returns the entire catalog. With
 * `level` filter, returns only rules at that severity (useful when the
 * agent only cares about hard blockers). With `format` filter, returns
 * only rules that apply to the given format (rules with no `appliesTo`
 * always pass).
 *
 * Read-only, concurrency-safe, no storage access.
 */

import { z } from 'zod'
import {
  type ValidationRule,
  listValidationRules,
} from '../validate/validate-rules.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'

export const VALIDATE_RULES_TOOL_NAME = 'huozi_validate_rules'

const HUOZI_FORMATS = ['deck', 'story', 'paper', 'dashboard', 'blog'] as const
const LEVELS = ['error', 'warning', 'hint'] as const

export const validateRulesInputSchema = z
  .object({
    level: z
      .enum(LEVELS)
      .optional()
      .describe(
        'Only return rules at this severity. Omit to get all levels.',
      ),
    format: z
      .enum(HUOZI_FORMATS)
      .optional()
      .describe(
        'Only return rules that apply to this huozi format. Rules with no `appliesTo` always pass this filter.',
      ),
  })
  .strict()
export type ValidateRulesInput = z.infer<typeof validateRulesInputSchema>

const ruleSchema = z.object({
  code: z.string(),
  level: z.enum(LEVELS),
  title: z.string(),
  why: z.string(),
  remedy: z.string(),
  docRef: z.string().optional(),
  appliesTo: z.array(z.enum(HUOZI_FORMATS)).optional(),
})

export const validateRulesOutputSchema = z.object({
  summary: z.object({
    error: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    hint: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  rules: z.array(ruleSchema),
})
export type ValidateRulesOutput = z.infer<typeof validateRulesOutputSchema>

function rulesPrompt(): string {
  return `List the full catalog of huozi HTML lint rules.

Each rule has:
  - code      stable identifier (used by huozi_validate's issues[])
  - level     error | warning | hint
  - title     short label
  - why       what the rule guards against
  - remedy    concrete next step
  - docRef    optional anchor into the live spec doc
  - appliesTo optional format filter (rule is inert outside this set)

Severity contract:
  - error    write WILL produce broken render. huozi_write refuses these.
  - warning  write succeeds; result probably isn't what the author intended.
  - hint     best-practice nudge. Pure FYI; agents can ignore.

Optional filters:
  - level    only return rules at this severity
  - format   only return rules that apply to this huozi format

Recommended usage:
  1. Call once at session start (or before authoring a new .html file) to
     learn the ruleset.
  2. Author the file with the rules in mind.
  3. Call huozi_validate after huozi_write to detect anything missed.
  4. Use each issue's \`code\` to look up the rule's full \`why\` and
     \`remedy\` from this catalog.

This tool is read-only and has no side effects.`
}

function passesFilters(
  rule: ValidationRule,
  input: ValidateRulesInput,
): boolean {
  if (input.level && rule.level !== input.level) return false
  if (input.format && rule.appliesTo && !rule.appliesTo.includes(input.format))
    return false
  return true
}

export function createValidateRulesTool(): Tool<
  ValidateRulesInput,
  ValidateRulesOutput
> {
  return buildTool<ValidateRulesInput, ValidateRulesOutput>({
    name: VALIDATE_RULES_TOOL_NAME,
    userFacingName: 'Validate Rules',
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: validateRulesInputSchema,
    outputSchema: validateRulesOutputSchema,
    async description() {
      return 'List the full catalog of huozi HTML lint rules. Use BEFORE writing to learn what the validator will check.'
    },
    async prompt() {
      return rulesPrompt()
    },
    renderResult(data) {
      const s = data.summary
      return `${s.total} rules · ${s.error}E · ${s.warning}W · ${s.hint}H`
    },
    async call(input): Promise<ToolResult<ValidateRulesOutput>> {
      const all = listValidationRules()
      const filtered = all.filter((r) => passesFilters(r, input))
      const summary = {
        error: filtered.filter((r) => r.level === 'error').length,
        warning: filtered.filter((r) => r.level === 'warning').length,
        hint: filtered.filter((r) => r.level === 'hint').length,
        total: filtered.length,
      }
      return {
        kind: 'success',
        data: { summary, rules: filtered },
      }
    },
  })
}
