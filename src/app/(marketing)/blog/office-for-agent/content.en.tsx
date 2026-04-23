export function ArticleEN() {
  return (
    <div className="prose-article">
      <P lead>
        Excel was the peak productivity tool of a generation. It stitched
        three things into one file, one runtime, one UI — the cells you
        see, the formulas between them, and the values that quietly sit
        on disk. For humans that&rsquo;s elegant: open the file and
        everything is right there. For an Agent, the same stitching is
        exactly the problem.
      </P>

      <P>
        This post lays out our design for an{" "}
        <strong>Agent-era Office</strong> — why Excel&rsquo;s three
        layers should come apart, who each one should go to, how to
        make them talk again, and when the value-management layer
        should stop being CSVs and become a real database.
      </P>

      <H2>The three layers Excel stitches together</H2>

      <P>Any spreadsheet is, underneath, doing three things:</P>

      <Ul>
        <Li>
          <strong>The DOM (presentation)</strong> — cells, borders,
          merges, formatting, charts. Everything you{" "}
          <em>see</em>.
        </Li>
        <Li>
          <strong>The computation graph</strong> —{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">=SUM(A1:A10)</code>,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">=VLOOKUP(...)</code>.
          Expression-level dependencies between cells.
        </Li>
        <Li>
          <strong>Data storage</strong> — the values and strings that
          end up on disk. Input and snapshot in one.
        </Li>
      </Ul>

      <P>
        Three layers welded into one{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">.xlsx</code>.
        That is Excel&rsquo;s genius — and it is elegant, for humans.
        For Agents, it&rsquo;s a trap.
      </P>

      <H2>Why it no longer fits the Agent</H2>

      <P>
        An Agent doesn&rsquo;t <em>see</em> a DOM; it{" "}
        <strong>reads structure</strong>. It doesn&rsquo;t need
        cell borders. It needs to know what each column{" "}
        <em>means</em>. And it doesn&rsquo;t trigger recalculation by
        clicking — it writes code.
      </P>

      <P>Forcing an Agent into Excel&rsquo;s paradigm means:</P>

      <Ul>
        <Li>it has to translate visual layout before it can understand data;</Li>
        <Li>it has to pick its way through half-alive formula references;</Li>
        <Li>it has to worry about one edit silently recalculating the whole sheet.</Li>
      </Ul>

      <P>
        And worst of all: Excel&rsquo;s formula language is a small,
        sandboxed DSL that thinks in grid coordinates. The Agent already
        knows Python. Why would it learn a second, weaker language?
      </P>

      <H2>Redistribute the three layers</H2>

      <P>
        Our proposal for an Agent-native Office is simple:{" "}
        <strong>
          unbundle the three layers and hand each one to whoever is
          best at it
        </strong>.
      </P>

      <Ul>
        <Li>
          <strong>DOM (presentation)</strong> goes to HTML / Markdown.
          The browser is the best rendering engine of the last thirty
          years. We don&rsquo;t need to build another one.
        </Li>
        <Li>
          <strong>Computation</strong> goes to Python / JS. The Agent
          already writes it natively. The toolchain is mature,
          debuggable, reusable.
        </Li>
        <Li>
          <strong>Data (value management)</strong> goes to the Agent
          and file storage. Reading, writing, merging, versioning —
          that is exactly what the Agent is best at.
        </Li>
      </Ul>

      <P>
        The Agent&rsquo;s actual job is{" "}
        <strong>value management</strong>, and nothing else:
        what&rsquo;s in this workbook, what state is it in, what&rsquo;s
        the history, does it need to change?
      </P>

      <H2>How the three layers talk</H2>

      <P>
        This is the part that matters. Unbundling isn&rsquo;t the goal
        — being able to recompose is.
      </P>

      <P>
        Our answer is <strong>the file as the interface</strong>.
      </P>

      <Pre>{`# A real Agent turn:
> "Make me a summary of this week's sales."

# The Agent executes across three layers:
huozi_write({ file_path: "data/sales.csv", ... })        # 1. values
huozi_write({ file_path: "scripts/summary.py", ... })    # 2. computation
# The Agent runs python scripts/summary.py in a sandbox:
#   reads  data/sales.csv
#   writes data/summary.json
huozi_write({ file_path: "report.html", ... })           # 3. presentation
#   this HTML reads data/summary.json and renders the table and charts.

# Three files. Three roles. Every step diffable, replayable, replaceable.`}</Pre>

      <P>
        The layers coordinate through <strong>file reads, writes, and
        versions</strong> — not through hidden cell dependencies. The
        Agent edits a CSV, runs a Python script, re-renders the HTML.
        Three explicit steps, each traceable and diffable. No
        &ldquo;I changed one cell and the whole workbook silently
        recalculated&rdquo; black box.
      </P>

      <P>
        There&rsquo;s a lovely side-effect to this architecture:{" "}
        <strong>each layer is independently replaceable</strong>.
        Computation in pandas today, Polars tomorrow. Presentation as
        static HTML today, React for interactivity tomorrow. The data
        files don&rsquo;t move; the layers above and below can be
        swapped freely. You can&rsquo;t do that inside an{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">.xlsx</code>.
      </P>

      <H2>Bottlenecks and limits: when does CSV give out?</H2>

      <P>
        The most immediate objection to this design is: value
        management is just a pile of CSVs? At what scale does that
        collapse?
      </P>

      <P>Rules of thumb:</P>

      <Ul>
        <Li>
          <strong>Hundreds to hundreds of thousands of rows</strong> —
          CSV is fine. pandas reads tens of MB without blinking, and
          the Agent can grep or diff the whole file in one pass. This
          range covers the overwhelming majority of real business
          tasks.
        </Li>
        <Li>
          <strong>100K to 10M rows</strong> — switch to Parquet, or
          shard the CSVs. Still files, still no server. The Agent uses
          duckdb for columnar queries.
        </Li>
        <Li>
          <strong>10M+ rows, or heavy concurrent writes</strong> —
          this is where an actual database earns its keep. Postgres,
          ClickHouse, or object storage plus a query engine. The
          Agent connects over SQL or MCP.
        </Li>
      </Ul>

      <P>
        Put another way:{" "}
        <strong>
          a database is warranted only when a single machine&rsquo;s
          memory can&rsquo;t hold the data, or multiple writers are
          contending for locks
        </strong>
        . Before that, the file <em>is</em> the best database:
        readable, diffable, versionable, shareable.
      </P>

      <H2>When to use CSV, when to reach for a database</H2>

      <P>A more operational checklist.</P>

      <P><strong>Use CSV / files</strong> if:</P>

      <Ul>
        <Li>only one Agent is writing, or writes are serialised;</Li>
        <Li>the data is &ldquo;produce once, reference many times&rdquo; in shape;</Li>
        <Li>
          you want humans to review changes ({" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">git diff</code>{" "}
          on a CSV is one of the most satisfying things in engineering);
        </Li>
        <Li>row count is under a million.</Li>
      </Ul>

      <P><strong>Reach for a database</strong> if:</P>

      <Ul>
        <Li>multiple Agents / multiple users are writing concurrently;</Li>
        <Li>you need transactions — all-or-nothing commits;</Li>
        <Li>there&rsquo;s an online query path (live dashboard, backend API);</Li>
        <Li>the data volume has outgrown what Python can chew on.</Li>
      </Ul>

      <P>
        Most Agent work — writing reports, doing analysis, maintaining
        a status list, one-off data wrangling — lives firmly on the
        file side of that line. A database is a{" "}
        <strong>serious upgrade decision</strong>, not a default.
      </P>

      <H2>The one-line version</H2>

      <P>
        Excel&rsquo;s genius is that{" "}
        <strong>it stitched three layers together for humans</strong>.
        An Agent-era Office&rsquo;s genius should be that{" "}
        <strong>it takes those three layers apart for the Agent</strong>.
      </P>

      <P>
        The Agent doesn&rsquo;t need a file format that pretends to be
        paper but is secretly a state machine. It needs three plain
        things:{" "}
        <strong>
          a value (a file), a computation (some code), a presentation
          (an HTML page)
        </strong>
        . Then it strings them together itself — which is exactly what
        the Agent is best at.
      </P>

      <P className="text-muted-foreground italic mt-10">
        Values as files. Computation as code. Presentation as the web.
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
