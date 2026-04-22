/**
 * POST /api/app/disconnect — forget the stored API key.
 */

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { HUOZI_CLOUD_KEY_COOKIE } from '@/lib/drive/mcp-client'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies()
  cookieStore.delete(HUOZI_CLOUD_KEY_COOKIE)
  return NextResponse.redirect(new URL('/connect', req.url), {
    status: 303,
  })
}
