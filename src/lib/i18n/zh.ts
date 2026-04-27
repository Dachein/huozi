export const zh = {
  // Nav

  // Home hero

  // Home features

  // Home · 两个版本



  // Home · 共享特性

  // Home · 三个角度（印 / 版 / 盘）—— Tab 切换，下方卡片与代码块就地变化

  // 印 · MCP —— 字模即接口

  // 版 · STYLE —— 写得对，看得美

  // 盘 · CLOUD —— 不在本地，跨 Agent 共享


  // Home CTA band

  // Home code

  // /cloud hero

  // /cloud — 整页











  // /edge — 整页






  // 营销页脚 —— 分组

  // 云盘 · Recent 面板
  "recent.title": "最近",
  "recent.op.new": "新建",
  "recent.op.edited": "编辑",
  "recent.op.deleted": "删除",
  "recent.folderCreated": "新建目录",

  // 云盘 · 文件视图错误 / 提示
  "view.error.label": "错误",
  "view.error.aclDenied.title": "这是私密目录",
  "view.error.aclDenied.body": "你没有访问该路径的权限。请联系目录成员邀请你加入,或在侧栏选择其他文件。",
  "view.readOnly.title": "想修改这个文件?",
  "view.readOnly.body": "通过你已连接的 Agent(Claude Code、Cursor、Claude Desktop 或任意 MCP 客户端)进行编辑。huozi Cloud 的 Web UI 设计为只读 —— 所有写入统一走 MCP 的审计提交链路。",

  // 云盘 · 侧边栏标题（可点的"首页"链接）
  "ws.shell.title": "Workspace",
  "ws.shell.subtitle": "管理 · 搜索",
  "ws.stats.files": "文件",
  "ws.stats.recent": "最近编辑",
  "ws.stats.agents": "Agent",
  "ws.search.title": "在云盘中搜索",
  "ws.search.placeholder": "输入文件名或路径…",
  "ws.search.noMatch": "没有匹配的文件。",

  // 发布 / 分享弹窗 —— 有效期
  "share.expiry.label": "链接有效期",
  "share.expiry.hint": "过期后链接返回 not found。选「永不」即不过期。",
  "share.expiry.30m": "30 分钟",
  "share.expiry.6h": "6 小时",
  "share.expiry.24h": "24 小时",
  "share.expiry.1mo": "1 个月",
  "share.expiry.never": "永不",
  "share.expiry.expiresAt": "{when} 过期",
  "share.expiry.permanent": "永不过期",

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

  // Home footer

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

  // 多 workspace 选择页
  "auth.selectWorkspace.title": "选择 workspace",
  "auth.selectWorkspace.subtitle": "你属于 {count} 个 workspace，挑一个进入。",

  // 邀请链接落地页
  "invite.notFound.title": "邀请不存在",
  "invite.notFound.message": "这个邀请链接无效或已被删除。",
  "invite.accepted.title": "已接受过",
  "invite.accepted.message": "这个邀请已经被接受过。如果未登录，请先登录。",
  "invite.revoked.title": "邀请已撤销",
  "invite.revoked.message": "owner 已撤销此邀请，请联系对方重新发送。",
  "invite.expired.title": "邀请已过期",
  "invite.expired.message": "邀请超过 7 天已过期，请联系 owner 重发。",
  "invite.welcome.title": "你被邀请了",
  "invite.welcome.invitedYouTo": "{inviter} 邀请你加入",
  "invite.welcome.signInAs": "以 {email} 登录",
  "invite.welcome.codeNotice": "我们将向 {email} 发送 6 位验证码。",
  "invite.wrongAccount.title": "账号不匹配",
  "invite.wrongAccount.message":
    "你当前已用 {current} 登录，但此邀请发给 {target}。请先退出当前账号，再点击邀请链接。",
  "invite.wrongAccount.signOut": "退出登录",
  "invite.error.title": "无法接受邀请",

  // 加入成功提示
  "joined.toast": "已加入 {slug}",

  // 切换 workspace
  "switcher.heading": "切换 workspace",

  // 用户菜单（顶部下拉）
  "menu.nav.files": "文件",
  "menu.nav.shares": "分享",
  "menu.nav.members": "成员",
  "menu.nav.folders": "目录权限",
  "menu.identity.signedIn": "已登录",
  "menu.identity.workspace": "Workspace",
  "menu.language": "语言",
  "menu.home": "回到 huozi.app",
  "menu.exit": "退出",
  "menu.disconnect": "断开连接",

  // 成员管理
  "members.title": "成员",
  "members.subtitle.owner":
    "邀请协作者、查看谁有访问权限，以及移除你不再希望保留在此 workspace 的成员。",
  "members.subtitle.member": "可访问此 workspace 的成员。",
  "members.invite.heading": "邀请协作者",
  "members.invite.placeholder": "ta@example.com",
  "members.invite.submit": "邀请",
  "members.invite.submitting": "发送中…",
  "members.invite.note":
    "对方将收到一封 7 天内有效的邀请邮件，接受后即成为本 workspace 的成员。",
  "members.list.heading": "成员（{count}）",
  "members.list.you": "（你）",
  "members.list.remove": "移除",
  "members.list.removeConfirm": "移除该成员？",
  "members.role.owner": "owner",
  "members.role.member": "member",
  "members.invites.heading": "待接受邀请（{count}）",
  "members.invites.expires": "{date} 过期",
  "members.invites.revoke": "撤销",
  "members.invites.revokeConfirm": "撤销此邀请？",
  // 成员的 keys 展开列表
  "members.keys.summary": "{count} 把 key",
  "members.keys.revoke": "撤销",
  "members.keys.revokeConfirm": "撤销这把 key？此操作不可撤销。",
  "members.keys.lastUsed": "最后使用 {rel}",
  "members.keys.neverUsed": "未使用",
  "members.error.invite_failed": "邀请发送失败。",
  "members.error.already_member": "该邮箱已是成员。",
  "members.error.remove_failed": "移除失败。",
  "members.error.owner_only": "只有 workspace owner 可以执行此操作。",

  // 文件夹 ACL
  "folders.title": "目录权限",
  "folders.subtitle":
    "锁定一个目录，仅指定成员可以读写其下文件。Workspace owner 也不能绕过——只能看到自己被加入的目录。",
  "folders.create.heading": "新建私密目录",
  "folders.create.placeholder": "funds/fund-A/",
  "folders.create.note":
    "路径必须以 / 结尾。子目录继承父目录权限。只有下方勾选的成员能读写。",
  "folders.create.submit": "锁定目录",
  "folders.create.submitting": "锁定中…",
  "folders.members.heading": "可访问成员",
  "folders.members.you": "（你）",
  "folders.list.heading": "私密目录（{count}）",
  "folders.list.empty": "还没有私密目录。在上方新建一个。",
  "folders.list.memberCount": "{count} 名成员",
  "folders.list.edit": "编辑",
  "folders.list.save": "保存",
  "folders.list.cancel": "取消",
  "folders.list.makePublic": "改为公开",
  "folders.makePublicConfirm":
    "取消锁定？所有 workspace 成员都将可以读写此目录。",
  "folders.error.create_failed": "创建 ACL 失败。",
  "folders.error.update_failed": "更新 ACL 失败。",
  "folders.error.empty_members": "至少选择一名成员。",
  "folders.error.self_excluded":
    "你必须保留自己在 ACL 内——把自己踢出去会让目录无法恢复。",
  "folders.error.member_not_in_workspace": "选中的成员已不在此 workspace。",
  "folders.error.not_in_acl":
    "此目录是私密的——必须已是成员才能编辑 ACL。",
  "folders.error.invalid_path_prefix": "路径需相对且不可含 '..' 段。",
  "folders.error.empty_path_prefix": "路径不能为空。",
  // Modal 专用
  "folders.modal.heading": "目录权限",
  "folders.modal.publicTitle": "公开",
  "folders.modal.publicHint": "任何 workspace 成员",
  "folders.modal.privateTitle": "私密",
  "folders.modal.privateHint": "仅指定成员",
  "folders.error.load_failed": "加载访问信息失败。",

  // Dashboard

  // Dashboard new page

  // Settings

  // Workspace setup

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

  // /start — 安装指南








  // /start 页上的 InstallPicker





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

  // CSV · 行详情
  "csv.rowDetail.title": "行详情",
  "csv.rowDetail.open": "查看此行详情",
  "csv.rowDetail.close": "关闭",
  "csv.rowDetail.rowOf": "第 {n} 行 / 共 {total} 行",
  "csv.rowDetail.empty": "—",
} as const;
