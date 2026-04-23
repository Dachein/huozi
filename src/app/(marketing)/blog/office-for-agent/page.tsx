import Link from "next/link";
import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { getPost } from "../posts";
import { ArticleZH } from "./content.zh";
import { ArticleEN } from "./content.en";

const post = getPost("office-for-agent")!;

export async function generateMetadata(): Promise<Metadata> {
  const zh = post.meta.zh;
  const en = post.meta.en;
  return {
    title: `${zh.title} / ${en.title} — huozi.app`,
    description: `${zh.excerpt} — ${en.excerpt}`,
    openGraph: {
      title: `${zh.title} / ${en.title}`,
      description: zh.excerpt,
      siteName: "活字 Huozi",
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      card: "summary_large_image",
      title: `${zh.title} / ${en.title}`,
      description: en.excerpt,
    },
  };
}

const backLabels = {
  zh: "← 返回博客",
  en: "← Back to blog",
  ja: "← ブログに戻る",
  fr: "← Retour au blog",
} as const;

export default async function OfficeForAgentPost() {
  const locale = await getLocale();
  const back = backLabels[locale] ?? backLabels.en;
  const zh = post.meta.zh;
  const en = post.meta.en;

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <nav className="mb-10">
        <Link
          href="/blog"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {back}
        </Link>
      </nav>

      <header className="mb-12 border-b border-border/60 pb-8">
        <time className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-serif">
          {post.date}
        </time>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-bold leading-tight tracking-tight">
          {zh.title}
        </h1>
        <h2 className="mt-2 font-serif text-xl sm:text-2xl font-normal leading-tight tracking-tight text-muted-foreground">
          {en.title}
        </h2>
        <p className="mt-6 text-base leading-relaxed">{zh.excerpt}</p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed italic">
          {en.excerpt}
        </p>
      </header>

      <section aria-label="中文版本" lang="zh">
        <LangBadge label="中文" />
        <ArticleZH />
      </section>

      <div className="my-20 flex items-center justify-center gap-4">
        <span className="block w-20 h-px bg-border" />
        <span className="text-accent text-lg font-serif">双 · Eng</span>
        <span className="block w-20 h-px bg-border" />
      </div>

      <section aria-label="English version" lang="en">
        <LangBadge label="English" />
        <ArticleEN />
      </section>

      <footer className="mt-16 border-t border-border/60 pt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          href="/blog"
          className="inline-flex items-center rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium hover:border-foreground/40 transition-colors"
        >
          {back}
        </Link>
        <Link
          href="/docs"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          查看完整 MCP 文档 / See the MCP reference →
        </Link>
      </footer>
    </article>
  );
}

function LangBadge({ label }: { label: string }) {
  return (
    <div className="mb-6 inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-serif">
      {label}
    </div>
  );
}
