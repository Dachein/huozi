export const en = {
  // Nav

  // Home hero

  // Home features

  // Home · two-product positioning



  // Home · shared features section

  // Home · three perspectives (印 / 版 / 盘). Tab pills swap the cards
  // and code block below in-place — no navigation.

  // 印 · MCP — type as interface

  // 版 · STYLE — bytes that render gracefully

  // 盘 · CLOUD — bytes in the cloud, shared across Agents


  // Home CTA band

  // Home code

  // /cloud hero

  // /cloud — full page











  // /edge — full page






  // Marketing footer — column groupings

  // Workspace · Recent panel
  "recent.title": "Recent",
  "recent.op.new": "new",
  "recent.op.edited": "edited",
  "recent.op.deleted": "deleted",
  "recent.folderCreated": "folder created",
  "recent.filter.view.label": "Filter",
  "recent.filter.view.works": "Works",
  "recent.filter.view.assets": "Assets",

  // Workspace · file view error / hint
  "view.error.label": "Error",
  "view.error.aclDenied.title": "This folder is private",
  "view.error.aclDenied.body": "You don't have access to this path. Ask a member to invite you, or pick another file from the sidebar.",
  "view.readOnly.title": "Need to modify this file?",
  "view.readOnly.body": "Ask your connected Agent (Claude Code, Cursor, Claude Desktop, or any MCP client). huozi Cloud's Web UI is read-only by design — all writes flow through a single audited commit path via MCP.",

  // Workspace · sidebar title (the clickable "home" link)
  "ws.shell.title": "Workspace",
  "ws.shell.subtitle": "Manage · Search",
  "ws.stats.files": "Files",
  "ws.stats.recent": "Recent edits",
  "ws.stats.agents": "Agents",
  "ws.search.title": "Search the workspace",
  "ws.search.placeholder": "Search file names or file contents…",
  "ws.search.noMatch": "No files match.",
  "ws.search.fileMatches": "Filename matches",
  "ws.search.contentMatches": "Content matches",
  "ws.search.searching": "Searching contents…",
  "ws.search.noContentMatch": "No content matches.",
  "ws.search.truncated": "Results truncated — try a more specific term.",
  "ws.search.error": "Search failed, please try again.",

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
  "ws.status.collapse": "Collapse",

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

  // Home footer

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

  // Select-workspace page (multi-membership users at login)
  "auth.selectWorkspace.title": "Choose a workspace",
  "auth.selectWorkspace.subtitle":
    "You belong to {count} workspaces. Pick one to enter.",

  // /authorize — OAuth consent
  "auth.authorize.error.title": "Cannot authorize",
  "auth.authorize.error.missingSession.title": "Missing session",
  "auth.authorize.error.missingSession.body":
    "This URL is missing the session parameter. Re-trigger the connection from your Agent.",
  "auth.authorize.error.expired":
    "This authorization request has expired (15 min limit). Please re-trigger from your Agent.",
  "auth.authorize.error.alreadyConsumed":
    "This authorization request has already been used.",
  "auth.authorize.error.notFound":
    "We couldn't find this authorization request.",
  "auth.authorize.connectTitle": "Connect {client}",
  "auth.authorize.workspaceLabel": "Workspace to access",
  "auth.authorize.permissionsLabel": "Permissions",
  "auth.authorize.tokenReturnsToLabel": "Token returns to",
  "auth.authorize.deny": "Deny",
  "auth.authorize.approve": "Approve",
  "auth.authorize.processing": "Processing…",
  "auth.authorize.tokenSecurity":
    "After approval, {client} receives a short-lived access token (1 hour) plus a revocable refresh token.",
  "auth.authorize.tokenContext":
    "The token stays with the MCP client; it never enters the conversation context.",
  "auth.authorize.scope.mcp": "Read · Write · Share files in this workspace",
  "auth.authorize.scope.read": "Read files in this workspace",
  "auth.authorize.scope.write": "Write files in this workspace",
  "auth.authorize.scope.share": "Create public share links",

  // /authorize/done — branded success landing
  "auth.authorize.done.heading": "Connected to {client}",
  "auth.authorize.done.workspaceLabel": "Workspace",
  "auth.authorize.done.countingLoopback":
    "Sending token to {client} in {seconds}s…",
  "auth.authorize.done.countingRemote":
    "Returning to {client} in {seconds}s…",
  "auth.authorize.done.buttonRemote": "Return now",
  "auth.authorize.done.buttonLoopback": "Send now",
  "auth.authorize.done.triggeringRemote": "Returning to {client}…",
  "auth.authorize.done.triggeringLoopback": "Sending token to {client}…",
  "auth.authorize.done.doneRemote":
    "Authorization sent. Returning to {client}…",
  "auth.authorize.done.doneLoopback":
    "Token sent. You can return to the {client} terminal.",
  "auth.authorize.done.openWorkspace": "Or open your workspace",
  "auth.authorize.done.viewWorkspace": "View workspace",
  "auth.authorize.done.tokenSecurity":
    "The token is held by {client} and never enters the conversation context.",
  "auth.authorize.done.tokenContext":
    "Revoke any time from \"Connected Agents\" in your workspace.",

  // Invite landing page
  "invite.notFound.title": "Invite not found",
  "invite.notFound.message":
    "This invite link is invalid or has been deleted.",
  "invite.accepted.title": "Already accepted",
  "invite.accepted.message":
    "This invite has already been redeemed. Sign in if you're not already.",
  "invite.revoked.title": "Invite revoked",
  "invite.revoked.message":
    "The workspace owner revoked this invite. Ask them to send a new one.",
  "invite.expired.title": "Invite expired",
  "invite.expired.message":
    "This invite is older than 7 days. Ask the workspace owner to send a new one.",
  "invite.welcome.title": "You're invited",
  "invite.welcome.invitedYouTo": "{inviter} invited you to",
  "invite.welcome.signInAs": "Sign in as {email}",
  "invite.welcome.codeNotice": "We'll email a 6-digit code to {email}.",
  "invite.wrongAccount.title": "Wrong account",
  "invite.wrongAccount.message":
    "You're signed in as {current}, but this invite is for {target}. Sign out first, then re-open this link.",
  "invite.wrongAccount.signOut": "Sign out",
  "invite.error.title": "Couldn't accept invite",

  // Joined toast
  "joined.toast": "Joined {slug}",

  // Workspace switcher
  "switcher.heading": "Switch workspace",

  // User menu (header dropdown)
  "menu.nav.files": "Files",
  "menu.nav.shares": "Shares",
  "menu.nav.members": "Members",
  "menu.nav.folders": "Folder access",
  "menu.identity.signedIn": "Signed in",
  "menu.identity.workspace": "Workspace",
  "menu.language": "Language",
  "menu.theme": "Theme",
  "theme.default.name": "Paper",
  "theme.brutalMono.name": "Block",
  "theme.applying": "Applying",
  "theme.confirm.title": "Switch style",
  "theme.confirm.body": "Switch to \u201C{name}\u201D? The page will reload to apply.",
  "theme.confirm.experimental": "This style is inspired by Slock's creative direction \u2014 experimental use only.",
  "theme.confirm.action": "Confirm",
  "theme.confirm.cancel": "Cancel",
  "locale.confirm.title": "Switch language",
  "locale.confirm.body": "Switch to \u201C{name}\u201D?",

  "confirm.revokeKey.title": "Revoke key",
  "confirm.revokeKey.body": "Revoke \u201C{label}\u201D? Any agent using this key will stop working immediately.",
  "confirm.revokeKey.warning": "This action cannot be undone.",
  "confirm.revokeKey.action": "Revoke",
  "confirm.revokeShare.title": "Revoke share link",
  "confirm.revokeShare.body": "Revoke the share for \u201C{path}\u201D? The URL stops working immediately. Viewers who saved the link will get 404.",
  "confirm.revokeShare.action": "Revoke",
  "confirm.removeMember.title": "Remove member",
  "confirm.removeMember.body": "Remove this member? They lose access to this workspace immediately.",
  "confirm.removeMember.action": "Remove",
  "confirm.cancelInvite.title": "Cancel invite",
  "confirm.cancelInvite.body": "Cancel this invitation?",
  "confirm.cancelInvite.action": "Cancel invite",
  "confirm.makePublic.title": "Make public",
  "confirm.makePublic.body": "Unlock this folder? All workspace members will be able to read and write to it.",
  "confirm.makePublic.action": "Make public",
  "confirm.cancel": "Cancel",
  "menu.home": "huozi.app site",
  "menu.exit": "Exit",
  "menu.disconnect": "Disconnect",

  // Members page
  "members.col.email": "Email",
  "members.col.role": "Role",
  "members.col.keys": "Keys",
  "members.col.expires": "Expires",
  "members.col.actions": "",

  "members.title": "Members",
  "members.subtitle.owner":
    "Invite collaborators, see who has access, and remove people you no longer want in this workspace.",
  "members.subtitle.member": "People with access to this workspace.",
  "members.invite.heading": "Invite a collaborator",
  "members.invite.placeholder": "them@example.com",
  "members.invite.submit": "Invite",
  "members.invite.submitting": "Sending…",
  "members.invite.note":
    "They'll get an email with a link valid for 7 days. Accepting it adds them as a member of this workspace.",
  "members.list.heading": "Members ({count})",
  "members.list.empty": "No members yet. Invited collaborators will show up here.",
  "members.list.you": "(you)",
  "members.list.remove": "remove",
  "members.list.removeConfirm": "Remove this member?",
  "members.role.owner": "owner",
  "members.role.member": "member",
  "members.invites.heading": "Pending invites ({count})",
  "members.invites.expires": "expires {date}",
  "members.invites.revoke": "revoke",
  "members.invites.revokeConfirm": "Revoke this invite?",
  // Keys list (expandable under each member)
  "members.keys.summary": "{count} keys",
  "members.keys.revoke": "revoke",
  "members.keys.revokeConfirm": "Revoke this key? It cannot be undone.",
  "members.keys.lastUsed": "last used {rel}",
  "members.keys.neverUsed": "never used",
  "members.error.invite_failed": "Couldn't send invite.",
  "members.error.already_member": "That email is already a member.",
  "members.error.remove_failed": "Couldn't remove this member.",
  "members.error.owner_only": "Only the workspace owner can do that.",

  // Folder ACL page
  "folders.title": "Folder access",
  "folders.subtitle":
    "Lock a folder so only specific members can read or write inside it. Workspace owner has no bypass — even owners only see folders they're invited into.",
  "folders.create.heading": "Make a folder private",
  "folders.create.placeholder": "funds/fund-A/",
  "folders.create.note":
    "Path must end with a slash. Subfolders inherit access. Only members below will be able to read or write inside.",
  "folders.create.submit": "Lock folder",
  "folders.create.submitting": "Locking…",
  "folders.members.heading": "Members with access",
  "folders.members.you": "(you)",
  "folders.list.heading": "Private folders ({count})",
  "folders.list.empty": "No private folders yet. Lock one above.",
  "folders.list.memberCount": "{count} members",
  "folders.list.edit": "edit",
  "folders.list.save": "Save",
  "folders.list.cancel": "Cancel",
  "folders.list.makePublic": "make public",
  "folders.makePublicConfirm":
    "Unlock this folder? Anyone in the workspace will be able to read and write again.",
  "folders.error.create_failed": "Couldn't create the ACL.",
  "folders.error.update_failed": "Couldn't update the ACL.",
  "folders.error.empty_members": "Pick at least one member.",
  "folders.error.self_excluded":
    "You must keep yourself in the ACL — locking yourself out makes the folder unrecoverable.",
  "folders.error.member_not_in_workspace":
    "Selected member is not in this workspace anymore.",
  "folders.error.not_in_acl":
    "This folder is private — you must already be a member to edit its ACL.",
  "folders.error.invalid_path_prefix":
    "Path must be relative and contain no '..' segments.",
  "folders.error.empty_path_prefix": "Path is required.",
  // Modal-specific
  "folders.modal.heading": "Folder access",
  "folders.modal.publicTitle": "Public",
  "folders.modal.publicHint": "Any workspace member",
  "folders.modal.privateTitle": "Private",
  "folders.modal.privateHint": "Only chosen members",
  "folders.error.load_failed": "Couldn't load access info.",

  // Dashboard

  // Dashboard new page

  // Settings

  // Workspace setup

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

  // /start — install guide








  // InstallPicker on /start





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
  "connect.agent.codex.tagline": "One terminal command.",
  "connect.agent.codex.blurb":
    "OpenAI Codex CLI registers via codex mcp add — bearer is read indirectly via env-var so the token never lands in config.toml. Export the key in your shell rc, then restart codex.",
  "connect.agent.hermes.tagline": "Edit ~/.hermes/config.yaml.",
  "connect.agent.hermes.blurb":
    "Hermes Agent (Nous Research). Paste the YAML snippet into ~/.hermes/config.yaml under mcp_servers, then run /reload-mcp inside a Hermes session.",

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

  // CSV · row detail
  "csv.rowDetail.title": "Row details",
  "csv.rowDetail.open": "Open row details",
  "csv.rowDetail.close": "Close",
  "csv.rowDetail.rowOf": "Row {n} of {total}",
  "csv.rowDetail.empty": "—",

  // ConnectPicker — connection card on /workspace. Two sections mirror
  // huozi.app/start: Choice 1 = Agent-driven device flow (RFC 8628),
  // Choice 2 = native CLI/GUI per client (RFC 8252).
  "connect.picker.dropdown.label": "1. Pick your Agent",
  "connect.picker.choice1.title": "Choice 1 · Let the Agent install itself",
  "connect.picker.choice1.badge":
    "RFC 8628 · for cloud / headless agents",
  "connect.picker.choice1.desc":
    "Paste this into any chat-mode Agent (Hermes / OpenClaw / Cowork / Claude Code etc.). It fetches /llms.txt from this deploy, runs the RFC 8628 device flow on its own — prints you a /device link, you click Approve once, the Agent picks up the key, writes the config, verifies via huozi_whoami.",
  "connect.picker.choice2.title": "Choice 2 · Native CLI / GUI install",
  "connect.picker.choice2.badge": "RFC 8252 · for local-terminal users",
  "connect.picker.choice2.desc":
    "Pick your client and grab a one-liner (or config snippet). Each client has its own native `mcp add` CLI or GUI entry; the first huozi call auto-opens a browser for OAuth.",
  "connect.picker.note.claude-code":
    "Paste once in terminal: register + trigger OAuth + confirm identity",
  "connect.picker.note.openclaw":
    "Paste once in terminal: registers huozi to ~/.openclaw/openclaw.json; first call pops the browser for OAuth",
  "connect.picker.note.hermes":
    "Paste once in terminal: --auth oauth triggers RFC 8252 PKCE in the browser (needs a TTY and a local browser)",
  "connect.picker.note.codex":
    "Paste once in terminal: register + trigger OAuth + confirm identity",
  "connect.picker.note.cursor":
    "One click — Cursor adds it natively, no reload needed; first call to huozi auto-opens the browser for OAuth",
  "connect.picker.cursor.button": "Add to Cursor",
  "connect.picker.note.cowork":
    "In Cowork: Customize → Connectors → + Add custom connector. Paste the URL below.",
  "connect.picker.note.generic":
    "Paste this URL into your host's MCP config; the host handles OAuth-on-first-use itself",
  "connect.picker.endpointLabel": "Endpoint:",
  "connect.picker.tokenSecurity":
    "Token stays with the MCP client. It never enters the chat context.",
  "connect.picker.copy": "Copy",
  "connect.picker.copied": "✓ Copied",
} as const;
