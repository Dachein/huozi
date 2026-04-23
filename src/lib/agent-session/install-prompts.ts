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
): InstallMcpNext {
  return {
    action: "install_mcp",
    api_key,
    workspace_slug: workspace_slug ?? "",
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
    message: workspace_slug
      ? `Workspace "${workspace_slug}" is ready. Copy the snippet for your client into its MCP config, then restart the client. You can rename the workspace later at https://huozi.app/workspace.`
      : `API key accepted. Copy the snippet for your client into its MCP config, then restart the client. Manage the connection at https://huozi.app/workspace.`,
  };
}
