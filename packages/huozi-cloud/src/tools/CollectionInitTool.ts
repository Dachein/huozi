/**
 * huozi_collection_init — create a new Collection (.jsonl) seeded with
 * its rendering schema as the first event.
 *
 * Schema goes inline as a `{"op":"schema","at":"...","by":"...","schema":{...}}`
 * line. The viewer (and any downstream tooling) reads the latest schema
 * event to decide field types, layout slots, filters, etc. — see
 * `app/docs/four-types.md` §3.7 and `src/lib/jsonl/parse.ts`.
 *
 * Why a dedicated tool (vs. plain huozi_write):
 *   - Bakes the schema-first convention into the MCP tool surface, so
 *     Agents discover it at tool listing instead of documentation.
 *   - Validates the schema shape up front (catches "I forgot to declare
 *     the avatar field" at create time, not on first render).
 *   - Refuses to clobber an existing file, since "init" implies new.
 *
 * Schema *evolution* still goes through huozi_write / huozi_edit by
 * appending a new `op:"schema"` line — fold semantics give last-write-
 * wins per field.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const COLLECTION_INIT_TOOL_NAME = 'huozi_collection_init'

/**
 * Schema payload — open shape on purpose. We accept any plain JSON
 * object so the format can grow new view types / field types without
 * us shipping new MCP tool versions. The viewer's schema reader is
 * the source of truth on which keys actually render.
 */
const schemaPayload = z.record(z.string(), z.unknown())

export const collectionInitInputSchema = z.object({
  file_path: z
    .string()
    .describe(
      'Destination path. Must end in `.jsonl`. Parent folders are created implicitly.',
    ),
  schema: schemaPayload.describe(
    'Render config for this Collection (Notion-style). Top-level keys: `title`, `description`, `entity` ({title_field/subtitle_field/avatar_field}), `fields` (per-field {type/display/hide/empty_placeholder/show_when/multi/options}), `groups` (XOR with display slots — pick one), `list_view` ({filters/search/row_chips}), `detail_view` ({show_id/groups_order}). Field types: text/paragraph/markdown/link/email/image/datetime/duration/status/options/progress/rating/relation/object/url_map — every type natively handles single OR array values. See four-types.md §3.6.',
  ),
  version: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional schema version. Informational; ordering still follows `at`.'),
})

export type CollectionInitInput = z.infer<typeof collectionInitInputSchema>

export const collectionInitOutputSchema = z.object({
  filePath: z.string(),
  commit_sha: z.string(),
  new_blob_sha: z.string(),
  schema_at: z.string(),
})

export type CollectionInitOutput = z.infer<typeof collectionInitOutputSchema>

export interface CollectionInitToolDeps {
  storage: StorageBackend
}

