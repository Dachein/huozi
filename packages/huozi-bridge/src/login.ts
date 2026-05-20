/**
 * `huozi-bridge login` — RFC 8628-style device flow against huozi-cloud.
 *
 * Flow:
 *   1. POST /auth/device-code → { device_code, user_code, verification_url_complete, interval }
 *   2. Open the URL in the user's browser (best-effort) + print it to stdout.
 *   3. Poll POST /auth/token every `interval` seconds until authorized.
 *   4. Persist { api_key, workspace, … } to ~/.huozi-bridge/credentials.json.
 *
 * The token returned is a long-lived `hz_<slug>_<32hex>` api_key — the same
 * format the daemon expects as `HUOZI_API_KEY`. No refresh needed.
 */

import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import { credentialsPath, writeCredentials } from './credentials.js'

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_url: string
  verification_url_complete: string
  expires_in: number
  interval: number
}

interface TokenSuccess {
  api_key: string
  key_id: string | null
  workspace: { id: string | null; slug: string | null }
}

interface TokenError {
  error: string
  message?: string
}

const CLIENT_NAME = 'huozi-bridge'
const AGENT_KIND = 'claude-code'

export async function runLogin(opts: { cloudBaseUrl: string }): Promise<void> {
  const out = (s: string) => process.stdout.write(s + '\n')

  out('Requesting device code...')
  const dc = await requestDeviceCode(opts.cloudBaseUrl)

  out('')
  out(`Visit:      ${dc.verification_url_complete}`)
  out(`User code:  ${dc.user_code}`)
  out('')
  openBrowser(dc.verification_url_complete)

  out(`Waiting for authorization (polling every ${dc.interval}s, expires in ${Math.round(dc.expires_in / 60)}m)...`)
  const token = await pollForToken(opts.cloudBaseUrl, dc.device_code, dc.interval, dc.expires_in)

  await writeCredentials({
    api_key: token.api_key,
    key_id: token.key_id,
    workspace: token.workspace,
    saved_at: new Date().toISOString(),
  })

  out('')
  out(`Authorized. Workspace: ${token.workspace.slug ?? '(unknown)'}`)
  out(`Credentials saved to ${credentialsPath()}`)
}

async function requestDeviceCode(cloudBaseUrl: string): Promise<DeviceCodeResponse> {
  const res = await fetch(`${cloudBaseUrl}/auth/device-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: CLIENT_NAME, agent_kind: AGENT_KIND }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`device-code http ${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as DeviceCodeResponse
}

async function pollForToken(
  cloudBaseUrl: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
): Promise<TokenSuccess> {
  const deadline = Date.now() + expiresInSeconds * 1000
  let interval = Math.max(1, intervalSeconds) * 1000

  while (Date.now() < deadline) {
    await sleep(interval)
    const res = await fetch(`${cloudBaseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    })
    const body = (await res.json().catch(() => ({}))) as Partial<TokenSuccess> & Partial<TokenError>

    // Server returns HTTP 202 + { error: 'authorization_pending' } while
    // the user hasn't approved yet — 2xx alone isn't enough to call it done.
    if (body.api_key) return body as TokenSuccess

    const err = body.error ?? `http_${res.status}`
    if (err === 'authorization_pending') continue
    if (err === 'slow_down') {
      interval += 5_000
      continue
    }
    if (err === 'access_denied') {
      throw new Error('Authorization denied in browser.')
    }
    if (err === 'expired_token') {
      throw new Error('Device code expired. Run `huozi-bridge login` again.')
    }
    throw new Error(`token error: ${err}${body.message ? ` (${body.message})` : ''}`)
  }

  throw new Error('Device code expired before authorization. Run `huozi-bridge login` again.')
}

function openBrowser(url: string): void {
  // Best-effort: launch the platform browser opener and detach. Never block,
  // never throw — the URL is also printed above so the user can copy it.
  const [cmd, args] =
    platform() === 'darwin'
      ? (['open', [url]] as const)
      : platform() === 'win32'
        ? (['cmd', ['/c', 'start', '', url]] as const)
        : (['xdg-open', [url]] as const)
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {}) // ignore; URL already printed
    child.unref()
  } catch {
    // ignore
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
