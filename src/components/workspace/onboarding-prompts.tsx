"use client";

import { useState } from "react";

export interface PromptCard {
  /** Badge, e.g. ".md" or ".csv" */
  badge: string;
  /** Accent character, e.g. 文 / 表 / 界 */
  glyph: string;
  title: string;
  scenario: string;
  prompt: string;
  copyLabel: string;
  copiedLabel: string;
}

interface OnboardingPromptsProps {
  heading: string;
  subheading: string;
  cards: PromptCard[];
}

/**
 * Scenario-driven onboarding for the empty workspace. Three cards,
 * each with a concrete prompt the user can copy and paste into their
 * connected Agent. The Agent then creates the first file of that type
 * — proving the round trip end-to-end.
 *
 * Rationale: we deliberately don't pre-seed files. The first commit in
 * the workspace should belong to the user's own intent, not to a
 * template we chose for them.
 */
export function OnboardingPrompts({
  heading,
  subheading,
  cards,
}: OnboardingPromptsProps) {
  return (
    <section>
      <div className="mb-5">
        <h2 className="font-serif text-lg font-bold tracking-wide">
          {heading}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          {subheading}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <Card key={i} card={card} />
        ))}
      </div>
    </section>
  );
}

function Card({ card }: { card: PromptCard }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(card.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background p-5 flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-serif text-2xl text-accent leading-none">
          {card.glyph}
        </span>
        <code className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
          {card.badge}
        </code>
      </div>

      <h3 className="font-serif text-base font-bold mb-1">{card.title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        {card.scenario}
      </p>

      <div className="mt-auto pt-3 border-t border-border/50">
        <pre className="text-[11px] text-muted-foreground font-mono whitespace-pre-wrap break-words bg-muted/40 rounded p-2.5 max-h-[88px] overflow-hidden leading-relaxed">
          {card.prompt}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="mt-2 w-full rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
        >
          {copied ? `✓ ${card.copiedLabel}` : card.copyLabel}
        </button>
      </div>
    </div>
  );
}
