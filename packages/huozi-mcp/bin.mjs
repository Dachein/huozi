#!/usr/bin/env node
/**
 * huozi-mcp
 *
 * One-command installer for huozi.app. Runs the OAuth 2.0 device-authorization
 * flow against cloud.huozi.app, mints a workspace-scoped API key, and writes
 * the MCP server config into the host Agent's config file.
 *
 * Usage:
 *     npx huozi-mcp                      # auto-detect client
 *     npx huozi-mcp --client cursor      # force a specific client
 *     npx huozi-mcp --name "My Laptop"   # custom key label
 *     npx huozi-mcp --help
 *
 * The user opens one URL in a browser and clicks Authorize. This CLI polls
 * until the key is minted, then writes the appropriate config:
 *
 *   - claude-code  → runs `claude mcp add …` (falls back to manual hint)
 *   - cursor       → merges into ~/.cursor/mcp.json
 *   - openclaw     → merges into ~/.openclaw/openclaw.json (mcp.servers.huozi)
 *
 * Zero dependencies. Requires Node ≥ 18 (native fetch).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const CLOUD_URL = process.env.HUOZI_CLOUD_URL ?? "https://cloud.huozi.app";
const CLOUD_MCP_URL = `${CLOUD_URL}/mcp`;
const SUPPORTED_CLIENTS = ["claude-code", "cursor", "openclaw"];

// ─── tiny logger ────────────────────────────────────────────────────────────
const tag = "[huozi]";
const log = (...a) => console.log(tag, ...a);
const warn = (...a) => console.warn(tag, ...a);
const err = (...a) => console.error(tag, ...a);

// ─── arg parser ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { client: null, name: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--client") out.client = (argv[++i] ?? "").toLowerCase();
    else if (a.startsWith("--client=")) out.client = a.slice(9).toLowerCase();
    else if (a === "--name") out.name = argv[++i] ?? "";
    else if (a.startsWith("--name=")) out.name = a.slice(7);
  }
  return out;
}

function printHelp() {
  console.log(`huozi-mcp — connect huozi.app to your Agent

Usage:
  npx huozi-mcp [options]

Options:
  --client <kind>    claude-code | cursor | openclaw
                     (auto-detected from environment if omitted)
  --name <label>     Label for the key (default: client name)
  --help             Show this help

Flow:
  1. Request a device code from cloud.huozi.app.
  2. You open one URL in a browser and click Authorize.
  3. Key is minted; MCP config is written to the right file.

Env:
  HUOZI_CLOUD_URL    Override the cloud base URL (for self-hosted).
`);
}

// ─── client detection ───────────────────────────────────────────────────────
function detectClient() {
  // Env-var signals set by the respective hosts when they run commands.
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

// ─── device-flow helpers ────────────────────────────────────────────────────
async function requestDeviceCode(clientName, agentKind) {
  const res = await fetch(`${CLOUD_URL}/auth/device-code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: clientName, agent_kind: agentKind }),
  });
  if (!res.ok) {
    throw new Error(
      `device-code request failed: HTTP ${res.status} ${await res.text().catch(() => "")}`,
    );
  }
  return res.json();
}

async function pollForKey(deviceCode, intervalSec, expiresInSec) {
  const deadline = Date.now() + expiresInSec * 1000;
  const intervalMs = Math.max(2, intervalSec) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const res = await fetch(`${CLOUD_URL}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: deviceCode }),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok && body.api_key) {
      return body;
    }
    if (body.error === "authorization_pending") {
      continue;
    }
    if (body.error === "expired_token") {
      throw new Error("Device code expired. Re-run the installer.");
    }
    if (body.error === "access_denied") {
      throw new Error("Authorization denied.");
    }
    if (!res.ok) {
      throw new Error(
        `token poll failed: HTTP ${res.status} ${body.error ?? ""}`,
      );
    }
  }
  throw new Error("Timed out waiting for authorization.");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  return { file, restartNote: "Reload Cursor to pick up the new MCP server." };
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
  return {
    file,
    restartNote: "Restart OpenClaw to pick up the new MCP server.",
  };
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
        restartNote: "Run `claude mcp list` to verify. New shells pick it up.",
      };
    } catch (e) {
      warn(
        `\`claude mcp add\` failed (${e.message}); falling back to manual instructions.`,
      );
    }
  }

  // Fallback: print the command the user can run.
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
    restartNote: "Run the command above. Keep the key safe — it won't be shown again.",
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

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  let client = args.client || detectClient();
  if (!client) {
    err("Could not auto-detect which client is running.");
    err(
      "Re-run with --client claude-code | --client cursor | --client openclaw",
    );
    process.exitCode = 2;
    return;
  }
  if (!SUPPORTED_CLIENTS.includes(client)) {
    err(`Unknown client "${client}". Supported: ${SUPPORTED_CLIENTS.join(", ")}`);
    process.exitCode = 2;
    return;
  }

  const clientName =
    client === "claude-code"
      ? "Claude Code"
      : client === "cursor"
        ? "Cursor"
        : "OpenClaw";
  const label = (args.name ?? "").trim() || clientName;

  log(`Installing huozi for ${clientName}…`);
  log(`Requesting device code from ${CLOUD_URL}…`);

  let grant;
  try {
    grant = await requestDeviceCode(label, client);
  } catch (e) {
    err(`Could not reach huozi-cloud: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  const { device_code, user_code, verification_url_complete, interval, expires_in } =
    grant;

  console.log("");
  console.log("  Open this URL in your browser and click Authorize:");
  console.log("");
  console.log(`    ${verification_url_complete}`);
  console.log("");
  console.log(`  (one-time user code: ${user_code})`);
  console.log("");
  log(
    `Waiting for authorization… (times out in ${Math.round(expires_in / 60)} min)`,
  );

  let minted;
  try {
    minted = await pollForKey(device_code, interval ?? 5, expires_in ?? 900);
  } catch (e) {
    err(e.message);
    process.exitCode = 1;
    return;
  }

  log(`Authorized by user ${minted.user_id ?? "(unknown)"}.`);
  log(`Workspace: ${minted.workspace_slug ?? minted.workspace_id ?? "(default)"}`);

  let result;
  try {
    if (client === "cursor") result = await installCursor(minted.api_key);
    else if (client === "openclaw") result = await installOpenClaw(minted.api_key);
    else result = await installClaudeCode(minted.api_key);
  } catch (e) {
    err(`Failed to write config: ${e.message}`);
    err("Your key (save this — it won't be shown again):");
    console.log("");
    console.log(`    ${minted.api_key}`);
    console.log("");
    process.exitCode = 1;
    return;
  }

  console.log("");
  log(`✓ huozi connected for ${clientName}.`);
  log(`  Config: ${result.file}`);
  log(`  ${result.restartNote}`);
  console.log("");
  log("Try asking your Agent: 'what files are in my huozi workspace?'");
}

main().catch((e) => {
  err(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
