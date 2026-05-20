#!/usr/bin/env node
/**
 * huozi-bridge daemon entry point.
 *
 * Usage:
 *   huozi-bridge login        # device-flow OAuth; stores key in ~/.huozi-bridge/
 *   huozi-bridge logout       # remove stored credentials
 *   huozi-bridge              # run the daemon (also: `huozi-bridge run`)
 *
 * The daemon reads its API key from `HUOZI_API_KEY` if set, otherwise from
 * the file written by `login`. See README.md for the per-event lifecycle.
 */

import { loadConfig, resolveCloudBaseUrl } from './config.js'
import { credentialsPath, deleteCredentials } from './credentials.js'
import { log, setVerbose } from './log.js'
import { runLogin } from './login.js'
import { McpClient } from './mcp.js'
import { WsSubscriber, type CommitEvent } from './ws.js'
import { ClaudeRunner } from './claude.js'
import { Orchestrator } from './orchestrator.js'

async function runDaemon(): Promise<void> {
  const cfg = await loadConfig()
  setVerbose(cfg.verbose)
  log.info('huozi-bridge starting', {
    cloud: cfg.cloudBaseUrl,
    workdir: cfg.workdirRoot,
    claude: cfg.claudeBin,
  })

  const mcp = new McpClient(cfg)
  const claude = new ClaudeRunner(cfg)
  const orch = new Orchestrator(cfg, mcp, claude)

  const ws = new WsSubscriber(cfg)
  ws.onConnect(() => orch.catchUp().catch((err) => log.error('catchUp', { err: String(err) })))
  ws.onEvent(async (evt) => {
    if (evt.type === 'commit') {
      const commit = evt as CommitEvent
      log.debug('commit', { paths: commit.paths, author: commit.author })
      await orch.handleCommit(commit)
    } else if (evt.type === 'hello') {
      log.info('ws hello')
    } else {
      log.debug('ws other', { type: evt.type })
    }
  })
  ws.start()

  let shuttingDown = false
  const shutdown = (sig: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('shutting down', { signal: sig })
    ws.close()
    setTimeout(() => process.exit(0), 200)
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  // Keep the event loop alive while the reconnect loop spins.
  setInterval(() => {}, 60_000)
}

function printHelp(): void {
  process.stdout.write(
    [
      'huozi-bridge — bridges a huozi workspace Tasks Collection to a local Claude CLI.',
      '',
      'Usage:',
      '  huozi-bridge login     Authenticate via browser device flow.',
      '  huozi-bridge logout    Remove the stored credentials file.',
      '  huozi-bridge [run]     Start the daemon (default).',
      '  huozi-bridge --help    Show this help.',
      '',
      'Env (optional overrides):',
      '  HUOZI_API_KEY              Skip the credentials file and use this token.',
      '  HUOZI_CLOUD_URL            Worker base URL (default https://cloud.huozi.app).',
      '  HUOZI_BRIDGE_VERBOSE=1     Emit debug-level logs.',
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'run'
  switch (cmd) {
    case 'login':
      await runLogin({ cloudBaseUrl: resolveCloudBaseUrl() })
      return
    case 'logout': {
      const removed = await deleteCredentials()
      process.stdout.write(
        removed
          ? `Removed ${credentialsPath()}\n`
          : `No credentials file at ${credentialsPath()}\n`,
      )
      return
    }
    case 'run':
      await runDaemon()
      return
    case '--help':
    case '-h':
    case 'help':
      printHelp()
      return
    default:
      process.stderr.write(`Unknown subcommand: ${cmd}\n\n`)
      printHelp()
      process.exit(2)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
