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
    slug: "office-for-agent",
    date: "2026-04-23",
    meta: {
      zh: {
        title: "为 Agent 设计 Office：拆开 Excel 的三层",
        excerpt:
          "Excel 把 DOM、计算、数据存储缝在一个文件里。Agent 时代应该把它们拆开 —— HTML 负责呈现，Python 负责计算，Agent 只管值。到什么规模才值得从 CSV 换成数据库？",
      },
      en: {
        title: "Office for Agent: Unbundling Excel's Three Layers",
        excerpt:
          "Excel stitches DOM, computation, and storage into one file. In the Agent era we should unbundle them — HTML renders, Python computes, the Agent manages values. And when does CSV stop being enough?",
      },
      ja: {
        title: "Agent 向けの Office を設計する：Excel の三層を解きほぐす",
        excerpt:
          "Excel は DOM・計算・データ保存を 1 つのファイルに縫い合わせている。Agent 時代にはそれを解きほぐすべきだ —— HTML で描画、Python で計算、Agent は値だけを見る。CSV とデータベースの境界線はどこに？",
      },
      fr: {
        title: "Office pour Agent : démonter les trois couches d'Excel",
        excerpt:
          "Excel colle DOM, calcul et stockage dans un seul fichier. À l'ère des Agents, il faut les séparer — HTML pour le rendu, Python pour le calcul, l'Agent gère les valeurs. Quand passer du CSV à une vraie base de données ?",
      },
    },
  },
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
