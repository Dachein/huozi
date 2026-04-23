export const ja = {
  // Nav
  "nav.home": "huozi.app",
  "nav.getStarted": "はじめる",
  "nav.signIn": "ログイン",
  "nav.workspace": "ワークスペース",
  "nav.signUp": "新規登録",
  "nav.docs": "ドキュメント",
  "nav.cloud": "Cloud",
  "nav.edge": "Edge",
  "nav.blog": "ブログ",

  // Home hero
  "home.title1": "文以載道",
  "home.title2.highlight": "活字",
  "home.title2.rest": "為器",
  "home.divider": "文",
  "home.subtitle1": "エージェント向けクラウドドライブ。",
  "home.subtitle2": "Claude Codeのファイルツール方言を話す。MCPクライアントからマウント可能。",
  "home.cta.start": "はじめる",
  "home.cta.signIn": "ログイン",
  "home.cta.preview": "プレビュー",

  // Home features
  "home.feat1.icon": "云",
  "home.feat1.title": "エージェント向けクラウドドライブ",
  "home.feat1.desc": "MCPでワークスペースをマウント。エージェントが既に知っているRead/Edit/Write/Glob/Grepがそのまま使える — 新しいツールを覚える必要なし。",
  "home.feat2.icon": "器",
  "home.feat2.title": "Claude Codeとビット単位で互換",
  "home.feat2.desc": "同じスキーマ、エラーコード、セッションキャッシュ。Claude Code、Cursor、Desktop、または生HTTP — すべて交換可能。",
  "home.feat3.icon": "时",
  "home.feat3.title": "ライブ同期 + 履歴",
  "home.feat3.desc": "すべてのコミットが約100msでWeb UIにブロードキャスト。すべてのファイルに完全なコミットログ。マルチエージェント原子書き込み。",

  // Home · 2つのエディション
  "home.products.label": "2つのエディション",
  "home.products.footnote": "同じMCPサーフェス、同じAgent方言。バイトをどこに置くかを選ぶだけ。",

  "home.cloud.tagline": "huozi.appのホスティング版。メール認証、ワークスペース作成、60秒でClaude Codeと接続。チームとマルチAgent協業のために設計。",
  "home.cloud.bullet1": "メール認証、マルチユーザー、Agentごとの独立APIキー",
  "home.cloud.bullet2": "Web UIへのリアルタイムWebSocket同期",
  "home.cloud.bullet3": "公開共有URL、任意の6桁パスコード付き",
  "home.cloud.cta": "Cloudを見る",

  "home.edge.tagline": "同じドライブを自分のCloudflareまたはVercelでホスト。一人デプロイヤー、一ワークスペース、Supabase不要。MITライセンス。",
  "home.edge.bullet1": "edge ランタイム以外の外部依存ゼロ",
  "home.edge.bullet2": "キー貼り付け認証 — メールや登録不要",
  "home.edge.bullet3": "ワンクリックデプロイ、独自ドメイン対応",
  "home.edge.cta": "Edgeを見る",

  // Home · 共通機能
  "home.shared.label": "両方で共有",

  // Home CTA band
  "home.install.title": "60秒で開始",

  // Home code
  "home.code.title": "マウントしてファイルを書く",

  // /cloud hero
  "cloud.hero.tagline1": "エージェント向けのハードドライブ。",
  "cloud.hero.tagline2": "Claude Code のファイルツール方言を話す。自分の Agent を持ち込む。Agent が書き、人が読む。",
  "cloud.cta.signIn": "ログイン",
  "cloud.cta.open": "ワークスペースを開く",
  "cloud.cta.connectAgent": "Agent を接続",

  // /workspace — 空状態オンボーディング
  "ws.status.title": "あなたのワークスペース",
  "ws.status.connectedAgents": "接続中の Agent",
  "ws.status.browserSession": "ブラウザセッション",
  "ws.status.never": "—",
  "ws.status.now": "たった今",
  "ws.status.activeKeys": "有効なキー",
  "ws.status.lastActivity": "最終アクティビティ",
  "ws.status.manage": "管理",
  "ws.status.connectNew": "新規接続",

  // キー期限ラベル (sliding-window TTL)
  "ws.expiry.never": "期限なし",
  "ws.expiry.expired": "期限切れ",
  "ws.expiry.inDays": "{n} 日後に期限切れ",
  "ws.expiry.inHours": "{n} 時間後に期限切れ",
  "ws.expiry.inMinutes": "あと {n} 分で期限切れ",
  "ws.expiry.hint": "スライディングウィンドウ — リクエストごとに期限がリセットされます。",

  // TTL プリセットラベル
  "ws.ttl.1d": "1 日",
  "ws.ttl.7d": "7 日",
  "ws.ttl.30d": "30 日",
  "ws.ttl.180d": "180 日",
  "ws.ttl.never": "なし",

  // キーごとの操作
  "ws.action.copy": "コピー",
  "ws.action.copied": "コピー済み",
  "ws.action.revoke": "取り消す",
  "ws.action.revoking": "取り消し中…",
  "ws.action.confirmRevoke": "「{label}」を取り消しますか？このキーを使用している Agent は即座に停止します。元に戻せません。",

  // /workspace 入力済み状態の紹介 + ヘルプカード + フッター
  "ws.filled.intro": "左側のツリーからファイルを選んで表示します。Markdown と HTML は huozi.app 公開ページと同じようにレンダリングされます。このワークスペースにアクセスできる Agent はいつでもファイルを編集可能 —— ファイルを開くと変更が履歴タブに表示されます。",
  "ws.filled.browse.title": "閲覧",
  "ws.filled.browse.desc": "ツリー（モバイルでは ☰）を使用。フォルダは展開状態を記憶します。",
  "ws.filled.history.title": "履歴",
  "ws.filled.history.desc": "すべてのファイルに履歴リンクがあり、そのファイルに触れたすべてのコミットを表示します。",
  "ws.filled.search.title": "検索",
  "ws.filled.search.desc": "ツリー上部の検索ボックスで名前を絞り込みます。",
  "ws.filled.footer.about": "huozi Cloud について",
  "ws.filled.footer.apiDocs": "API ドキュメント",


  "ws.onboard.heading": "何か作ってみよう",
  "ws.onboard.subheading": "下のシナリオをコピーして Agent に貼り、最初のファイルがここにリアルタイムで現れるのを見てみましょう。作りたい形式を選んで — あとは Agent に任せます。",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "週次レビュー",
  "ws.onboard.md.scenario": "自由形式のメモ — 執筆、思考、ログに。閲覧時は Markdown としてレンダリング。",
  "ws.onboard.md.prompt": "今週の週報を書いて：リリースした 3 件、詰まっている 2 件、来週試したいアイデア 1 件。reviews/2026-w17.md に Markdown 見出しと短い箇条書きで。",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "データテーブル",
  "ws.onboard.csv.scenario": "構造化表データ。ソート可能なテーブルでレンダリング。行単位で拡張しやすい。",
  "ws.onboard.csv.prompt": "data/ai-milestones-2025.csv に、過去 1 年の AI 企業の注目イベント 12 件を追跡する CSV を作って。列: date, company, event, impact_note。時系列順に並べる。",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "ビジュアルページ",
  "ws.onboard.html.scenario": "リッチなレンダリング — 挿絵、チャート、カバーページ。HTML として安全にレンダリング。",
  "ws.onboard.html.prompt": "cover/movable-type.html に活版印刷についての美しい HTML カバーページを作って。温かみのあるベージュのグラデーション背景、セリフ書体、なぜ重要かを説明する短い段落。主要な発明のシンプルな Echarts タイムラインも含める。",

  "ws.onboard.copy": "プロンプトをコピー",
  "ws.onboard.copied": "コピー済み",

  // Home open source
  "home.oss.title": "オープンソース",
  "home.oss.desc": "Markdown & HTMLパブリッシングを自己ホスト。データベース不要、KVのみ。MITライセンス。",
  "home.oss.deployCF": "Cloudflareにデプロイ",
  "home.oss.deployVercel": "Vercelにデプロイ",
  "home.oss.soon": "近日公開",

  // Home footer
  "home.footer": "活字 — AI時代の活版印刷",

  // Auth
  "auth.login.title": "Huoziにログイン",
  "auth.login.subtitle": "メールアドレスを入力。パスワード不要。",
  "auth.login.checkEmail": "メールで認証コードを確認してください。",
  "auth.login.email": "メールアドレス",
  "auth.login.code": "認証コード",
  "auth.login.sendCode": "認証コードを送信",
  "auth.login.sending": "送信中...",
  "auth.login.verify": "認証",
  "auth.login.verifying": "認証中...",
  "auth.login.changeEmail": "別のメールアドレスを使用",
  "auth.login.newHere": "初めての方",
  "auth.login.guide": "スタートガイド",

  // Dashboard

  // Dashboard new page

  // Settings
  "settings.title": "設定",
  "settings.subtitle": "ワークスペースとAPIキーを管理。",
  "settings.workspace": "ワークスペース",
  "settings.workspaceDesc": "ワークスペースのURLプレフィックス。",
  "settings.apiKeys": "APIキー",
  "settings.apiKeysDesc": "APIキーを使用してAIエージェントやスクリプトからページを公開。",
  "settings.apiUsage": "API使用法",
  "settings.apiUsageDesc": "ページを公開する簡単な例：",
  "settings.getStarted": "はじめる",
  "settings.getStartedDesc": "Claude Code MCP、OpenClaw、または会話型APIの設定方法を学ぶ。",
  "settings.viewGuide": "スタートガイドを見る",

  // Workspace setup
  "workspace.setup.title": "ワークスペースを設定",
  "workspace.setup.desc": "ワークスペースのユニークなスラグを選択してください。ページURLの一部になります。",
  "workspace.setup.label": "ワークスペーススラグ",
  "workspace.setup.placeholder": "your-name",
  "workspace.setup.submit": "ワークスペースを作成",
  "workspace.setup.loading": "作成中...",

  // API Key manager
  "apiKey.created": "APIキーが作成されました！今すぐコピーしてください — 再表示されません。",
  "apiKey.copy": "コピー",
  "apiKey.dismiss": "閉じる",
  "apiKey.nameLabel": "キー名",
  "apiKey.namePlaceholder": "例：Claude Agent",
  "apiKey.create": "キーを作成",
  "apiKey.creating": "作成中...",
  "apiKey.confirmRevoke": "このAPIキーを取り消しますか？元に戻せません。",
  "apiKey.neverUsed": "未使用",
  "apiKey.lastUsed": "最終使用",
  "apiKey.revoke": "取り消し",
  "apiKey.empty": "APIキーがありません。APIで公開するにはキーを作成してください。",

  // Conversational install
  "install.copyButton": "コピーしてインストール",
  "install.copied": "コピー済み！",

  // /start — インストールガイド
  "start.meta.title": "はじめる — huozi Cloud",
  "start.meta.description":
    "一行のコマンド、または一つのプロンプト。Agent に渡して、リンクを一回クリック。完了。",
  "start.hero.title": "はじめる",
  "start.hero.subtitle":
    "プロンプト 1 つ、クリック 1 回で完了。MCP 対応の任意の Agent で動作。",

  "start.fastest.title": "最速 · 一行コマンド",
  "start.fastest.badge": "Node ≥ 18",
  "start.fastest.desc1":
    "下記と同じ OAuth デバイスフローを実行します。クライアント（Claude Code / Cursor / OpenClaw）を自動検出し、ブラウザを開いて認証を求め、MCP 設定を適切な場所に書き込みます。",
  "start.fastest.desc2Before": "Agent に伝えてください：",
  "start.fastest.tellAgent": "npx huozi-mcp を実行して認証を手伝って",
  "start.fastest.desc2After": "—— あとは Agent が処理します。",

  "start.prompt.title": "1 · または、このプロンプトを Agent に貼り付け",
  "start.prompt.badge": "Agent 可読",
  "start.prompt.desc":
    "Claude Code、Cursor、OpenClaw、または HTTP を扱える任意の Agent で動作します。Agent が手順を読んで実行し、あなたはブラウザで Authorize を一度クリックするだけです。",
  "start.prompt.langNote":
    "（英語のまま —— LLM はどれも英語をネイティブに読めます。）",

  "start.authorize.title": "2 · Agent がリンクを出力 —— Authorize をクリック",
  "start.authorize.example":
    "→ https://huozi.app/device?code=ABCD-1234 を開いて Authorize をクリック。",
  "start.authorize.desc":
    "任意のブラウザで開きます。huozi.app にログインしていなければ、一度限りのメール OTP を実行。その後「どの Agent が要求しているか」「どのワークスペースにアクセスするか」と Authorize ボタンが表示されます。クリックしてタブを閉じてください。",

  "start.done.title": "3 · Agent が自動接続 · 完了",
  "start.done.descBefore":
    "数秒以内に Agent が鍵を取得し、MCP サーバーを登録し、次のように報告します：",
  "start.done.connectedPhrase": "✓ ワークスペース … に接続",
  "start.done.descAfter":
    "。以降、Agent のあらゆるリクエストが huozi ワークスペースを読み書き可能になります。",
  "start.done.manageBefore":
    "接続管理、ファイル閲覧、取消はいつでもこちらから：",
  "start.done.manageAfter": "。",

  "start.manual.summary": "Agent なし？手動で",
  "start.manual.desc":
    "同じフローはただの HTTP です — 自分で curl を実行できます：",
  "start.manual.noteBefore":
    "すでに huozi.app にログイン済み？Cursor / OpenClaw 用の設定スニペットを直接取得することもできます：",
  "start.manual.noteAfter": "。",

  "start.footer.mcp.title": "MCP リファレンス",
  "start.footer.mcp.desc":
    "すべての huozi_* ツール、JSON-RPC 形式、リアルタイムイベント。",
  "start.footer.cloud.title": "Cloud について",
  "start.footer.cloud.desc":
    "なぜ Agent にコミット履歴付きの共有ドライブが必要なのか。",
  "start.footer.edge.title": "セルフホスト（Edge）",
  "start.footer.edge.desc":
    "同じドライブを、あなた自身の Cloudflare / Vercel にデプロイ。MIT。",

  // /start の InstallPicker
  "start.picker.title": "クライアント別のインストール",
  "start.picker.subtitle":
    "クライアントを選んでください —— 該当するパスだけを表示します。MCP はツール、Skill / Rules はノウハウを加えます。大抵は両方必要です。",
  "start.picker.generic.name": "汎用 / その他",

  "start.picker.content.claude-code.mcp.body":
    "Claude Code の拡張方法は MCP —— ツール記述自体が Agent に必要な文脈を全て担います。任意のシェルでこれを実行すると、CLI がブラウザを開いてワンクリック認証、Claude Code のユーザースコープ MCP 設定に書き込み、新しいシェルで有効になります。",

  "start.picker.content.cursor.mcp.body":
    "Cursor はリモート MCP をネイティブサポート。統合ターミナル（⌘J）を開いてこれを実行 —— ~/.cursor/mcp.json に書き込まれ、Reload Window（⌘⇧P）で反映されます。",

  "start.picker.content.openclaw.mcp.body":
    "これを実行すれば OpenClaw の MCP 層は設定完了。CLI が ~/.openclaw/openclaw.json の mcp.servers.huozi（transport: streamable-http）に書き込みます。OpenClaw を再起動で反映。",
  "start.picker.content.openclaw.skill.body":
    "OpenClaw のネイティブ生態系は ClawHub —— Skill はここでは一級市民です。現在は手動配置、公開後は `openclaw skills install huozi/mcp` で完了します。",
  "start.picker.content.openclaw.skill.note":
    "ClawHub 公開は準備中。Skill を表示するのは OpenClaw だけです —— そこが Skill のネイティブな慣習だから。Claude Code と Cursor のユーザーは MCP 一本で十分。",

  "start.picker.content.generic.mcp.body":
    "HTTP を扱える任意の Agent 向け。このプロンプトを Agent に貼り付け —— Agent が手順を読み、curl デバイスフローを実行し、自身の MCP 設定を書き込みます。あなたはブラウザで Authorize を一回クリックするだけ。",
  "start.picker.content.generic.mcp.note":
    "英語のまま —— LLM はどれも英語をネイティブに読みますし、ステップを訳すと微妙にずれるリスクがあります。stdio / HTTP のどんな MCP クライアントでも動作。",

  // Connect-Agent ページ
  "connect.back": "← ワークスペース",
  "connect.title": "Agent を接続",
  "connect.desc":
    "3 ステップ：Agent を選ぶ → スニペットを貼る → リクエストを送る。初回呼び出しを自動検出して接続を確認します。Agent ごとに独立した鍵、いつでも取り消し可能。",

  "connect.step1": "1 · Agent を選ぶ",
  "connect.step2": "2 · {title} に貼り付け",
  "connect.step3": "3 · 接続を確認",

  "connect.agent.claude-code.tagline": "ターミナルで一行",
  "connect.agent.claude-code.blurb":
    "任意のシェルで実行。Claude Code は huozi をリモート MCP サーバーとして登録 —— すべてのプロジェクトで使用可能に。",
  "connect.agent.cursor.tagline": "mcp.json に追加",
  "connect.agent.cursor.blurb":
    "~/.cursor/mcp.json（またはプロジェクトの .cursor/mcp.json）に追加し、Cursor を再読み込み。",
  "connect.agent.openclaw.tagline": "openclaw.json を編集",
  "connect.agent.openclaw.blurb":
    "~/.openclaw/openclaw.json の mcp.servers 以下に追加し、OpenClaw を再起動。",

  "connect.label.title": "この鍵にラベル（Connected Agents に表示）",
  "connect.generate": "{title} 用の鍵を生成",
  "connect.generating": "生成中…",
  "connect.copy": "コピー",
  "connect.copied": "コピー済み",
  "connect.generateFirst": "先に鍵を生成してください",

  "connect.rawKey.show": "生の API 鍵を表示",
  "connect.rawKey.note":
    "平文は保存しません —— 今すぐコピーしてください。紛失した場合は workspace ページから取り消し・再発行できます。",

  "connect.waiting.title": "{title} からの接続を待機中…",
  "connect.waiting.desc":
    "上のスニペットを貼り付けてから、任意のリクエストを送ってください —— 初回呼び出しを自動検出します。",

  "connect.done.title": "{title} 接続完了",
  "connect.done.detected": "初回ツール呼び出し時刻：",
  "connect.done.note":
    "このページは閉じて構いません —— 取り消すまで Agent は鍵を使い続けます。",
  "connect.done.goto": "ワークスペースへ →",
  "connect.done.another": "別の Agent を接続",

  "connect.footer.back": "← ワークスペースに戻る",
  "connect.footer.start": "Agent に自分でインストールさせる（OAuth デバイスフロー）→",
  "connect.footer.docs": "API ドキュメント",

  "connect.terminal.title": "ターミナル派？一行で完結：",
  "connect.terminal.desc":
    "Claude Code、Cursor、OpenClaw —— シェルを持つ任意の Agent で動きます。同じ OAuth フローを実行し、MCP 設定を自動で書き込みます。",
} as const;
