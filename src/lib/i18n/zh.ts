export const zh = {
  // Nav
  "nav.home": "huozi.app",
  "nav.getStarted": "开始使用",
  "nav.signIn": "登录",
  "nav.workspace": "云盘",
  "nav.signUp": "注册",
  "nav.docs": "文档",
  "nav.cloud": "Cloud",
  "nav.edge": "Edge",
  "nav.blog": "博客",

  // Home hero
  "home.title1": "以文载道",
  "home.title2.highlight": "活字",
  "home.title2.rest": "为器",
  "home.divider": "文",
  "home.subtitle1": "为 Agent 而造的云盘。",
  "home.subtitle2": "讲 Claude Code 的文件工具方言。任何 MCP 客户端都能挂载。",
  "home.cta.start": "开始使用",
  "home.cta.signIn": "登录",
  "home.cta.preview": "预览",

  // Home features
  "home.feat1.icon": "云",
  "home.feat1.title": "Agent 云盘",
  "home.feat1.desc": "通过 MCP 挂载一个工作空间。Agent 已经会的 Read / Edit / Write / Glob / Grep 直接可用 —— 不用学新工具。",
  "home.feat2.icon": "器",
  "home.feat2.title": "和 Claude Code 逐字节一致",
  "home.feat2.desc": "同样的 schema、错误码、session 缓存。Claude Code、Cursor、Desktop 或裸 HTTP —— 可互换。",
  "home.feat3.icon": "时",
  "home.feat3.title": "实时同步 + 历史",
  "home.feat3.desc": "每次提交 ~100 毫秒内推送到 Web UI。每个文件都有完整 commit 日志。多 Agent 原子写。",

  // Home · 两个版本
  "home.products.label": "两个版本",
  "home.products.footnote": "同样的 MCP 协议，同样的 Agent 方言。选你把字节放在哪里。",

  "home.cloud.tagline": "huozi.app 提供的托管版。邮箱登录、创建工作空间、60 秒接入 Claude Code。面向团队与多 Agent 协作。",
  "home.cloud.bullet1": "邮箱登录、多人使用、每个 Agent 独立 API key",
  "home.cloud.bullet2": "实时 WebSocket 推送到 Web UI",
  "home.cloud.bullet3": "公开分享 URL，可加 6 位口令",
  "home.cloud.cta": "了解 Cloud",

  "home.edge.tagline": "把同一套云盘部署到你自己的 Cloudflare 或 Vercel。单人单工作空间，无需 Supabase。MIT 开源。",
  "home.edge.bullet1": "除 edge 运行时外无任何外部依赖",
  "home.edge.bullet2": "粘贴 key 即登录，无需注册",
  "home.edge.bullet3": "一键部署，自带域名",
  "home.edge.cta": "了解 Edge",

  // Home · 共享特性
  "home.shared.label": "两版共享",

  // Home CTA band
  "home.install.title": "60 秒上手",

  // Home code
  "home.code.title": "挂载、写一个文件",

  // /cloud hero
  "cloud.hero.tagline1": "为 Agent 而造的云盘。",
  "cloud.hero.tagline2": "讲 Claude Code 的文件工具方言。自带 Agent。Agent 写，人读。",
  "cloud.cta.signIn": "登录",
  "cloud.cta.open": "打开我的云盘",
  "cloud.cta.connectAgent": "接入 Agent",

  // /workspace — 空态引导
  "ws.status.title": "你的云盘",
  "ws.status.connectedAgents": "已连接 Agent",
  "ws.status.browserSession": "浏览器会话",
  "ws.status.never": "—",
  "ws.status.now": "刚刚",
  "ws.status.activeKeys": "把有效 key",
  "ws.status.lastActivity": "最近活动",
  "ws.status.manage": "管理",
  "ws.status.connectNew": "新建连接",

  // Key-expiry labels (sliding-window TTL)
  "ws.expiry.never": "永不过期",
  "ws.expiry.expired": "已过期",
  "ws.expiry.inDays": "{n} 天后到期",
  "ws.expiry.inHours": "{n} 小时后到期",
  "ws.expiry.inMinutes": "{n} 分钟后到期",
  "ws.expiry.hint": "滑动窗口——每次成功请求都重置倒计时。",

  // TTL preset labels
  "ws.ttl.1d": "1 天",
  "ws.ttl.7d": "7 天",
  "ws.ttl.30d": "30 天",
  "ws.ttl.180d": "180 天",
  "ws.ttl.never": "永不",

  // Per-key actions
  "ws.action.copy": "复制",
  "ws.action.copied": "已复制",
  "ws.action.revoke": "撤销",
  "ws.action.revoking": "撤销中…",
  "ws.action.confirmRevoke": "撤销「{label}」？使用此 key 的 Agent 会立刻停工。此操作不可撤销。",

  // /workspace 非空态介绍 + 帮助卡片 + 页脚
  "ws.filled.intro": "从左侧树中选一个文件查看。Markdown 与 HTML 的渲染效果与 huozi.app 公开页面一致。拥有该云盘访问权限的 Agent 随时可以编辑文件 —— 打开文件即可在历史标签中看到变更。",
  "ws.filled.browse.title": "浏览",
  "ws.filled.browse.desc": "使用左侧文件树（移动端点 ☰）。文件夹会记住展开状态。",
  "ws.filled.history.title": "历史",
  "ws.filled.history.desc": "每个文件都有历史记录，展示所有相关提交。",
  "ws.filled.search.title": "搜索",
  "ws.filled.search.desc": "通过文件树上方的搜索框按名称过滤文件。",
  "ws.filled.footer.about": "关于 huozi Cloud",
  "ws.filled.footer.apiDocs": "API 文档",


  "ws.onboard.heading": "开始造点东西",
  "ws.onboard.subheading": "复制下面一段场景话术，粘给你的 Agent，第一份文件就会实时出现在这里。选你想创造的文件类型 —— 剩下交给 Agent。",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "一份周报",
  "ws.onboard.md.scenario": "自由形态的笔记，适合写作、思考、日志。查看时按 Markdown 渲染。",
  "ws.onboard.md.prompt": "帮我写一份这周的周报：三件我推进的事、两件卡住的事、一个下周想试的点子。放在 reviews/2026-w17.md，用 Markdown 标题和简短列表。",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "一张数据表",
  "ws.onboard.csv.scenario": "结构化表格数据。查看时按可排序表格渲染，易于逐行扩展。",
  "ws.onboard.csv.prompt": "在 data/ai-milestones-2025.csv 建一张 CSV，记录过去一年 12 个 AI 公司的重要事件。列：date、company、event、impact_note。按时间排序。",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "一个可视化页面",
  "ws.onboard.html.scenario": "富渲染 —— 插图、图表、封面页。作为 HTML 渲染，带安全消毒。",
  "ws.onboard.html.prompt": "在 cover/movable-type.html 帮我做一个讲活字印刷术的精美 HTML 封面页，用温和米色渐变背景、衬线字体，写一段为什么它重要。加一个简单的 Echarts 时间线显示关键发明节点。",

  "ws.onboard.copy": "复制 prompt",
  "ws.onboard.copied": "已复制",

  // Home open source
  "home.oss.title": "开源",
  "home.oss.desc": "自部署 Markdown 与 HTML 发布引擎。零数据库，纯 KV 存储。MIT 开源协议。",
  "home.oss.deployCF": "部署到 Cloudflare",
  "home.oss.deployVercel": "部署到 Vercel",
  "home.oss.soon": "即将支持",

  // Home footer
  "home.footer": "活字 — 以文载道，活字为器",

  // Auth
  "auth.login.title": "登录活字",
  "auth.login.subtitle": "输入邮箱即可，无需密码。",
  "auth.login.checkEmail": "验证码已发送，请查看邮箱。",
  "auth.login.email": "邮箱",
  "auth.login.code": "验证码",
  "auth.login.sendCode": "发送验证码",
  "auth.login.sending": "发送中...",
  "auth.login.verify": "验证",
  "auth.login.verifying": "验证中...",
  "auth.login.changeEmail": "使用其他邮箱",
  "auth.login.newHere": "初来乍到？",
  "auth.login.guide": "查看入门指南",

  // Dashboard

  // Dashboard new page

  // Settings
  "settings.title": "设置",
  "settings.subtitle": "管理你的工作空间和 API 密钥。",
  "settings.workspace": "工作空间",
  "settings.workspaceDesc": "你的工作空间 URL 前缀。",
  "settings.apiKeys": "API 密钥",
  "settings.apiKeysDesc": "使用 API 密钥从 AI 智能体或脚本发布页面。",
  "settings.apiUsage": "API 用法",
  "settings.apiUsageDesc": "发布页面的快速示例：",
  "settings.getStarted": "开始使用",
  "settings.getStartedDesc": "了解如何设置 Claude Code MCP、OpenClaw 或使用对话式 API。",
  "settings.viewGuide": "查看入门指南",

  // Workspace setup
  "workspace.setup.title": "设置工作空间",
  "workspace.setup.desc": "为你的工作空间选择一个唯一的 slug，它将成为页面 URL 的一部分。",
  "workspace.setup.label": "工作空间 slug",
  "workspace.setup.placeholder": "your-name",
  "workspace.setup.submit": "创建工作空间",
  "workspace.setup.loading": "创建中...",

  // API Key manager
  "apiKey.created": "API 密钥已创建！请立即复制 — 之后将不再显示。",
  "apiKey.copy": "复制",
  "apiKey.dismiss": "关闭",
  "apiKey.nameLabel": "密钥名称",
  "apiKey.namePlaceholder": "例如 Claude Agent",
  "apiKey.create": "创建密钥",
  "apiKey.creating": "创建中...",
  "apiKey.confirmRevoke": "撤销此 API 密钥？此操作不可撤销。",
  "apiKey.neverUsed": "从未使用",
  "apiKey.lastUsed": "上次使用",
  "apiKey.revoke": "撤销",
  "apiKey.empty": "暂无 API 密钥。创建一个即可通过 API 发布。",

  // Conversational install
  "install.copyButton": "复制即安装",
  "install.copied": "已复制！",

  // /start — 安装指南
  "start.meta.title": "开始使用 — huozi Cloud",
  "start.meta.description":
    "一行命令，或一段提示词。交给任何 Agent。点一次链接，搞定。",
  "start.hero.title": "开始使用",
  "start.hero.subtitle":
    "一段提示词、一次点击，搞定。适用于任何支持 MCP 的 Agent。",

  "start.fastest.title": "最快 · 一行命令",
  "start.fastest.badge": "Node ≥ 18",
  "start.fastest.desc1":
    "走的是和下方相同的 OAuth 设备流程，自动检测客户端（Claude Code / Cursor / OpenClaw），打开浏览器授权，然后把 MCP 配置写到对应位置。",
  "start.fastest.desc2Before": "对 Agent 说",
  "start.fastest.tellAgent": "跑 npx huozi-mcp，帮我完成授权",
  "start.fastest.desc2After": "—— 剩下的 Agent 自己处理。",

  "start.prompt.title": "1 · 或者，把这段提示词贴给 Agent",
  "start.prompt.badge": "Agent 可读",
  "start.prompt.desc":
    "适用于 Claude Code、Cursor、OpenClaw，或任何能发 HTTP 请求的 Agent。Agent 读完步骤后自行执行；你只需要在浏览器里点一次 Authorize。",
  "start.prompt.langNote": "（保留英文 —— 任何 LLM 都能原生阅读。）",

  "start.authorize.title": "2 · Agent 会打印一个链接 —— 点一下 Authorize",
  "start.authorize.example":
    "→ 打开 https://huozi.app/device?code=ABCD-1234 并点 Authorize。",
  "start.authorize.desc":
    "用任意浏览器打开链接。如果你还没登录 huozi.app，会先走一次 email OTP。然后你会看到「哪个 Agent 在请求」「要访问哪个工作区」以及一个 Authorize 按钮。点它，关掉页面。",

  "start.done.title": "3 · Agent 自动连接 · 完成",
  "start.done.descBefore":
    "几秒钟内，Agent 拿到 key，注册 MCP server，回报",
  "start.done.connectedPhrase": "✓ 已连接到工作区 …",
  "start.done.descAfter":
    "。从此每一次 Agent 请求都能读写你的 huozi 工作区。",
  "start.done.manageBefore": "管理连接、浏览文件、随时吊销，都在",
  "start.done.manageAfter": "。",

  "start.manual.summary": "没有 Agent？手动装一遍",
  "start.manual.desc":
    "整条流程就是纯 HTTP —— 你可以自己跑 curl：",
  "start.manual.noteBefore":
    "已登录 huozi.app？也可以在此处直接拿到为 Cursor / OpenClaw 准备好的配置片段：",
  "start.manual.noteAfter": "。",

  "start.footer.mcp.title": "MCP 参考文档",
  "start.footer.mcp.desc":
    "所有 huozi_* 工具、JSON-RPC 格式、实时事件。",
  "start.footer.cloud.title": "关于 Cloud",
  "start.footer.cloud.desc":
    "为什么 Agent 需要一个带 commit 历史的共享云盘。",
  "start.footer.edge.title": "自部署（Edge）",
  "start.footer.edge.desc":
    "同一款云盘，部署到你自己的 Cloudflare / Vercel。MIT 协议。",

  // /start 页上的 InstallPicker
  "start.picker.title": "按客户端选择安装方式",
  "start.picker.subtitle":
    "选你的客户端 —— 下方会只显示与之相关的路径。MCP 加的是工具，Skill / Rules 加的是说明书；大多数场景两者都需要。",
  "start.picker.generic.name": "通用 / 其他",

  "start.picker.content.claude-code.mcp.body":
    "Claude Code 的原生扩展方式就是 MCP —— 工具描述本身就承载了 Agent 需要的全部上下文。在任意 shell 跑这行，CLI 打开浏览器让你一键授权，写进 Claude Code 的用户级 MCP 配置，新开一个 shell 就生效。",

  "start.picker.content.cursor.mcp.body":
    "Cursor 原生支持远程 MCP。打开 Cursor 的集成终端（⌘J），跑这行 —— CLI 写 ~/.cursor/mcp.json，Reload Window（⌘⇧P）生效。",

  "start.picker.content.openclaw.mcp.body":
    "跑这行 OpenClaw 的 MCP 层就配置好了。CLI 写 ~/.openclaw/openclaw.json 的 mcp.servers.huozi（transport: streamable-http），重启 OpenClaw 生效。",
  "start.picker.content.openclaw.skill.body":
    "OpenClaw 原生的生态是 ClawHub —— Skill 在这里是一等公民。跑这行，CLI 会从 ClawHub 拉 huozi/mcp 并写进 ~/.openclaw/skills/，重启 OpenClaw 生效。",
  "start.picker.content.openclaw.skill.note":
    "Skill 这条路只出现在 OpenClaw，因为那里才是它的原生习惯 —— Claude Code 和 Cursor 用户保持 MCP 一条路就够了。",

  "start.picker.content.generic.mcp.body":
    "任何能发 HTTP 请求的 Agent 都适用。把下面这段提示词贴给 Agent —— 它读指令、跑 curl 设备流程、把拿到的 key 写进自己的 MCP 配置里。你只需要在浏览器里点一次 Authorize。",
  "start.picker.content.generic.mcp.note":
    "保留英文 —— LLM 原生读英文，翻译反而可能让步骤出现细微偏差。适用于任何 stdio / HTTP MCP 客户端。",

  // Connect-Agent 页面
  "connect.back": "← 工作区",
  "connect.title": "连接 Agent",
  "connect.desc":
    "三步：选 agent → 贴一段配置 → 发一次请求。我们会检测到首次调用并自动确认连接。每个 agent 一把独立的 key，随时吊销不影响其他。",

  "connect.step1": "1 · 选择 Agent",
  "connect.step2": "2 · 贴到 {title}",
  "connect.step3": "3 · 确认连接",

  "connect.agent.claude-code.tagline": "终端一行命令",
  "connect.agent.claude-code.blurb":
    "在任意 shell 里跑。Claude Code 会把 huozi 注册成远程 MCP server —— 在所有项目中都可用。",
  "connect.agent.cursor.tagline": "贴进 mcp.json",
  "connect.agent.cursor.blurb":
    "加到 ~/.cursor/mcp.json（或项目级 .cursor/mcp.json），然后重启 Cursor。",
  "connect.agent.openclaw.tagline": "改 openclaw.json",
  "connect.agent.openclaw.blurb":
    "加到 ~/.openclaw/openclaw.json 的 mcp.servers 下，重启 OpenClaw 生效。",

  "connect.label.title": "给这把 key 起个名（在 Connected Agents 里显示）",
  "connect.generate": "为 {title} 生成 key",
  "connect.generating": "生成中…",
  "connect.copy": "复制",
  "connect.copied": "已复制",
  "connect.generateFirst": "先生成 key",

  "connect.rawKey.show": "显示原始 API key",
  "connect.rawKey.note":
    "我们不存明文 —— 现在就复制。丢了可在 workspace 页面吊销并重新发一把。",

  "connect.waiting.title": "等待 {title} 连接…",
  "connect.waiting.desc":
    "贴完上面的配置后，随便发一次请求 —— 我们会自动检测首次调用。",

  "connect.done.title": "{title} 已连接",
  "connect.done.detected": "首次工具调用于",
  "connect.done.note":
    "你可以关掉这个页面了 —— agent 会一直用这把 key，直到你手动吊销。",
  "connect.done.goto": "前往工作区 →",
  "connect.done.another": "连接另一个 agent",

  "connect.footer.back": "← 返回工作区",
  "connect.footer.start": "让 Agent 自己装（OAuth 设备流）→",
  "connect.footer.docs": "API 文档",

  "connect.terminal.title": "更喜欢终端？一行命令：",
  "connect.terminal.desc":
    "适用于 Claude Code、Cursor、OpenClaw —— 或任何带 shell 的 agent。跑的是同样的 OAuth 流程，自动帮你写好 MCP 配置。",
} as const;
