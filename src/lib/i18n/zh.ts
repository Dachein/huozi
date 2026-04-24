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

  // /cloud — 整页
  "cloud.meta.title": "huozi Cloud — 为 Agent 而造的硬盘",
  "cloud.meta.description":
    "为 Agent 而造的云上工作空间。讲 Claude Code 的文件工具方言。带上你自己的 Agent —— Claude Code、Cursor、Codex 或自家造的 —— 在任何地方挂载。",

  "cloud.status.shipping": "已上线",
  "cloud.status.coming": "即将推出",
  "cloud.status.preview": "预览版",

  "cloud.metaphor.title": "为 Agent 造的移动硬盘",
  "cloud.metaphor.body1":
    "U 盘到哪都能用，因为它讲一套标准接口 —— 插上去，任何系统都读得懂。任何操作系统、任何年代。",
  "cloud.metaphor.body2":
    "我们想让 Agent 也有这一套。huozi Cloud 就是一个可挂载的云上工作空间，讲的正是 Claude Code 今天用的那套文件工具方言 —— 也就是说，所有已经会这套方言的 Agent（Claude Code 自己、Cursor、Codex、你自家的 Agent）都能在里面工作，零代码改动。",

  "cloud.compare.physical": "物理硬盘",
  "cloud.compare.huozi": "huozi Cloud",
  "cloud.compare.r1a": "USB / SATA 协议",
  "cloud.compare.r1b": "MCP + Claude Code 工具方言",
  "cloud.compare.r2a": "盘符 / 挂载点",
  "cloud.compare.r2b": "Workspace URI",
  "cloud.compare.r3a": "目录权限",
  "cloud.compare.r3b": "Scope（按 API key 限定前缀）",
  "cloud.compare.r4a": "文件系统日志",
  "cloud.compare.r4b": "Git 提交日志",
  "cloud.compare.r5a": "在任意机器上挂载",
  "cloud.compare.r5b": "被任意 Agent 访问",

  "cloud.shipped.title": "现在已经能用什么",
  "cloud.shipped.intro1": "七个 MCP 工具，端点 ",
  "cloud.shipped.intro2": "。其中五个是 Claude Code 的逐字节镜像；两个是云上原生扩展。",
  "cloud.tools.ccMirror": "CC 镜像",
  "cloud.tools.extension": "huozi 扩展",
  "cloud.tools.read.desc":
    "按行分页读取，cat -n 输出，file_unchanged 缓存，二进制按 base64 或签名 URL 返回。",
  "cloud.tools.edit.desc":
    "精确字符串替换。强制 Read-before-Edit，blob_sha 防陈旧，输出 structuredPatch。",
  "cloud.tools.write.desc":
    "新建或覆盖。强制 LF 换行。结果区分 create/update。",
  "cloud.tools.glob.desc":
    "Glob 模式匹配。按 mtime 倒序，最多 100 个文件。",
  "cloud.tools.grep.desc":
    "正则搜索。content / files_with_matches / count 三种模式。-A/-B/-C 上下文。type 过滤。",
  "cloud.tools.batch.desc":
    "原子的多文件编辑。all_or_nothing + 单个 commit_sha。逐文件结果。",
  "cloud.tools.history.desc":
    "查询某文件的提交历史。按操作分类（create / edit / write / batch）。支持分页。",

  "cloud.underHood.title": "底层栈",
  "cloud.underHood.b1.label": "Cloudflare Workers",
  "cloud.underHood.b1.desc":
    " 作为 serverless MCP 端点（HTTP 上的 JSON-RPC 2.0）。",
  "cloud.underHood.b2.label": "R2",
  "cloud.underHood.b2.desc":
    " 存储 blob，按 Git 兼容的 SHA-1 寻址（与真 Git 的 blob <size>\\0<content> 同算法）。",
  "cloud.underHood.b3.label": "D1",
  "cloud.underHood.b3.desc":
    " 存放 files_current 索引、commit 链、按路径的审计行、API keys。",
  "cloud.underHood.b4.label": "Durable Objects",
  "cloud.underHood.b4.desc":
    " 串行化写侧关键区（每个 workspace 一个 DO），并跨请求保留每会话的 ReadFileState（每个 {workspace, principal} 一个 DO）。",
  "cloud.underHood.b5.label": "Bearer 鉴权",
  "cloud.underHood.b5.desc":
    "：token hash 到 api_keys 一行；那一行把这次调用绑定到 workspace、principal、可选的 scope 前缀。",

  "cloud.principles.title": "设计原则",
  "cloud.principles.1.title": "和 CC 方言逐字节一致",
  "cloud.principles.1.body":
    "任何在 Claude Code 工具面上训过的 Agent，到这里应该零代码改动就能跑。字段名、默认值、错误码、甚至承重的错误字符串都保留。任何偏离 CC 的地方 —— 我们都在记录里写明原因。",
  "cloud.principles.2.title": "Git 是事实，其它都是缓存",
  "cloud.principles.2.body":
    "提交日志才是真相之源。D1 索引、Durable Object 状态、Worker 内缓存 —— 都能从 Git 历史重建。这让恢复、排查、备份都简单。",
  "cloud.principles.3.title": "Workspace = 挂载点",
  "cloud.principles.3.body":
    "没有共享全局命名空间。一个 workspace 是一个封闭的盒子，自己的 ACL、自己的历史、自己的备份边界。用户创建 workspace；Agent 在某个 workspace 内活动。",
  "cloud.principles.4.title": "永远只能 revert，不能改写",
  "cloud.principles.4.body":
    "没有 force-push，没有历史改写，没有管理员后门。每次撤销都是一个新提交把旧的取消掉。审计链不可变。这对合规级用例不可妥协。",
  "cloud.principles.5.title": "批量要么全成要么全败",
  "cloud.principles.5.body":
    "10 个文件作为一次逻辑变更，应该是一个 commit，而不是十个。huozi_batch_edit 在写之前先校验整批的 staleness —— 任何一个 fail 就整批取消。",
  "cloud.principles.6.title": "严格匹配，不做空白回退",
  "cloud.principles.6.body":
    "Claude Code 的 Edit 工具在 old_string 不精确匹配时直接报错。官方 MCP filesystem server 反过来 —— 默默回退到对空白宽容的匹配 —— 在并发写入时就悄悄改了不该改的地方。我们站 CC 这边：严格失败，显式重读。",

  "cloud.roadmap.title": "路线图",
  "cloud.roadmap.1.label": "Scope 强制隔离",
  "cloud.roadmap.1.desc":
    "API key 绑子目录沙箱。被限定到 funds/fund-A/ 的 Agent 在物理上读不到 funds/fund-B/。",
  "cloud.roadmap.2.label": "Secret 扫描",
  "cloud.roadmap.2.desc":
    "写入时内联扫描。约 20 条内置规则（AWS / OpenAI / GitHub / JWT / 私钥）+ 占位符白名单。",
  "cloud.roadmap.3.label": "生产级 Grep",
  "cloud.roadmap.3.desc":
    "D1 FTS5 trigram 索引提速正则；多行 / 复杂模式回退到流式扫描；5 MB / 50 MB / 10 秒安全上限。",
  "cloud.roadmap.4.label": "真实 Git 提交哈希",
  "cloud.roadmap.4.desc":
    "在 Cloudflare Worker 上跑 isomorphic-git。Commit SHA 与本地 Git 的算法一致。",
  "cloud.roadmap.5.label": "Notebook 编辑",
  "cloud.roadmap.5.desc":
    "为 .ipynb cell 提供 huozi_notebook_edit 工具。在此之前 notebook 只读。",
  "cloud.roadmap.6.label": "Revert 工具",
  "cloud.roadmap.6.desc":
    "huozi_revert 按 commit_sha 或 message_uuid 撤销。新提交取消旧的；历史保留。",
  "cloud.roadmap.7.label": "跨 workspace 搜索",
  "cloud.roadmap.7.desc":
    "在 workspace 之上引入组织概念。让基金经理能一次性搜遍他名下所有基金。",
  "cloud.roadmap.8.label": "实时订阅",
  "cloud.roadmap.8.desc":
    "WorkspaceDO 的 WebSocket 推送。Agent A 提交后，Agent B 实时收到变更通知。",

  "cloud.try.title": "上手试试",
  "cloud.try.intro":
    "目前是私测。联系我们拿一个绑到你 workspace 的 Bearer token。拿到后挑你的 Agent：",
  "cloud.try.h.claudeCode": "Claude Code",
  "cloud.try.h.claudeDesktop": "Claude Desktop",
  "cloud.try.h.rawHttp": "裸 HTTP",

  "cloud.who.title": "适合谁",
  "cloud.who.1.title": "真在干活的 Agent",
  "cloud.who.1.body":
    "任何你愿意让它在本地 Read/Edit/Write 的活儿 —— 研究 Agent、代码 Agent、写报告的 Agent —— 现在都能跨机器、跨会话地干，每次改动都有记录。",
  "cloud.who.2.title": "跑很多 Agent 的团队",
  "cloud.who.2.body":
    "一个 workspace、多个 Agent、多个真人。staleness 模型让并发写入诚实。提交日志谁干了什么一清二楚。",
  "cloud.who.3.title": "合规敏感的工作流",
  "cloud.who.3.body":
    "金融研究、法律备忘、受监管文档。不可变历史、按文件审计、可选子目录隔离做分析师级访问。",
  "cloud.who.4.title": "多设备协作",
  "cloud.who.4.body":
    "笔电上开始。iPad 上继续。手机上审阅。你 Agent 的状态 —— 它读了什么、改了什么 —— 跟着你走。",

  "cloud.footer.tagline": "为 Agent 造的工作空间。建在 Cloudflare 上。",
  "cloud.footer.publish": "发布（MD/HTML）",

  // /edge — 整页
  "edge.meta.title": "huozi Edge — 自部署 Agent 云盘",
  "edge.meta.description":
    "huozi 的开源、单部署者版本。一键部署到 Cloudflare 或 Vercel。无 Supabase、无账号系统，MIT 开源。",

  "edge.badge.openSource": "开源 · MIT",
  "edge.hero.tagline1": "同样的 Agent 云盘，跑在你自己的基础设施上。",
  "edge.hero.tagline2":
    "无 Supabase。无邮箱登录。一个部署者、一个工作空间、一个属于你的域名。",
  "edge.cta.deployCF": "部署到 Cloudflare",
  "edge.cta.deployVercel": "部署到 Vercel",
  "edge.cta.github": "在 GitHub 上看",

  "edge.same.title": "同一套云盘，由你来跑",
  "edge.same.body1":
    "Edge 提供与 Cloud 完全一致的 MCP 接口、Claude Code 兼容性、实时同步、提交历史和公开分享 URL —— 只是没有托管账号系统。你拿着 HUOZI_ADMIN_SECRET，把它部署到自己的 Cloudflare 或 Vercel；把 API key 粘贴给谁，谁就能接 Agent。",
  "edge.same.body2":
    "因为两个版本是同一份代码、靠 HUOZI_EDITION 切换 —— 每个 bug 修复和新功能都同时落到两边。",

  "edge.compare.title": "Cloud vs Edge",
  "edge.compare.col.cloud": "Cloud",
  "edge.compare.col.edge": "Edge",
  "edge.compare.r1.label": "谁运营",
  "edge.compare.r1.cloud": "huozi.app",
  "edge.compare.r1.edge": "你自己",
  "edge.compare.r2.label": "鉴权",
  "edge.compare.r2.cloud": "邮箱 OTP（Supabase）",
  "edge.compare.r2.edge": "管理员密钥 + 粘贴 key",
  "edge.compare.r3.label": "每实例用户数",
  "edge.compare.r3.cloud": "多人",
  "edge.compare.r3.edge": "单部署者",
  "edge.compare.r4.label": "每用户 workspace 数",
  "edge.compare.r4.cloud": "一个（可扩展）",
  "edge.compare.r4.edge": "一个固定 workspace",
  "edge.compare.r5.label": "成本",
  "edge.compare.r5.cloud": "付给 huozi.app",
  "edge.compare.r5.edge": "付给 Cloudflare / Vercel（多数情况 $0）",
  "edge.compare.r6.label": "授权",
  "edge.compare.r6.cloud": "专有服务",
  "edge.compare.r6.edge": "MIT",

  "edge.bootstrap.title": "三步上手",
  "edge.bootstrap.s1.title": "部署 + 设置密钥",
  "edge.bootstrap.s1.body":
    "一键部署，然后设置一个强 HUOZI_ADMIN_SECRET 和 HUOZI_EDITION=edge。",
  "edge.bootstrap.s2.title": "签发管理员 key",
  "edge.bootstrap.s2.body":
    "调一次 Worker 的管理端点签出第一把 API key。下一步会贴进 Web UI。",
  "edge.bootstrap.s3.title": "粘贴 key，开干",
  "edge.bootstrap.s3.body":
    "打开 https://<你的域名>/connect，粘贴拿到的 hz_… key，进去了。和 Cloud 一样，从 Keys 页接 Claude Code / Cursor / Desktop。",

  "edge.footer.repo": "GitHub 仓库",
  "edge.footer.docs": "MCP 参考",
  "edge.footer.compare": "对比 Cloud",

  // 营销页脚 —— 分组
  "footer.tagline": "为 Agent 而造的云盘。",
  "footer.col.product": "产品",
  "footer.col.resources": "资源",
  "footer.col.source": "源码",
  "footer.legal": "MIT 开源 · 跑在 Cloudflare 上",
  "nav.language": "语言",

  // 云盘 · Recent 面板
  "recent.title": "最近",
  "recent.op.new": "新建",
  "recent.op.edited": "编辑",
  "recent.op.deleted": "删除",

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

  "start.conversation.title": "让你的 Agent 装",
  "start.conversation.badge": "对话 · 约 60 秒",
  "start.conversation.desc":
    "把这句话贴给任意支持 MCP 的 Agent（Claude Code、Cursor、OpenClaw，或任何能联网的）。它会从本页读取安装协议，然后在对话里问你 2-3 个问题：注册、浏览器登录、或者粘已有 token。全程不用打开终端。",

  "start.terminal.title": "或者，从终端",
  "start.terminal.badge": "Node ≥ 18",
  "start.terminal.desc":
    "开发者友好的选项。交互式走完同样的 OAuth 流程并帮你写好 MCP 配置。给在 shell 里的人用 —— CLI 不接受非 TTY 输入，Agent 应该走 HTTP 状态机那条。",

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
