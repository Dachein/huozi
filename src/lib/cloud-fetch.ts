/**
 * Unified outbound call into huozi-cloud.
 *
 * On Cloudflare (production / preview) this resolves to the `CLOUD` service
 * binding declared in wrangler.jsonc — zero network hop, no DNS, no public
 * HTTP exposure. In `next dev` and Node test runs we fall back to a plain
 * fetch() to HUOZI_CLOUD_URL (default https://cloud.huozi.app).
 *
 * Callers pass a path like "/admin/mint-key" — never an absolute URL — so
 * the same call site works in both modes.
 */
import "server-only";

const PUBLIC_FALLBACK =
  process.env.HUOZI_CLOUD_URL ?? "https://cloud.huozi.app";

/**
 * The public base URL of the huozi-cloud Worker — what an external Agent
 * (Claude Code, Cursor, …) should point its MCP client at.
 *
 * Cloud production: `https://cloud.huozi.app`. Edge deploys: whatever the
 * admin set `HUOZI_CLOUD_URL` to (their Worker's hostname). Same code path.
 */
export function getPublicCloudBase(): string {
  return PUBLIC_FALLBACK.replace(/\/+$/, "");
}

/** Convenience: the MCP endpoint URL surfaced in /connect snippets. */
export function getPublicMcpUrl(): string {
  return `${getPublicCloudBase()}/mcp`;
}

interface CloudBinding {
  fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
}

interface CloudfareEnvShape {
  CLOUD?: CloudBinding;
}

async function getCloudBinding(): Promise<CloudBinding | null> {
  try {
    // Lazy import — @opennextjs/cloudflare is a server-only dep and throws
    // at import time outside Cloudflare's runtime context. Keep it inside a
    // try so dev / vitest don't blow up.
    const mod = (await import("@opennextjs/cloudflare").catch(() => null)) as
      | {
          getCloudflareContext?: () => { env?: CloudfareEnvShape };
        }
      | null;
    if (!mod?.getCloudflareContext) return null;
    const ctx = mod.getCloudflareContext();
    return ctx.env?.CLOUD ?? null;
  } catch {
    return null;
  }
}

/** Build the URL passed to .fetch() on a service binding. The host is
 * ignored by the Cloudflare runtime but must be a syntactically valid URL. */
function bindingUrl(path: string): string {
  return `https://huozi-cloud.internal${path}`;
}

export async function cloudFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!path.startsWith("/")) {
    throw new Error(
      `cloudFetch path must start with "/" — got: ${path.slice(0, 64)}`,
    );
  }
  const binding = await getCloudBinding();
  if (binding) {
    return binding.fetch(bindingUrl(path), init);
  }
  return fetch(`${PUBLIC_FALLBACK}${path}`, init);
}
