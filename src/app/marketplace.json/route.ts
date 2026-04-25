/**
 * GET /marketplace.json
 *
 * Serves the Claude Code plugin marketplace manifest. Users add the
 * marketplace with:
 *
 *   /plugin marketplace add https://huozi.app/marketplace.json
 *   /plugin install huozi@huozi
 *
 * Bytes are baked into the bundle by scripts/bundle-skill-pack.mjs —
 * the Cloudflare Worker runtime has no fs, so we cannot read files
 * from disk per-request. Re-run the bundler after editing the source
 * file at skill-pack/.claude-plugin/marketplace.json.
 */

import { SKILL_PACK } from '@/lib/skill-pack-bundle'

const ENTRY = SKILL_PACK['marketplace.json']

export const dynamic = 'force-static'

export async function GET(): Promise<Response> {
  return new Response(ENTRY.body, {
    status: 200,
    headers: {
      'content-type': ENTRY.type,
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  })
}
