/**
 * Programmatic Cloudflare Email Routing setup.
 *
 * Why this exists: deploying huozi-email-ingest doesn't, on its own,
 * actually wire CF Email Routing on the mail.huozi.app zone. That last
 * mile is normally a manual dashboard click (Enable → pick worker).
 * Doing it via the CF API removes the click — once the deployer sets
 * CF_API_TOKEN, any workspace admin can hit POST /admin/mail/setup and
 * have the catch-all live in seconds.
 *
 * Idempotent end-to-end: every call computes the desired state, compares
 * against the current zone state, and only writes the diff. Safe to call
 * repeatedly (e.g. from a workspace re-onboarding flow).
 */

import { assertAdminAuth, type AdminEnv } from './admin.js'
import type { HuoziCloudflareBindings } from './bindings.js'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

interface MailEnv {
  CF_API_TOKEN?: string
  CF_MAIL_ZONE_ID?: string
  CF_MAIL_ZONE_NAME?: string
  CF_MAIL_INGEST_WORKER?: string
}

export interface MailRoutingStatus {
  configured: boolean
  enabled: boolean
  /** "unconfigured" | "ready" | "missing_dns" | "disabled" — verbatim from CF. */
  status: string | null
  /** Whether the catch-all rule currently points at our ingest worker. */
  catch_all_correct: boolean
  /** When non-null, what the catch-all is currently set to. */
  catch_all_target: string | null
  /** Destination addresses that still need verification, if any. */
  pending_dns: boolean
}

export interface MailRoutingSetupResult {
  ok: boolean
  status: MailRoutingStatus
  actions_taken: string[]
  error?: string
}

/**
 * Read current Email Routing state for the configured zone.
 * Returns `configured: false` when CF_API_TOKEN / CF_MAIL_ZONE_ID aren't
 * set — the deployer hasn't wired this feature yet.
 */
export async function getMailRoutingStatus(
  env: HuoziCloudflareBindings,
): Promise<MailRoutingStatus> {
  const e = env as unknown as MailEnv
  const token = e.CF_API_TOKEN
  const zoneId = e.CF_MAIL_ZONE_ID
  const expectedWorker = e.CF_MAIL_INGEST_WORKER ?? 'huozi-email-ingest'

  const empty: MailRoutingStatus = {
    configured: false,
    enabled: false,
    status: null,
    catch_all_correct: false,
    catch_all_target: null,
    pending_dns: false,
  }
  if (!token || !zoneId) return empty

  // The `/email/routing` settings endpoint needs a broader CF permission
  // than just "Email Routing Rules" (account-level token granularity is
  // tricky here). We probe via `/rules/catch_all` instead — if it returns
  // data, routing has already been turned on at the zone level by someone
  // with broader perms (typically the account owner via dashboard).
  const ca = await cfFetch<{
    result: {
      enabled: boolean
      actions: Array<{ type: string; value: string[] }>
    }
  }>(token, `/zones/${zoneId}/email/routing/rules/catch_all`)
  if (!ca.ok) {
    return {
      ...empty,
      configured: true,
      status: `api_error: ${ca.error}`,
    }
  }
  const action = ca.data.result.actions?.[0]
  let catchAllTarget: string | null = null
  let catchAllCorrect = false
  if (action?.type === 'worker') {
    catchAllTarget = action.value?.[0] ?? null
    catchAllCorrect =
      ca.data.result.enabled === true && catchAllTarget === expectedWorker
  } else if (action) {
    catchAllTarget = `${action.type}:${(action.value ?? []).join(',')}`
  }

  return {
    configured: true,
    // Reading catch_all worked → routing IS provisioned on this zone.
    enabled: true,
    status: 'ready',
    catch_all_correct: catchAllCorrect,
    catch_all_target: catchAllTarget,
    pending_dns: false,
  }
}

/**
 * Make sure Email Routing is enabled AND the catch-all rule points at the
 * configured ingest worker. Idempotent — only writes what's missing.
 */
