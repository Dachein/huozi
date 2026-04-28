/**
 * GET /skill.md
 *
 * Serves the canonical Huozi SKILL.md for any Agent-skill ecosystem that
 * takes a Markdown file with YAML frontmatter (Anthropic Agent Skills,
 * OpenClaw skills, Cursor rules-as-file, etc.).
 *
 * Install shortcuts:
 *   # Claude Code
 *   curl -sS https://huozi.app/skill.md \
 *     -o ~/.claude/skills/huozi/SKILL.md
 *
 *   # OpenClaw (while the ClawHub package ships)
 *   curl -sS https://huozi.app/skill.md \
 *     -o ~/.openclaw/skills/huozi/SKILL.md
 *
 *   # Cursor (rules use the same body; frontmatter is permissive)
 *   curl -sS https://huozi.app/skill.md -o .cursor/rules/huozi.mdc
 *
 * The content is plain text served with text/markdown so browsers render
 * it legibly too — useful when linking from docs.
 */

const SKILL_MD = `---
name: huozi
description: Use the huozi_* MCP tools when the user asks to read, write, edit, grep, or publish files in their Huozi workspace. Huozi is an Agent-native cloud drive; workspace paths are the interface. Never print API keys.
version: 1
---

# Huozi Workspace

You have access to an Agent-native cloud drive via MCP. The workspace is
the user's file tree; paths are how you address things, and every write
is a commit in a versioned history.

## When to use

- User references a file in their huozi workspace → \`huozi_read\`,
  \`huozi_edit\`, \`huozi_write\`.
- User asks to find a pattern across files → \`huozi_grep\`.
- User asks to list or discover files → \`huozi_glob\` (path-only) before
  reading.
- User asks "what changed" or "when did X happen" → \`huozi_history\`.
- User asks to share, publish, or give someone a public URL for a file
  → \`huozi_share\` returns \`cloud.huozi.app/p/<slug>\`.
- Multiple cross-file edits that must land together → \`huozi_batch_edit\`
  for a single atomic commit.

## Tool cheatsheet

| Tool | Shape | Notes |
|---|---|---|
| \`huozi_read\` | \`{ file_path, offset?, limit? }\` | cat -n output, session-cached (returns \`file_unchanged\` on a second read). |
| \`huozi_write\` | \`{ file_path, content }\` | Creates or overwrites; folders are implicit. |
| \`huozi_edit\` | \`{ file_path, old_string, new_string, replace_all? }\` | Exact replacement. Read the file first — edit fails on blob staleness. |
| \`huozi_glob\` | \`{ pattern }\` | Path-only; use before reading. |
| \`huozi_grep\` | \`{ pattern, path?, -n?, -i?, glob?, output_mode? }\` | ripgrep dialect, D1 FTS5-backed. |
| \`huozi_batch_edit\` | \`{ edits: [ ... ] }\` | Atomic multi-file commit. |
| \`huozi_history\` | \`{ file_path? }\` | Per-file or workspace-level commit log. |
| \`huozi_share\` | \`{ file_path, slug? }\` | Returns a live \`cloud.huozi.app/p/<slug>\` URL that tracks the current bytes. |

## Workspace semantics (hard rules)

- Paths are workspace-relative, case-sensitive, forward-slash only.
- Folders are **implicit**: writing \`blog/post.md\` creates \`blog/\` as a
  side effect. There is no \`mkdir\` tool and you don't need one.
- **No delete**. To retire a file, overwrite it. To rename, write to the
  new path (the old one lingers until delete ships).
- Prefer minimal, targeted edits via \`huozi_edit\` over broad rewrites
  via \`huozi_write\`.
- \`huozi_share\` produces a live URL, not a snapshot — edits go live
  immediately.

## Agent workflow pattern

Before writing a new file, orient yourself:

1. \`huozi_glob\` the relevant subtree.
2. \`huozi_read\` a similar existing file as template.
3. \`huozi_grep\` for conventions (e.g. frontmatter shape, import style).
4. Only then \`huozi_write\`.

This mirrors how an engineer joins a codebase — and it is the behavior
Huozi is tuned for.

## Security

- **Never** print \`api_key\`, \`device_code\`, or \`key_id\` to the human.
- Do not persist credentials outside the MCP config your client owns.
- The user can revoke any Agent's access from the Connected Agents panel
  at cloud.huozi.app/workspace — treat lost tools as expected, recoverable
  state, not a crisis.

## Reference

Full MCP spec: https://huozi.app/docs · Install: https://huozi.app/start
`;

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return new Response(SKILL_MD, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
