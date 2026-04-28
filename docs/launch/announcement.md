# Launch announcement — huozi OSS

This file is **not user-facing** — it's a kit of copy-paste-ready announcement texts for when you flip the switch on huozi's OSS launch. Pick the channels you want, post in the recommended order. Time everything for **Tuesday-Thursday, 09:00 ET / 14:00 UTC** (peak HN / Twitter window).

Contents:

- [GitHub README banner](#github-readme-banner) — already shipped in `README.md`; included here as reference
- [Twitter / X thread](#twitterx-thread) — 5-tweet thread, English; Chinese variant below
- [Hacker News post](#hacker-news-show-hn) — `Show HN:` format
- [Lobste.rs](#lobste.rs) — short-form
- [Dev.to / r/selfhosted / r/programming](#dev.to--reddit) — long-form blog post
- [Email to friends / DMs](#friends--dms)

---

## GitHub README banner

(Already in `README.md` at the top.)

```
# huozi · 活字

**An Agent-native cloud drive.** Speaks the Claude Code tool dialect bit-for-bit, so any MCP-capable Agent — Claude Code, Cursor, Codex, your own — can mount it with zero adapters and use it as a working directory.
```

For a **launch-week pin issue** at github.com/Dachein/huozi/issues, paste this:

> **🎉 huozi is now open-source (MIT)**
>
> The Agent-native cloud drive that powers huozi.app is now MIT-licensed and self-hostable on your own Cloudflare account.
>
> - **Hosted (Cloud edition):** sign up at https://huozi.app — email OTP, no install
> - **Self-host (Edge edition):** `git clone github.com/Dachein/huozi && scripts/edge-deploy.sh`
> - **Connect any MCP Agent:** `claude mcp add huozi https://cloud.huozi.app/mcp` (or your edge URL)
>
> Architecture, deployment guide, and contribution invariants in [docs/](docs/) and [SPEC.md](packages/huozi-cloud/SPEC.md). PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Twitter / X thread

### English (5 tweets)

**Tweet 1 — the hook**
```
Just open-sourced huozi 🎉

It's an Agent-native cloud drive — your MCP-capable Agent (Claude Code, Cursor, Codex…) mounts it as a working directory and reads / edits / writes files with bit-for-bit Claude Code tool dialect.

Self-host on your CF account in one command.

🔗 github.com/Dachein/huozi
```

**Tweet 2 — what's actually inside**
```
Three layers, one product:

🪶 印 (MCP) — JSON-RPC at cloud.huozi.app/mcp, Claude Code dialect
📐 版 (templates) — 5 self-contained HTML scaffolds (deck/story/paper/mobile/web)
☁️ 盘 (cloud) — Cloudflare D1 + R2 + DOs; every write = a Git-style commit

"Agents write, humans read."
```

**Tweet 3 — why it matters**
```
The pitch: every Agent already trained on Claude Code's file tools (Read/Edit/Write/Glob/Grep) works on huozi *with zero adapter code*. Field names, error codes, even staleness behavior match 1:1.

Plug in your favorite Agent. It just works.
```

**Tweet 4 — self-host**
```
Edge edition runs on YOUR Cloudflare account. One Worker, one D1, one R2 bucket.

```bash
git clone github.com/Dachein/huozi && cd huozi
npm install
scripts/edge-deploy.sh    # provisions everything, mints first key, smoke-tests
```

Free tier covers most of it. MIT licensed.
```

**Tweet 5 — the ask**
```
Looking for early Agent-native workflows to learn from. If you're using Claude Code / Cursor / Codex for real research, code, or content work — try mounting huozi and ping me.

Issues / PRs at github.com/Dachein/huozi 🙏
```

### Chinese variant (3 推文,简化)

**推文 1**
```
活字 huozi 开源啦 🎉

一个 Agent 用的云端硬盘 —— 任何懂 Claude Code 工具方言的 Agent(Claude Code、Cursor、Codex…)挂载即用,Read / Edit / Write / Glob / Grep 一字不差。

自己部署一行命令搞定。MIT 开源。

🔗 github.com/Dachein/huozi
```

**推文 2**
```
三层结构:

印 — MCP(讲 Claude Code 方言)
版 — 5 套发布排版(deck / story / paper / mobile / web)
盘 — Cloudflare D1 + R2 + DO,每次写入是一条 Git 风格 commit

设计哲学:Agent 写,人读。
```

**推文 3**
```
最大的卖点:**Agent 零改造接入**。所有训过 Claude Code 文件工具的 Agent,在 huozi 上直接工作,不写一行 adapter 代码。

cloud.huozi.app(托管,邮箱 OTP) 或自部署 Edge —— 同一个产品,同一份代码。

试试看,issue 或 PR 来 github 找我。
```

---

## Hacker News (Show HN)

**Title** (under 80 chars, no hype):
```
Show HN: huozi – an Agent-native cloud drive that speaks Claude Code's dialect
```

**Body**:

```
Hey HN,

I built huozi (活字, "movable type") to scratch my own itch: I wanted my Agent
sessions to share state across machines. The breakthrough was realizing that if
the cloud workspace speaks the *exact* file-tool dialect Claude Code already
speaks (Read/Edit/Write/Glob/Grep, identical fields and error codes), every
existing CC-trained Agent works on it with zero adapter code.

So that's what huozi is — a cloud drive at cloud.huozi.app/mcp where Agents
mount and operate via standard MCP. Files live in Cloudflare R2, metadata in
D1, writes serialize through Durable Objects, and every Edit/Write produces a
Git-style commit so the audit trail is immutable.

Three modes you can start with:

  1. Hosted (Cloud): sign in at https://huozi.app, email OTP. Free for now.
  2. Self-host (Edge): `git clone github.com/Dachein/huozi && scripts/edge-deploy.sh`
     provisions a Worker + D1 + R2 in your CF account in ~60 seconds, mints
     your first admin key, smoke-tests the MCP surface. MIT licensed.
  3. Just curl the MCP endpoint: tools/list returns the 14 huozi_* tools,
     auth via Bearer api_key.

A few things I'd specifically love feedback on:

  - The Claude Code dialect alignment. Field-level mirror of cc-haha's
    FileEditTool / FileReadTool / GlobTool / GrepTool. If you spot drift,
    please open an issue.
  - The Edge bootstrap UX. Right now it's `scripts/edge-deploy.sh +
    paste-key into /workspace/connect`. I think this can be smoother —
    suggestions welcome.
  - The "Agents write, humans read" stance. The Web UI is intentionally
    read-only; all writes flow through MCP. Not everyone agrees with this.
    The rationale lives in packages/huozi-cloud/SPEC.md § 0.4.

Code: https://github.com/Dachein/huozi
SPEC: https://github.com/Dachein/huozi/blob/main/packages/huozi-cloud/SPEC.md
Edge guide: https://github.com/Dachein/huozi/blob/main/docs/edge-self-host.md

Happy to answer anything in the comments.
```

---

## Lobste.rs

**Tags:** `releases`, `cloud`, `ai`, `mit-license`

**Title:**
```
huozi: Agent-native cloud drive, Claude Code MCP dialect, self-hostable on Cloudflare
```

**URL:** `https://github.com/Dachein/huozi`

**Description:**
```
huozi is a cloud drive that exposes the same file-tool surface Claude Code
already speaks (Read/Edit/Write/Glob/Grep), so any MCP-capable Agent can
mount it as a workspace without adapter code. Cloudflare-native (Workers +
D1 + R2 + DOs); every write is a Git-style commit, immutable history.
Hosted at huozi.app, or self-host on your own CF account via one bash
script. MIT.
```

---

## Dev.to / Reddit (r/selfhosted, r/programming)

(Long-form, ~600 words. Adapt for each platform's tone.)

**Title:**
```
I open-sourced an Agent-native cloud drive (Cloudflare-based, MCP, MIT)
```

**Body:**

```
TL;DR: huozi is a cloud drive that any MCP-capable Agent (Claude Code,
Cursor, Codex…) can mount as a working directory. Today I'm open-sourcing
it under MIT, with a one-command self-host on your own Cloudflare account.

GitHub: github.com/Dachein/huozi
Live: huozi.app

---

## The problem

LLM Agents are getting really good at "do this on my filesystem." Read a
file, edit a few lines, glob across a project, grep for a symbol — Claude
Code's file-tool dialect has become the de-facto standard for this on the
local machine.

But local-machine state doesn't move with you. Switch laptops, switch IDEs,
switch which Agent you're running — the work-in-progress lives on one
machine. Agent + cloud-storage usually means rebuilding the file-tool
abstraction from scratch (custom REST endpoints, custom serialization,
custom permission model), and every Agent integration has to learn that
new surface.

## The bet

If you build a *cloud workspace* that speaks the *exact same dialect* Claude
Code already speaks, every existing CC-trained Agent works on it with zero
modification. Field names match, error codes match, defaults match, even
load-bearing error strings match.

So that's what huozi is. The MCP endpoint at `cloud.huozi.app/mcp` exposes
14 tools — `huozi_read`, `huozi_edit`, `huozi_write`, `huozi_glob`,
`huozi_grep`, plus a few cloud-native extras (`huozi_batch_edit`,
`huozi_history`, `huozi_share`, `huozi_template`, `huozi_whoami`). Every
field that Claude Code itself uses, we mirror.

## The architecture

It's all on Cloudflare's serverless stack:

- **R2**  — blob storage, addressed by Git-compatible SHA-1.
- **D1**  — files_current index, the commit chain, per-path audit, api_keys.
- **Durable Objects** — serialize the write critical section per workspace,
  persist per-session ReadFileState.
- **Workers** — the MCP endpoint, admin endpoints, public share resolver.

Every Edit/Write produces an audit-trail row. The architecture invariant is
that history is immutable: no force-push, no admin override, no rewrite.
"Undo" creates a compensating commit. This is non-negotiable for
compliance-grade use cases.

There's a SPEC at `packages/huozi-cloud/SPEC.md` that goes deep on the
storage model, the Claude Code dialect alignment, and the deviations we
chose explicitly.

## Self-hosting

The Edge edition is a single-deployer build. You run:

    git clone github.com/Dachein/huozi
    cd huozi
    npm install
    scripts/edge-deploy.sh

The script provisions a Worker, a D1 database, an R2 bucket, applies the
schema, mints your first admin api_key, and smoke-tests the MCP surface.
~60 seconds end to end, free tier covers it.

Then `set -a; source .huozi-edge.env; set +a; npm run dev` brings up the
Next.js front-end pointing at your fresh Worker. Open localhost:3000,
paste the api_key, you're in.

The full deployment guide (custom domains, secrets rotation, ops) is at
`docs/edge-self-host.md`.

## What I'd love feedback on

- **Claude Code dialect drift.** If your Agent already works against
  Claude Code's tools and *doesn't* work against huozi, please open an
  issue.
- **The Edge bootstrap UX.** The current paste-key flow is functional but
  rough. Ideas welcome.
- **The "Agents write, humans read" stance.** Web UI is intentionally
  read-only. The reasoning is in SPEC §0.4 — happy to discuss if you
  disagree.

## Repo

- Code (MIT): github.com/Dachein/huozi
- Marketing site: github.com/Dachein/huozi-marketing  (separate, brand stuff)
- Hosted: huozi.app
- MCP endpoint: cloud.huozi.app/mcp

PRs and issues very welcome.
```

---

## Friends / DMs

Short, personal — adjust to the recipient.

```
Hey [name],

I just open-sourced huozi — the cloud drive thing I've been working on
that lets Claude Code / Cursor / etc. share state across machines via
MCP. MIT, runs on Cloudflare's free tier if you want to self-host.

If you're doing any real Agent work I'd genuinely love your eyes on it:

  github.com/Dachein/huozi

Two-minute setup if you want to try the hosted version: huozi.app.
For self-host: scripts/edge-deploy.sh does the whole thing.

Ping me with whatever breaks. 🙏
```

---

## Posting order (recommendation)

If you have time on launch day, post in this order with ~30 minute gaps:

1. **GitHub repo flip to public + pin the launch issue** — done, this is now done.
2. **Twitter thread** — 09:00 ET. Pin the first tweet to your profile for a week.
3. **Hacker News Show HN** — 09:30 ET (Tue/Wed/Thu best). Don't beg for upvotes; the post stands on its own.
4. **Lobste.rs** — 10:00 ET, after HN has any traction.
5. **Dev.to long-form post** — 10:30 ET. Cross-post to r/selfhosted later in the week (different audience, doesn't compete).
6. **Friend DMs** — 11:00 ET. After the post is live so you can link to it.

If HN gets traction (front page or top 30), expect 3-5 days of issue / PR / question traffic. Block off 1-2 hours/day to triage.

Good luck. 🚀
