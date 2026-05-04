#!/usr/bin/env node
/**
 * huozi-mcp — DEPRECATED
 *
 * This installer wrapper is no longer maintained. The huozi MCP server is a
 * remote HTTP server (Streamable HTTP transport at https://cloud.huozi.app/mcp)
 * that every modern MCP host can reach directly — no local Node process, no
 * `npx` middleman.
 *
 * Run one of these in your client of choice instead:
 *
 *   Claude Code:
 *     claude mcp add --transport http huozi https://cloud.huozi.app/mcp \
 *       -H "Authorization: Bearer hz_your_key"
 *
 *   Cursor / Claude Desktop / OpenClaw — paste into mcp.json:
 *     {
 *       "mcpServers": {
 *         "huozi": {
 *           "type": "http",
 *           "url": "https://cloud.huozi.app/mcp",
 *           "headers": { "Authorization": "Bearer hz_your_key" }
 *         }
 *       }
 *     }
 *
 * Mint your api_key at https://huozi.app/workspace/connect (Cloud) or your
 * own Edge worker's /workspace/connect.
 *
 * Walk-through with copy-paste examples: https://huozi.app/start
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const YEL = "\x1b[33m";

const lines = [
  "",
  `${YEL}${BOLD}huozi-mcp is deprecated.${RESET}`,
  "",
  "The huozi MCP server is now a remote HTTP server. Configure your client",
  "to connect directly — no npx wrapper needed.",
  "",
  `${BOLD}Claude Code${RESET}`,
  `  ${DIM}claude mcp add --transport http huozi https://cloud.huozi.app/mcp \\${RESET}`,
  `  ${DIM}  -H "Authorization: Bearer hz_your_key"${RESET}`,
  "",
  `${BOLD}Cursor / Claude Desktop / OpenClaw${RESET} — add to mcp.json:`,
  `  ${DIM}{${RESET}`,
  `  ${DIM}  "mcpServers": {${RESET}`,
  `  ${DIM}    "huozi": {${RESET}`,
  `  ${DIM}      "type": "http",${RESET}`,
  `  ${DIM}      "url": "https://cloud.huozi.app/mcp",${RESET}`,
  `  ${DIM}      "headers": { "Authorization": "Bearer hz_your_key" }${RESET}`,
  `  ${DIM}    }${RESET}`,
  `  ${DIM}  }${RESET}`,
  `  ${DIM}}${RESET}`,
  "",
  `Mint a key:  ${BOLD}https://huozi.app/workspace/connect${RESET}`,
  `Walk-through: ${BOLD}https://huozi.app/start${RESET}`,
  "",
];

for (const line of lines) console.log(line);
process.exitCode = 0;