export async function setupMailRouting(
  env: HuoziCloudflareBindings,
): Promise<MailRoutingSetupResult> {
  const e = env as unknown as MailEnv
  const token = e.CF_API_TOKEN
  const zoneId = e.CF_MAIL_ZONE_ID
  const worker = e.CF_MAIL_INGEST_WORKER ?? 'huozi-email-ingest'

  if (!token || !zoneId) {
    return {
      ok: false,
      status: await getMailRoutingStatus(env),
      actions_taken: [],
      error:
        'CF_API_TOKEN and CF_MAIL_ZONE_ID must be set on the huozi-cloud Worker.',
    }
  }

  const actions: string[] = []
  const before = await getMailRoutingStatus(env)

  // Enable-routing step is intentionally NOT here. With the scoped
  // "Email Routing Rules" perm we can't call /email/routing/enable
  // (Auth error). The zone owner enables routing once via the dashboard;
  // after that we only manage the catch-all rule, which IS within scope.
  if (before.status?.startsWith('api_error') && !before.catch_all_target) {
    return {
      ok: false,
      status: before,
      actions_taken: actions,
      error:
        'Cannot reach Email Routing on this zone. Enable routing once via the Cloudflare dashboard (Email → Email Routing → Enable), then re-run setup.',
    }
  }

  if (!before.catch_all_correct) {
    const put = await cfFetch<{ result: unknown }>(
      token,
      `/zones/${zoneId}/email/routing/rules/catch_all`,
      {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          name: `huozi catch-all → ${worker}`,
          matchers: [{ type: 'all' }],
          actions: [{ type: 'worker', value: [worker] }],
        }),
      },
    )
    if (!put.ok) {
      return {
        ok: false,
        status: await getMailRoutingStatus(env),
        actions_taken: actions,
        error: `catch_all rule update failed: ${put.error}`,
      }
    }
    actions.push(`catch_all → worker(${worker})`)
  }

  return {
    ok: true,
    status: await getMailRoutingStatus(env),
    actions_taken: actions,
  }
}

// ── Admin endpoints ────────────────────────────────────────────────────

/**
 * GET /admin/mail/status — read-only inspection. The Next.js side wraps
 * this so a workspace admin can render the current routing state in
 * /workspace/mail.
 */
export async function handleMailStatus(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }
  assertAdminAuth(request, env)
  const status = await getMailRoutingStatus(env)
  return Response.json({ ok: true, status })
}

/**
 * POST /admin/mail/setup — enable Email Routing on the configured zone
 * AND point the catch-all rule at the ingest worker. Idempotent: returns
 * an empty `actions_taken` list when everything is already in place.
 */
export async function handleMailSetup(
  request: Request,
  env: AdminEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  assertAdminAuth(request, env)
  const result = await setupMailRouting(env)
  return Response.json(result, { status: result.ok ? 200 : 502 })
}

// ── CF API helper ──────────────────────────────────────────────────────

type CfResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function cfFetch<T>(
  token: string,
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<CfResult<T>> {
  let res: Response
  try {
    res = await fetch(`${CF_API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: init.body,
    })
  } catch (err) {
    return { ok: false, error: `network: ${err instanceof Error ? err.message : String(err)}` }
  }
  // CF returns 200 with `success: false` AND non-2xx for errors; handle both.
  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    return { ok: false, error: `non-JSON response (${res.status})` }
  }
  const body = parsed as {
    success?: boolean
    errors?: Array<{ code?: number; message?: string }>
  }
  if (!res.ok || body.success === false) {
    const detail =
      body.errors && body.errors.length > 0
        ? body.errors.map((e) => `${e.code ?? '?'} ${e.message ?? ''}`.trim()).join('; ')
        : `${res.status} ${res.statusText}`
    return { ok: false, error: detail }
  }
  return { ok: true, data: parsed as T }
}
