/**
 * huozi_capabilities — read-only catalog of the platform's authoring
 * capabilities (data sources + renderers + runtime).
 *
 * Companion to huozi_validate_rules: that one is the corrective gate
 * ("what will my write be checked against"); this one is the generative
 * palette ("what can I build with, and how"). Call it BEFORE authoring an
 * HTML doc to learn which bundles / data sources exist and their
 * 原理/规则/边界/Example.
 *
 * Input is optional:
 *   - no args         → brief catalog (id, kind, summary, declare).
 *   - { id }          → the full guide for one capability (principle,
 *                       rules, limits, examples, validateRefs).
 *   - { kind }        → brief catalog filtered to data | render | runtime.
 *
 * Read-only, concurrency-safe, no storage access.
 */

import { z } from 'zod'
import {
  getCapability,
  listCapabilities,
  type Capability,
} from '../capabilities/capabilities.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'

export const CAPABILITIES_TOOL_NAME = 'huozi_capabilities'

const KINDS = ['data', 'render', 'runtime'] as const

export const capabilitiesInputSchema = z
  .object({
    id: z
      .string()
      .optional()
      .describe(
        'Return the FULL guide for this capability id (e.g. "echarts", "api-data/market", "data/jsonl"). Omit for the brief catalog.',
      ),
    kind: z
      .enum(KINDS)
      .optional()
      .describe('Filter the brief catalog to this kind. Ignored when `id` is set.'),
  })
  .strict()
export type CapabilitiesInput = z.infer<typeof capabilitiesInputSchema>

const exampleSchema = z.object({ title: z.string(), code: z.string() })
const capabilitySchema = z.object({
  id: z.string(),
  kind: z.enum(KINDS),
  summary: z.string(),
  declare: z.string(),
  // Detail fields — present only when a single `id` is requested.
  principle: z.string().optional(),
  rules: z.array(z.string()).optional(),
  limits: z.array(z.string()).optional(),
  examples: z.array(exampleSchema).optional(),
  validateRefs: z.array(z.string()).optional(),
})

export const capabilitiesOutputSchema = z.object({
  summary: z.object({
    total: z.number().int().nonnegative(),
    detail: z.boolean(),
  }),
  capabilities: z.array(capabilitySchema),
})
export type CapabilitiesOutput = z.infer<typeof capabilitiesOutputSchema>

function brief(c: Capability) {
  return { id: c.id, kind: c.kind, summary: c.summary, declare: c.declare }
}

function capabilitiesPrompt(): string {
  return `List the platform's authoring capabilities — the data sources and
renderers you can use inside a huozi HTML document.

Two families of "data" + the renderers that draw it:
  - data/jsonl       read your own workspace files (jsonl/csv/json)
  - api-data/market  live hosted data (Yahoo market) — first source of the
                     external "api-data" framework (rate/fx/user-defined later)
  - echarts / mermaid / svg   how to render

Each capability carries: kind, summary, declare (how to turn it on),
principle (实现原理), rules (规则), limits (边界), examples, validateRefs.

Usage:
  1. Call with no args at session start (or before authoring a new .html)
     to see the brief catalog.
  2. Call with { id } to get the full guide + copy-paste examples for the
     one you'll use.
  3. Author the doc; then huozi_validate to check it.

Read-only, no side effects. The catalog grows over time — re-list to
discover new capabilities.`
}

export function createCapabilitiesTool(): Tool<
  CapabilitiesInput,
  CapabilitiesOutput
> {
  return buildTool<CapabilitiesInput, CapabilitiesOutput>({
    name: CAPABILITIES_TOOL_NAME,
    userFacingName: 'Capabilities',
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: capabilitiesInputSchema,
    outputSchema: capabilitiesOutputSchema,
    async description() {
      return 'List huozi authoring capabilities (data sources + renderers: echarts/mermaid/svg/data-jsonl/api-data). Call BEFORE writing HTML; pass { id } for the full guide + examples.'
    },
    async prompt() {
      return capabilitiesPrompt()
    },
    renderResult(data) {
      return data.summary.detail
        ? `capability detail (${data.capabilities.length})`
        : `${data.summary.total} capabilities`
    },
    async call(input): Promise<ToolResult<CapabilitiesOutput>> {
      if (input.id) {
        const c = getCapability(input.id)
        return {
          kind: 'success',
          data: {
            summary: { total: c ? 1 : 0, detail: true },
            capabilities: c ? [c] : [],
          },
        }
      }
      const list = listCapabilities().filter(
        (c) => !input.kind || c.kind === input.kind,
      )
      return {
        kind: 'success',
        data: {
          summary: { total: list.length, detail: false },
          capabilities: list.map(brief),
        },
      }
    },
  })
}
