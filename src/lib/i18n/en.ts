export const en = {
  // Nav
  "nav.home": "huozi.app",
  "nav.getStarted": "Get Started",
  "nav.signIn": "Sign in",
  "nav.workspace": "Workspace",
  "nav.signUp": "Sign up",
  "nav.docs": "Docs",
  "nav.cloud": "Cloud",
  "nav.edge": "Edge",
  "nav.blog": "Blog",

  // Home hero
  "home.title1": "Words carry the Way",
  "home.title2.highlight": "Huozi",
  "home.title2.rest": ", the vessel",
  "home.divider": "文",
  "home.subtitle1": "An Agent-native cloud drive.",
  "home.subtitle2": "Speaks Claude Code's file-tool dialect. Mount from any MCP client.",
  "home.cta.start": "Get Started",
  "home.cta.signIn": "Sign in",
  "home.cta.preview": "Preview",

  // Home features
  "home.feat1.icon": "云",
  "home.feat1.title": "Cloud drive for Agents",
  "home.feat1.desc": "Mount a workspace over MCP. Every Read / Edit / Write / Glob / Grep your Agent already knows just works — no new tools to learn.",
  "home.feat2.icon": "器",
  "home.feat2.title": "Bit-exact Claude Code",
  "home.feat2.desc": "Same schemas, same error codes, same session cache. Claude Code, Cursor, Desktop, or raw HTTP — all interchangeable.",
  "home.feat3.icon": "时",
  "home.feat3.title": "Live sync + history",
  "home.feat3.desc": "Every commit broadcasts in ~100 ms to the Web UI. Every file has a full commit log. Multi-Agent atomic writes.",

  // Home · two-product positioning
  "home.products.label": "Two editions",
  "home.products.footnote": "Same MCP surface, same Agent dialect. Choose where the bytes live.",

  "home.cloud.tagline": "Hosted on huozi.app. Sign in with email, claim a workspace, connect Claude Code in 60 seconds. Built for teams and multi-Agent collaboration.",
  "home.cloud.bullet1": "Email login, multi-user, per-Agent API keys",
  "home.cloud.bullet2": "Live WebSocket sync to the Web UI",
  "home.cloud.bullet3": "Public share URLs with optional 6-digit passcodes",
  "home.cloud.cta": "Explore Cloud",

  "home.edge.tagline": "Self-host the same drive on your own Cloudflare or Vercel account. One deployer, one workspace, no Supabase. MIT licensed.",
  "home.edge.bullet1": "Zero external dependencies beyond the edge runtime",
  "home.edge.bullet2": "Paste-key auth — no email, no signup",
  "home.edge.bullet3": "Deploy in one click, bring your own domain",
  "home.edge.cta": "Explore Edge",

  // Home · shared features section
  "home.shared.label": "Shared across both",

  // Home CTA band
  "home.install.title": "Get started in 60 seconds",

  // Home code
  "home.code.title": "Mount it, write a file",

  // /cloud hero
  "cloud.hero.tagline1": "An Agent-native hard drive.",
  "cloud.hero.tagline2": "Speaks Claude Code's file-tool dialect. Bring your own Agent. Agents write, humans read.",
  "cloud.cta.signIn": "Sign in",
  "cloud.cta.open": "Open my workspace",
  "cloud.cta.connectAgent": "Connect an Agent",

  // /cloud — full page
  "cloud.meta.title": "huozi Cloud — An Agent-Native Hard Drive",
  "cloud.meta.description":
    "A cloud workspace for Agents. Speaks Claude Code's file-tool dialect. Bring your own Agent — Claude Code, Cursor, Codex, or your own — and mount it anywhere.",

  "cloud.status.shipping": "Shipping",
  "cloud.status.coming": "Coming soon",
  "cloud.status.preview": "Preview",

  "cloud.metaphor.title": "The external hard drive, for Agents",
  "cloud.metaphor.body1":
    "A USB drive works anywhere because it speaks one standard interface. You plug it in, and any computer reads it. Any OS, any era.",
  "cloud.metaphor.body2":
    "We wanted the same for Agents. huozi Cloud is a mountable cloud workspace that speaks the exact file-tool dialect Claude Code uses today — which means every Agent already trained on that dialect (Claude Code itself, Cursor, Codex, custom ones) can work in it with zero modifications.",

  "cloud.compare.physical": "Physical hard drive",
  "cloud.compare.huozi": "huozi Cloud",
  "cloud.compare.r1a": "USB / SATA protocol",
  "cloud.compare.r1b": "MCP + Claude Code tool dialect",
  "cloud.compare.r2a": "Drive letter / mount",
  "cloud.compare.r2b": "Workspace URI",
  "cloud.compare.r3a": "Directory permissions",
  "cloud.compare.r3b": "Scope (per-API-key prefix)",
  "cloud.compare.r4a": "Filesystem journal",
  "cloud.compare.r4b": "Git-backed commit log",
  "cloud.compare.r5a": "Mounted on any machine",
  "cloud.compare.r5b": "Accessed by any Agent",

  "cloud.shipped.title": "What's alive today",
  "cloud.shipped.intro1": "Seven MCP tools, exposed at ",
  "cloud.shipped.intro2":
    ". Five are bit-exact mirrors of Claude Code; two are cloud-native extensions.",
  "cloud.tools.ccMirror": "CC-mirror",
  "cloud.tools.extension": "huozi-ext",
  "cloud.tools.read.desc":
    "Line-paged read, cat -n output, file_unchanged cache, base64 or signed-URL binary return.",
  "cloud.tools.edit.desc":
    "Exact string replacement. Read-before-Edit enforced. blob_sha staleness. structuredPatch output.",
  "cloud.tools.write.desc":
    "Create or overwrite. LF-forced. create/update distinction on result.",
  "cloud.tools.glob.desc":
    "Glob pattern matching. mtime-desc ordering. 100-file truncation.",
  "cloud.tools.grep.desc":
    "Regex search. content / files_with_matches / count modes. -A/-B/-C context. type filter.",
  "cloud.tools.batch.desc":
    "Atomic N-file edit. all_or_nothing + single commit_sha. Per-file results.",
  "cloud.tools.history.desc":
    "Query a file's commit trail. operation classification (create / edit / write / batch). Pagination.",

  "cloud.underHood.title": "Under the hood",
  "cloud.underHood.b1.label": "Cloudflare Workers",
  "cloud.underHood.b1.desc":
    " as the serverless MCP endpoint (JSON-RPC 2.0 over HTTP).",
  "cloud.underHood.b2.label": "R2",
  "cloud.underHood.b2.desc":
    " stores blobs addressed by Git-compatible SHA-1 (same algorithm as real Git's blob <size>\\0<content>).",
  "cloud.underHood.b3.label": "D1",
  "cloud.underHood.b3.desc":
    " holds files_current index, commit chain, per-path audit rows, and API keys.",
  "cloud.underHood.b4.label": "Durable Objects",
  "cloud.underHood.b4.desc":
    " serialize the write-side critical section (one DO per workspace) and persist per-session ReadFileState across requests (one DO per {workspace, principal}).",
  "cloud.underHood.b5.label": "Bearer auth",
  "cloud.underHood.b5.desc":
    ": a token hashes to an api_keys row; that row binds the call to a workspace, principal, and optional scope prefix.",

  "cloud.principles.title": "Design principles",
  "cloud.principles.1.title": "CC-dialect bit-exact",
  "cloud.principles.1.body":
    "Every Agent trained on Claude Code's tool surface should work here with zero code changes. Field names, defaults, error codes, even load-bearing error strings are preserved. Wherever we deviate from CC — we do it with a reason on the record.",
  "cloud.principles.2.title": "Git is the truth; everything else is cache",
  "cloud.principles.2.body":
    "The commit log is the source of ground truth. D1 indices, Durable Object state, in-Worker caches — all are reconstructible from the Git history. This simplifies recovery, debugging, and backup.",
  "cloud.principles.3.title": "Workspace = mount point",
  "cloud.principles.3.body":
    "No shared global namespace. A workspace is a closed box with its own ACL, its own history, its own backup boundary. Users create workspaces; Agents live within one.",
  "cloud.principles.4.title": "Revert-only, forever",
  "cloud.principles.4.body":
    "No force-push. No history rewrite. No admin override. Every 'undo' creates a new commit that cancels the old one. The audit trail is immutable. This is non-negotiable for compliance-grade use cases.",
  "cloud.principles.5.title": "All-or-nothing batches",
  "cloud.principles.5.body":
    "Writing 10 files as one logical change should produce one commit, not ten. huozi_batch_edit validates staleness across the whole batch before writing anything — partial failures abort the entire commit.",
  "cloud.principles.6.title": "Strict matching, no whitespace fallback",
  "cloud.principles.6.body":
    "Claude Code's Edit tool fails hard when old_string doesn't match exactly. The official MCP filesystem server, by contrast, silently falls back to whitespace-tolerant matching — and quietly edits the wrong location under concurrent writes. We side with CC. Strict fail, explicit re-read.",

  "cloud.roadmap.title": "On the roadmap",
  "cloud.roadmap.1.label": "Scope enforcement",
  "cloud.roadmap.1.desc":
    "API-key-bound subdirectory sandboxing. An Agent scoped to funds/fund-A/ physically cannot read funds/fund-B/.",
  "cloud.roadmap.2.label": "Secret scanner",
  "cloud.roadmap.2.desc":
    "Inline scan at write time. ~20 built-in rules (AWS / OpenAI / GitHub / JWT / private keys) + placeholder allowlist.",
  "cloud.roadmap.3.label": "Production-grade Grep",
  "cloud.roadmap.3.desc":
    "D1 FTS5 trigram index for fast regex; stream-scan fallback for multiline / complex patterns; 5 MB / 50 MB / 10 s safety caps.",
  "cloud.roadmap.4.label": "Real Git commit hashes",
  "cloud.roadmap.4.desc":
    "isomorphic-git on Cloudflare Worker. Commit SHA equals what local Git would produce.",
  "cloud.roadmap.5.label": "Notebook editing",
  "cloud.roadmap.5.desc":
    "huozi_notebook_edit tool for .ipynb cells. Until then, notebooks are read-only.",
  "cloud.roadmap.6.label": "Revert tool",
  "cloud.roadmap.6.desc":
    "huozi_revert by commit_sha or message_uuid. New commit cancels old; history preserved.",
  "cloud.roadmap.7.label": "Multi-workspace search",
  "cloud.roadmap.7.desc":
    "Organization concept layered above workspaces. Lets a fund manager search across all their funds at once.",
  "cloud.roadmap.8.label": "Live subscribers",
  "cloud.roadmap.8.desc":
    "WebSocket push from WorkspaceDO. When Agent A commits, Agent B gets a changed-files notification in real time.",

  "cloud.try.title": "Try it",
  "cloud.try.intro":
    "Private beta. Get in touch for a Bearer token bound to your workspace. Once you have one, pick your Agent:",
  "cloud.try.h.claudeCode": "Claude Code",
  "cloud.try.h.claudeDesktop": "Claude Desktop",
  "cloud.try.h.rawHttp": "Raw HTTP",

  "cloud.who.title": "Who it's for",
  "cloud.who.1.title": "Agents doing real work",
  "cloud.who.1.body":
    "Anything you'd trust with Read/Edit/Write on your laptop — research agents, code agents, report writers — can now do it across machines, across sessions, with every change audited.",
  "cloud.who.2.title": "Teams running many Agents",
  "cloud.who.2.body":
    "One workspace, multiple Agents, multiple humans. The staleness model keeps concurrent writers honest. The commit log shows who did what.",
  "cloud.who.3.title": "Compliance-sensitive workflows",
  "cloud.who.3.body":
    "Financial research, legal memos, regulated documentation. Immutable history, per-file audit, optional subdirectory scoping for analyst-level access.",
  "cloud.who.4.title": "Multi-device work",
  "cloud.who.4.body":
    "Start on your laptop. Continue on your iPad. Review on your phone. Your Agent's state — what it read, what it edited — follows you.",

  "cloud.footer.tagline": "A workspace for Agents. Built on Cloudflare.",
  "cloud.footer.publish": "Publish (MD/HTML)",

  // /edge — full page
  "edge.meta.title": "huozi Edge — Self-host the Agent drive",
  "edge.meta.description":
    "Open-source, single-deployer edition of huozi. Deploy in one click to Cloudflare or Vercel. No Supabase, no accounts, MIT licensed.",

  "edge.badge.openSource": "Open Source · MIT",
  "edge.hero.tagline1": "The same Agent drive, on your own infrastructure.",
  "edge.hero.tagline2":
    "No Supabase. No email login. One deployer, one workspace, one domain you own.",
  "edge.cta.deployCF": "Deploy to Cloudflare",
  "edge.cta.deployVercel": "Deploy to Vercel",
  "edge.cta.github": "View on GitHub",

  "edge.same.title": "Same drive, yours to run",
  "edge.same.body1":
    "Edge ships the exact same MCP surface, Claude Code compatibility, live sync, commit history, and public share URLs as Cloud — just without the hosted account system. You hold HUOZI_ADMIN_SECRET, you deploy to your own Cloudflare or Vercel, and anyone you hand a pasted API key to can connect an Agent.",
  "edge.same.body2":
    "Because both editions are one codebase guarded by HUOZI_EDITION, every bug fix and feature lands in both at the same time.",

  "edge.compare.title": "Cloud vs Edge",
  "edge.compare.col.cloud": "Cloud",
  "edge.compare.col.edge": "Edge",
  "edge.compare.r1.label": "Who operates it",
  "edge.compare.r1.cloud": "huozi.app",
  "edge.compare.r1.edge": "You",
  "edge.compare.r2.label": "Auth",
  "edge.compare.r2.cloud": "Email OTP (Supabase)",
  "edge.compare.r2.edge": "Admin secret + paste-key",
  "edge.compare.r3.label": "Users per instance",
  "edge.compare.r3.cloud": "Many",
  "edge.compare.r3.edge": "One deployer",
  "edge.compare.r4.label": "Workspaces per user",
  "edge.compare.r4.cloud": "One (expandable)",
  "edge.compare.r4.edge": "One fixed workspace",
  "edge.compare.r5.label": "Cost",
  "edge.compare.r5.cloud": "Pay huozi.app",
  "edge.compare.r5.edge": "Pay Cloudflare / Vercel (often $0)",
  "edge.compare.r6.label": "License",
  "edge.compare.r6.cloud": "Proprietary service",
  "edge.compare.r6.edge": "MIT",

  "edge.bootstrap.title": "Bootstrap in 3 steps",
  "edge.bootstrap.s1.title": "Deploy + set secrets",
  "edge.bootstrap.s1.body":
    "One-click deploy, then set a strong HUOZI_ADMIN_SECRET and HUOZI_EDITION=edge.",
  "edge.bootstrap.s2.title": "Mint the admin key",
  "edge.bootstrap.s2.body":
    "Call the worker's admin endpoint once to mint your first API key. You'll paste it into the web UI in step 3.",
  "edge.bootstrap.s3.title": "Paste key, start writing",
  "edge.bootstrap.s3.body":
    "Visit https://<your-domain>/connect, paste the returned hz_… key, and you're in. Connect Claude Code / Cursor / Desktop from the Keys page just like on Cloud.",

  "edge.footer.repo": "GitHub repo",
  "edge.footer.docs": "MCP reference",
  "edge.footer.compare": "Compare with Cloud",

  // Marketing footer — column groupings
  "footer.tagline": "An Agent-native cloud drive.",
  "footer.col.product": "Product",
  "footer.col.resources": "Resources",
  "footer.col.source": "Source",
  "footer.legal": "MIT licensed · Built on Cloudflare",
  "nav.language": "Language",

  // Workspace · Recent panel
  "recent.title": "Recent",
  "recent.op.new": "new",
  "recent.op.edited": "edited",
  "recent.op.deleted": "deleted",

  // Workspace · sidebar title (the clickable "home" link)
  "ws.shell.title": "Workspace",
  "ws.shell.subtitle": "Manage · Search",
  "ws.stats.files": "Files",
  "ws.stats.recent": "Recent edits",
  "ws.stats.agents": "Agents",
  "ws.search.title": "Search the workspace",
  "ws.search.placeholder": "Type a file name or path…",
  "ws.search.noMatch": "No files match.",

  // Publish / share dialog — TTL picker
  "share.expiry.label": "Link expires in",
  "share.expiry.hint": "Expired links return not found. Choose 'Never' for a permanent URL.",
  "share.expiry.30m": "30 min",
  "share.expiry.6h": "6 hours",
  "share.expiry.24h": "24 hours",
  "share.expiry.1mo": "1 month",
  "share.expiry.never": "Never",
  "share.expiry.expiresAt": "Expires {when}",
  "share.expiry.permanent": "Never expires",

  // /workspace — empty-state status + onboarding
  "ws.status.title": "Your workspace",
  "ws.status.connectedAgents": "Connected Agents",
  "ws.status.browserSession": "Browser session",
  "ws.status.never": "—",
  "ws.status.now": "just now",
  "ws.status.activeKeys": "active keys",
  "ws.status.lastActivity": "last activity",
  "ws.status.manage": "Manage",
  "ws.status.connectNew": "New Connection",

  // Key-expiry labels (sliding-window TTL).  {n} is interpolated.
  "ws.expiry.never": "never expires",
  "ws.expiry.expired": "expired",
  "ws.expiry.inDays": "expires in {n} days",
  "ws.expiry.inHours": "expires in {n} hours",
  "ws.expiry.inMinutes": "expires in {n} min",
  "ws.expiry.hint": "Sliding window — each successful request resets the timer.",

  // TTL preset labels
  "ws.ttl.1d": "1 day",
  "ws.ttl.7d": "7 days",
  "ws.ttl.30d": "30 days",
  "ws.ttl.180d": "180 days",
  "ws.ttl.never": "Never",

  // Per-key actions
  "ws.action.copy": "Copy",
  "ws.action.copied": "Copied",
  "ws.action.revoke": "Revoke",
  "ws.action.revoking": "Revoking…",
  "ws.action.confirmRevoke": "Revoke \"{label}\"? Agents using this key will stop working immediately. This cannot be undone.",

  // /workspace — filled-state intro + help cards + footer
  "ws.filled.intro": "Pick a file from the tree to view it. Markdown and HTML render the same way they appear on huozi.app published pages. Agents with access to this workspace can edit files at any time — open a file and watch the history tab.",
  "ws.filled.browse.title": "Browse",
  "ws.filled.browse.desc": "Use the tree (☰ on mobile). Folders remember their expand state.",
  "ws.filled.history.title": "History",
  "ws.filled.history.desc": "Every file has a History link showing every commit that touched it.",
  "ws.filled.search.title": "Search",
  "ws.filled.search.desc": "Filter files by name using the search box above the tree.",
  "ws.filled.footer.about": "About huozi Cloud",
  "ws.filled.footer.apiDocs": "API docs",


  "ws.onboard.heading": "Let's make something",
  "ws.onboard.subheading": "Copy a scenario below, paste into your Agent, and watch the first file land here in real time. Pick the format that fits what you want to make — the Agent handles the rest.",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "A weekly review",
  "ws.onboard.md.scenario": "A free-form note — good for writing, thinking, logs. Rendered as Markdown on the viewer.",
  "ws.onboard.md.prompt": "Write me a weekly review for this week: three things I shipped, two things that stalled, and one idea I want to chase next week. Put it in reviews/2026-w17.md with Markdown headings and short bullets.",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "A data table",
  "ws.onboard.csv.scenario": "Structured tabular data. Rendered as a sortable table; easy to extend row by row.",
  "ws.onboard.csv.prompt": "Build me a CSV at data/ai-milestones-2025.csv tracking 12 notable AI company milestones from the past year. Columns: date, company, event, impact_note. Sort chronologically.",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "A visual page",
  "ws.onboard.html.scenario": "Rich rendering — illustrations, charts, a cover page. Rendered as HTML with sanitization.",
  "ws.onboard.html.prompt": "Create a beautiful HTML cover page at cover/movable-type.html about 活字印刷术 (movable type printing) with a subtle warm-beige gradient background, serif typography, and a short paragraph explaining why it mattered. Include a simple Echarts timeline of key inventions.",

  "ws.onboard.copy": "Copy prompt",
  "ws.onboard.copied": "Copied",

  // Home open source
  "home.oss.title": "Open Source",
  "home.oss.desc": "Self-host your own Markdown & HTML publishing. Zero database, just KV. MIT licensed.",
  "home.oss.deployCF": "Deploy to Cloudflare",
  "home.oss.deployVercel": "Deploy to Vercel",
  "home.oss.soon": "soon",

  // Home footer
  "home.footer": "Huozi — Movable type for the AI era",

  // Auth
  "auth.login.title": "Sign in to Huozi",
  "auth.login.subtitle": "Enter your email. No password needed.",
  "auth.login.checkEmail": "Check your email for the verification code.",
  "auth.login.email": "Email",
  "auth.login.code": "Verification code",
  "auth.login.sendCode": "Send verification code",
  "auth.login.sending": "Sending...",
  "auth.login.verify": "Verify",
  "auth.login.verifying": "Verifying...",
  "auth.login.changeEmail": "Use a different email",
  "auth.login.newHere": "New here?",
  "auth.login.guide": "Get Started guide",

  // Dashboard

  // Dashboard new page

  // Settings
  "settings.title": "Settings",
  "settings.subtitle": "Manage your workspace and API keys.",
  "settings.workspace": "Workspace",
  "settings.workspaceDesc": "Your workspace URL prefix.",
  "settings.apiKeys": "API Keys",
  "settings.apiKeysDesc": "Use API keys to publish pages from AI agents or scripts.",
  "settings.apiUsage": "API Usage",
  "settings.apiUsageDesc": "Quick example to publish a page:",
  "settings.getStarted": "Get Started",
  "settings.getStartedDesc": "Learn how to set up Claude Code MCP, OpenClaw, or use the conversational API.",
  "settings.viewGuide": "View Get Started guide",

  // Workspace setup
  "workspace.setup.title": "Set up your workspace",
  "workspace.setup.desc": "Choose a unique slug for your workspace. This will be part of your page URLs.",
  "workspace.setup.label": "Workspace slug",
  "workspace.setup.placeholder": "your-name",
  "workspace.setup.submit": "Create workspace",
  "workspace.setup.loading": "Creating...",

  // API Key manager
  "apiKey.created": "API key created! Copy it now — it won't be shown again.",
  "apiKey.copy": "Copy",
  "apiKey.dismiss": "Dismiss",
  "apiKey.nameLabel": "Key name",
  "apiKey.namePlaceholder": "e.g., Claude Agent",
  "apiKey.create": "Create key",
  "apiKey.creating": "Creating...",
  "apiKey.confirmRevoke": "Revoke this API key? This cannot be undone.",
  "apiKey.neverUsed": "Never used",
  "apiKey.lastUsed": "Last used",
  "apiKey.revoke": "Revoke",
  "apiKey.empty": "No API keys yet. Create one to start publishing via API.",

  // Conversational install
  "install.copyButton": "Copy to Install",
  "install.copied": "Copied!",

  // /start — install guide
  "start.meta.title": "Get started — huozi Cloud",
  "start.meta.description":
    "One command or one prompt. Give it to any Agent. Click one link. Done.",
  "start.hero.title": "Get started",
  "start.hero.subtitle":
    "One prompt, one click, done. Works with any MCP-capable Agent.",

  "start.conversation.title": "Tell your Agent",
  "start.conversation.badge": "chat · ~60 seconds",
  "start.conversation.desc":
    "Paste this into any MCP-capable Agent (Claude Code, Cursor, OpenClaw, or anything with web access). It reads the install protocol from this page, then asks you 2–3 questions in chat — sign up, browser login, or paste an existing token. No terminal required.",

  "start.terminal.title": "Or, from a terminal",
  "start.terminal.badge": "Node ≥ 18",
  "start.terminal.desc":
    "Dev-friendly alternative. Runs the same OAuth flow interactively and writes the MCP config. Meant for humans at a shell — the CLI refuses non-TTY input, so Agents should drive the HTTP state machine instead.",

  "start.prompt.title": "1 · Or, copy this prompt into your Agent",
  "start.prompt.badge": "Agent-readable",
  "start.prompt.desc":
    "Works in Claude Code, Cursor, OpenClaw, or any Agent that can make HTTP calls. The Agent reads the steps and executes them; your only job is to click one Authorize link in the browser.",
  "start.prompt.langNote":
    "(Kept in English — every LLM reads it natively.)",

  "start.authorize.title": "2 · The Agent prints a link — click Authorize",
  "start.authorize.example":
    "→ Open https://huozi.app/device?code=ABCD-1234 and click Authorize.",
  "start.authorize.desc":
    "Open the link in any browser. If you're not signed in to huozi.app, do a one-time email OTP first. Then you'll see which Agent is asking, which workspace it will access, and a single Authorize button. Click it. Close the tab.",

  "start.done.title": "3 · Agent auto-connects · you're done",
  "start.done.descBefore":
    "Within a few seconds the Agent catches the key, registers the MCP server, and reports",
  "start.done.connectedPhrase": "✓ Connected to workspace …",
  "start.done.descAfter":
    ". From now on every Agent request can read and write in your huozi workspace.",
  "start.done.manageBefore":
    "Manage connections, browse files, and revoke at any time from",
  "start.done.manageAfter": ".",

  "start.manual.summary": "No Agent? Do it by hand",
  "start.manual.desc":
    "The same flow is plain HTTP — you can run the curl commands yourself:",
  "start.manual.noteBefore":
    "Already signed in at huozi.app? You can also mint a ready-made config snippet for Cursor / OpenClaw directly at",
  "start.manual.noteAfter": ".",

  "start.footer.mcp.title": "MCP reference",
  "start.footer.mcp.desc":
    "All huozi_* tools, JSON-RPC shape, real-time events.",
  "start.footer.cloud.title": "About Cloud",
  "start.footer.cloud.desc":
    "Why Agents need a shared drive with commit history.",
  "start.footer.edge.title": "Self-host (Edge)",
  "start.footer.edge.desc":
    "Same drive, deployed on your own Cloudflare / Vercel. MIT.",

  // InstallPicker on /start
  "start.picker.title": "Install for your agent",
  "start.picker.subtitle":
    "Pick your client — we'll show exactly what applies. MCP adds the tools; Skill / Rules adds the know-how. Most clients want both.",
  "start.picker.generic.name": "Generic / Other",

  "start.picker.content.claude-code.mcp.body":
    "Claude Code's canonical way to extend is MCP — the tool descriptions carry everything the Agent needs. Run this in any terminal; the CLI opens your browser for a one-click authorize, writes Claude Code's user-scope MCP config, and any fresh shell picks it up.",

  "start.picker.content.cursor.mcp.body":
    "Cursor ships native remote-MCP support. Open Cursor's integrated terminal (⌘J) and run this — it writes ~/.cursor/mcp.json; Reload Window (⌘⇧P) to pick it up.",

  "start.picker.content.openclaw.mcp.body":
    "Run this and OpenClaw's MCP layer is configured. The CLI writes ~/.openclaw/openclaw.json under mcp.servers.huozi (transport: streamable-http); restart OpenClaw to pick it up.",
  "start.picker.content.openclaw.skill.body":
    "OpenClaw's native ecosystem is ClawHub — Skill is a first-class entry point here. Run this; the CLI pulls huozi/mcp from ClawHub into ~/.openclaw/skills/ and you restart OpenClaw to pick it up.",
  "start.picker.content.openclaw.skill.note":
    "We only surface Skill for OpenClaw because that's where it's the native idiom — Claude Code and Cursor users stick with MCP.",

  "start.picker.content.generic.mcp.body":
    "Any Agent that can make HTTP calls. Copy this prompt into the Agent — it reads the steps, runs the curl device flow, and writes its own MCP config. Your only job: click one Authorize link in the browser.",
  "start.picker.content.generic.mcp.note":
    "Kept in English — LLMs read English natively, and translating the steps risks subtle drift. Works for any stdio / HTTP MCP client.",

  // Connect-Agent page
  "connect.back": "← Workspace",
  "connect.title": "Connect an Agent",
  "connect.desc":
    "Three steps: pick your agent, paste one snippet, make a request. We'll detect the first call and confirm the connection. Each agent gets its own key — revoke any time without affecting the others.",

  "connect.step1": "1 · Pick your agent",
  "connect.step2": "2 · Paste this into {title}",
  "connect.step3": "3 · Confirm connection",

  "connect.agent.claude-code.tagline": "Terminal, one command.",
  "connect.agent.claude-code.blurb":
    "Run this in any shell. Claude Code registers huozi as a remote MCP server — available in every project.",
  "connect.agent.cursor.tagline": "Drop into mcp.json.",
  "connect.agent.cursor.blurb":
    "Add this block to ~/.cursor/mcp.json (or the project-level .cursor/mcp.json), then reload Cursor.",
  "connect.agent.openclaw.tagline": "Edit openclaw.json.",
  "connect.agent.openclaw.blurb":
    "Add this block to ~/.openclaw/openclaw.json under mcp.servers. Restart OpenClaw to pick it up.",

  "connect.label.title": "Label this key (shown in Connected Agents)",
  "connect.generate": "Generate key for {title}",
  "connect.generating": "Generating…",
  "connect.copy": "Copy",
  "connect.copied": "Copied",
  "connect.generateFirst": "Generate a key first",

  "connect.rawKey.show": "Show raw API key",
  "connect.rawKey.note":
    "We never store the plaintext — copy it now. Lost keys can be revoked and replaced from the workspace page.",

  "connect.waiting.title": "Waiting for {title} to connect…",
  "connect.waiting.desc":
    "Paste the snippet above, then make any request — we'll detect the first call automatically.",

  "connect.done.title": "{title} connected",
  "connect.done.detected": "First tool call detected at",
  "connect.done.note":
    "You can close this page — the agent will keep using the key until you revoke it.",
  "connect.done.goto": "Go to workspace →",
  "connect.done.another": "Connect another agent",

  "connect.footer.back": "← Back to workspace",
  "connect.footer.start": "Let the agent install itself (OAuth device flow) →",
  "connect.footer.docs": "API docs",

  "connect.terminal.title": "Prefer the terminal? One command:",
  "connect.terminal.desc":
    "Works in Claude Code, Cursor, OpenClaw — or any agent with a shell. Runs the same OAuth flow and writes the MCP config for you.",

  // CSV · row detail
  "csv.rowDetail.title": "Row details",
  "csv.rowDetail.open": "Open row details",
  "csv.rowDetail.close": "Close",
  "csv.rowDetail.rowOf": "Row {n} of {total}",
  "csv.rowDetail.empty": "—",
} as const;
