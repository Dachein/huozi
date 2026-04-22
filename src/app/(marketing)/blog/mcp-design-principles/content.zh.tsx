export function ArticleZH() {
  return (
    <div className="prose-article">
      <P lead>
        给 Agent 做工具这件事,很容易走错方向。最常见的错误是:把 Agent 当成一个初级产品运营,给它一堆听起来像产品功能的 API——
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">create_document</code>、
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">summarize_file</code>、
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">search_memory</code>——
        看起来很「智能」,但每一个 API 都是一个新语汇、一个新心智模型、一次新的提示工程。
      </P>

      <P>
        huozi 走的是相反的方向。我们认为,<strong>Agent 应该被当成工程师对待</strong>:
        给它工程师用的东西——一个文件系统、一个 workspace、一套 Unix 风格的原语工具。
        这篇文章写我们五个核心设计原则,以及背后的推理。
      </P>

      <H2>原则一:最大化基于文件系统</H2>

      <P>
        我们没有造「文档 API」。我们造的是一个<strong>真正的文件系统</strong>,以路径寻址:
      </P>

      <Pre>{`huozi_read({ file_path: "notes/2026/w17-review.md" })
huozi_edit({
  file_path: "data/roadmap.csv",
  old_string: "Q2,Planning",
  new_string: "Q2,Shipping",
})
huozi_glob({ pattern: "drafts/**/*.md" })`}</Pre>

      <P>
        为什么用文件系统?因为文件系统是<strong>过去五十年人类最成功的工程抽象之一</strong>——
        每一个工程师都会用,每一个大语言模型都在训练语料里见过几百万次
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">ls</code>、<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">cat</code>、
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">grep</code>、<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">sed</code>。
        我们不需要再教 Agent 一套新语法。
      </P>

      <P>
        文件系统还给我们几个「免费」的好处:
      </P>

      <Ul>
        <Li>
          <strong>路径本身就是信息</strong>。
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">projects/2026/q2/roadmap.md</code>
          比一个叫 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">doc_7f3a8b</code> 的 ID 能告诉 Agent 多得多,而且只要几个 token。
        </Li>
        <Li>
          <strong>可组合</strong>。Agent 能建目录、移动文件、glob 扫一个子树、grep 搜整棵树——
          这些操作在「文档 API」里要么做不到,要么每一个都得另起一套接口。
        </Li>
        <Li>
          <strong>人类也认得</strong>。文件树在 Web UI 里直接渲染,用户点开就看,不用解码任何抽象对象。
        </Li>
      </Ul>

      <H2>原则二:Workspace 视角,而不是单文档视角</H2>

      <P>
        做完一个文件系统,下一个陷阱是把它当成「许多孤立文档的集合」。
        但 Agent 做任何真实任务时,它关心的都是<strong>上下文</strong>:
        这个项目的目录结构长什么样?README 里写了什么约定?有没有类似的现有文件可以参照?
        提交历史告诉我最近发生了什么?
      </P>

      <P>
        所以 huozi 的最小单位不是「文档」,是 <strong>Workspace</strong>:
        一整棵版本化的文件树,所有写入都落在同一个提交图里,
        Agent 可以把整个树当一个项目来推理。
      </P>

      <Pre>{`# Agent 的一次真实对话:
> 我想在 analytics 目录下加一个新指标

# Agent 不会凭空写。它会先:
huozi_glob({ pattern: "analytics/**" })              # 看现有结构
huozi_read({ file_path: "analytics/README.md" })     # 读约定
huozi_grep({ pattern: "defineMetric" })              # 找类似写法
huozi_history({ file_path: "analytics/retention.ts" }) # 最近谁改过
# ——然后才 huozi_write 新文件。`}</Pre>

      <P>
        这是<strong>工程师的工作流</strong>。
        如果接口只给它一个 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">create_document</code>,
        它会失去所有这些上下文,只能盲写。
        Workspace 的存在,就是让 Agent 能像人一样,先看再做。
      </P>

      <P>
        提交(commit)也是 Workspace 级的,不是单文件级的。
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_batch_edit</code> 可以在一次提交里跨多个文件原子性地改——
        这对需要跨文件保持一致性的重构非常关键。
      </P>

      <H2>原则三:我们把 Claude Code 的代码基搬进了 Workspace</H2>

      <P>
        huozi 的 MCP 工具——<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_read</code>、
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_edit</code>、<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_write</code>、
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_glob</code>、<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_grep</code>、
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_batch_edit</code>、<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_history</code>——
        在 schema、错误码、行号分页、edit 的字符串唯一性规则上,
        <strong>与 Claude Code 内置的文件工具逐字节一致</strong>。
      </P>

      <P>
        这不是偶然。我们是<strong>刻意把 Claude Code 的工具语义移植过来</strong>:
        同样的 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">old_string → new_string</code> 替换契约、
        同样的 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">replace_all</code> 标志、
        同样的 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">file_unchanged</code> 缓存响应、
        同样的 cat-n 风格行号输出。
      </P>

      <P>为什么?三个原因:</P>

      <Ul>
        <Li>
          <strong>零学习曲线</strong>。
          任何已经会讲 Claude Code 方言的 Agent——Claude Code 本身、Cursor、Claude Desktop、
          Anthropic 自己的 SDK 代理——挂上 huozi 立刻能用,不需要一行提示调整。
        </Li>
        <Li>
          <strong>继承提示工程的复利</strong>。
          Anthropic 在 Claude Code 上积累的所有训练信号、所有评测基准、
          所有关于「Agent 怎么高效用这些工具」的经验,都自动转移到 huozi。
        </Li>
        <Li>
          <strong>可互换</strong>。同一个 Agent 从 Claude Code 本地上下文切到 huozi workspace,
          中间没有认知切换。本地写一份代码,放到 huozi 上继续改,
          对 Agent 来说就是 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">cd</code> 了一下。
        </Li>
      </Ul>

      <H2>原则四:用 Grep,不用向量化</H2>

      <P>
        这是最常被挑战的一条,也是我们最确信的一条。
      </P>

      <P>
        很多「Agent 知识库」产品的第一反应是:把所有文件 chunk、embed、存进向量库,
        让 Agent 用语义搜索找相关内容。huozi 不这么做。
        我们跟 Claude Code 一样——<strong>用 grep 和 glob,按需扫描,返回事实</strong>。
      </P>

      <P>原因不是偷懒,是深思熟虑:</P>

      <Ul>
        <Li>
          <strong>Grep 返回事实,嵌入返回相关性得分</strong>。
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{`huozi_grep("defineMetric")`}</code>
          告诉你这个标识符在哪几个文件的哪几行。Agent 能去读上下文、理解为什么匹配、作出判断。
          向量搜索告诉你「这五个文件可能相关,相似度 0.87」——
          Agent 拿到的是一个它无法质疑的黑盒分数。
        </Li>
        <Li>
          <strong>代码和结构化文档是词法的,不是「语义」的</strong>。
          你改的是 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">getUserById</code> 还是
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">get_user_by_id</code>,向量嵌入会把它们聚到一起,
          而 grep 告诉你精确的区别。对工程任务,精确比「相近」重要一万倍。
        </Li>
        <Li>
          <strong>索引会过期,grep 不会</strong>。
          向量库永远落后于 HEAD,每次 Agent 写完就得重建,
          否则下一次查询拿到的是陈旧的理解。
          grep 永远读当下的文件树,没有同步问题。
        </Li>
        <Li>
          <strong>Token 更便宜,而且更诚实</strong>。
          向量搜索需要返回 top-K 的完整块,Agent 再从里面筛。
          grep 只返回匹配的行号和上下文几行;Agent 可以精准决定接下来读哪个文件的哪一段。
        </Li>
        <Li>
          <strong>不需要训练、不需要调参、不需要 OpenAI 的 embedding endpoint</strong>。
          这意味着 huozi Edge(开源版)完全可以零外部依赖跑起来,
          而向量方案永远要绑一个嵌入服务。
        </Li>
      </Ul>

      <P>
        工程上,我们用 D1 的 FTS5 trigram 索引给 grep 做预过滤——
        跟本地 ripgrep 的体验一致,但规模化到 Workspace 的整棵树,通常比遍历树快 50 倍。
        依然是 grep,依然是事实,只是更快。
      </P>

      <P className="text-muted-foreground italic">
        一句话:<strong>代码和文档应该用读代码和文档的方式来用,不是用搜论文的方式。</strong>
      </P>

      <H2>原则五:Token 效率是一等公民</H2>

      <P>
        Agent 的运行成本是 token。每一个工具调用的返回,都在消耗 Agent 的上下文预算。
        所以 huozi 每一个工具,都是围绕「让 Agent 能以最少 token 拿到正确答案」设计的:
      </P>

      <Ul>
        <Li>
          <strong>Read 带会话缓存</strong>。
          如果 Agent 在本次会话里已经读过某文件的某个版本,再次
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">huozi_read</code> 返回
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">file_unchanged</code>——零字节。
        </Li>
        <Li>
          <strong>Read 有行号分页</strong>。
          Agent 可以只拉 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">offset: 200, limit: 50</code>,
          不必每次把整个文件拖回来。
        </Li>
        <Li>
          <strong>Edit 返回 unified patch</strong>。
          十行文件里改一个字,我们返回三行 diff,不是整个文件的新版本。
        </Li>
        <Li>
          <strong>Glob 只返回路径</strong>。
          Agent 先看树,再挑哪些文件值得读。
        </Li>
        <Li>
          <strong>Batch edit 合并成一次提交</strong>。
          跨文件 N 处改动只消耗一次工具调用的 token 开销。
        </Li>
      </Ul>

      <H2>一句话总结</H2>

      <P>
        huozi 的核心假设是:<strong>Agent 不是需要被包装好的用户,而是一个能用 Unix 工具的工程师</strong>。
        所以我们不造新抽象,我们把 Agent 已经会的东西——文件系统、路径、grep、commit、patch——
        完整地给它。Workspace 住在 Agent 之外,Agent 只是来操作它的 CPU。
      </P>

      <P className="text-muted-foreground italic mt-10">
        文件为器,Agent 为工。
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
      className={`my-5 leading-[1.9] ${
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
  return <li className="leading-[1.9] text-base text-foreground/85 pl-1">{children}</li>;
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-6 rounded-lg border border-border bg-muted/40 p-4 text-xs sm:text-sm overflow-x-auto font-mono leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}
