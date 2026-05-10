export const ja = {
  // Nav

  // Home hero

  // Home features

  // Home · 2つのエディション



  // Home · 共通機能

  // Home · 3つの視点（印 / 版 / 盘）—— タブ切替で下のカードとコードブロックがその場で変わる

  // 印 · MCP —— 字模即接口

  // 版 · STYLE —— 美しく描画されるバイト

  // 盘 · CLOUD —— ローカルではなくクラウドに住む


  // Home CTA band

  // Home code

  // /cloud hero

  // /cloud — 全ページ











  // /edge — 全ページ






  // マーケティングフッター — グルーピング

  // ワークスペース · 最近パネル
  "recent.title": "最近",
  "recent.op.new": "新規",
  "recent.op.edited": "編集",
  "recent.op.deleted": "削除",
  "recent.folderCreated": "フォルダ作成",
  "recent.filter.view.label": "フィルター",
  "recent.filter.view.works": "作品",
  "recent.filter.view.assets": "素材",

  // ワークスペース · ファイルビューのエラー / ヒント
  "view.error.label": "エラー",
  "view.error.aclDenied.title": "このフォルダは非公開です",
  "view.error.aclDenied.body": "このパスへのアクセス権がありません。メンバーに招待してもらうか、サイドバーから別のファイルを選んでください。",
  "view.readOnly.title": "このファイルを編集したい?",
  "view.readOnly.body": "接続中のAgent(Claude Code、Cursor、Claude Desktop、または任意のMCPクライアント)に依頼してください。huozi CloudのWeb UIは読み取り専用設計で、すべての書き込みはMCPの監査済みコミット経路を通ります。",

  // ワークスペース · サイドバー見出し（クリックでホームへ）
  "ws.shell.title": "Workspace",
  "ws.shell.subtitle": "管理 · 検索",
  "ws.stats.files": "ファイル",
  "ws.stats.recent": "最近の編集",
  "ws.stats.agents": "Agent",
  "ws.search.title": "ワークスペース内を検索",
  "ws.search.placeholder": "ファイル名やファイル内容を検索…",
  "ws.search.noMatch": "一致するファイルがありません。",
  "ws.search.fileMatches": "ファイル名一致",
  "ws.search.contentMatches": "コンテンツ一致",
  "ws.search.searching": "コンテンツを検索中…",
  "ws.search.noContentMatch": "コンテンツの一致なし。",
  "ws.search.truncated": "結果が切り詰められました。より具体的なキーワードで再検索してください。",
  "ws.search.error": "検索に失敗しました、もう一度お試しください。",

  // 共有ダイアログ — 有効期限
  "share.expiry.label": "リンクの有効期限",
  "share.expiry.hint": "期限切れのリンクは not found を返します。「無期限」で永続 URL に。",
  "share.expiry.30m": "30 分",
  "share.expiry.6h": "6 時間",
  "share.expiry.24h": "24 時間",
  "share.expiry.1mo": "1 か月",
  "share.expiry.never": "無期限",
  "share.expiry.expiresAt": "{when} に期限切れ",
  "share.expiry.permanent": "期限なし",

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
  "ws.status.collapse": "閉じる",

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


  // 4 つのデータ型カテゴリ — app/docs/four-types.md を参照。
  // 単漢字ラベルは huozi の活字印刷美学（印 / 版 / 盘）と整合。
  "ws.types.all": "すべて",
  "ws.types.table": "表",
  "ws.types.document": "文",
  "ws.types.collection": "集",
  "ws.types.page": "版",
  "ws.types.other": "その他",

  // Collection (.jsonl) レンダラー
  "ws.coll.view.current": "現在",
  "ws.coll.view.stream": "ストリーム",
  "ws.coll.view.table": "テーブル",
  "ws.coll.view.timeline": "タイムライン",
  "ws.coll.entities": "{n} エンティティ",
  "ws.coll.events": "{n} イベント",
  "ws.coll.errors": "{n} 解析エラー",
  "ws.coll.empty.title": "これは Collection です",
  "ws.coll.empty.body": "Collection は huozi の 4 つのデータ型の 1 つ — ID と時刻を持つエンティティの流れ。Agent に最初のイベントを追加するよう依頼してください。",
  "ws.coll.empty.prompt": "この jsonl ファイルに最初のイベントを追加して。各行は JSON オブジェクトで、少なくとも `id` フィールド（エンティティ ID）が必要。推奨: `at`（タイムスタンプ）、`by`（実行者）、`op`（動詞）。Append-only — 既存行をその場で編集しない。",
  "ws.coll.deleted": "削除済み",
  "ws.coll.pickEntity": "エンティティを選んでタイムラインを見る",
  "ws.coll.backToList": "← 戻る",
  "ws.coll.fields": "フィールド",
  "ws.coll.search": "検索",
  "ws.coll.historicalView": "過去バージョンを表示中",
  "ws.coll.peekDiff": "Space 長押しで差分表示",

  "ws.onboard.heading": "あなたの CRM を作ろう",
  "ws.onboard.subheading": "シナリオをコピーして Agent に貼り付けます。この 4 枚のカードは 4 つのデータ型が協働する形 — 表 / 文 / 集 / 版 — それぞれが小さな顧客管理ワークスペースで実ファイルを生み出します。",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "セールスプレイブック",
  "ws.onboard.md.scenario": "Document — 連続したテキスト。SOP、知識、ノート。Markdown でレンダリング。",
  "ws.onboard.md.prompt": "crm/playbook.md に顧客フォロー SOP を書いて。4 段階（初回接触、ニーズ発掘、提案・交渉、成約後フォロー）それぞれに具体的なトーク 3 本ずつ。Markdown 見出しと箇条書きで。",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "顧客名簿",
  "ws.onboard.csv.scenario": "Spreadsheet — 均質なグリッド。マスター、名簿、横断面。ソート可能なテーブル。",
  "ws.onboard.csv.prompt": "crm/customers.csv に SMB 顧客 8 社の名簿を作って、3 業種にまたがるように。列: name, industry, size, region, contact_name, phone, since。",

  "ws.onboard.jsonl.badge": ".jsonl",
  "ws.onboard.jsonl.title": "顧客対応ログ",
  "ws.onboard.jsonl.scenario": "Collection — エンティティの流れ、各行が ID と時刻を持つ。Append-only で履歴付き。",
  "ws.onboard.jsonl.prompt": "crm/interactions.jsonl に顧客対応ログを作って（jsonl、各行 1 イベント、append-only）。顧客 cust_acme に対し 4 イベントを追加：電話、提案送付、顧客フィードバック、成約。各行のフィールド: id（イベント id）、at（時刻）、by（実行者）、op（動詞：call / proposal_sent / feedback / closed_won）、customer_id、およびその動作に関連するフィールド（メモ、金額など）。",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "提案ページ",
  "ws.onboard.html.scenario": "Page — 完成したビジュアル成果物。サニタイズ済み HTML、5 種類のサブフォーマット。",
  "ws.onboard.html.prompt": "crm/proposals/acme-2026-q2.html に顧客 Acme への年間サービス提案ページを作って。温かみのあるベージュ背景、セリフ書体、3 ページ：カバー（テーマ）、価値提案（3 ポイント）、料金（年間 ¥52,000、4 サービス含む）。",

  "ws.onboard.copy": "プロンプトをコピー",
  "ws.onboard.copied": "コピー済み",

  // Home open source

  // Home footer

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

  // ワークスペース選択
  "auth.selectWorkspace.title": "ワークスペースを選択",
  "auth.selectWorkspace.subtitle":
    "あなたは {count} 個のワークスペースに所属しています。1つ選んでください。",

  // /authorize — OAuth 認可ページ
  "auth.authorize.error.title": "認可できません",
  "auth.authorize.error.missingSession.title": "セッションがありません",
  "auth.authorize.error.missingSession.body":
    "URL に session パラメータがありません。Agent から接続を再実行してください。",
  "auth.authorize.error.expired":
    "この認可リクエストは期限切れです（15 分制限）。Agent から再度実行してください。",
  "auth.authorize.error.alreadyConsumed": "この認可リクエストは使用済みです。",
  "auth.authorize.error.notFound": "この認可リクエストが見つかりません。",
  "auth.authorize.connectTitle": "{client} に接続",
  "auth.authorize.workspaceLabel": "アクセス先のワークスペース",
  "auth.authorize.permissionsLabel": "権限",
  "auth.authorize.tokenReturnsToLabel": "トークンの返送先",
  "auth.authorize.deny": "拒否",
  "auth.authorize.approve": "承認",
  "auth.authorize.processing": "処理中…",
  "auth.authorize.tokenSecurity":
    "承認後、{client} は短期 access token（1 時間）と取り消し可能な refresh token を受け取ります。",
  "auth.authorize.tokenContext":
    "トークンは MCP クライアントが保持し、会話コンテキストには入りません。",
  "auth.authorize.scope.mcp":
    "このワークスペースのファイルを読み取り・書き込み・共有",
  "auth.authorize.scope.read": "このワークスペースのファイルを読み取り",
  "auth.authorize.scope.write": "このワークスペースのファイルを書き込み",
  "auth.authorize.scope.share": "公開共有リンクを作成",

  // /authorize/done — 認可完了ランディング
  "auth.authorize.done.heading": "{client} に接続しました",
  "auth.authorize.done.workspaceLabel": "ワークスペース",
  "auth.authorize.done.countingLoopback":
    "{seconds} 秒後に {client} へトークンを送信します…",
  "auth.authorize.done.countingRemote":
    "{seconds} 秒後に {client} へ戻ります…",
  "auth.authorize.done.buttonRemote": "今すぐ戻る",
  "auth.authorize.done.buttonLoopback": "今すぐ送信",
  "auth.authorize.done.triggeringRemote": "{client} へ戻っています…",
  "auth.authorize.done.triggeringLoopback":
    "{client} へトークンを書き込んでいます…",
  "auth.authorize.done.doneRemote":
    "認可を送信しました。{client} へ戻っています…",
  "auth.authorize.done.doneLoopback":
    "トークンを送信しました。{client} のターミナルに戻って続行できます。",
  "auth.authorize.done.openWorkspace": "またはワークスペースを開く",
  "auth.authorize.done.viewWorkspace": "ワークスペースを表示",
  "auth.authorize.done.tokenSecurity":
    "トークンは {client} が保持し、会話コンテキストには入りません。",
  "auth.authorize.done.tokenContext":
    "ワークスペースの「接続済み Agent」からいつでも取り消せます。",

  // 招待ページ
  "invite.notFound.title": "招待が見つかりません",
  "invite.notFound.message": "この招待リンクは無効か削除されています。",
  "invite.accepted.title": "受諾済み",
  "invite.accepted.message":
    "この招待はすでに受諾されています。サインインしていなければサインインしてください。",
  "invite.revoked.title": "招待が取り消されました",
  "invite.revoked.message":
    "ワークスペースのオーナーがこの招待を取り消しました。再送を依頼してください。",
  "invite.expired.title": "招待が期限切れです",
  "invite.expired.message":
    "招待は 7 日を過ぎました。ワークスペースのオーナーに再送を依頼してください。",
  "invite.welcome.title": "招待されました",
  "invite.welcome.invitedYouTo": "{inviter} があなたを招待しました",
  "invite.welcome.signInAs": "{email} でサインイン",
  "invite.welcome.codeNotice": "{email} に 6 桁のコードを送信します。",
  "invite.wrongAccount.title": "アカウントが一致しません",
  "invite.wrongAccount.message":
    "現在 {current} としてサインイン中ですが、この招待は {target} 宛です。先にサインアウトしてからリンクを開き直してください。",
  "invite.wrongAccount.signOut": "サインアウト",
  "invite.error.title": "招待を受諾できませんでした",

  // 参加トースト
  "joined.toast": "{slug} に参加しました",

  // ワークスペース切替
  "switcher.heading": "ワークスペースを切替",

  // ユーザーメニュー
  "menu.nav.files": "ファイル",
  "menu.nav.shares": "共有",
  "menu.nav.members": "メンバー",
  "menu.nav.folders": "フォルダ権限",
  "menu.identity.signedIn": "サインイン中",
  "menu.identity.workspace": "ワークスペース",
  "menu.language": "言語",
  "menu.theme": "テーマ",
  "theme.default.name": "紙",
  "theme.brutalMono.name": "ブロック",
  "theme.office.name": "事務",
  "theme.applying": "適用中",
  "theme.confirm.title": "スタイル切り替え",
  "theme.confirm.body": "「{name}」に切り替えますか？適用のためページを再読み込みします。",
  "theme.confirm.experimental": "Slock のクリエイティブ志向を参考にした実験用スタイルです。",
  "theme.confirm.action": "切り替え",
  "theme.confirm.cancel": "キャンセル",
  "locale.confirm.title": "言語切り替え",
  "locale.confirm.body": "「{name}」に切り替えますか？",

  "confirm.revokeKey.title": "key を取り消す",
  "confirm.revokeKey.body": "「{label}」を取り消しますか？このキーを使う Agent は即座に停止します。",
  "confirm.revokeKey.warning": "この操作は取り消せません。",
  "confirm.revokeKey.action": "取り消す",
  "confirm.revokeShare.title": "共有リンクを取り消す",
  "confirm.revokeShare.body": "「{path}」の共有を取り消しますか？URL は即座に無効になり、保存済みのリンクは 404 になります。",
  "confirm.revokeShare.action": "取り消す",
  "confirm.removeMember.title": "メンバーを削除",
  "confirm.removeMember.body": "このメンバーを削除しますか？このワークスペースへのアクセス権を失います。",
  "confirm.removeMember.action": "削除",
  "confirm.cancelInvite.title": "招待を取り消す",
  "confirm.cancelInvite.body": "この招待を取り消しますか？",
  "confirm.cancelInvite.action": "取り消す",
  "confirm.makePublic.title": "公開に変更",
  "confirm.makePublic.body": "ロックを解除しますか？すべてのワークスペースメンバーがこのフォルダを読み書きできるようになります。",
  "confirm.makePublic.action": "公開する",
  "confirm.cancel": "キャンセル",
  "menu.home": "huozi.app 公式サイト",
  "menu.exit": "ログアウト",
  "menu.disconnect": "切断",

  // メンバー管理
  "members.col.email": "メール",
  "members.col.role": "役割",
  "members.col.keys": "key 数",
  "members.col.expires": "有効期限",
  "members.col.actions": "",

  "members.title": "メンバー",
  "members.subtitle.owner":
    "コラボレーターを招待し、誰がアクセスできるかを確認し、不要になった人を削除できます。",
  "members.subtitle.member": "このワークスペースのアクセス権を持つ人々。",
  "members.invite.heading": "コラボレーターを招待",
  "members.invite.placeholder": "them@example.com",
  "members.invite.submit": "招待",
  "members.invite.submitting": "送信中…",
  "members.invite.note":
    "7 日間有効な招待リンクを記載したメールを送信します。受諾するとこのワークスペースのメンバーになります。",
  "members.list.heading": "メンバー ({count})",
  "members.list.empty": "メンバーはまだいません。招待したコラボレーターがここに表示されます。",
  "members.list.you": "(あなた)",
  "members.list.remove": "削除",
  "members.list.removeConfirm": "このメンバーを削除しますか？",
  "members.role.owner": "owner",
  "members.role.member": "member",
  "members.invites.heading": "保留中の招待 ({count})",
  "members.invites.expires": "{date} 期限切れ",
  "members.invites.revoke": "取り消し",
  "members.invites.revokeConfirm": "この招待を取り消しますか？",
  // メンバーごとの keys
  "members.keys.summary": "{count} 個のキー",
  "members.keys.revoke": "取り消し",
  "members.keys.revokeConfirm": "このキーを取り消しますか？元に戻せません。",
  "members.keys.lastUsed": "最終使用 {rel}",
  "members.keys.neverUsed": "未使用",
  "members.error.invite_failed": "招待の送信に失敗しました。",
  "members.error.already_member": "このメールアドレスはすでにメンバーです。",
  "members.error.remove_failed": "削除に失敗しました。",
  "members.error.owner_only": "ワークスペースのオーナーのみ実行できます。",

  // フォルダ ACL
  "folders.title": "フォルダ権限",
  "folders.subtitle":
    "特定メンバーのみが読み書きできるようフォルダをロック。オーナーもバイパス不可——招待されたフォルダしか見えません。",
  "folders.create.heading": "プライベートフォルダを作成",
  "folders.create.placeholder": "funds/fund-A/",
  "folders.create.note":
    "パスは / で終わる必要があります。サブフォルダは権限を継承します。下記の選択メンバーのみ読み書きできます。",
  "folders.create.submit": "フォルダをロック",
  "folders.create.submitting": "ロック中…",
  "folders.members.heading": "アクセスできるメンバー",
  "folders.members.you": "(あなた)",
  "folders.list.heading": "プライベートフォルダ ({count})",
  "folders.list.empty": "プライベートフォルダはまだありません。",
  "folders.list.memberCount": "{count} 人",
  "folders.list.edit": "編集",
  "folders.list.save": "保存",
  "folders.list.cancel": "キャンセル",
  "folders.list.makePublic": "公開に戻す",
  "folders.makePublicConfirm":
    "ロック解除しますか？ワークスペースの全員が再び読み書きできます。",
  "folders.error.create_failed": "ACL の作成に失敗。",
  "folders.error.update_failed": "ACL の更新に失敗。",
  "folders.error.empty_members": "少なくとも1人を選択してください。",
  "folders.error.self_excluded":
    "自分自身を ACL から外すことはできません — 復旧不能になります。",
  "folders.error.member_not_in_workspace":
    "選択されたメンバーはこのワークスペースにいません。",
  "folders.error.not_in_acl":
    "このフォルダはプライベートです — 編集には既にメンバーである必要があります。",
  "folders.error.invalid_path_prefix":
    "パスは相対で、'..' を含めないでください。",
  "folders.error.empty_path_prefix": "パスを入力してください。",
  // モーダル専用
  "folders.modal.heading": "フォルダ権限",
  "folders.modal.publicTitle": "公開",
  "folders.modal.publicHint": "ワークスペース全員",
  "folders.modal.privateTitle": "プライベート",
  "folders.modal.privateHint": "指定メンバーのみ",
  "folders.error.load_failed": "アクセス情報の読み込みに失敗。",

  // Dashboard

  // Dashboard new page

  // Settings

  // Workspace setup

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

  // /start — インストールガイド








  // /start の InstallPicker





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
  "connect.agent.codex.tagline": "ターミナル一行コマンド",
  "connect.agent.codex.blurb":
    "OpenAI Codex CLI は codex mcp add で登録 —— bearer は env-var 経由で間接読み込みなので token は config.toml に平文で残りません。shell rc で key を export して codex を再起動。",
  "connect.agent.hermes.tagline": "~/.hermes/config.yaml を編集",
  "connect.agent.hermes.blurb":
    "Hermes Agent（Nous Research）。下の YAML を ~/.hermes/config.yaml の mcp_servers に貼り、Hermes セッション内で /reload-mcp を実行。",

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

  // CSV · 行の詳細
  "csv.rowDetail.title": "行の詳細",
  "csv.rowDetail.open": "この行の詳細を表示",
  "csv.rowDetail.openHint": "Space で行 · Enter で編集",
  "csv.rowDetail.close": "閉じる",
  "csv.rowDetail.rowOf": "{total} 行中 {n} 行目",
  "csv.rowDetail.empty": "—",

  // ConnectPicker — /workspace の接続カード。huozi.app/start と対応:
  // 選択 1 = エージェント駆動の device flow (RFC 8628)、選択 2 = 各クライアント原生の CLI/GUI (RFC 8252)
  "connect.picker.dropdown.label": "1. エージェントを選択",
  "connect.picker.choice1.title": "選択 1 · Agent に自動でインストールさせる",
  "connect.picker.choice1.badge": "RFC 8628 · クラウド/headless 向け",
  "connect.picker.choice1.desc":
    "この一言を任意の chat-mode エージェント(Hermes / OpenClaw / Cowork / Claude Code 等)に貼り付け。本デプロイの /llms.txt から完全な手順を読み取り、自身で RFC 8628 device flow を実行 —— /device リンクを表示するので、Approve を 1 回クリック、エージェントが key を取得し config を書き込み、huozi_whoami で検証。",
  "connect.picker.choice2.title": "選択 2 · クライアント別 CLI / GUI インストール",
  "connect.picker.choice2.badge": "RFC 8252 · ローカル端末ユーザー向け",
  "connect.picker.choice2.desc":
    "クライアントを選んでワンライナー(または設定スニペット)を取得。各クライアントには自身の `mcp add` CLI または GUI エントリがあり、初回 huozi 呼び出しでブラウザを自動起動して OAuth を実行。",
  "connect.picker.note.claude-code":
    "ターミナルに一度貼り付け: 登録 + OAuth トリガー + 身元確認",
  "connect.picker.note.openclaw":
    "ターミナルに一度貼り付け: huozi を ~/.openclaw/openclaw.json に登録、初回呼び出しでブラウザ OAuth",
  "connect.picker.note.hermes":
    "ターミナルに一度貼り付け: --auth oauth で RFC 8252 PKCE ブラウザ OAuth(TTY とローカルブラウザが必要)",
  "connect.picker.note.codex":
    "TOML ブロックを ~/.codex/config.toml に追記、その後 codex mcp login huozi を実行してブラウザ OAuth(トークンは codex がローカル保持)",
  "connect.picker.note.cursor":
    "ワンクリック追加;Cursor がネイティブで処理,リロード不要;初回 huozi 呼び出しで自動でブラウザ OAuth",
  "connect.picker.cursor.button": "Cursor に追加",
  "connect.picker.note.cowork":
    "Cowork で: Customize → Connectors → + Add custom connector、下の URL を貼り付け",
  "connect.picker.note.generic":
    "この URL をホストの MCP 設定に貼り付け;ホスト側が OAuth-on-first-use を処理",
  "connect.picker.endpointLabel": "Endpoint:",
  "connect.picker.tokenSecurity":
    "トークンは MCP クライアントが保持。チャットの文脈には入りません。",
  "connect.picker.copy": "コピー",
  "connect.picker.copied": "✓ コピー済み",

  // Inline edit (workspace view)
  "editor.inline.button": "編集",
  "editor.inline.title": "選択範囲を編集",
  "editor.inline.save": "保存",
  "editor.inline.saving": "保存中…",
  "editor.inline.cancel": "キャンセル",
  "editor.inline.scope.md": "markdown ブロックを編集中",
  "editor.inline.scope.html": "要素を編集中",
  "editor.inline.scope.csv": "セルを編集中",
  "editor.inline.scope.jsonl": "フィールドを編集中",
  "editor.inline.hint.jsonl":
    "JSONL の編集はエンティティの最新行のフィールド値を置き換えます。",
  "editor.inline.error.stale":
    "ファイルが変更されました。再読み込みしてやり直してください。",
  "editor.inline.error.notfound":
    "選択範囲がファイルと一致しません。再読み込みして選び直してください。",
  "editor.inline.error.ambiguous":
    "選択範囲がファイル内で一意ではありません — もっと長く選択してください。",
  "editor.inline.error.forbidden": "このファイルへの書き込み権限がありません。",
  "editor.inline.error.generic": "編集に失敗しました: {message}",
} as const;
