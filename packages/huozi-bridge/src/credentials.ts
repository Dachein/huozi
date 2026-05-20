/**
 * On-disk credential store for huozi-bridge.
 *
 * Path: `~/.huozi-bridge/credentials.json` (chmod 600 on POSIX).
 * Written by `huozi-bridge login`, read by `loadConfig()` when
 * `HUOZI_API_KEY` is not set. The env var always wins.
 */

import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'

export interface StoredCredentials {
  api_key: string
  key_id: string | null
  workspace: { id: string | null; slug: string | null }
  saved_at: string
}

export function credentialsPath(): string {
  return join(homedir(), '.huozi-bridge', 'credentials.json')
}

export async function readCredentials(): Promise<StoredCredentials | null> {
  try {
    const raw = await readFile(credentialsPath(), 'utf8')
    const parsed = JSON.parse(raw) as StoredCredentials
    if (typeof parsed?.api_key !== 'string' || parsed.api_key.length === 0) {
      return null
    }
    return parsed
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function writeCredentials(c: StoredCredentials): Promise<void> {
  const p = credentialsPath()
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(c, null, 2) + '\n', 'utf8')
  if (platform() !== 'win32') {
    await chmod(p, 0o600)
  }
}

export async function deleteCredentials(): Promise<boolean> {
  try {
    await rm(credentialsPath())
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}
