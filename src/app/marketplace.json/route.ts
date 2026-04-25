/**
 * GET /marketplace.json
 *
 * Serves the Claude Code plugin marketplace manifest. Users add the
 * marketplace with:
 *
 *   /plugin marketplace add https://huozi.app/marketplace.json
 *   /plugin install huozi@huozi
 *
 * Source bytes live at skill-pack/.claude-plugin/marketplace.json — read
 * once at build time and baked into the static response.
 */

import fs from "node:fs";
import path from "node:path";

const BODY = fs.readFileSync(
  path.join(process.cwd(), "skill-pack", ".claude-plugin", "marketplace.json"),
  "utf-8",
);

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return new Response(BODY, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
