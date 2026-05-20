/**
 * huozi_project_archive / huozi_project_unarchive — move a Project
 * into / out of the workspace's `.archive/` hold.
 *
 * Per spec §3 v3.3, Archive is the only mutable action exposed in the
 * Settings page (no toggles, no settings.json). It's intentionally a
 * pure folder rename: the Project keeps all of its README / tasks /
 * memory / sub-files, just under a different prefix. Unarchive
 * reverses it.
 *
 * Reserved name rules:
 *   - Cannot archive `.archive` itself (would self-nest).
 *   - Cannot archive system folders (`__assets__`, `.huozi`).
 *   - Archive target slot under `.archive/<name>` must be empty.
 *   - Unarchive source must live directly under `.archive/`.
 */

import { z } from 'zod'
import { ERR } from '../errors.js'
import type { StorageBackend } from '../storage/types.js'
import { buildTool } from '../Tool.js'
import type { Tool, ToolResult } from '../types.js'
import { canonicalizePath } from '../utils/path.js'

export const PROJECT_ARCHIVE_TOOL_NAME = 'huozi_project_archive'
export const PROJECT_UNARCHIVE_TOOL_NAME = 'huozi_project_unarchive'

const ARCHIVE_PREFIX = '.archive/'
const RESERVED_NAMES = new Set(['__assets__', '.huozi', '.archive'])

// ── Shared helpers ────────────────────────────────────────────────────

function looksLikeTopLevelName(name: string): boolean {
  if (name.length === 0) return false
  if (name.includes('/')) return false
  if (name === '.' || name === '..') return false
  return true
}

async function folderHasAnyFile(
  storage: StorageBackend,
  workspaceId: string,
  prefix: string,
): Promise<boolean> {
  const entries = await storage.listFiles(workspaceId, { prefix, limit: 1 })
  return entries.length > 0
}

export interface ProjectArchiveToolDeps {
  storage: StorageBackend
}

// ── Archive ───────────────────────────────────────────────────────────

export const projectArchiveInputSchema = z.object({
  folder_path: z.string().min(1).describe(
    'Top-level folder name to archive (e.g. "huozi-dev"). Moves the whole folder under `.archive/<folder>/`.',
  ),
})

export type ProjectArchiveInput = z.infer<typeof projectArchiveInputSchema>

export const projectArchiveOutputSchema = z.object({
  from: z.string(),
  to: z.string(),
  commit_sha: z.string(),
  moved_paths: z.number().int().nonnegative(),
})

export type ProjectArchiveOutput = z.infer<typeof projectArchiveOutputSchema>

export function projectArchivePrompt(): string {
  return `Archive a top-level Project folder by moving it under \`.archive/\`.

Usage:
- \`folder_path\` is the bare top-level name (no slashes). Refuses reserved system folders and refuses if the target slot under .archive/ is already taken.
- Archiving is a folder rename: README / tasks.jsonl / memory.jsonl all move with it. To restore, call huozi_project_unarchive.

Example:
{ "folder_path": "marketing" }`
}

export function createProjectArchiveTool(
  deps: ProjectArchiveToolDeps,
): Tool<ProjectArchiveInput, ProjectArchiveOutput> {
  return buildTool<ProjectArchiveInput, ProjectArchiveOutput>({
    name: PROJECT_ARCHIVE_TOOL_NAME,
    userFacingName: 'ProjectArchive',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: projectArchiveInputSchema,
    outputSchema: projectArchiveOutputSchema,
    async description() {
      return 'Move a top-level Project folder under .archive/. Reversible.'
    },
    async prompt() {
      return projectArchivePrompt()
    },
    renderResult(data) {
      return `✓ Archived "${data.from}" → "${data.to}" (${data.moved_paths} paths, commit ${data.commit_sha.slice(0, 8)}).`
    },

    async validateInput(input) {
      const canon = canonicalizePath(input.folder_path)
      if (!canon.ok) {
        return { result: false, errorCode: ERR.INVALID_URI, message: canon.message }
      }
      if (!looksLikeTopLevelName(canon.path)) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message: 'folder_path must be a single top-level folder name.',
        }
      }
      if (RESERVED_NAMES.has(canon.path)) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message: `"${canon.path}" is a reserved system folder and cannot be archived.`,
        }
      }
      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<ProjectArchiveOutput>> {
      const canon = canonicalizePath(input.folder_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const folder = canon.path

      const fromPrefix = `${folder}/`
      const toPrefix = `${ARCHIVE_PREFIX}${folder}/`

      const hasAny = await folderHasAnyFile(deps.storage, ctx.workspaceId, fromPrefix)
      if (!hasAny) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message: `No files found under "${fromPrefix}" — nothing to archive.`,
        }
      }
      const targetOccupied = await folderHasAnyFile(
        deps.storage,
        ctx.workspaceId,
        toPrefix,
      )
      if (targetOccupied) {
        return {
          kind: 'error',
          errorCode: ERR.CONFLICT,
          message: `Archive slot "${toPrefix}" is already occupied. Restore or rename the existing archive entry first.`,
        }
      }

      const result = await deps.storage.renamePrefix({
        workspaceId: ctx.workspaceId,
        fromPrefix,
        toPrefix,
        author: { id: ctx.principalId, type: ctx.principalType },
        message: `project_archive: ${folder}`,
      })
      if (!result.ok) {
        return {
          kind: 'error',
          errorCode: ERR.CONFLICT,
          message: `Archive failed: ${result.error}${result.message ? ` (${result.message})` : ''}`,
        }
      }

      return {
        kind: 'success',
        data: {
          from: fromPrefix,
          to: toPrefix,
          commit_sha: result.commit_sha ?? '',
          moved_paths: result.moved_paths.length,
        },
      }
    },
  })
}

