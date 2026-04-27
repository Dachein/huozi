# Contributing to huozi

Thanks for considering a contribution. huozi is small and opinionated, but PRs that fix bugs, sharpen the architecture, or fill in obvious gaps are very welcome. Here's what to expect.

## TL;DR

1. Issues first for anything non-trivial — saves you and us from sunk-cost surprises.
2. Match the codebase's style: TypeScript strict, no comments unless the *why* is non-obvious, prefer editing existing files over adding new ones.
3. Add tests when you change behavior in `packages/huozi-cloud/`.
4. Keep the cloud / edge invariant intact — anything edition-divergent goes through `IdentityService`.

## Getting set up

```bash
git clone https://github.com/Dachein/huozi.git
cd huozi
npm install
```

You can develop against the hosted Cloud Worker at `cloud.huozi.app/mcp` (no extra setup), or spin up your own Edge Worker with `scripts/edge-deploy-test.sh` (requires a Cloudflare account; see [`docs/edge-self-host.md`](docs/edge-self-host.md)).

For Worker development:

```bash
cd packages/huozi-cloud
npm test           # vitest, runs against the in-memory storage backend
npm run typecheck
npm run cf:dev     # local wrangler dev — hits remote D1/R2 of your edge deploy
```

For Next.js development:

```bash
npm run dev        # localhost:3000 — points at cloud.huozi.app/mcp by default
```

Override `HUOZI_CLOUD_URL` in `.env.local` to point at your own Worker.

## How we like changes shaped

**Surgical commits.** Small, focused, single-concern. The commit message explains the *why*; the *what* should be readable from the diff. Co-authored-by trailers are welcome.

**No drive-by rewrites.** If you see code you'd structure differently but it works fine — leave it. Refactor PRs are discussed in an issue first so we can plan migrations together.

**Tests where they earn their keep.** `packages/huozi-cloud/` has 177 vitest tests today; new tool implementations and any change to the writeFilePrimitive critical section need test coverage. UI work usually doesn't ship with tests because we lean on type-checking + manual verification.

**Update docs alongside code.** If you change behavior described in `packages/huozi-cloud/SPEC.md` or `docs/edge-self-host.md`, update the docs in the same PR.

## What's in scope

✅ **Bug fixes** — race conditions, edge cases, confusing error messages, broken-on-Edge code paths.

✅ **MCP tool sharpening** — better error codes, missing fields, mismatches with the Claude Code dialect that we're failing to mirror.

✅ **Edge UX gaps** — anything that makes self-hosting harder than it needs to be. The bootstrap flow especially could use polish.

✅ **i18n** — adding a locale or filling in missing strings.

✅ **Documentation** — examples, deployment recipes, architecture notes for things SPEC.md skips.

⚠️ **New MCP tools** — discuss in an issue first. We're keeping the surface tight; the bar is "Claude Code itself would have shipped this."

❌ **Marketing copy / brand assets** — those live in the sibling [huozi-marketing](https://github.com/Dachein/huozi-marketing) repo. PRs touching `(marketing)` paths or brand-specific landing copy go there, not here.

❌ **Account / billing surfaces** — these are Cloud-edition specific and live behind huozi.app's deploy. The OSS edition (Edge) is single-deployer by design.

## Architectural invariants

These are non-negotiable. PRs that break them get bounced.

1. **Edition divergence happens in exactly two files.** `src/lib/identity/cloud.ts` and `src/lib/identity/edge.ts`. Everywhere else uses `getIdentity()` and the `IdentityService` interface. If you find yourself wanting to scatter `if (isCloud()) {…}` checks through pages or routes, extend `IdentityService` instead.

2. **Supabase is gone.** Don't reintroduce `@supabase/*`. Identity lives in D1, behind the Worker.

3. **MCP is the API.** Don't add REST endpoints that mirror MCP tools. The single surface is `cloud.huozi.app/mcp` (Cloud) or your worker URL (Edge).

4. **Audit trail is immutable.** No force-push, no history rewrite, no admin override. "Undo" = new compensating commit. This is the architectural floor for compliance use cases; please don't propose a feature that requires breaking it.

5. **All writes go through `writeFilePrimitive`.** One audit path, one critical section, one bug-fix point. If you're adding a new write surface, it goes through the primitive.

See [`AGENTS.md`](AGENTS.md) for the long form, including the module map.

## Reporting bugs

[GitHub Issues](https://github.com/Dachein/huozi/issues). Please include:

- Steps to reproduce
- Edition (cloud / edge)
- Wrangler / Node versions if it's an Edge deploy issue
- Error message + relevant stack / curl output

For security-sensitive reports, see [SECURITY.md](SECURITY.md). Don't open public issues for those.

## Code of Conduct

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Short version: be civil, assume good faith, focus on the work.

## License

By submitting a PR, you agree your contribution is licensed under the project's [MIT License](LICENSE).
