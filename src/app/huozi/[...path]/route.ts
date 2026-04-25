/**
 * GET /huozi/<...path>
 *
 * Serves the huozi plugin tree for Claude Code's marketplace install
 * flow. The marketplace manifest at /marketplace.json declares
 * `source: "./huozi"`, so Claude Code resolves plugin files against
 * this prefix.
 *
 * Files served (all baked into the bundle by scripts/bundle-skill-pack.mjs):
 *   /huozi/.claude-plugin/plugin.json
 *   /huozi/skills/huozi/SKILL.md
 *   /huozi/skills/huozi/REFERENCES.md
 *   /huozi/skills/huozi/templates/{deck,story,paper,mobile,page}.html
 */

import { SKILL_PACK } from '@/lib/skill-pack-bundle'

const PATHS = Object.keys(SKILL_PACK)
  .filter((p) => p.startsWith('huozi/'))
  .map((p) => p.slice('huozi/'.length))

export const dynamic = 'force-static'

export async function generateStaticParams(): Promise<{ path: string[] }[]> {
  return PATHS.map((p) => ({ path: p.split('/') }))
}

export async function GET(
  _: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: parts } = await ctx.params
  const entry = SKILL_PACK[`huozi/${parts.join('/')}`]
  if (!entry) return new Response('Not Found', { status: 404 })
  return new Response(entry.body, {
    status: 200,
    headers: {
      'content-type': entry.type,
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  })
}
