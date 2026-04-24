/**
 * Build the per-client install snippets returned in the terminal
 * `install_mcp` response. Kept in its own module so the /workspace/connect
 * UI and this state machine can share formatting later.
 */

import type { InstallMcpNext } from "./types";

const CLOUD_MCP_URL = "https://cloud.huozi.app/mcp";

export function buildInstallMcpNext(
  api_key: string,
  /** Optional — omit when the token was pasted (path 2/3) and we don't
   *  have a cheap way to resolve the workspace slug server-side. */
  workspace_slug: string | null,
  opts?: {
    /** Signup path only: one-time Supabase magic link that drops the
     *  user straight into /workspace with no extra email OTP. */
    workspace_url?: string;
  },
): InstallMcpNext {
  return {
    action: "install_mcp",
    api_key,
    workspace_slug: workspace_slug ?? "",
    workspace_url: opts?.workspace_url,
    commands: {
      "claude-code": `claude mcp add --transport http huozi ${CLOUD_MCP_URL} \\
  -H "Authorization: Bearer ${api_key}" \\
  -s user`,
      cursor: JSON.stringify(
        {
          mcpServers: {
            huozi: {
              url: CLOUD_MCP_URL,
              headers: { Authorization: `Bearer ${api_key}` },
            },
          },
        },
        null,
        2,
      ),
      openclaw: JSON.stringify(
        {
          mcp: {
            servers: {
              huozi: {
                url: CLOUD_MCP_URL,
                transport: "streamable-http",
                headers: { Authorization: `Bearer ${api_key}` },
              },
            },
          },
        },
        null,
        2,
      ),
      generic: `# Raw JSON-RPC over HTTP — works for any MCP client.
# Replace <args> with real tool arguments.
curl -X POST ${CLOUD_MCP_URL} \\
  -H "Authorization: Bearer ${api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    },
    message: buildMessage(workspace_slug, opts?.workspace_url),
  };
}

function buildMessage(
  workspace_slug: string | null,
  workspace_url?: string,
): string {
  const base = workspace_slug
    ? `Workspace "${workspace_slug}" is ready.`
    : `API key accepted.`;
  const install = `Copy the snippet for your client into its MCP config, then restart the client.`;
  const browser = workspace_url
    ? `Open this one-time link to enter your workspace in a browser — no second login needed: ${workspace_url} (valid ~1 hour, single-use).`
    : `Manage the connection at https://huozi.app/workspace.`;
  return `${base} ${install} ${browser}`;
}
