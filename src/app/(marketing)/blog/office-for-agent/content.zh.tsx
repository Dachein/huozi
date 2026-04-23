export function ArticleZH() {
  return (
    <div className="prose-article">
      <P lead>
        Excel 是一代人生产力工具的巅峰。它把三件事塞进了同一个文件、同一个运行时、同一个 UI 里 ——
        你看到的单元格、单元格之间的公式计算、还有静静躺着的那些值。
        对人类来说很方便：打开文件，一切都在眼前。
        但对 Agent 来说，这种缝合恰恰是个麻烦。
      </P>

      <P>
        这篇文章写我们对 <strong>Agent 时代 Office</strong> 的设想 ——
        为什么应该把 Excel 的三层拆开、拆给谁、怎么让它们重新联动，以及
        值管理那一层什么时候该用 CSV、什么时候该上数据库。
      </P>

      <H2>Excel 缝在一起的三层</H2>

      <P>任何电子表格本质上都在做三件事：</P>

      <Ul>
        <Li>
          <strong>DOM（呈现层）</strong> —— 单元格、边框、合并、格式、图表。
          你<em>看到</em>的一切。
        </Li>
        <Li>
          <strong>计算图</strong> ——{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">=SUM(A1:A10)</code>、
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">=VLOOKUP(...)</code>。
          单元格之间的表达式依赖。
        </Li>
        <Li>
          <strong>数据存储</strong> —— 那些最终落在磁盘上的数值和字符串。
          既是输入，也是快照。
        </Li>
      </Ul>

      <P>
        三层被缝在一个{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">.xlsx</code> 里，
        这是 Excel 的天才 —— 对人类来说很优雅。但对 Agent 来说就是灾难。
      </P>

      <H2>为什么对 Agent 不再合适</H2>

      <P>
        Agent 不&ldquo;看&rdquo; DOM，它<strong>读结构</strong>。它不需要可视化的边框，
        它需要知道&ldquo;这一列是什么语义&rdquo;。它也不像人类那样通过鼠标点击来触发重算 ——
        它写代码。
      </P>

      <P>硬把 Agent 塞进 Excel 的范式，意味着：</P>

      <Ul>
        <Li>它得先翻译视觉布局才能理解数据；</Li>
        <Li>它得处理工作表里那些半死不活的公式引用；</Li>
        <Li>它得担心一次改动触发整张表重算的副作用。</Li>
      </Ul>

      <P>
        更糟的是：Excel 的公式语言是一门受限的、沙箱化的、用表格坐标思考的小语言。
        Agent 已经会写 Python 了，它为什么还要学那门语言？
      </P>

      <H2>三层重新分工</H2>

      <P>
        对 Agent-native 的 Office，我们的主张很简单：<strong>把三层拆开，每一层交给最合适的执行者</strong>。
      </P>

      <Ul>
        <Li>
          <strong>DOM（呈现）</strong> 交给 HTML / Markdown。
          浏览器已经是过去三十年最好的渲染引擎，不用再造一个。
        </Li>
        <Li>
          <strong>计算</strong> 交给 Python / JS。
          Agent 原生就会写，工具链完整、可调试、可复用。
        </Li>
        <Li>
          <strong>数据（值管理）</strong> 交给 Agent 和文件存储。
          Agent 最擅长读、写、合并、版本化。
        </Li>
      </Ul>

      <P>
        Agent 真正要负责的，只有<strong>值管理</strong>那一层 ——
        这份工作簿里装了什么数据、现在是什么状态、历史是什么、要不要改。
      </P>

      <H2>三层怎么联动</H2>

      <P>
        这是最关键的问题。拆开不是目的，能重新合起来才是。
      </P>

      <P>
        我们的答案是 —— <strong>文件即接口</strong>。
      </P>

      <Pre>{`# Agent 的一次真实工作流:
> 用户问: "帮我做一份这周销售的汇总"

# Agent 按三层拆解执行:
huozi_write({ file_path: "data/sales.csv", ... })        # 1. 值
huozi_write({ file_path: "scripts/summary.py", ... })    # 2. 计算
# Agent 在本地/沙箱跑 python scripts/summary.py
#   → 读 data/sales.csv
#   → 写回 data/summary.json
huozi_write({ file_path: "report.html", ... })           # 3. 呈现
#   → 这个 HTML 读 data/summary.json 渲染出表格和图

# 三个文件. 三个角色. 每一步都可 diff, 可回放, 可单独替换.`}</Pre>

      <P>
        联动是通过<strong>文件的读写和版本</strong>发生的，不是通过隐藏的单元格依赖。
        Agent 改一个 CSV，再跑一下 Python，再重渲染 HTML ——
        这三步是显式的、可追溯的、可 diff 的。
        没有&ldquo;改了某个单元格，整个工作簿偷偷重算了&rdquo;这种黑盒。
      </P>

      <P>
        这种架构还有一个很美好的副作用：<strong>每一层都可以被单独替换</strong>。
        今天计算用 pandas，明天想换 Polars；今天呈现用纯 HTML，明天想加个 React 交互层 ——
        数据文件不动，上下游都可以重来。Excel 里你做不到这件事。
      </P>

      <H2>瓶颈和限制：CSV 到什么时候就顶不住</H2>

      <P>
        这套设计最直接的质疑是：值管理就靠一堆 CSV？到什么规模就塌了？
      </P>

      <P>经验法则：</P>

      <Ul>
        <Li>
          <strong>百行到十万行</strong> —— CSV 够用。
          pandas 读进来几十 MB 眼都不眨，Agent 也能一次性 grep / diff 全文件。
          这个范围覆盖了绝大多数实际业务场景。
        </Li>
        <Li>
          <strong>十万到千万行</strong> —— 改用 Parquet 或分片 CSV。
          仍然是文件，仍然不需要服务器。Agent 用 duckdb 做列式查询即可。
        </Li>
        <Li>
          <strong>千万行以上，或强并发写</strong> —— 这时候才上真正的数据库。
          Postgres、ClickHouse、或者对象存储 + 查询引擎。
          Agent 通过 SQL 或 MCP 连过去。
        </Li>
      </Ul>

      <P>
        换句话说 ——
        <strong>只有当&ldquo;单机内存装不下&rdquo;或&ldquo;多个写入者要抢锁&rdquo;时，才值得引入数据库</strong>。
        在那之前，文件就是最好的数据库：可读、可 diff、可版本化、可分享。
      </P>

      <H2>什么时候用 CSV，什么时候用数据库</H2>

      <P>一个更操作化的清单。</P>

      <P><strong>用 CSV / 文件</strong>，如果：</P>

      <Ul>
        <Li>只有一个 Agent 在写，或者写入是串行的；</Li>
        <Li>数据是&ldquo;一次产出、多次引用&rdquo;的快照性质；</Li>
        <Li>
          你希望变更能被人类 review（
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">git diff</code>{" "}
          一个 CSV 是最舒服的事之一）；
        </Li>
        <Li>行数在百万级以下。</Li>
      </Ul>

      <P><strong>用数据库</strong>，如果：</P>

      <Ul>
        <Li>多个 Agent / 多个用户并发写；</Li>
        <Li>需要事务：要么全部成功，要么全部回滚；</Li>
        <Li>需要在线查询（实时仪表盘、后端 API）；</Li>
        <Li>数据量已经让 Python 吃不消。</Li>
      </Ul>

      <P>
        大多数 Agent 场景 —— 写报告、做分析、维护一份状态清单、跑一次性的数据整理 ——
        都落在文件这一侧。数据库是一个<strong>严肃的升级决定</strong>，不是默认选项。
      </P>

      <H2>一句话总结</H2>

      <P>
        Excel 的天才，在于<strong>把三层缝合给人类</strong>。
        Office for Agent 的天才，应该在于<strong>把三层拆开给 Agent</strong>。
      </P>

      <P>
        Agent 不需要一个假装是纸、实际是隐藏状态机的文件格式。
        它需要三样直白的东西：<strong>一个值（文件）、一段计算（代码）、一张呈现（HTML）</strong>。
        然后让它自己把它们串起来 —— 这恰恰是 Agent 最擅长的事。
      </P>

      <P className="text-muted-foreground italic mt-10">
        值为文件，计算为代码，呈现为网页。
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
