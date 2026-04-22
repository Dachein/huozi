"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useT } from "@/lib/i18n/context";

/**
 * Login surface — email OTP. Design choices:
 *
 *   - serif display type for the heading, mirroring the homepage hero
 *   - a small red 启 ("begin") glyph between the title and the form,
 *     same family as the 载 divider on the homepage and 源 on /edge
 *   - underline-only inputs (no box borders) for a paper-like feel
 *   - pill-shaped CTA to match the homepage CTAs
 *   - a subtle mist gradient behind the form so the auth surface
 *     reads as part of the same visual world as the marketing pages
 */

function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/workspace";
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

  const dividerGlyph = step === "email" ? "启" : "验";

  return (
    <div className="relative w-full max-w-sm">
      {/* Soft mist backdrop, same visual language as the homepage hero */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-10 h-48 pointer-events-none -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 50%, var(--border), transparent)",
        }}
      />

      <div className="text-center mb-10">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-[0.08em]">
          {_("auth.login.title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {step === "email"
            ? _("auth.login.subtitle")
            : _("auth.login.checkEmail")}
        </p>
      </div>

      {/* Calligraphic divider */}
      <div className="mb-8 flex items-center justify-center gap-3" aria-hidden>
        <span className="block w-16 h-px bg-border" />
        <span
          className={`font-serif text-base text-accent transition-all duration-300 ${
            loading ? "opacity-50" : ""
          }`}
        >
          {dividerGlyph}
        </span>
        <span className="block w-16 h-px bg-border" />
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {/*
        One input, two stages. The field morphs (label, value source,
        placeholder, style) instead of appearing as a second form —
        keeps the eye rooted in the same spot throughout the flow.
      */}
      <form
        onSubmit={step === "email" ? handleSendCode : handleVerifyCode}
        className="space-y-6"
      >
        {step === "code" && (
          <div className="flex items-center justify-between text-xs text-muted-foreground -mb-2">
            <span className="font-mono truncate" title={email}>
              → {email}
            </span>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              className="underline underline-offset-4 hover:text-foreground transition-colors shrink-0 ml-3"
            >
              {_("auth.login.changeEmail")}
            </button>
          </div>
        )}

        <Field
          /* Stable id — same input, two roles. */
          id="auth-input"
          /* `key` forces autoFocus to re-fire on step change so the user
             doesn't have to click into the field after receiving the code. */
          key={step}
          type={step === "email" ? "email" : "text"}
          label={
            step === "email" ? _("auth.login.email") : _("auth.login.code")
          }
          value={step === "email" ? email : code}
          onChange={(v) => {
            if (step === "email") setEmail(v);
            else setCode(v.replace(/\D/g, "").slice(0, 8));
          }}
          placeholder={step === "email" ? "you@example.com" : "••••••••"}
          autoFocus
          autoComplete={step === "email" ? "email" : "one-time-code"}
          inputMode={step === "email" ? "email" : "numeric"}
          maxLength={step === "email" ? undefined : 8}
          mono={step === "code"}
          centered={step === "code"}
        />

        <PillButton
          loading={loading}
          disabled={
            step === "email" ? !email.trim() : code.length < 6
          }
        >
          {step === "email"
            ? loading
              ? _("auth.login.sending")
              : _("auth.login.sendCode")
            : loading
              ? _("auth.login.verifying")
              : _("auth.login.verify")}
        </PillButton>
      </form>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        {_("auth.login.newHere")}{" "}
        <Link
          href="/start"
          className="text-foreground underline underline-offset-4 hover:text-accent transition-colors"
        >
          {_("auth.login.guide")}
        </Link>
      </p>
    </div>
  );
}

/* ── small reusable bits ─────────────────────────────────────────────── */

function Field({
  id,
  type,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  autoComplete,
  inputMode,
  maxLength,
  mono,
  centered,
}: {
  id: string;
  type: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "email";
  maxLength?: number;
  mono?: boolean;
  centered?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs uppercase tracking-[0.15em] text-muted-foreground mb-2"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`w-full border-0 border-b border-border bg-transparent px-0 py-2
                   focus:outline-none focus:border-foreground/60
                   transition-colors
                   placeholder:text-muted-foreground/40
                   ${mono ? "font-mono tracking-[0.35em]" : "text-base"}
                   ${centered ? "text-center text-lg" : ""}`}
      />
    </div>
  );
}

function PillButton({
  loading,
  disabled,
  children,
}: {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="w-full rounded-full bg-foreground px-4 py-3 text-sm font-medium
                 text-background transition-all
                 hover:opacity-90 active:scale-[0.98]
                 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
                 flex items-center justify-center gap-2"
    >
      {loading && (
        <svg
          className="animate-spin h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="3"
          />
          <path
            d="M12 2 a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span>{children}</span>
    </button>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
