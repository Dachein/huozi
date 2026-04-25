/**
 * GET /huozi/<...path>
 *
 * Serves the huozi plugin tree for Claude Code's marketplace install flow.
 * The marketplace manifest at /marketplace.json declares `source: "./huozi"`,
 * so Claude Code resolves plugin files against this prefix.
 *
 * Files served:
 *   /huozi/.claude-plugin/plugin.json
 *   /huozi/skills/huozi/SKILL.md
 *   /huozi/skills/huozi/REFERENCES.md
 *   /huozi/skills/huozi/templates/{deck,story,paper,mobile,page}.html
 *
 * The whole tree is walked at build time and baked into the static
 * response set — no fs access at edge runtime.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "skill-pack", "huozi");

const TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function walk(dir: string, base = ""): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

const FILES: Record<string, { body: string; type: string }> = (() => {
  const map: Record<string, { body: string; type: string }> = {};
  for (const { rel, abs } of walk(ROOT)) {
    map[rel] = {
      body: fs.readFileSync(abs, "utf-8"),
      type: TYPES[path.extname(rel)] ?? "application/octet-stream",
    };
  }
  return map;
})();

export const dynamic = "force-static";

export async function generateStaticParams() {
  return Object.keys(FILES).map((rel) => ({ path: rel.split("/") }));
}

export async function GET(
  _: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: parts } = await ctx.params;
  const file = FILES[parts.join("/")];
  if (!file) return new Response("Not Found", { status: 404 });
  return new Response(file.body, {
    status: 200,
    headers: {
      "content-type": file.type,
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
