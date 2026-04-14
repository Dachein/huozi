export const zh = {
  // Nav
  "nav.home": "huozi.app",
  "nav.getStarted": "开始使用",
  "nav.signIn": "登录",
  "nav.signUp": "注册",
  "nav.docs": "文档",
  "nav.pages": "页面",
  "nav.settings": "设置",
  "nav.signOut": "退出登录",

  // Home hero
  "home.title1": "以文载道",
  "home.title2.highlight": "活字",
  "home.title2.rest": "为器",
  "home.divider": "文",
  "home.subtitle1": "将 Markdown 与 HTML 化为可分享的网页。",
  "home.subtitle2": "为 AI 智能体与开发者而造。",
  "home.cta.start": "开始使用",
  "home.cta.signIn": "登录",
  "home.cta.preview": "预览",

  // Home features
  "home.feat1.icon": "书",
  "home.feat1.title": "一键发布",
  "home.feat1.desc": "一个 API 调用，Markdown 或 HTML 即刻化为美观的网页。无需构建，无需部署。",
  "home.feat2.icon": "器",
  "home.feat2.title": "为智能体而造",
  "home.feat2.desc": "RESTful API，Bearer 认证。AI Agent 可直接调用发布内容，无缝集成工作流。",
  "home.feat3.icon": "道",
  "home.feat3.title": "工作空间",
  "home.feat3.desc": "自定义工作空间与链接。你的内容，你的品牌，你的域名路径。",

  // Home conversational install
  "home.install.title": "对话安装",
  "home.install.desc": "复制以下内容，粘贴到 Claude Code 或任意 AI Agent，即刻完成注册与配置。",

  // Home code
  "home.code.title": "一次调用，即刻发布",

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
  "dashboard.pages": "页面",
  "dashboard.newPage": "新建页面",
  "dashboard.noPages": "暂无页面",
  "dashboard.noPagesDesc": "创建你的第一个页面，或通过 API 发布 Markdown 或 HTML。",
  "dashboard.draft": "草稿",
  "dashboard.confirmDelete": "确定要删除这个页面吗？",
  "dashboard.copyUrl": "复制链接",
  "dashboard.openPage": "打开页面",
  "dashboard.delete": "删除",

  // Dashboard new page
  "dashboard.new.title": "新建页面",
  "dashboard.new.titleLabel": "标题",
  "dashboard.new.slug": "路径",
  "dashboard.new.content": "内容 (Markdown)",
  "dashboard.new.publish": "发布",
  "dashboard.new.publishing": "发布中...",
  "dashboard.new.cancel": "取消",

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

  // Get started
  "start.title": "开始使用",
  "start.subtitle": "选择你喜欢的方式开始使用活字发布内容。",
  "start.method1.title": "对话安装",
  "start.method1.desc": "复制以下内容，粘贴到 Claude Code 或任意 AI Agent。Agent 会引导你完成注册、验证和配置。",
  "start.method1.flow": "流程：",
  "start.method1.step1": "Agent 询问邮箱，调用注册 API",
  "start.method1.step2": "查看邮箱，将验证码告诉 Agent",
  "start.method1.step3": "Agent 验证后，询问你的工作空间 slug",
  "start.method1.step4": "创建工作空间 + 生成 API Key — 即刻可用",
  "start.method2.title": "OpenClaw / ClawHub",
  "start.method3.title": "Claude Code (MCP)",
  "start.rawApi": "显示原始 API 示例（用于脚本和直接集成）",
  "start.apiRef": "API 参考",
  "start.apiRefLink.desc": "完整的 API 文档，包含所有端点、参数和示例。",
  "start.apiDocAgentLink.desc": "为 AI Agent 优化的 API 参考 — 可直接粘贴到 Agent 上下文中。",
  "start.endpoint": "端点",
  "start.method": "方法",
  "start.description": "描述",
  "start.auth": "认证",
  "start.footer": "活字 — 以文载道，活字为器",

  // Method 2: OpenClaw
  "start.method2.desc": "从 ClawHub 安装 Huozi 技能，通过 OpenClaw 直接发布 Markdown 或 HTML。",
  "start.method2.installSkill": "安装技能",
  "start.method2.orCli": "或通过 OpenClaw CLI：",
  "start.method2.configure": "配置",
  "start.method2.configureDesc": "将你的 API 密钥设为环境变量：",
  "start.method2.usage": "使用",
  "start.method2.usageDesc": "安装后，告诉你的 Agent：",
  "start.method2.usagePrompt": "帮我把这个 markdown 发布到 huozi",

  // Method 3: Claude Code MCP
  "start.method3.desc": "将 Huozi 添加为 Claude Code MCP 服务器，直接在对话中发布 Markdown 与 HTML。",
  "start.method3.installMcp": "安装 MCP 服务器",
  "start.method3.configureKey": "配置 API 密钥",
  "start.method3.configureKeyDesc": "将 API 密钥添加到 MCP 服务器环境：",
  "start.method3.usageThen": "然后在 Claude Code 中说：",
  "start.method3.usagePrompt": "帮我把这篇文档发布到 Huozi",

  // Raw API
  "start.rawApi.signup": "注册",
  "start.rawApi.verify": "验证",
  "start.rawApi.setup": "创建工作空间",
  "start.rawApi.publish": "发布",
} as const;
