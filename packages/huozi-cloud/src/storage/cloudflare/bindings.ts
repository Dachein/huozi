/**
 * Cloudflare binding surface expected by the production storage + Worker.
 *
 * Kept here so every module speaks to the same typed shape regardless of
 * whether it's running inside the Worker entry, a DO, or a Node test shim.
 */

export interface HuoziCloudflareBindings {
  /** R2 bucket for blobs. */
  BLOBS: R2Bucket
  /** D1 database holding files_current / commits / commit_paths / api_keys. */
  DB: D1Database
  /** WorkspaceDO namespace — one DO per workspace, handles write critical section. */
  WORKSPACE_DO: DurableObjectNamespace
  /** AgentSessionDO namespace — one DO per {workspace, principal} session. */
  SESSION_DO: DurableObjectNamespace

  /**
   * Origin used to construct public share URLs (huozi_share output).
   * Cloud sets this to "https://huozi.app"; Edge deployers point it at
   * wherever their Next.js front-end lives. Falls back to huozi.app when
   * unset to keep the cloud build working with zero config.
   */
  HUOZI_PUBLIC_BASE?: string

  /**
   * HMAC secret used to sign short-lived blob download URLs (returned by
   * huozi_download and the binary_ref branch of huozi_read). Any sufficiently
   * random string works; rotate by setting a new value and accepting that
   * in-flight URLs become invalid. When unset, signed URLs cannot be issued
   * — read/download fall back to a placeholder URL the agent can't actually
   * fetch. Edge deployers should always set this; the deploy script
   * generates one automatically.
   */
  HUOZI_SIGNING_SECRET?: string

  /**
   * Worker env namespace for config / feature flags.
   * Presence optional; not all deployments need one.
   */
  [key: string]: unknown
}
