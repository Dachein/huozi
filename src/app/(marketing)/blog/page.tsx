import Link from "next/link";
import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { posts } from "./posts";

export const metadata: Metadata = {
  title: "Blog — huozi.app",
  description:
    "Notes on Agent-native tools, the tradition of knowledge vessels, and why your data should outlive any one AI.",
};

const labels = {
  zh: { title: "博客", read: "阅读 / Read" },
  en: { title: "Blog", read: "Read / 阅读" },
  ja: { title: "ブログ", read: "読む / Read" },
  fr: { title: "Blog", read: "Lire / Read" },
} as const;

export default async function BlogIndex() {
  const locale = await getLocale();
  const L = labels[locale] ?? labels.en;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl font-bold tracking-tight">{L.title}</h1>
      <p className="mt-4 text-base leading-relaxed">
        关于 Agent 时代的工具、知识的器皿,以及为什么你的数据应该比任何一个 AI 活得更久。
      </p>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed italic">
        Notes on Agent-native tools, the tradition of knowledge vessels, and why
        your data should outlive any one AI.
      </p>

      <div className="mt-12 border-t border-border/60">
        {posts.map((post) => {
          const zh = post.meta.zh;
          const en = post.meta.en;
          return (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block border-b border-border/60 py-8 transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-col gap-2">
                <time className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-serif">
                  {post.date}
                </time>
                <h2 className="font-serif text-2xl font-bold leading-tight group-hover:text-accent transition-colors">
                  {zh.title}
                  <span className="ml-3 font-normal text-muted-foreground">
                    / {en.title}
                  </span>
                </h2>
                <p className="mt-1 text-sm leading-relaxed">{zh.excerpt}</p>
                <p className="text-sm text-muted-foreground leading-relaxed italic">
                  {en.excerpt}
                </p>
                <span className="mt-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
                  {L.read} →
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
