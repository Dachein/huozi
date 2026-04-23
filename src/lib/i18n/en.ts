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

  "start.fastest.title": "Fastest · one command",
  "start.fastest.badge": "Node ≥ 18",
  "start.fastest.desc1":
    "Runs the same OAuth device flow as below. Auto-detects your client (Claude Code, Cursor, OpenClaw), opens a browser for authorization, and writes the MCP config into the right place.",
  "start.fastest.desc2Before": "Tell your Agent",
  "start.fastest.tellAgent": "run npx huozi-mcp and help me authorize",
  "start.fastest.desc2After": "— the Agent does the rest.",

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
    "Simplest: run this in any terminal. The CLI opens your browser for a one-click authorize, writes Claude Code's user-scope MCP config, and any fresh shell picks it up.",
  "start.picker.content.claude-code.skill.body":
    "Drop the canonical SKILL.md into Claude Code's skills directory. The Agent loads it on demand and learns when to reach for each huozi_* tool.",
  "start.picker.content.claude-code.skill.note":
    "Skill adds the *know-how*, not the tools themselves. If you haven't set up MCP yet, do that first (MCP tab above).",

  "start.picker.content.cursor.mcp.body":
    "Simplest: open Cursor's integrated terminal (⌘J) and run this. It writes ~/.cursor/mcp.json; Reload Window (⌘⇧P) to pick it up.",
  "start.picker.content.cursor.rules.body":
    "Cursor's equivalent of a Skill is a Rule — a Markdown file in .cursor/rules/ that the Agent loads for context. Same source file as the other clients.",
  "start.picker.content.cursor.rules.note":
    "This installs project-level. For user-wide rules, drop the same file into ~/.cursor/rules/ instead. Tool access still goes through MCP.",

  "start.picker.content.openclaw.mcp.body":
    "Simplest: run this. The CLI writes ~/.openclaw/openclaw.json under mcp.servers.huozi (transport: streamable-http); restart OpenClaw to pick it up.",
  "start.picker.content.openclaw.skill.body":
    "OpenClaw has a native skill system. Drop the file manually today; once we publish to ClawHub you'll run `openclaw skills install huozi/mcp` instead.",
  "start.picker.content.openclaw.skill.note":
    "ClawHub publication is pending. Same rule as the other skill flows: the skill adds guidance; tool calls still go through the MCP setup.",

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
} as const;
