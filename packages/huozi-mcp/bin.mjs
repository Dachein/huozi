#!/usr/bin/env node
/**
 * huozi-mcp 0.2.x
 *
 * Interactive installer for humans at a terminal. Drives the server-side
 * state machine at https://huozi.app/api/agent/{start,step}, which offers
 * three install paths:
 *
 *   1. Sign up (email OTP, auto-provisions a workspace)
 *   2. Log in via browser device flow (existing account)
 *   3. Paste an API key you already have
 *
 * At the end the state machine returns install_mcp with an api_key + per-
 * client snippets; we write the one for your chosen client into its
 * conventional MCP config location.
 *
 * Agent-driven install? Don't use this CLI. Have the Agent POST to
 * /api/agent/start directly — see https://huozi.app/start. This CLI
 * refuses to run under non-TTY stdin so an Agent can't accidentally
 * hang on a readline prompt.
 *
 * Usage:
 *     npx huozi-mcp                      # auto-detect / prompt for client
 *     npx huozi-mcp --client cursor      # skip detection
 *     npx huozi-mcp --help
 *
 * Env:
 *     HUOZI_APP_URL     Override the app base (default https://huozi.app)
 *     HUOZI_CLOUD_URL   Override the cloud base (default https://cloud.huozi.app)
 *
 * Zero dependencies. Requires Node ≥ 18 (native fetch + readline/promises).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { spawn } from "node:child_process";

const HUOZI_APP = process.env.HUOZI_APP_URL ?? "https://huozi.app";
const CLOUD_BASE = process.env.HUOZI_CLOUD_URL ?? "https://cloud.huozi.app";
const CLOUD_MCP_URL = `${CLOUD_BASE}/mcp`;

const SUPPORTED_CLIENTS = ["claude-code", "cursor", "openclaw", "generic"];

// ─── tiny logger ────────────────────────────────────────────────────────────
const tag = "[huozi]";
const log = (...a) => console.log(tag, ...a);
const warn = (...a) => console.warn(tag, ...a);
const err = (...a) => console.error(tag, ...a);

// ─── arg parser ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { client: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--client") out.client = (argv[++i] ?? "").toLowerCase();
    else if (a.startsWith("--client=")) out.client = a.slice(9).toLowerCase();
  }
  return out;
}

function printHelp() {
  console.log(`huozi-mcp — interactive installer for huozi.app

Usage:
  npx huozi-mcp [--client <kind>]

Options:
  --client <kind>    claude-code | cursor | openclaw | generic
                     (auto-detected / prompted if omitted)
  --help             Show this help

Flow:
  1. Pick install path (1 = signup · 2 = browser login · 3 = paste token).
  2. Follow the prompts.
  3. The MCP config is written to your client's conventional location.

Agent-driven install? This CLI is for humans at a terminal. Agents should
drive the same state machine over HTTP — see https://huozi.app/start.
`);
}

// ─── client detection ───────────────────────────────────────────────────────
function detectClient() {
  if (process.env.CLAUDECODE === "1" || process.env.CLAUDE_CODE === "1") {
    return "claude-code";
  }
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR === "1") {
    return "cursor";
  }
  if (process.env.OPENCLAW === "1" || process.env.OPENCLAW_SESSION) {
    return "openclaw";
  }
  return null;
}

async function promptClient(rl) {
  console.log("");
  console.log("Which client are you installing for?");
  console.log("  1. Claude Code");
  console.log("  2. Cursor");
  console.log("  3. OpenClaw");
  console.log("  4. Generic (print snippet for manual install)");
  console.log("");
  const ans = (await rl.question("  > ")).trim();
  const map = {
    "1": "claude-code",
    "2": "cursor",
    "3": "openclaw",
    "4": "generic",
  };
  return map[ans] ?? null;
}

// ─── state-machine driver ───────────────────────────────────────────────────
async function runAgentFlow(rl) {
  let body = await postJson(`${HUOZI_APP}/api/agent/start`, {});

  // Safety net: the longest legit flow is ~5 prompts (choice + email +
  // code + optional client disambig). 30 iterations is generous.
  for (let i = 0; i < 30; i++) {
    if (!body || typeof body !== "object") {
      throw new Error(`Unexpected response: ${JSON.stringify(body)}`);
    }
    if (!body.ok && body.next?.action !== "error") {
      throw new Error(
        `Non-ok response with no error action: ${JSON.stringify(body)}`,
      );
    }
    const next = body.next;

    if (next.action === "install_mcp") {
      return next;
    }

    if (next.action === "ask_user") {
      console.log("");
      console.log(next.prompt);
      if (next.hint) console.log(`  (${next.hint})`);
      console.log("");
      const answer = (await rl.question("  > ")).trim();
      body = await postStep(next.then, next.input.key, answer);
      continue;
    }

    if (next.action === "run_device_flow") {
      const apiKey = await executeDeviceFlow(rl, next);
      body = await postStep(next.then, next.then.input.key, apiKey);
      continue;
    }

    if (next.action === "error") {
      throw new Error(`[${next.code}] ${next.message}`);
    }

    throw new Error(`Unknown next.action: ${JSON.stringify(next)}`);
  }
  throw new Error("State machine exceeded max iterations (30).");
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // We parse regardless of status — our API wraps errors in its own shape.
  const json = await res.json().catch(() => null);
  if (json) return json;
  throw new Error(`HTTP ${res.status} with non-JSON body from ${url}`);
}

async function postStep(then, key, value) {
  return postJson(then.url, { ...then.body, [key]: value });
}

// ─── device flow (path 2) ───────────────────────────────────────────────────
async function executeDeviceFlow(rl, next) {
  // The server's run_device_flow response hands us shell scripts for
  // documentation. We implement the same flow in Node natively — one HTTP
  // roundtrip is cheaper and more reliable than shelling out to curl.
  const dcRes = await fetch(`${CLOUD_BASE}/auth/device-code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "huozi-mcp CLI",
      agent_kind: "other",
    }),
  });
  if (!dcRes.ok) {
    throw new Error(`device-code request failed: HTTP ${dcRes.status}`);
  }
  const grant = await dcRes.json();
  const {
    device_code,
    user_code,
    verification_url_complete,
    interval = 5,
    expires_in = 900,
  } = grant;

  console.log("");
  console.log("  Open this URL in your browser and click Authorize:");
  console.log("");
  console.log(`    ${verification_url_complete}`);
  console.log("");
  console.log(`  (one-time code: ${user_code})`);
  console.log("");
  void rl; // kept for future "[y] to continue" prompts; unused today
  log(
    `Waiting for authorization… (times out in ${Math.round(expires_in / 60)} min)`,
  );

  const deadline = Date.now() + expires_in * 1000;
  const intervalMs = Math.max(2, interval) * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const tokRes = await fetch(`${CLOUD_BASE}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code }),
    });
    const tok = await tokRes.json().catch(() => ({}));
    if (tokRes.ok && tok.api_key) {
      log("Authorized.");
      return tok.api_key;
    }
    if (tok.error === "authorization_pending") continue;
    if (tok.error === "expired_token") {
      throw new Error("Device code expired. Please re-run and try again.");
    }
    if (tok.error === "access_denied") {
      throw new Error("Authorization denied.");
    }
  }
  throw new Error("Timed out waiting for authorization.");
}

// ─── config writers ─────────────────────────────────────────────────────────
async function readJsonIfExists(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

async function writeJson(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function installCursor(apiKey) {
  const file = path.join(os.homedir(), ".cursor", "mcp.json");
  const config = await readJsonIfExists(file);
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers.huozi = {
    url: CLOUD_MCP_URL,
    headers: { Authorization: `Bearer ${apiKey}` },
  };
  await writeJson(file, config);
  return { file, note: "Reload Cursor (⌘⇧P → Reload Window) to pick it up." };
}

async function installOpenClaw(apiKey) {
  const file = path.join(os.homedir(), ".openclaw", "openclaw.json");
  const config = await readJsonIfExists(file);
  config.mcp = config.mcp ?? {};
  config.mcp.servers = config.mcp.servers ?? {};
  config.mcp.servers.huozi = {
    url: CLOUD_MCP_URL,
    transport: "streamable-http",
    headers: { Authorization: `Bearer ${apiKey}` },
  };
  await writeJson(file, config);
  return { file, note: "Restart OpenClaw to pick up the new MCP server." };
}

async function installClaudeCode(apiKey) {
  const hasClaude = await commandExists("claude");
  if (hasClaude) {
    try {
      await runCommand("claude", [
        "mcp",
        "add",
        "--transport",
        "http",
        "huozi",
        CLOUD_MCP_URL,
        "-H",
        `Authorization: Bearer ${apiKey}`,
        "-s",
        "user",
      ]);
      return {
        file: "claude mcp (user scope)",
        note: "Run `claude mcp list` to verify. New shells pick it up.",
      };
    } catch (e) {
      warn(
        `\`claude mcp add\` failed (${e.message}); falling back to manual instructions.`,
      );
    }
  }
  console.log("");
  console.log(
    "Could not run `claude mcp add` automatically. Run this yourself:",
  );
  console.log("");
  console.log(
    `    claude mcp add --transport http huozi ${CLOUD_MCP_URL} \\\n      -H "Authorization: Bearer ${apiKey}" \\\n      -s user`,
  );
  console.log("");
  return {
    file: "(manual)",
    note: "Run the command above. Keep the key safe — it won't be shown again.",
  };
}

async function installGeneric(apiKey, installMcp) {
  console.log("");
  console.log(
    "Generic install — paste the snippet for your client into its MCP config:",
  );
  console.log("");
  console.log("--- Raw JSON-RPC probe to verify the key ---");
  console.log(installMcp.commands.generic ?? `Bearer ${apiKey}`);
  console.log("");
  return {
    file: "(manual)",
    note:
      "No file was written. Configure your client manually using the snippet above.",
  };
}

function commandExists(cmd) {
  return new Promise((resolve) => {
    const child =
      process.platform === "win32"
        ? spawn("where", [cmd], { stdio: "ignore" })
        : spawn("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function installClient(client, installMcp) {
  const apiKey = installMcp.api_key;
  if (client === "cursor") return installCursor(apiKey);
  if (client === "openclaw") return installOpenClaw(apiKey);
  if (client === "claude-code") return installClaudeCode(apiKey);
  return installGeneric(apiKey, installMcp);
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  // Guard against non-interactive invocation. Agents driving install on a
  // user's behalf should hit /api/agent/start directly instead of running
  // this CLI through a non-TTY bash tool.
  if (!process.stdin.isTTY) {
    err("huozi-mcp needs an interactive terminal (TTY) — found piped stdin.");
    err("");
    err("If you are an Agent installing on the user's behalf, drive the");
    err("state machine via HTTP directly:");
    err("    POST https://huozi.app/api/agent/start");
    err("See https://huozi.app/start for the full protocol.");
    process.exitCode = 1;
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    let client = args.client ?? detectClient();
    if (!client || !SUPPORTED_CLIENTS.includes(client)) {
      client = await promptClient(rl);
    }
    if (!client || !SUPPORTED_CLIENTS.includes(client)) {
      err(`Unknown or missing client. Pass --client ∈ {${SUPPORTED_CLIENTS.join(", ")}}`);
      process.exitCode = 2;
      return;
    }

    log(`Installing huozi for ${clientName(client)}…`);
    const installMcp = await runAgentFlow(rl);

    log("Writing MCP config…");
    const result = await installClient(client, installMcp);

    console.log("");
    log(`✓ ${clientName(client)} set up.`);
    log(`  Config: ${result.file}`);
    if (installMcp.workspace_slug) log(`  Workspace: ${installMcp.workspace_slug}`);
    log(`  ${result.note}`);
    console.log("");
    log("Try asking your Agent: \"what files are in my huozi workspace?\"");
  } catch (e) {
    console.log("");
    err(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

function clientName(kind) {
  switch (kind) {
    case "claude-code":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "openclaw":
      return "OpenClaw";
    case "generic":
      return "Generic";
    default:
      return kind;
  }
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
