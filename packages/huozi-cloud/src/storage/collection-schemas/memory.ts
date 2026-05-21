/**
 * Project memory format — Markdown KV blocks at `.huozi/memory.md`.
 *
 * Per the v3.3 simplification (memory moved from Collection / jsonl to
 * Document / md): each memory entry is a `## <name>` heading + a small
 * YAML-ish metadata block + a free-form body. Update = edit the section
 * in place; supersede = replace; tombstone = delete the section. History
 * lives in git commits, not in an event stream.
 *
 * This file just centralises (1) the canonical seed body so the Upgrade
 * flow can mint a fresh memory.md and (2) the four type tags so any
 * future render / linting can stay in sync.
 */

/** The four memory categories — used as the `type:` tag on each entry. */
export const MEMORY_TYPES = [
  'feedback',
  'project',
  'reference',
  'user',
] as const
export type MemoryType = (typeof MEMORY_TYPES)[number]

/** Path suffix that marks a Project (sentinel). */
export const MEMORY_FILE_SUFFIX = '.huozi/memory.md'

/**
 * Body seeded into a freshly-minted memory.md. Mostly comments — the
 * file starts empty of real entries, with a short usage note so a
 * human (or LLM) opening it for the first time knows the convention
 * without reading external docs.
 *
 * Frontmatter `huozi: project-memory` marks the file's role so the
 * renderer / file tree can light up the right affordances; mirrors
 * the `huozi: project` frontmatter on README.md.
 */
export const INITIAL_MEMORY_DOC = `---
huozi: project-memory
---

# Project Memory

> Agent observations for this Project. One entry per \`## <name>\`
> section. Update an entry by editing it in place; retire one by
> deleting its section. History lives in git commits.

> Each entry's metadata lines (under the heading) follow a simple
> \`key: value\` convention. Recognised keys:
> - \`type\` — one of: feedback / project / reference / user
> - \`why\` — optional reason / motivation
> - \`how_to_apply\` — optional usage guidance
>
> Body below the metadata is free-form markdown.

> **Memory types:**
> - \`feedback\` — user conduct guidance ("don't summarize trailing")
> - \`project\` — project facts, constraints, status
> - \`reference\` — pointer to where info lives in external systems
> - \`user\` — user role / preferences / background

<!-- example
## Prefer terse responses
type: feedback
why: user stated 2026-05-21
how_to_apply: end-of-turn 1-2 sentences max

Skip trailing summaries — the diff already shows what changed.
-->
`
