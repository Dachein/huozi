/**
 * huozi_template — huozi extension.
 *
 * Returns one of the 5 standard layout ("版") HTML scaffolds, baked into
 * the Worker bundle. Pure read-only; no storage, no D1, no DO state.
 *
 * The point of this tool is to keep the publishing pipeline coherent:
 * the agent doesn't have to invent HTML structure, doesn't fetch any
 * external CSS, and produces self-contained pages that survive the
 * publish-time sanitizer (which strips <script>, @import, etc.).
 */

import { ERR } from '../../errors.js'
import { buildTool } from '../../Tool.js'
import type { Tool, ToolResult } from '../../types.js'
import {
  TEMPLATE_TOOL_NAME,
  TEMPLATE_TOOL_USER_FACING_NAME,
  templatePrompt,
} from './prompt.js'
import {
  templateInputSchema,
  templateOutputSchema,
  type TemplateInput,
  type TemplateOutput,
} from './schema.js'
import { TEMPLATES } from './templates.js'

export function createTemplateTool(): Tool<TemplateInput, TemplateOutput> {
  return buildTool<TemplateInput, TemplateOutput>({
    name: TEMPLATE_TOOL_NAME,
    userFacingName: TEMPLATE_TOOL_USER_FACING_NAME,
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: templateInputSchema,
    outputSchema: templateOutputSchema,

    async description() {
      return 'Fetch one of the 5 huozi standard layout (版) templates: deck (16:9), story (9:16), paper (A4), mobile, page.'
    },
    async prompt() {
      return templatePrompt()
    },

    renderResult(data) {
      return `Loaded ${data.format} template (${data.shape}, ${data.body.length} chars)`
    },

    async call(input): Promise<ToolResult<TemplateOutput>> {
      const meta = TEMPLATES[input.format]
      if (!meta) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: `Unknown template format: ${String(input.format)}`,
        }
      }
      return {
        kind: 'success',
        data: {
          ok: true,
          format: meta.format,
          shape: meta.shape,
          content_type: 'text/html',
          body: meta.body,
        },
      }
    },
  })
}
