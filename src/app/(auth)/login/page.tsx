"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useT } from "@/lib/i18n/context";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const _ = useT();

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("code");
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{_("auth.login.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {step === "email"
            ? _("auth.login.subtitle")
            : _("auth.login.checkEmail")}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleSendCode} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              {_("auth.login.email")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? _("auth.login.sending") : _("auth.login.sendCode")}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email-display" className="block text-sm font-medium mb-1">
              {_("auth.login.email")}
            </label>
            <input
              id="email-display"
              type="email"
              value={email}
              disabled
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
            />
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium mb-1">
              {_("auth.login.code")}
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={8}
              placeholder="12345678"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? _("auth.login.verifying") : _("auth.login.verify")}
          </button>

          <button
            type="button"
            onClick={() => { setStep("email"); setCode(""); setError(""); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {_("auth.login.changeEmail")}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {_("auth.login.newHere")}{" "}
        <Link href="/start" className="text-foreground underline">
          {_("auth.login.guide")}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
