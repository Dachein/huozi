"use client";

/**
 * HomePerspectives — three angles into huozi: 印 / 版 / 盘.
 *
 *   印 (MCP)    → the print: bit-exact Claude Code dialect, mountable
 *                 from any MCP client.
 *   版 (STYLE)  → the layout: Markdown, CSV, HTML — typeset by default.
 *   盘 (CLOUD)  → the drive: cloud workspace, multi-Agent collab,
 *                 self-host Edge.
 *
 * Picking a tab swaps the eyebrow line, three feature cards, and the
 * code example below — all in-place, no navigation. The code blocks
 * stay in English (commands are literal) but every label and prose
 * line flows through the i18n dictionary.
 */

import { useState } from "react";
import { useT } from "@/lib/i18n/context";

type Perspective = "mcp" | "style" | "cloud";

const PERSPECTIVES: Perspective[] = ["mcp", "style", "cloud"];

const TAB_GLYPH: Record<Perspective, string> = {
  mcp: "印",
  style: "版",
  cloud: "盘",
};

const CARD_GLYPHS: Record<Perspective, [string, string, string]> = {
  mcp: ["镜", "具", "通"],
  style: ["文", "表", "式"],
  cloud: ["处", "协", "享"],
};

const CODE_BODY: Record<Perspective, string> = {
  mcp: `# Mount the workspace in any MCP client:
claude mcp add --transport http huozi https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_your_key"

# Agent now has Read / Edit / Write / Glob / Grep
# plus huozi_batch_edit and huozi_history — the same
# dialect it learned from Claude Code. No retraining.`,

  style: `# Ask the Agent — pick a layout in plain language:
> turn this week's recap into a 16:9 pitch deck

# Agent → huozi_template({ format: "deck" })
#       → fills the 16:9 self-scaling stage
#       → huozi_share → huozi.app/p/<random>
#
# Five layouts: deck · story · paper · mobile · page`,

  cloud: `# Cloud — hosted, multi-Agent collaboration:
#   sign in at huozi.app
#   issue one key per Agent (Claude Code, Cursor, …)
#   every write live-syncs to the same workspace.

# Or self-host Edge — same drive on your own infra:
git clone github.com/dachein/huozi && deploy   # MIT`,
};

export function HomePerspectives() {
  const t = useT();
  const [active, setActive] = useState<Perspective>("mcp");

  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground text-center mb-6 font-serif">
        {t("home.persp.label")}
      </p>

      {/* Tab pills — three big CJK glyphs with English roman name underneath. */}
      <div
        role="tablist"
        aria-label={t("home.persp.label")}
        className="flex flex-wrap justify-center gap-3 sm:gap-4 mb-10"
      >
        {PERSPECTIVES.map((p) => {
          const isActive = p === active;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(p)}
              className={`group flex flex-col items-center gap-1 px-6 sm:px-8 py-3 rounded-xl border transition-all ${
                isActive
                  ? "border-foreground/40 bg-muted/60 shadow-sm"
                  : "border-border/50 hover:border-foreground/30 hover:bg-muted/30"
              }`}
            >
              <span
                className={`font-serif font-bold text-3xl sm:text-4xl leading-none transition-colors ${
                  isActive ? "text-accent" : "text-muted-foreground/60 group-hover:text-accent/70"
                }`}
              >
                {TAB_GLYPH[p]}
              </span>
              <span
                className={`text-[10px] sm:text-xs uppercase tracking-[0.25em] transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {t(`home.persp.${p}.tab`)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Per-perspective subtitle — one line, central, italic-feeling serif. */}
      <p className="text-center text-base sm:text-lg text-muted-foreground font-serif mb-10 max-w-2xl mx-auto">
        {t(`home.persp.${active}.subtitle`)}
      </p>

      {/* Three feature cards — same shape, content swaps with the active tab. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        {[0, 1, 2].map((i) => (
          <FeatureCard
            key={`${active}-${i}`}
            icon={CARD_GLYPHS[active][i]}
            title={t(`home.persp.${active}.card${i + 1}.title`)}
            desc={t(`home.persp.${active}.card${i + 1}.desc`)}
          />
        ))}
      </div>

      {/* Code example — title flows through i18n, body is verbatim English. */}
      <p className="text-sm font-medium text-muted-foreground mb-4 text-center font-serif tracking-wider">
        {t(`home.persp.${active}.code.title`)}
      </p>
      <pre className="rounded-xl border border-border bg-muted/50 p-6 text-sm overflow-x-auto font-mono leading-relaxed">
        <code>{CODE_BODY[active]}</code>
      </pre>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-7 transition-all hover:border-border hover:shadow-sm min-h-[180px] flex flex-col">
      <div className="font-serif text-2xl text-accent mb-3">{icon}</div>
      <h3 className="font-serif text-base font-bold mb-2">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
