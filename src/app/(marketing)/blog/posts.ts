import type { Locale } from "@/lib/i18n";

type PostMeta = {
  title: string;
  excerpt: string;
};

export type Post = {
  slug: string;
  date: string;
  meta: Record<Locale, PostMeta>;
};

export const posts: Post[] = [
  {
    slug: "what-is-huozi",
    date: "2026-04-23",
    meta: {
      zh: {
        title: "Huozi 是什么",
        excerpt:
          "从毕昇的活字、德格印经院的木刻，到 Agent 时代的数字优盘 —— 为什么我们给这个产品起名叫「活字」。",
      },
      en: {
        title: "What is Huozi",
        excerpt:
          "From Bi Sheng's movable type and the Derge Printing House to a digital USB drive for the Agent era — why we named this product Huozi.",
      },
      ja: {
        title: "Huozi とは何か",
        excerpt:
          "畢昇の活字、デルゲ印経院の木版、そして Agent 時代のデジタル USB —— なぜこのプロダクトを「活字」と名付けたか。",
      },
      fr: {
        title: "Qu'est-ce que Huozi",
        excerpt:
          "Des caractères mobiles de Bi Sheng à l'imprimerie de Derge, jusqu'à la clé USB numérique de l'ère des Agents — pourquoi nous l'avons appelé Huozi.",
      },
    },
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
