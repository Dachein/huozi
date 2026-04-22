export function ArticleEN() {
  return (
    <div className="prose-article">
      <P lead>
        Building tools for Agents is easy to get wrong. The most common
        failure mode is treating the Agent like a junior product
        operator and handing it a pile of API endpoints that sound
        product-shaped — <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">create_document</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">summarize_file</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">search_memory</code>. It looks
        smart, but every endpoint is a new vocabulary, a new mental
        model, a new round of prompt engineering.
      </P>

      <P>
        Huozi goes the opposite way. We believe{" "}
        <strong>Agents should be treated like engineers</strong> — so
        we hand them the things engineers use: a file system, a
        workspace, a set of Unix-flavoured primitive tools. This post
        lays out the five principles we designed around, and the
        reasoning behind each.
      </P>

      <H2>Principle 1: Maximally file-system-based</H2>

      <P>
        We didn&rsquo;t build a &ldquo;document API.&rdquo; We built a{" "}
        <strong>real file system</strong>, addressed by paths:
      </P>

      <Pre>{`huozi_read({ file_path: "notes/2026/w17-review.md" })
huozi_edit({
  file_path: "data/roadmap.csv",
  old_string: "Q2,Planning",
  new_string: "Q2,Shipping",
})
huozi_glob({ pattern: "drafts/**/*.md" })`}</Pre>

      <P>
        Why the file system? Because it is one of the most successful
        engineering abstractions of the last fifty years. Every
        engineer knows it. Every LLM has seen millions of examples of{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">ls</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">cat</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">grep</code>, and{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">sed</code> in its training
        corpus. There is no new grammar to teach.
      </P>

      <P>The file system gives us three things for free:</P>

      <Ul>
        <Li>
          <strong>Paths are information</strong>.{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">projects/2026/q2/roadmap.md</code>{" "}
          tells the Agent far more than an opaque{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">doc_7f3a8b</code> ever could —
          and in a handful of tokens.
        </Li>
        <Li>
          <strong>Composability</strong>. Agents can make directories,
          move files, glob a subtree, grep the whole tree. In a
          document API each of those is either impossible or another
          bespoke endpoint.
        </Li>
        <Li>
          <strong>Humans recognize it too</strong>. The tree renders
          directly in the Web UI; nobody has to decode an abstract
          object model to read their own work.
        </Li>
      </Ul>

      <H2>Principle 2: Workspace-oriented, not document-oriented</H2>

      <P>
        Once you have a file system, the next trap is treating it as
        &ldquo;a collection of isolated documents.&rdquo; But any
        realistic Agent task is about <strong>context</strong>: what
        does the project&rsquo;s directory structure look like? What
        conventions does the README spell out? Is there a similar
        existing file I can model mine on? What do recent commits tell
        me about what&rsquo;s going on?
      </P>

      <P>
        So Huozi&rsquo;s unit of addressability is not a document. It
        is a <strong>Workspace</strong>: a full, versioned file tree,
        every write landing in the same commit graph, the whole thing
        reasonable-about as a single project.
      </P>

      <Pre>{`# A real Agent turn:
> I want to add a new metric under analytics/

# The Agent won't just write blindly. It first:
huozi_glob({ pattern: "analytics/**" })              # see the shape
huozi_read({ file_path: "analytics/README.md" })     # read conventions
huozi_grep({ pattern: "defineMetric" })              # find prior art
huozi_history({ file_path: "analytics/retention.ts" }) # who changed this?
# — then, and only then, huozi_write the new file.`}</Pre>

      <P>
        That is an <strong>engineer&rsquo;s workflow</strong>. If we
        only gave the Agent a{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">create_document</code>, it would
        lose all of that context and have to write blind. The
        Workspace exists precisely so the Agent can look before it
        leaps.
      </P>

      <P>
        Commits are workspace-level, not file-level.{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_batch_edit</code> performs
        N changes across any number of files atomically, in one
        commit — essential for refactors that need cross-file
        consistency.
      </P>

      <H2>Principle 3: We ported Claude Code&rsquo;s codebase into the Workspace</H2>

      <P>
        Huozi&rsquo;s MCP tools — <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_read</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_edit</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_write</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_glob</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_grep</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_batch_edit</code>,{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_history</code> — are{" "}
        <strong>bit-exact with Claude Code&rsquo;s built-in file tools</strong>.
        Same schemas, same error codes, same line-offset pagination,
        same string-uniqueness contract on edit.
      </P>

      <P>
        This is not an accident. We{" "}
        <strong>deliberately ported the semantics of Claude Code&rsquo;s toolbox across</strong>:
        the same{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">old_string → new_string</code>{" "}
        replacement contract, the same{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">replace_all</code> flag, the same{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">file_unchanged</code> cache
        response, the same cat-n-style line numbers.
      </P>

      <P>Three reasons:</P>

      <Ul>
        <Li>
          <strong>Zero learning curve</strong>. Any Agent that already
          speaks Claude Code&rsquo;s dialect — Claude Code itself,
          Cursor, Claude Desktop, Anthropic&rsquo;s own SDK agents —
          works against Huozi immediately, without a single prompt
          tweak.
        </Li>
        <Li>
          <strong>Prompt-engineering compound interest</strong>. Every
          training signal, every eval, every piece of tribal knowledge
          Anthropic has published about &ldquo;how Agents use these
          tools effectively&rdquo; transfers to Huozi automatically.
        </Li>
        <Li>
          <strong>Interchangeability</strong>. An Agent moving from
          its local Claude Code context into a Huozi Workspace
          undergoes no cognitive switch. It&rsquo;s the same toolkit,
          just pointed at a different root. To the Agent, it&rsquo;s
          essentially a <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">cd</code>.
        </Li>
      </Ul>

      <H2>Principle 4: Grep, not vectors</H2>

      <P>
        This is the principle we get challenged on the most, and also
        the one we&rsquo;re most certain about.
      </P>

      <P>
        The reflex reaction for most &ldquo;Agent knowledge base&rdquo;
        products is to chunk everything, embed it, shove it into a
        vector store, and let the Agent do semantic search. Huozi
        refuses. Like Claude Code, we{" "}
        <strong>grep and glob on demand, returning ground truth</strong>.
      </P>

      <P>This is not laziness; it&rsquo;s deliberate:</P>

      <Ul>
        <Li>
          <strong>Grep returns facts. Embeddings return relevance scores.</strong>{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_grep(&quot;defineMetric&quot;)</code>{" "}
          tells you exactly which files, which lines. The Agent can go
          read the context, decide why it matched, and make a
          judgement. Vector search hands the Agent a black-box number
          it can&rsquo;t audit — &ldquo;these five files look related,
          similarity 0.87.&rdquo;
        </Li>
        <Li>
          <strong>Code and structured documents are lexical, not &ldquo;semantic.&rdquo;</strong>{" "}
          Whether you named it{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">getUserById</code> or{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">get_user_by_id</code> matters,
          and matters precisely. Embeddings blur that distinction
          away; grep preserves it. For engineering work, precision
          beats &ldquo;nearby&rdquo; by a huge margin.
        </Li>
        <Li>
          <strong>Indexes go stale. Grep doesn&rsquo;t.</strong> A
          vector store is always behind HEAD — every time an Agent
          writes, you have to re-index, or the next query hands back
          an out-of-date worldview. Grep reads the tree as it stands,
          right now. No sync problem to solve.
        </Li>
        <Li>
          <strong>Tokens are cheaper, and the answer is more honest</strong>.
          Vector search has to return top-K full chunks for the Agent
          to winnow; grep returns just matching lines and a couple of
          context lines. The Agent can decide exactly which file and
          which slice is worth a full read.
        </Li>
        <Li>
          <strong>No training, no tuning, no OpenAI embedding endpoint</strong>.
          This means Huozi Edge (our open-source self-host) can run
          with zero external dependencies. Anything that bolts on a
          vector store is forever tethered to an embedding service.
        </Li>
      </Ul>

      <P>
        Operationally, we use D1&rsquo;s FTS5 trigram index as a
        pre-filter for grep — same experience as local ripgrep,
        scaled across the whole Workspace tree, typically 50&times;
        faster than a tree walk. Still grep. Still ground truth.
        Just faster.
      </P>

      <P className="text-muted-foreground italic">
        In one line:{" "}
        <strong>
          code and documents deserve to be used the way code and
          documents are used — not the way you search a pile of
          research papers.
        </strong>
      </P>

      <H2>Principle 5: Token efficiency is a first-class concern</H2>

      <P>
        The running cost of an Agent is tokens. Every tool result
        spends some of the Agent&rsquo;s context budget. So every
        Huozi tool is designed to let the Agent get the right answer
        with the fewest tokens:
      </P>

      <Ul>
        <Li>
          <strong>Read has a session cache</strong>. If the Agent has
          already read a file at a given version in the current
          session, the next{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_read</code> returns{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">file_unchanged</code> — zero
          bytes.
        </Li>
        <Li>
          <strong>Read is paginated by line offset</strong>. The Agent
          can ask for{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">offset: 200, limit: 50</code>{" "}
          and skip pulling the whole file back.
        </Li>
        <Li>
          <strong>Edit returns a unified patch</strong>. One-character
          change in a ten-line file returns a three-line diff, not
          the whole new file body.
        </Li>
        <Li>
          <strong>Glob returns paths only</strong>. The Agent sees the
          shape first, then picks what&rsquo;s worth reading.
        </Li>
        <Li>
          <strong>Batch edit collapses to one commit</strong>. N edits
          across M files cost one tool call&rsquo;s worth of
          round-trip tokens.
        </Li>
      </Ul>

      <H2>The one-line version</H2>

      <P>
        Huozi&rsquo;s core assumption is that{" "}
        <strong>
          an Agent is not a user who needs to be wrapped in
          product-shaped APIs — it is an engineer who can use Unix
          tools
        </strong>
        . So we don&rsquo;t invent new abstractions. We hand the Agent
        exactly what it already knows how to use — a file system,
        paths, grep, commits, patches — in full. The Workspace lives
        outside the Agent; the Agent is just the CPU operating on it.
      </P>

      <P className="text-muted-foreground italic mt-10">
        Files as the vessel. Agents as the craft.
      </P>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-2xl sm:text-3xl font-bold mt-14 mb-5 tracking-tight">
      {children}
    </h2>
  );
}

function P({
  children,
  lead,
  className,
}: {
  children: React.ReactNode;
  lead?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`my-5 leading-[1.8] ${
        lead ? "text-lg text-foreground" : "text-base text-foreground/85"
      } ${className ?? ""}`}
    >
      {children}
    </p>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="my-5 space-y-3 pl-5 list-disc marker:text-accent">{children}</ul>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="leading-[1.8] text-base text-foreground/85 pl-1">{children}</li>;
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-6 rounded-lg border border-border bg-muted/40 p-4 text-xs sm:text-sm overflow-x-auto font-mono leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}
