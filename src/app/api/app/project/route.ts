/**
 * POST /api/app/project  { action, folder_path, ... }
 *
 * Action endpoint behind the Folder Settings page. Routes Project
 * lifecycle (upgrade / archive / unarchive) through the Bearer-auth
 * `/me/project` endpoint on the Worker — these are intentionally not
 * MCP tools, so an agent can't trigger Project boundary changes on its
 * own. The Settings page is the only caller.
 */

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { HUOZI_CLOUD_KEY_COOKIE } from '@/lib/drive/mcp-client'
import {
  projectArchive,
  projectUnarchive,
  projectUpgrade,
} from '@/lib/drive/project-actions'

type Action = 'upgrade' | 'archive' | 'unarchive'

interface ProjectBody {
  action?: unknown
  folder_path?: unknown
  readme_content?: unknown
}

const ALLOWED_ACTIONS: ReadonlySet<Action> = new Set([
  'upgrade',
  'archive',
  'unarchive',
])

function isValidAction(v: unknown): v is Action {
  return typeof v === 'string' && ALLOWED_ACTIONS.has(v as Action)
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
  }
}
