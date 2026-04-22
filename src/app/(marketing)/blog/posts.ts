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
    slug: "mcp-design-principles",
    date: "2026-04-23",
    meta: {
      zh: {
        title: "文件系统、Workspace、不要向量化 —— huozi MCP 的设计原则",
        excerpt:
          "为什么我们把 Agent 当工程师对待：一个真正的文件系统、一个 Workspace 而非单文档、逐字节对齐 Claude Code 的工具方言，以及 —— 像 Claude Code 一样，用 grep 而不是向量化。",
      },
      en: {
        title: "File System, Workspace, No Vectors — Huozi's MCP Design Principles",
        excerpt:
          "Why we treat Agents like engineers: a real file system, a Workspace rather than a single document, bit-exact parity with Claude Code's tool dialect, and — like Claude Code — grep instead of vector search.",
      },
      ja: {
        title: "ファイルシステム、Workspace、ベクトル検索しない —— huozi MCP の設計原則",
        excerpt:
          "なぜ我々は Agent をエンジニアのように扱うか：本物のファイルシステム、単一ドキュメントではなく Workspace、Claude Code のツール方言とビット単位で一致、そして Claude Code と同様に —— ベクトルではなく grep。",
      },
      fr: {
        title: "Système de fichiers, Workspace, pas de vecteurs — les principes de conception du MCP de Huozi",
        excerpt:
          "Pourquoi nous traitons les Agents comme des ingénieurs : un vrai système de fichiers, un Workspace plutôt qu'un document isolé, une parité bit-exacte avec le dialecte d'outils de Claude Code, et — comme Claude Code — grep plutôt que la recherche vectorielle.",
      },
    },
  },
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
