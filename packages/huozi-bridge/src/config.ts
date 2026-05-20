/**
 * Config loading.
 *
 * Resolution order for the API key:
 *   1. `HUOZI_API_KEY` env var (explicit override).
 *   2. `~/.huozi-bridge/credentials.json` (written by `huozi-bridge login`).
 *
 * If neither is present, daemon startup fails with a message pointing the
 * user at `huozi-bridge login`.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { credentialsPath, readCredentials } from './credentials.js'

export interface Config {
  /** Bearer token (hz_…) used against huozi-cloud's /mcp endpoint. */
  apiKey: string
  /** Base URL of the huozi-cloud Worker (no trailing slash). */
  cloudBaseUrl: string
  /** WebSocket base URL (derived from cloudBaseUrl by default). */
  wsBaseUrl: string
  /** Absolute path used as workdir root for per-task Claude sessions. */
  workdirRoot: string
  /** Path to the `claude` CLI binary. PATH lookup if not set. */
  claudeBin: string
  /** Tool allowlist passed via `--allowedTools` to claude. */
  allowedTools: string
  /** When true, write more detailed logs to stderr. */
  verbose: boolean
}

export function resolveCloudBaseUrl(): string {
  return (process.env.HUOZI_CLOUD_URL ?? 'https://cloud.huozi.app').replace(/\/+$/, '')
}

export async function loadConfig(): Promise<Config> {
  const cloudBaseUrl = resolveCloudBaseUrl()
  const wsBaseUrl =
    process.env.HUOZI_WS_URL ?? cloudBaseUrl.replace(/^https?:\/\//, (m) =>
      m === 'http://' ? 'ws://' : 'wss://',
    )

  const apiKey = await resolveApiKey()

  return {
    apiKey,
    cloudBaseUrl,
    wsBaseUrl,
    workdirRoot:
      process.env.HUOZI_BRIDGE_WORKDIR ??
      join(homedir(), '.huozi-bridge', 'tasks'),
    claudeBin: process.env.HUOZI_BRIDGE_CLAUDE_BIN ?? 'claude',
    allowedTools:
      process.env.HUOZI_BRIDGE_ALLOWED_TOOLS ??
      // MCP huozi tools are the whole point — without them, the spawned
      // claude can't touch the workspace it's supposed to act on.
      'Read,Edit,Grep,Glob,Bash(git *),mcp__huozi',
    verbose: process.env.HUOZI_BRIDGE_VERBOSE === '1',
  }
}

async function resolveApiKey(): Promise<string> {
  const fromEnv = process.env.HUOZI_API_KEY
  if (fromEnv && fromEnv.length > 0) return fromEnv

  const stored = await readCredentials()
  if (stored) return stored.api_key

  throw new Error(
    `No API key found.\n` +
      `  Run \`huozi-bridge login\` to authenticate, or set HUOZI_API_KEY.\n` +
      `  (Credentials would be loaded from ${credentialsPath()}.)`,
  )
}
