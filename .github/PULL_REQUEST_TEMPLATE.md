<!--
Thanks for the contribution. A quick fill-out makes review faster.
-->

## What

<!-- One or two sentences. What does this change do? -->

## Why

<!-- The motivation: what problem, which issue (#123), or what user pain. -->

## How to verify

<!--
For UI: a screenshot or a short list of click-paths.
For code: which test covers it, or how a reviewer would reproduce.
-->

## Edition impact

- [ ] Cloud
- [ ] Edge
- [ ] Both
- [ ] Neither (docs / tooling)

## Checklist

- [ ] `npx tsc --noEmit` passes locally
- [ ] `cd packages/huozi-cloud && npm test` passes (if I touched the worker)
- [ ] I read [`AGENTS.md`](../AGENTS.md) and didn't widen edition-divergent code beyond `src/lib/identity/`
- [ ] No secrets in the diff (env files, API keys, tokens)
