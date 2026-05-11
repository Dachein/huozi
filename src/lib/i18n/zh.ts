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
  "recent.filter.view.label": "过滤",
  "recent.filter.view.works": "作品",
  "recent.filter.view.assets": "素材",

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
  "ws.search.placeholder": "搜索文件名或文件内容…",
  "ws.search.noMatch": "没有匹配的文件。",
  "ws.search.fileMatches": "文件名匹配",
  "ws.search.contentMatches": "内容匹配",
  "ws.search.searching": "正在搜索内容…",
  "ws.search.noContentMatch": "没有内容命中。",
  "ws.search.truncated": "结果已截断,请输入更具体的关键词。",
  "ws.search.error": "搜索出错,请稍后重试。",

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
  "ws.status.collapse": "收起",

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


  // 4 件套类目名 — see app/docs/four-types.md
  "ws.types.all": "全部",
  "ws.types.table": "表",
  "ws.types.document": "文",
  "ws.types.collection": "集",
  "ws.types.page": "版",
  "ws.types.other": "其他",

  // Collection (.jsonl) 渲染器
  "ws.coll.view.current": "当前",
  "ws.coll.view.stream": "流水",
  "ws.coll.view.table": "表格",
  "ws.coll.view.timeline": "时间线",
  "ws.coll.entities": "{n} 个实体",
  "ws.coll.events": "{n} 行事件",
  "ws.coll.errors": "{n} 行解析错误",
  "ws.coll.empty.title": "这是一集 Collection",
  "ws.coll.empty.body": "Collection 是 huozi 的 4 件套之一,记录有身份和时间的实体流水。让 Agent 追加第一条事件来开始。",
  "ws.coll.empty.prompt": "在这个 jsonl 文件里追加第一条事件。每行是一个 JSON 对象,至少有 id 字段(实体身份),建议加 at(时间)、by(操作人)、op(动作)。append-only,不要原地改老行。",
  "ws.coll.deleted": "已删除",
  "ws.coll.pickEntity": "选一个实体看它的时间线",
  "ws.coll.backToList": "← 返回",
  "ws.coll.fields": "字段",
  "ws.coll.search": "搜索",
  "ws.coll.historicalView": "正在查看历史版本",
  "ws.coll.peekDiff": "按住 Space 看变化",

  "ws.onboard.heading": "开始造你的客户管理库",
  "ws.onboard.subheading": "复制一段场景话术，粘给你的 Agent。这 4 张卡是一个完整 CRM 的 4 件套——表 / 文 / 集 / 版 各司其职，每张产出一个真实文件。",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "一份客户跟进话术",
  "ws.onboard.md.scenario": "Document — 连续叙述。适合 SOP、知识、说明、笔记。Markdown 渲染。",
  "ws.onboard.md.prompt": "在 crm/playbook.md 写一份客户跟进 SOP：第一次接触、需求挖掘、报价谈判、成交跟进 4 个阶段，各给 3 条具体话术。用 Markdown 标题加列表。",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "一张客户名册",
  "ws.onboard.csv.scenario": "Spreadsheet — 同构网格数据。适合主数据、清单、横截面分析。可排序表格。",
  "ws.onboard.csv.prompt": "在 crm/customers.csv 建一张客户名册，记录 8 家 SMB 客户，覆盖 3 个不同行业。列：name、industry、size、region、contact_name、phone、since。",

  "ws.onboard.jsonl.badge": ".jsonl",
  "ws.onboard.jsonl.title": "一集客户互动流水",
  "ws.onboard.jsonl.scenario": "Collection — 实体集合。每条带身份和时间，append-only 自带历史。",
  "ws.onboard.jsonl.prompt": "在 crm/interactions.jsonl 建一份客户互动流水（jsonl，每行一条事件，append-only）。给客户 cust_acme 写 4 条事件：电话沟通、发送提案、客户反馈、签约成交。每行字段：id（事件 id）、at（时间）、by（操作人）、op（动作如 call / proposal_sent / feedback / closed_won）、customer_id，以及该动作相关字段（备注、金额等）。",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "一个客户提案页",
  "ws.onboard.html.scenario": "Page — 视觉成品。富渲染、可发布、可分享。安全 HTML，5 种 format。",
  "ws.onboard.html.prompt": "在 crm/proposals/acme-2026-q2.html 帮我做一份给客户 Acme 的年度服务提案页。温和米色背景、衬线字体、3 页：封面（公司主题）、价值主张（3 个要点）、报价（年度 ¥52,000，含 4 项服务）。",

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
  "auth.selectWorkspace.title": "选择工作空间",
  "auth.selectWorkspace.subtitle": "你属于 {count} 个工作空间，挑一个进入。",

  // /authorize — OAuth 同意页（consent）
  "auth.authorize.error.title": "无法授权",
  "auth.authorize.error.missingSession.title": "缺少 session",
  "auth.authorize.error.missingSession.body":
    "URL 缺少 session 参数。请从你的 Agent 重新发起连接。",
  "auth.authorize.error.expired":
    "此授权请求已过期（15 分钟限制）。请从你的 Agent 重新发起。",
  "auth.authorize.error.alreadyConsumed": "此授权请求已被使用过。",
  "auth.authorize.error.notFound": "找不到此授权请求。",
  "auth.authorize.connectTitle": "连接 {client}",
  "auth.authorize.workspaceLabel": "将访问的工作区",
  "auth.authorize.permissionsLabel": "权限",
  "auth.authorize.tokenReturnsToLabel": "令牌将返回到",
  "auth.authorize.deny": "拒绝",
  "auth.authorize.approve": "授权",
  "auth.authorize.processing": "处理中…",
  "auth.authorize.tokenSecurity":
    "授权后，{client} 将获得短期 access token（1 小时）+ 可吊销的 refresh token。",
  "auth.authorize.tokenContext": "token 由 MCP 客户端持有，不进入对话上下文。",
  "auth.authorize.scope.mcp": "读取 · 写入 · 分享此工作区文件",
  "auth.authorize.scope.read": "读取此工作区文件",
  "auth.authorize.scope.write": "写入此工作区文件",
  "auth.authorize.scope.share": "创建公开分享链接",

  // /authorize/done — 授权成功落地页（branded "成"）
  "auth.authorize.done.heading": "已连接 {client}",
  "auth.authorize.done.workspaceLabel": "工作区",
  "auth.authorize.done.countingLoopback": "{seconds} 秒后向 {client} 发送令牌…",
  "auth.authorize.done.countingRemote": "{seconds} 秒后跳回 {client}…",
  "auth.authorize.done.buttonRemote": "立即跳转",
  "auth.authorize.done.buttonLoopback": "立即发送",
  "auth.authorize.done.triggeringRemote": "正在跳回 {client}…",
  "auth.authorize.done.triggeringLoopback": "正在向 {client} 写入令牌…",
  "auth.authorize.done.doneRemote": "已发送授权，正在返回 {client}…",
  "auth.authorize.done.doneLoopback": "令牌已发送，可返回 {client} 终端继续",
  "auth.authorize.done.openWorkspace": "或者打开工作区",
  "auth.authorize.done.viewWorkspace": "查看工作区",
  "auth.authorize.done.tokenSecurity":
    "授权令牌由 {client} 持有，不会进入对话上下文。",
  "auth.authorize.done.tokenContext":
    "可在工作区「已连接 Agent」中随时吊销。",

  // 邀请链接落地页
  "invite.notFound.title": "邀请不存在",
  "invite.notFound.message": "这个邀请链接无效或已被删除。",
  "invite.accepted.title": "已接受过",
  "invite.accepted.message": "这个邀请已经被接受过。如果未登录，请先登录。",
  "invite.revoked.title": "邀请已撤销",
  "invite.revoked.message": "所有者已撤销此邀请，请联系对方重新发送。",
  "invite.expired.title": "邀请已过期",
  "invite.expired.message": "邀请超过 7 天已过期，请联系所有者重发。",
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
  "switcher.heading": "切换工作空间",

  // 用户菜单（顶部下拉）
  "menu.nav.files": "文件",
  "menu.nav.shares": "分享",
  "menu.nav.members": "成员",
  "menu.nav.folders": "目录权限",
  "menu.identity.signedIn": "已登录",
  "menu.identity.workspace": "工作空间",
  "menu.language": "语言",
  "menu.theme": "主题",
  "theme.default.name": "纸",
  "theme.brutalMono.name": "琥珀",
  "theme.office.name": "简素",
  "theme.applying": "应用主题",
  "theme.confirm.title": "切换风格",
  "theme.confirm.body": "切换到「{name}」？页面会刷新以应用新风格。",
  "theme.confirm.experimental": "新粗野主义风格——实验性，视觉冲击较强。",
  "theme.confirm.action": "确认切换",
  "theme.confirm.cancel": "取消",
  "locale.confirm.title": "切换语言",
  "locale.confirm.body": "切换到「{name}」？",

  // 通用确认对话框 —— 撤销 / 移除 等
  "confirm.revokeKey.title": "撤销 key",
  "confirm.revokeKey.body": "撤销「{label}」？使用此 key 的 Agent 会立刻停工。",
  "confirm.revokeKey.warning": "此操作不可撤销。",
  "confirm.revokeKey.action": "撤销",
  "confirm.revokeShare.title": "撤销分享链接",
  "confirm.revokeShare.body": "撤销「{path}」的分享？链接立即失效，已保存链接的访问者会得到 404。",
  "confirm.revokeShare.action": "撤销",
  "confirm.removeMember.title": "移除成员",
  "confirm.removeMember.body": "移除该成员？他们将立即失去对此工作空间的访问权限。",
  "confirm.removeMember.action": "移除",
  "confirm.cancelInvite.title": "撤销邀请",
  "confirm.cancelInvite.body": "撤销此邀请？",
  "confirm.cancelInvite.action": "撤销",
  "confirm.makePublic.title": "改为公开",
  "confirm.makePublic.body": "取消锁定？所有工作空间成员都将可以读写此目录。",
  "confirm.makePublic.action": "确认",
  "confirm.cancel": "取消",
  "menu.home": "huozi.app 官网",
  "menu.exit": "退出",
  "menu.disconnect": "断开连接",

  // 表格列头（成员 / 待接受邀请）
  "members.col.email": "邮箱",
  "members.col.role": "角色",
  "members.col.keys": "key 数",
  "members.col.expires": "过期",
  "members.col.actions": "",

  // 成员管理
  "members.title": "成员",
  "members.subtitle.owner":
    "邀请协作者、查看谁有访问权限，以及移除你不再希望保留在此工作空间的成员。",
  "members.subtitle.member": "可访问此工作空间的成员。",
  "members.invite.heading": "邀请协作者",
  "members.invite.placeholder": "ta@example.com",
  "members.invite.submit": "邀请",
  "members.invite.submitting": "发送中…",
  "members.invite.note":
    "对方将收到一封 7 天内有效的邀请邮件，接受后即成为本工作空间的成员。",
  "members.list.heading": "成员（{count}）",
  "members.list.empty": "暂无成员。邀请协作者后，他们会在这里出现。",
  "members.list.you": "（你）",
  "members.list.remove": "移除",
  "members.list.removeConfirm": "移除该成员？",
  "members.role.owner": "所有者",
  "members.role.member": "成员",
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
  "members.error.owner_only": "只有工作空间所有者可以执行此操作。",

  // 文件夹 ACL
  "folders.title": "目录权限",
  "folders.subtitle":
    "锁定一个目录，仅指定成员可以读写其下文件。工作空间所有者也不能绕过——只能看到自己被加入的目录。",
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
    "取消锁定？所有工作空间成员都将可以读写此目录。",
  "folders.error.create_failed": "创建 ACL 失败。",
  "folders.error.update_failed": "更新 ACL 失败。",
  "folders.error.empty_members": "至少选择一名成员。",
  "folders.error.self_excluded":
    "你必须保留自己在 ACL 内——把自己踢出去会让目录无法恢复。",
  "folders.error.member_not_in_workspace": "选中的成员已不在此工作空间。",
  "folders.error.not_in_acl":
    "此目录是私密的——必须已是成员才能编辑 ACL。",
  "folders.error.invalid_path_prefix": "路径需相对且不可含 '..' 段。",
  "folders.error.empty_path_prefix": "路径不能为空。",
  // Modal 专用
  "folders.modal.heading": "目录权限",
  "folders.modal.publicTitle": "公开",
  "folders.modal.publicHint": "任何工作空间成员",
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
  "connect.agent.codex.tagline": "终端一行命令",
  "connect.agent.codex.blurb":
    "OpenAI Codex CLI 用 codex mcp add 注册 —— bearer 通过 env var 间接读，token 不落 plaintext。在 shell rc 里 export 后重启 codex。",
  "connect.agent.hermes.tagline": "改 ~/.hermes/config.yaml",
  "connect.agent.hermes.blurb":
    "Hermes Agent（Nous Research）。把下面的 yaml 段贴进 ~/.hermes/config.yaml 的 mcp_servers，然后在会话里 /reload-mcp 生效。",

  "connect.label.title": "给这把 key 起个名（在 Connected Agents 里显示）",
  "connect.generate": "为 {title} 生成 key",
  "connect.generating": "生成中…",
  "connect.copy": "复制",
  "connect.copied": "已复制",
  "connect.generateFirst": "先生成 key",

  "connect.rawKey.show": "显示原始 API key",
  "connect.rawKey.note":
    "我们不存明文 —— 现在就复制。丢了可在工作空间页面吊销并重新发一把。",

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

  // CSV · 行详情
  "csv.rowDetail.title": "行详情",
  "csv.rowDetail.open": "查看此行详情",
  "csv.rowDetail.openHint": "Space 查看行 · Enter 编辑",
  "csv.rowDetail.close": "关闭",
  "csv.rowDetail.rowOf": "第 {n} 行 / 共 {total} 行",
  "csv.rowDetail.empty": "—",

  // ConnectPicker — /workspace 顶部连接卡。两段对照 huozi.app/start:
  // 选择一 = Agent driven device flow (RFC 8628), 选择二 = 客户端原生 CLI/GUI (RFC 8252)
  "connect.picker.dropdown.label": "1. 选你用的 Agent",
  "connect.picker.choice1.title": "选择一 · 让 Agent 自己装",
  "connect.picker.choice1.badge": "RFC 8628 · 适合云端/headless Agent",
  "connect.picker.choice1.desc":
    "把这句话贴给任意 chat-mode Agent(Hermes / OpenClaw / Cowork / Claude Code 等)。它会去本部署的 /llms.txt 读完整安装协议,自己跑 RFC 8628 device flow:给你一个 /device 链接,你点一次 Approve,Agent 拿到 key、写好配置、调用 huozi_whoami 验证。",
  "connect.picker.choice2.title": "选择二 · 按客户端 CLI / GUI 安装",
  "connect.picker.choice2.badge": "RFC 8252 · 适合本地终端用户",
  "connect.picker.choice2.desc":
    "选你的客户端拿一行命令(或一段配置)。每个客户端有自己原生的 `mcp add` CLI 或 GUI 入口,首次调用 huozi 时自动弹浏览器走 OAuth。",
  "connect.picker.note.claude-code":
    "终端粘贴一次:注册 + 触发 OAuth + 确认身份",
  "connect.picker.note.openclaw":
    "终端粘贴一次:注册 huozi 到 ~/.openclaw/openclaw.json,首次调用弹浏览器 OAuth",
  "connect.picker.note.hermes":
    "终端粘贴一次:`--auth oauth` 触发 RFC 8252 PKCE 浏览器 OAuth(需 TTY 与本地浏览器)",
  "connect.picker.note.codex":
    "把 TOML 块写进 ~/.codex/config.toml,然后跑 codex mcp login huozi 走浏览器 OAuth(token 由 codex 本地持有)",
  "connect.picker.note.cursor":
    "一键添加到 Cursor,Cursor 原生接管;首次调用 huozi 自动弹浏览器 OAuth,无需 reload",
  "connect.picker.cursor.button": "一键添加到 Cursor",
  "connect.picker.note.cowork":
    "在 Cowork:Customize → Connectors → + Add custom connector,粘下面的 URL",
  "connect.picker.note.generic":
    "把这个 URL 粘进你 host 的 MCP 配置,host 自己处理 OAuth-on-first-use",
  "connect.picker.endpointLabel": "Endpoint:",
  "connect.picker.tokenSecurity":
    "授权令牌由 MCP 客户端持有,不会进入对话上下文。",
  "connect.picker.copy": "复制",
  "connect.picker.copied": "✓ 已复制",

  // Inline edit (workspace view)
  "editor.inline.button": "编辑",
  "editor.inline.title": "编辑选区",
  "editor.inline.save": "保存",
  "editor.inline.saving": "保存中…",
  "editor.inline.cancel": "取消",
  "editor.inline.scope.md": "正在编辑 markdown 段落",
  "editor.inline.scope.html": "正在编辑元素",
  "editor.inline.scope.csv": "正在编辑单元格",
  "editor.inline.scope.jsonl": "正在编辑字段",
  "editor.inline.hint.jsonl": "JSONL 编辑会替换该实体最新行的字段值。",
  "editor.inline.error.stale": "文件已变化，请刷新后重试。",
  "editor.inline.error.notfound": "选区已不在文件中，请刷新后重新选择。",
  "editor.inline.error.ambiguous": "选区在文件中不唯一，请选长一点。",
  "editor.inline.error.forbidden": "你没有写权限。",
  "editor.inline.error.generic": "编辑失败: {message}",
} as const;
