/**
 * POST /api/app/project  { action, folder_path, ... }
 *
 * Action endpoint behind the Folder Settings page. Mirrors the
 * `/api/app/drive/edit` carve-out for project-lifecycle MCP tools
 * (upgrade / archive / unarchive). The Folder Settings page does
 * almost everything else server-side; this is the one mutation
 * surface the page needs.
 *
 * Actions are dispatched against the v3.3 tools introduced in
 * P0/P1/P2.1:
 *
 *   - upgrade   → huozi_project_upgrade
 *   - archive   → huozi_project_archive
 *   - unarchive → huozi_project_unarchive
 *   - task_create → huozi_task_create  (Promote flow / future Settings UX)
 *
 * Worker-side capability + folder-ACL checks gate the actual write —
 * the Next side just routes the request under the user's api_key.
 */

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { HUOZI_CLOUD_KEY_COOKIE } from '@/lib/drive/mcp-client'
import {
  projectArchive,
  projectTaskCreate,
  projectUnarchive,
  projectUpgrade,
} from '@/lib/drive/project-actions'

type Action = 'upgrade' | 'archive' | 'unarchive' | 'task_create'

interface ProjectBody {
  action?: unknown
  folder_path?: unknown
  readme_content?: unknown
  // task_create extras
  title?: unknown
  deliverable?: unknown
  body?: unknown
  source_refs?: unknown
}

const ALLOWED_ACTIONS: ReadonlySet<Action> = new Set([
  'upgrade',
  'archive',
  'unarchive',
  'task_create',
])

function isValidAction(v: unknown): v is Action {
  return typeof v === 'string' && ALLOWED_ACTIONS.has(v as Action)
}

function statusFor(code: number): number {
  switch (code) {
    case 3: // CANNOT_CREATE_FILE_EXISTS — upgrade on an already-Project folder
      return 409
    case 4: // FILE_NOT_FOUND — archive an empty folder, etc.
      return 404
    case 101: // SCOPE_VIOLATION
      return 403
    case 110: // INVALID_URI
      return 400
    case 111: // CONFLICT
      return 409
    case 401:
      return 401
    case 403:
      return 403
    default:
      return 502
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies()
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value
  if (!key) {
    return NextResponse.json(
      { error: 'unauthenticated' },
      { status: 401 },
    )
  }

  let body: ProjectBody
  try {
    body = (await req.json()) as ProjectBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!isValidAction(body.action)) {
    return NextResponse.json(
      { error: 'invalid_action', allowed: Array.from(ALLOWED_ACTIONS) },
      { status: 400 },
    )
  }
  if (typeof body.folder_path !== 'string' || body.folder_path.length === 0) {
    return NextResponse.json(
      { error: 'invalid_folder_path' },
      { status: 400 },
    )
  }

  const folderPath = body.folder_path

  switch (body.action) {
    case 'upgrade': {
      const readme =
        typeof body.readme_content === 'string' && body.readme_content.length > 0
          ? body.readme_content
          : undefined
      const r = await projectUpgrade(key, folderPath, readme)
      if (!r.ok) {
        return NextResponse.json(
          { error: 'upgrade_failed', message: r.message },
          { status: r.status },
        )
      }
      return NextResponse.json({ ok: true, ...r.data })
    }
    case 'archive': {
      const r = await projectArchive(key, folderPath)
      if (!r.ok) {
        return NextResponse.json(
          { error: 'archive_failed', message: r.message },
          { status: r.status },
        )
      }
      return NextResponse.json({ ok: true, ...r.data })
    }
    case 'unarchive': {
      const r = await projectUnarchive(key, folderPath)
      if (!r.ok) {
        return NextResponse.json(
          { error: 'unarchive_failed', message: r.message },
          { status: r.status },
        )
      }
      return NextResponse.json({ ok: true, ...r.data })
    }
    case 'task_create': {
      if (typeof body.title !== 'string' || body.title.length === 0) {
        return NextResponse.json(
          { error: 'invalid_title' },
          { status: 400 },
        )
      }
      const r = await projectTaskCreate(key, folderPath, body.title, {
        ...(typeof body.deliverable === 'string'
          ? { deliverable: body.deliverable }
          : {}),
        ...(typeof body.body === 'string' ? { body: body.body } : {}),
        ...(Array.isArray(body.source_refs) &&
        body.source_refs.every((s) => typeof s === 'string')
          ? { source_refs: body.source_refs as string[] }
          : {}),
      })
      if (!r.ok) {
        return NextResponse.json(
          { error: 'task_create_failed', code: r.errorCode, message: r.message },
          { status: statusFor(r.errorCode) },
        )
      }
      return NextResponse.json({ ok: true, ...r.data })
    }
  }
}
