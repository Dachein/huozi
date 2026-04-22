/**
 * POST /api/connect
 *
 * Body (form or JSON): { api_key: string }
 *
 * Validates the key by calling tools/list on cloud.huozi.app. If valid, set an
 * HttpOnly cookie so subsequent page renders can use it server-side. The key
 * never travels to the browser.
 */

import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { HUOZI_CLOUD_KEY_COOKIE, listTools } from '@/lib/drive/mcp-client'

async function extractKey(req: NextRequest): Promise<string | null> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as {
      api_key?: string
    } | null
    return body?.api_key?.trim() || null
  }
  const form = await req.formData().catch(() => null)
  if (!form) return null
  const v = form.get('api_key')
  return typeof v === 'string' ? v.trim() : null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = await extractKey(req)
  if (!key || !key.startsWith('hz_')) {
    return NextResponse.redirect(
      new URL('/connect?error=missing_key', req.url),
      { status: 303 },
    )
  }

  const probe = await listTools(key)
  if (!probe.ok) {
    return NextResponse.redirect(
      new URL(
        `/connect?error=${encodeURIComponent(probe.message.slice(0, 120))}`,
        req.url,
      ),
      { status: 303 },
    )
  }

  const cookieStore = await cookies()
  cookieStore.set({
    name: HUOZI_CLOUD_KEY_COOKIE,
    value: key,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    // 30 days — the key itself can be revoked server-side via D1
    maxAge: 60 * 60 * 24 * 30,
  })

  return NextResponse.redirect(new URL('/workspace', req.url), {
    status: 303,
  })
}