// ── Unarchive ─────────────────────────────────────────────────────────

export const projectUnarchiveInputSchema = z.object({
  folder_path: z.string().min(1).describe(
    'Bare folder name (no slashes), referring to `.archive/<folder>/` to restore back to top level.',
  ),
})

export type ProjectUnarchiveInput = z.infer<typeof projectUnarchiveInputSchema>

export const projectUnarchiveOutputSchema = z.object({
  from: z.string(),
  to: z.string(),
  commit_sha: z.string(),
  moved_paths: z.number().int().nonnegative(),
})

export type ProjectUnarchiveOutput = z.infer<typeof projectUnarchiveOutputSchema>

export function projectUnarchivePrompt(): string {
  return `Restore an archived Project from .archive/ back to the workspace top level.

Usage:
- \`folder_path\` is the bare name — pass "marketing" to restore \`.archive/marketing/\` to \`marketing/\`.
- Refuses if the target top-level slot already has files.

Example:
{ "folder_path": "marketing" }`
}

export function createProjectUnarchiveTool(
  deps: ProjectArchiveToolDeps,
): Tool<ProjectUnarchiveInput, ProjectUnarchiveOutput> {
  return buildTool<ProjectUnarchiveInput, ProjectUnarchiveOutput>({
    name: PROJECT_UNARCHIVE_TOOL_NAME,
    userFacingName: 'ProjectUnarchive',
    maxResultSizeChars: 10_000,
    isConcurrencySafe: false,
    isReadOnly: false,
    inputSchema: projectUnarchiveInputSchema,
    outputSchema: projectUnarchiveOutputSchema,
    async description() {
      return 'Restore an archived Project back to the workspace top level.'
    },
    async prompt() {
      return projectUnarchivePrompt()
    },
    renderResult(data) {
      return `✓ Restored "${data.from}" → "${data.to}" (${data.moved_paths} paths).`
    },

    async validateInput(input) {
      const canon = canonicalizePath(input.folder_path)
      if (!canon.ok) {
        return { result: false, errorCode: ERR.INVALID_URI, message: canon.message }
      }
      if (!looksLikeTopLevelName(canon.path)) {
        return {
          result: false,
          errorCode: ERR.INVALID_URI,
          message:
            'folder_path must be the bare archived folder name (no slashes). For .archive/foo/ pass "foo".',
        }
      }
      return { result: true }
    },

    async call(input, ctx): Promise<ToolResult<ProjectUnarchiveOutput>> {
      const canon = canonicalizePath(input.folder_path)
      if (!canon.ok) {
        return { kind: 'error', errorCode: ERR.INVALID_URI, message: canon.message }
      }
      const folder = canon.path

      const fromPrefix = `${ARCHIVE_PREFIX}${folder}/`
      const toPrefix = `${folder}/`

      const hasAny = await folderHasAnyFile(deps.storage, ctx.workspaceId, fromPrefix)
      if (!hasAny) {
        return {
          kind: 'error',
          errorCode: ERR.FILE_NOT_FOUND,
          message: `No archived folder at "${fromPrefix}".`,
        }
      }
      const targetOccupied = await folderHasAnyFile(
        deps.storage,
        ctx.workspaceId,
        toPrefix,
      )
      if (targetOccupied) {
        return {
          kind: 'error',
          errorCode: ERR.CONFLICT,
          message: `Top-level slot "${toPrefix}" is already occupied — restore would overwrite live files.`,
        }
      }

      const result = await deps.storage.renamePrefix({
        workspaceId: ctx.workspaceId,
        fromPrefix,
        toPrefix,
        author: { id: ctx.principalId, type: ctx.principalType },
        message: `project_unarchive: ${folder}`,
      })
      if (!result.ok) {
        return {
          kind: 'error',
          errorCode: ERR.CONFLICT,
          message: `Unarchive failed: ${result.error}${result.message ? ` (${result.message})` : ''}`,
        }
      }

      return {
        kind: 'success',
        data: {
          from: fromPrefix,
          to: toPrefix,
          commit_sha: result.commit_sha ?? '',
          moved_paths: result.moved_paths.length,
        },
      }
    },
  })
}
