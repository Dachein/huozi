export function ArticleEN() {
  return (
    <div className="prose-article">
      <P lead>
        <strong>Huozi</strong> (活字) is the Chinese word for movable type.
        We chose it as the name of this product because we wanted to say
        three things at once: a debt to a long tradition of knowledge-
        vessels, a response to what the Agent era actually needs, and a
        thing we believe is obvious but nobody has yet built.
      </P>

      <H2>1. The vessel: from Bi Sheng&rsquo;s clay type to the Derge Printing House</H2>

      <P>
        In 1041, during the Song dynasty, a commoner named Bi Sheng
        invented movable clay type. It was a radical abstraction: a unit
        of knowledge was pried loose from the woodblock it was carved on
        and became something that could be rearranged, reused, and
        passed around. For the first time, knowledge was decoupled from
        the object that carried it.
      </P>

      <P>
        Meanwhile, in the mountains of Derge in western Sichuan, the{" "}
        <strong>Derge Printing House</strong> has for nearly three
        centuries kept over 320,000 wooden printing blocks alive.
        Through dynasties, wars, and revolutions, monks there have gone
        on inking, printing, and binding without pause. No server, no
        company has ever credibly offered that kind of lifespan. Derge
        could offer it because the knowledge was carved into something{" "}
        <em>stable, readable, reproducible</em> — wood, ink, and
        Tibetan paper.
      </P>

      <P>
        To us this is one continuous thread. For knowledge to survive,
        it needs a vessel that outlives any particular tool or dynasty.
        Movable type was one form of that vessel. We believe the Agent
        era needs another.
      </P>

      <H2>2. Today: in the Agent era, Word / Excel / PPT are just formats crying out to be token-friendly</H2>

      <P>
        Word, Excel, and PowerPoint were designed for{" "}
        <em>human hands and human eyes</em>. A single .docx is a zip of
        XML, styles, embedded fonts, and shape objects. The fraction of
        the file that is actually text is often a few percent.
      </P>

      <P>
        Agents can&rsquo;t really read those. Or rather, reading them is
        absurdly expensive — the Agent has to translate a complex
        binary format into plain text, lose structure along the way,
        and burn thousands of tokens to understand something that
        could have been expressed in a few lines of Markdown.
      </P>

      <P>
        So here is our bet: in the Agent era,{" "}
        <strong>
          Word / Excel / PPT simply get re-expressed in token-friendly
          ways
        </strong>
        . Documents become Markdown. Tables become CSV. Slides become
        structured Markdown or JSON. This isn&rsquo;t a step backwards — it&rsquo;s
        returning to the spirit of movable type: let information itself
        be the smallest unit, not the wrapper that traps it.
      </P>

      <H2>3. Agents are CPUs. Huozi is the USB drive</H2>

      <P>Now take one step further.</P>

      <P>
        Look at where we already are: Claude Code writing code on your
        laptop; the Claude mobile app answering emails on the subway;
        some open-source Open Claw running batch jobs on your server;
        next month, a new Agent you haven&rsquo;t heard of yet.
      </P>

      <P>
        <strong>Agents are the CPU. They are raw compute.</strong>{" "}
        Every person uses different Agents in different contexts — one
        for work, one for writing, one for research; one on the desktop,
        one on the phone, one on the tablet. Agents should be
        swappable. They should be plug-and-play.
      </P>

      <P>
        But <strong>data should stay put</strong>. Your notes, your
        documents, your code, your research — none of that should be
        locked to one particular Agent, one particular company, or one
        particular device. It should outlive all of them.
      </P>

      <P lead>
        That is what{" "}
        <strong>huozi.app is: the digital USB drive everyone has</strong>
        . Mount it into any Agent — Claude Code, Cursor, Claude Desktop,
        your own script — and the Agent reads the same file tree, writes
        into the same versioned workspace. Switch Agents; the drive is
        still there. Switch devices; still there. Switch eras; still
        there.
      </P>

      <H2>That is what Huozi means</H2>

      <P>
        For knowledge to be passed on, you first need a stable vessel.
        In the age of woodblock, it was Tibetan paper and carved wood.
        In the age of print, it was movable type and paper. In the age
        of Agents, it is{" "}
        <strong>huozi.app</strong> — a truly plug-and-play workspace,
        shared across every Agent, owned by you, versioned across
        generations, mountable anywhere.
      </P>

      <P className="text-muted-foreground italic mt-10">
        Words carry the Way. Huozi, the vessel.
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
