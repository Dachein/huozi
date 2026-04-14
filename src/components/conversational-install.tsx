"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/context";

const PROMPTS: Record<string, string> = {
  zh: `帮我注册并配置 Huozi (huozi.app) — 一个 Markdown 发布服务。无需密码，只要邮箱验证。

如果你支持 skills/插件，请先安装：npx clawhub install huozi
安装后 skill 会自动引导我完成注册。

如果不支持 skills，请用 curl 依次执行以下步骤：

1. 注册：POST https://huozi.app/api/v1/auth/signup
   Body: {"email": "<问我>"}
   → 先问我邮箱。

2. 验证：POST https://huozi.app/api/v1/auth/verify
   Body: {"email": "<第1步的邮箱>", "code": "<问我>"}
   → 我会查看邮箱告诉你验证码。

3. 创建工作空间：POST https://huozi.app/api/v1/auth/setup
   Header: Authorization: Bearer <第2步的access_token>
   Body: {"workspace_slug": "<建议一个>"}
   → 从我的邮箱 @ 前面部分建议一个 slug，告诉我"你的页面将发布在 huozi.app/xxx/"，问我是否需要修改，确认后再提交。

4. 保存返回的 api_key，以后发布用。

5. 访问 https://huozi.app/docs4agent 学习使用方式与最佳实践。

请一步步引导我完成。`,

  en: `Help me set up Huozi (huozi.app) — a Markdown publishing service. No password needed, just email verification.

If you support skills/plugins, install first: npx clawhub install huozi
The skill will auto-guide registration after install.

Otherwise, follow these steps using curl:

1. SIGNUP: POST https://huozi.app/api/v1/auth/signup
   Body: {"email": "<ask me>"}
   → Ask me for my email first.

2. VERIFY: POST https://huozi.app/api/v1/auth/verify
   Body: {"email": "<from step 1>", "code": "<ask me>"}
   → I'll check my email for the verification code and tell you.

3. SETUP: POST https://huozi.app/api/v1/auth/setup
   Header: Authorization: Bearer <access_token from step 2>
   Body: {"workspace_slug": "<suggest one>"}
   → Suggest a slug from my email prefix (e.g. alice@gmail.com → alice), show me "Your pages will be at huozi.app/alice/" and ask if I want to change it. Submit after I confirm.

4. Save the returned api_key for future use.

5. Read https://huozi.app/docs4agent for usage guide and best practices.

Walk me through it step by step.`,

  ja: `Huozi (huozi.app) のセットアップを手伝ってください — Markdown パブリッシングサービスです。パスワード不要、メール認証のみ。

skills/プラグインに対応している場合、先にインストール：npx clawhub install huozi
インストール後、skillが自動的に登録を案内します。

対応していない場合、curl で以下の手順を実行してください：

1. 登録：POST https://huozi.app/api/v1/auth/signup
   Body: {"email": "<聞いて>"}
   → まずメールアドレスを聞いてください。

2. 認証：POST https://huozi.app/api/v1/auth/verify
   Body: {"email": "<ステップ1のメール>", "code": "<聞いて>"}
   → メールで届いた認証コードをお伝えします。

3. ワークスペース作成：POST https://huozi.app/api/v1/auth/setup
   Header: Authorization: Bearer <ステップ2のaccess_token>
   Body: {"workspace_slug": "<提案して>"}
   → メールの@前の部分からslugを提案し、「ページは huozi.app/xxx/ で公開されます」と伝えて、変更するか確認してから送信。

4. 返ってきた api_key を保存。今後の公開に使います。

5. https://huozi.app/docs4agent を読んで、使い方とベストプラクティスを確認。

ステップごとに案内してください。`,

  fr: `Aide-moi à configurer Huozi (huozi.app) — un service de publication Markdown. Pas de mot de passe, juste une vérification par e-mail.

Si tu supportes les skills/plugins, installe d'abord : npx clawhub install huozi
Le skill guidera automatiquement l'inscription.

Sinon, suis ces étapes avec curl :

1. INSCRIPTION : POST https://huozi.app/api/v1/auth/signup
   Body: {"email": "<demande-moi>"}
   → Demande-moi mon e-mail d'abord.

2. VÉRIFICATION : POST https://huozi.app/api/v1/auth/verify
   Body: {"email": "<de l'étape 1>", "code": "<demande-moi>"}
   → Je vérifierai mon e-mail et te donnerai le code.

3. CONFIGURATION : POST https://huozi.app/api/v1/auth/setup
   Header: Authorization: Bearer <access_token de l'étape 2>
   Body: {"workspace_slug": "<suggère-en un>"}
   → Suggère un slug depuis le préfixe de mon e-mail (ex: alice@gmail.com → alice), montre-moi « Vos pages seront sur huozi.app/alice/ » et demande si je veux le changer. Soumets après confirmation.

4. Sauvegarde l'api_key retournée pour un usage futur.

5. Consulte https://huozi.app/docs4agent pour le guide d'utilisation et les bonnes pratiques.

Guide-moi étape par étape.`,
};

export function ConversationalInstall() {
  const [copied, setCopied] = useState(false);
  const _ = useT();
  const locale = useLocale();
  const prompt = PROMPTS[locale] || PROMPTS.en;

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="relative rounded-xl border border-border bg-muted/50 p-6">
      <pre className="text-sm whitespace-pre-wrap leading-relaxed font-mono pr-4 max-h-48 overflow-y-auto">
        <code>{prompt}</code>
      </pre>
      <div className="mt-5 flex justify-center">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {copied ? (
            <>
              <Check size={16} /> {_("install.copied")}
            </>
          ) : (
            <>
              <Copy size={16} /> {_("install.copyButton")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
