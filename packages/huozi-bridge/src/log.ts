/**
 * Structured logger. Lines are NDJSON to stderr so `huozi-bridge | jq`
 * works for ad-hoc inspection. stdout is reserved (might be used for
 * future control-plane output to a supervising process).
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

let verbose = false

export function setVerbose(v: boolean): void {
  verbose = v
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (level === 'debug' && !verbose) return
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  }
  process.stderr.write(JSON.stringify(line) + '\n')
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
}
