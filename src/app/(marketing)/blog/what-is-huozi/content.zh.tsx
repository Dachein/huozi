export function ArticleZH() {
  return (
    <div className="prose-article">
      <Section>
        <P lead>
          <strong>活字</strong>——这是我们给这款产品起的中文名。在给它起名的时候，我们想表达三件事：
          一种对知识传承的敬意，一种对当下 Agent 时代的回应，以及一种我们认为理所当然、但还没有人做出来的东西。
        </P>
      </Section>

      <H2>一、器皿：从毕昇的泥活字，到德格印经院</H2>

      <P>
        公元 1041 年，毕昇发明了泥活字。这是一次了不起的抽象——
        把「一段知识」从「一整块雕版」上剥离出来，变成可以重排、可以复用、可以传递的最小单位。
        知识第一次与承载它的载体解耦。
      </P>

      <P>
        而在四川德格的山里，<strong>德格印经院</strong>至今仍保存着 32 万多块木刻经版。
        近三百年来，无论朝代更替、战火烽烟，僧人们一直在那里刷墨、印经、装订。
        没有任何一台服务器、任何一家公司能承诺这样的寿命。
        它能做到，是因为知识被刻在了一种<em>稳定、可读、可复制</em>的器皿上——木头、墨、藏纸。
      </P>

      <P>
        在我们看来，这是同一条线索：
        <strong>知识要活下去，必须有一个比任何单个工具、任何单个朝代都更长久的器皿。</strong>
        活字，是这个器皿的一个具体形态。
      </P>

      <H2>二、今日：Agent 时代，文件格式该为 token 友好而生</H2>

      <P>
        Word、Excel、PowerPoint——这些格式是为<em>人的手和眼</em>设计的。
        一个 .docx 文件里塞满了样式、XML schema、图形对象、嵌入字体，
        其中真正承载信息的文字可能只占百分之几。
      </P>

      <P>
        而 Agent 读不了这些。或者说，Agent 读它们的代价高得离谱——
        它必须把这些复杂的二进制格式翻译成纯文本，
        在翻译过程中丢失结构、丢失语义，再烧掉几千个 token 去「看懂」一份本可以用一段 Markdown 说清楚的东西。
      </P>

      <P>
        所以我们相信：
        <strong>在 Agent 的时代，Word / Excel / PPT 只是用 token 友好的方式重新表达</strong>。
        文档是 Markdown，表格是 CSV，幻灯片是结构化的 Markdown 或 JSON。
        这不是退步，而是一次正本清源——回到「活字」的精神：
        让信息本身成为最小单位，而不是让格式绑架信息。
      </P>

      <H2>三、Agent 是 CPU，活字是 U 盘</H2>

      <P>
        再往前推一步。
      </P>

      <P>
        今天我们已经看到这样的格局：
        Claude Code 在你的笔记本上写代码，
        Claude 手机 App 在地铁里帮你回邮件，
        某个开源的 Open Claw 在你的服务器上跑批处理，
        下个月还会有新的 Agent 出现。
      </P>

      <P>
        <strong>Agent 是 CPU，是算力</strong>。
        每个人在不同场景会用不同的 Agent——工作时用一个，写作时用一个，研究时用一个；
        电脑上一个，手机上一个，平板上又是一个。Agent 应该是可替换的、即插即用的。
      </P>

      <P>
        但<strong>数据应该是固定的</strong>。
        你的笔记、你的文档、你的代码、你的研究资料——这些不应该被绑死在某一个 Agent、某一家公司、某一台设备上。
        它们应该比任何一个 Agent 都活得更久。
      </P>

      <P lead>
        所以 <strong>huozi.app 就是大家都有的那个数字 U 盘</strong>。
        把它挂到任何一个 Agent 上——Claude Code、Cursor、Claude Desktop、自己写的脚本——
        Agent 读到的永远是同一份文件树，写入的永远落在同一个版本化的工作空间里。
      </P>

      <P>
        换一个 Agent，U 盘还在。
        换一台设备，U 盘还在。
        换一个时代，U 盘还在。
      </P>

      <H2>这就是「活字」的意思</H2>

      <P>
        知识要传承，必须先有一个稳定的器皿。
        在木刻的时代，那是藏纸和经版；
        在印刷的时代，那是活字和纸张；
        在 Agent 的时代，那是 <strong>huozi.app</strong>：
        一个真正即插即用的 workspace，给所有 Agent 共享、给你一个人所有，历代可查，随处可挂。
      </P>

      <P className="text-muted-foreground italic mt-10">
        以文载道，活字为器。
      </P>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="mb-8">{children}</section>;
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
      className={`my-5 leading-[1.9] ${
        lead
          ? "text-lg text-foreground"
          : "text-base text-foreground/85"
      } ${className ?? ""}`}
    >
      {children}
    </p>
  );
}
