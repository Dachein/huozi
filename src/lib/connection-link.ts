/**
 * `hz_link_` connection token: a base64url-encoded payload that bundles
 * everything an MCP client needs to connect — endpoint URL, api_key,
 * workspace identity, and edition.
 *
 * Why this format exists: the canonical mcp.json snippet is verbose
 * (4 lines, requires editing client config). `hz_link_` is a single
 * token the user can paste into a chat ("here's my huozi connection")
 * and the Agent decodes + suggests the right config edit. Same shape
 * as Slack's app-token / GitHub's installation-token / Stripe's API
 * test-keys — opaque-ish but self-describing if you decode.
 *
 * Format:
 *   hz_link_<base64url(json)>
 *
 * Payload schema (v=1):
 *   {
 *     v:  1,                          // version (forward-compat)
 *     ep: "https://cloud.huozi.app",  // MCP endpoint origin (no /mcp suffix)
 *     k:  "hz_xxxxxxxxxx",            // api_key (Bearer token)
 *     ws: "alice",                    // workspace_slug, for UI hint
 *     ed: "cloud" | "edge"            // edition, surfaces in agent prompt
 *   }
 *
 * Universal: works in Node and the browser (no Buffer dependency).
 */

export type Edition = "cloud" | "edge";

export interface ConnectionLinkPayload {
  v: 1;
  ep: string;
  k: string;
  ws: string;
  ed: Edition;
}

const PREFIX = "hz_link_";

export function encodeConnectionLink(payload: ConnectionLinkPayload): string {
  const json = JSON.stringify(payload);
  return PREFIX + toBase64Url(json);
}

/** Returns null on any malformed / version-mismatched input. Never throws. */
export function decodeConnectionLink(
  link: string,
): ConnectionLinkPayload | null {
  if (!link.startsWith(PREFIX)) return null;
  try {
    const json = fromBase64Url(link.slice(PREFIX.length));
    const obj = JSON.parse(json) as Partial<ConnectionLinkPayload>;
    if (
      obj.v !== 1 ||
      typeof obj.ep !== "string" ||
      typeof obj.k !== "string" ||
      typeof obj.ws !== "string" ||
      (obj.ed !== "cloud" && obj.ed !== "edge")
    ) {
      return null;
    }
    return obj as ConnectionLinkPayload;
  } catch {
    return null;
  }
}

/**
 * Build the canonical mcp.json snippet (verbose form). Used alongside
 * `hz_link_` in the web banner — some users / IDEs prefer the
 * transparent JSON over the opaque token.
 */
export function buildMcpSnippet(payload: ConnectionLinkPayload): string {
  return JSON.stringify(
    {
      mcpServers: {
        huozi: {
          type: "http",
          url: `${payload.ep.replace(/\/$/, "")}/mcp`,
          headers: {
            Authorization: `Bearer ${payload.k}`,
          },
        },
      },
    },
    null,
    2,
  );
}

// ── base64url helpers (universal: Node 16+ and modern browsers) ──────

function toBase64Url(str: string): string {
  const utf8 = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]!);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(b64url: string): string {
  const b64 =
    b64url.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
