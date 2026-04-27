/**
 * huozi_whoami — huozi extension, diagnostic.
 *
 * Returns the principal / workspace / api_key metadata for the authenticated
 * caller. Useful when an Agent suddenly hits 403 on every other tool — a
 * whoami round-trip reveals exactly which workspace the key is bound to,
 * whether the principal still has an active membership row, and which key
 * minted the call. Bypasses the workspace_members JOIN (an orphan key
 * needs to be able to diagnose itself).
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'

export const WHOAMI_TOOL_NAME = 'huozi_whoami'

export const whoamiInputSchema = z.object({}).strict()
export type WhoamiInput = z.infer<typeof whoamiInputSchema>

export const whoamiOutputSchema = z.object({
  user: z.object({
    user_id: z.string(),
    email: z.string().nullable(),
    display_name: z.string().nullable(),
  }),
  workspace: z.object({
    workspace_id: z.string(),
    slug: z.string().nullable(),
    name: z.string().nullable(),
    role: z.enum(['owner', 'member']).nullable(),
    member_since: z.string().nullable(),
  }),
  api_key: z.object({
    key_id: z.string(),
    name: z.string().nullable(),
    principal_type: z.enum(['user', 'agent', 'system']),
    scope: z.string().nullable(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
  }),
})
export type WhoamiOutput = z.infer<typeof whoamiOutputSchema>

export interface WhoamiToolDeps {
  whoami: () => Promise<WhoamiOutput | { error: string }>
}

function whoamiPrompt(): string {
  return `Return identity & binding info for the current MCP session.

Use this to diagnose 403 errors. It tells you:
- which user this api_key is mapped to (and whether that user still exists),
- which workspace it's bound to (slug + UUID),
- your role in that workspace ("owner" / "member" / null = no membership),
- key metadata: name, scope, created_at, last_used_at.

Read-only, no input arguments. Bypasses the workspace-members ACL check so an
orphan key can still see its own state — that's the whole point.`
}

export function createWhoamiTool(
  deps: WhoamiToolDeps,
): Tool<WhoamiInput, WhoamiOutput> {
  return buildTool<WhoamiInput, WhoamiOutput>({
    name: WHOAMI_TOOL_NAME,
    userFacingName: 'Whoami',
    isConcurrencySafe: true,
    isReadOnly: true,
    inputSchema: whoamiInputSchema,
    outputSchema: whoamiOutputSchema,
    async description() {
      return 'Return identity & binding info for the current MCP session.'
    },
    async prompt() {
      return whoamiPrompt()
    },
    renderResult(data) {
      const role = data.workspace.role ?? '(no membership)'
      const who = data.user.email ?? '(orphan user)'
      const ws = data.workspace.slug ?? '(no workspace)'
      const last = data.api_key.last_used_at ?? 'never'
      return `${who} → ${ws} [${role}]\nkey: ${data.api_key.name ?? data.api_key.key_id} (last used ${last})`
    },
    async call(): Promise<ToolResult<WhoamiOutput>> {
      const res = await deps.whoami()
      if ('error' in res) {
        return { kind: 'error', errorCode: ERR.INTERNAL, message: res.error }
      }
      return { kind: 'success', data: res }
    },
  })
}