export function collectionInitPrompt(): string {
  return `Create a new Collection (.jsonl) file with its render schema seeded as the first event.

Usage:
- \`file_path\` must end in \`.jsonl\`. Refuses to clobber an existing file — pick a fresh path or use huozi_write/huozi_edit to evolve an existing Collection.
- \`schema\` is the render config (Notion-style). Recommended top-level keys:
  - \`title\`, \`description\`: human-readable labels
  - \`entity\`: { \`title_field\`, \`subtitle_field\`, \`avatar_field\` } — which fields drive the card chrome
  - \`fields\`: { <key>: { \`type\`, \`label\`, \`display\`, \`hide\`, \`empty_placeholder\`, \`show_when\`, \`multi\`, \`filterable\`, \`searchable\`, \`options\` } }
    - \`type\` (auto-array-aware — single OR array value, same widget):
        text · paragraph · markdown · link · email · image
        datetime · duration · status · options · progress · rating
        relation · object · url_map
      Unknown types fall back to text. When type is omitted, the
      renderer auto-detects from the value (URL → link, ISO date →
      datetime, all-URL object → url_map, plain object → object).
    - \`display\` (slot mode): headline · subheadline · avatar · body · aside · meta
    - \`hide: true\` — never render this field (internal ids, scores)
    - \`empty_placeholder: "..."\` — replaces the default "—" for empty values
    - \`show_when: { field, equals }\` — conditional render based on another field
    - \`multi: true | false\` — force array / single layout (auto otherwise)
    - \`options: [{ value, label?, color? }]\` — for status / options types (colors carry into chips)
  - \`groups: [{ title, fields, collapsed? }]\` — alternative to slot mode. Renders detail as Notion-style sections. XOR with \`display\` slots — when groups is set, display is ignored. Fields not assigned to any group fall into a tail "·" section.
  - \`detail_view: { show_id, groups_order }\` — \`show_id: false\` hides the entity id line; \`groups_order\` overrides group display order.
  - \`list_view: { filters, search, sort, row, row_chips }\` — \`filters\` adds dropdown filters; \`search\` lists field keys to substring-match; \`sort\` is the default order: string shorthand (\`"name"\` asc / \`"-name"\` desc) or \`{field, direction}\`. List-row layout has two flavors: prefer \`row: { title, status, timestamp, subtitle, tag, preview }\` (6 named slots, fixed shape) — each maps to a field key, value renders via the field's type widget. Layout: row 1 = title + inline status chip + right-aligned timestamp; row 2 = subtitle OR tag pills (XOR — tag wins when it has a value); row 3 = preview (2-line clamp). \`status\` is single-valued by spec (array → first item). Fallback \`row_chips: [...]\` (legacy, 1-2 chips appended after title+subtitle).
- After init, append entity events (with \`id\`) via huozi_write or huozi_edit. To evolve the schema later, append another \`{"op":"schema","schema":{...}}\` line — folds latest-wins per field.

Example:
{
  "file_path": "crm/customers.jsonl",
  "schema": {
    "title": "Customers",
    "entity": { "title_field": "name", "subtitle_field": "company" },
    "fields": {
      "name":    { "type": "text" },
      "company": { "type": "text" },
      "notes":   { "type": "markdown", "empty_placeholder": "(no notes)" },
      "stage":   { "type": "status", "options": [
        { "value": "new",  "label": "New",  "color": "#3b82f6" },
        { "value": "live", "label": "Live", "color": "#22c55e" }
      ]},
      "tags":    { "type": "options" },
      "started": { "type": "datetime" },
      "won_at":  { "type": "datetime", "show_when": { "field": "stage", "equals": "live" } },
      "internal_score": { "hide": true }
    },
    "groups": [
      { "title": "Identity", "fields": ["name", "company"] },
      { "title": "Status",   "fields": ["stage", "started", "won_at"] },
      { "title": "Notes",    "fields": ["notes", "tags"], "collapsed": true }
    ],
    "detail_view": { "show_id": false },
    "list_view": {
      "filters": ["stage"],
      "search":  ["name", "company"],
      "sort":    "-started",
      "row": {
        "title":     "name",
        "status":    "stage",
        "timestamp": "started",
        "subtitle":  "company",
        "tag":       "labels",
        "preview":   "notes"
      }
    }
  }
}`
}

export function createCollectionInitTool(
  deps: CollectionInitToolDeps,
): Tool<CollectionInitInput, CollectionInitOutput> {
  return buildTool<CollectionInitInput, CollectionInitOutput>({
    name: COLLECTION_INIT_TOOL_NAME,
    userFacingName: 'CollectionInit',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: collectionInitInputSchema,
    outputSchema: collectionInitOutputSchema,
    async description() {
      return 'Create a new Collection (.jsonl) seeded with its render schema as the first event.'
    },
    async prompt() {
      return collectionInitPrompt()
    },
    renderResult(data) {
      return `✓ Initialized Collection "${data.filePath}" with schema event at ${data.schema_at}.`
    },

    async validateInput(input, ctx) {
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      if (!canon.path.endsWith('.jsonl')) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message: 'huozi_collection_init: file_path must end in .jsonl',
        }
      }
      const existing = await deps.storage.readFile(ctx.workspaceId, canon.path)
      if (existing) {
        return {
          result: false,
          errorCode: ERR.MODIFIED_SINCE_READ,
          message:
            `File "${canon.path}" already exists. ` +
            'huozi_collection_init refuses to clobber. ' +
            'To evolve the schema of an existing Collection, append a new `{"op":"schema",...}` line via huozi_write/huozi_edit.',
        }
      }
      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<CollectionInitOutput>> {
      const canon = canonicalizePath(input.file_path)
      if (!canon.ok) {
        return {
          kind: 'error',
          errorCode: ERR.INVALID_URI,
          message: canon.message,
        }
      }
      const path = canon.path

      const at = new Date().toISOString()
      const by = `${ctx.principalType}:${ctx.principalId}`
      const schemaEvent: Record<string, unknown> = {
        op: 'schema',
        at,
        by,
        ...(input.version !== undefined ? { version: input.version } : {}),
        schema: input.schema,
      }
      const line = JSON.stringify(schemaEvent) + '\n'
      const bytes = new TextEncoder().encode(line)

      const writeResult = await deps.storage.writeFile({
        workspaceId: ctx.workspaceId,
        path,
        content: bytes,
        author: { id: ctx.principalId, type: ctx.principalType },
        parent_sha: null,
        message: `collection_init: ${path} via ${ctx.principalId}`,
      })

      // Refresh ReadFileState so a subsequent Edit on this file works
      // without a separate Read first.
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
          commit_sha: writeResult.commit_sha,
          new_blob_sha: writeResult.record.blob_sha,
          schema_at: at,
        },
      }
    },
  })
}
