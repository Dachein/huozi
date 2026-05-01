# huozi-cloud SPEC v0.1

**Status**: Draft — architectural alignment only. No implementation yet.
**Scope**: 云端"Agent 可协作的文件工作区"——与 Claude Code 工具方言 bit-exact 兼容。
**Date**: 2026-04-20

---

## 0. 目的与定位

### 0.1 一句话

**huozi-cloud 是一块面向 Agent 的云端硬盘。** 任何说 Claude Code 工具方言的 Agent——Claude Code 本体、OpenClaw、Cursor、Codex、第三方平台、企业自建 Agent——都能**零改造**把它当本地工作区挂载使用，支持多 Agent / 多设备 / 多用户协作，自带合规级审计。

更形式化：**它是"USB 硬盘的 Agent 等价物"**——协议标准（MCP + CC 工具方言）代替了物理接口（USB/SATA），workspace 代替了盘符，Scope 代替了目录权限。

### 0.2 非定位（为避免混淆）

- 不是又一个 Agent 平台（不自带 Agent）
- 不是 Notion/Google Drive 克隆（不做富文本协同编辑 UX）
- 不是 GitHub 克隆（没有 PR / Issue / UI-heavy 协作）
- 不是 huozi-edge 的替代（huozi-edge 做**发布**，huozi-cloud 做**存储+协作**）
- 不绑任何特定 Agent 厂商（商品性第一）
- **Web UI 不是编辑器**——Markdown / CSV / JSON 看起来简单，但是 HTML / Notebook 编辑在浏览器里永远是深水区。v1 Web UI 明确只读，编辑都交给 Agent。

### 0.4 "Agent 写，人类读"的依据

1. **Agent 已经是最好的编辑器**——模型对 MD / CSV / JSON / HTML / code 都理解深，生成有结构有规范。与其给人做一个半残的 in-browser editor，不如让人对着 Agent 说"把这一段改成 X"。
2. **编辑 UX 永远吃不完**——语法高亮、实时预览、协同光标、undo/redo、图片嵌入、智能补全……全都做 = 做一个 VS Code。不如聚焦。
3. **审计一致性**——所有写入经同一 `writeFilePrimitive`（§2.5）→ 同一条 commit chain。如果 Web 里能编辑，就得再搞一条 REST 写入路径，增加审计攻击面。
4. **人的输入价值点不在 keystroke，在决策**——浏览 / 审阅 / 批准 / 指示 Agent 才是人类应该做的；让他们打字修改 HTML 是浪费。
5. **符合"USB 硬盘"心智**——插电脑上是编辑器的事，硬盘本身不负责编辑。

### 0.3 设计目标

1. **Agent BYOA**：Cursor / Claude Code / Codex / 自建 Agent 零改造接入
2. **协议对齐**：工具输入输出**字段级等价**于 Claude Code
3. **合规级审计**：每次 Agent 写入留下不可篡改的 commit 流水
4. **云原生 serverless**：Cloudflare 栈，无 VM
5. **Agent 写，人类读**（v1 分工）：Web UI 面向人类，提供浏览 + 审计视图，**故意不提供 Web 内编辑**。所有写入统一经 Agent via MCP。这不是 v1 的缺项，是明确的产品决策（见 §0.4）
5. **按基金/项目边界天然切片**：workspace = Git 仓库

### 0.4 与 Claude Code 的关系

本 SPEC 中凡是引用 `cc:path/to/file.ts:Lnn` 的地方，均指 `https://github.com/NanmiCoder/cc-haha` 中该路径——即 Claude Code 泄露源码的重建版本。我们把它当作**协议规范**来对齐。

---

## 1. 设计原则（优先级排序）

1. **CC 方言 > 内部一致性**——协议字段、默认值、error message 文本与 CC 一字不差；若 CC 内部有矛盾设计，照抄矛盾。
2. **协议 > 实现**——工具契约稳定，底层（FTS5 / 流式 regex / rg）可换。
3. **云端语义 > 本地模拟**——绝不假装文件系统；`mtime` → blob SHA、本地路径 → `workspace://` URI。
4. **Git 是数据真相**——所有状态最终归档为 commit；任何非 Git 存储（DO / D1 / KV）都是可重建的缓存/索引。
5. **审计先于功能**——任何写操作都必须能回答"谁、何时、基于什么、改了什么"，否则不做。
6. **v1 < v2 < v3**——先单用户 Agent 跑通 → 再多 Agent → 再多用户多权限。

---

## 2. 架构总览

### 2.1 CF 原语映射

```
协议层（暴露给 Agent）
  └─ MCP Server over SSE (Cloudflare Worker)
        ↓
工具层（Port from CC）
  ├─ Read / Edit / Write / Glob / Grep
        ↓
状态与存储层
  ├─ AgentSessionDO       ——  per-agent readFileState（持久化）
  ├─ WorkspaceDO          ——  per-workspace 锁 + commit 串行化 + 事件广播
  ├─ R2                   ——  Git packfile + loose object
  ├─ D1                   ——  元数据索引、FTS5、ACL、审计流水
  └─ Vectorize (v2+)      ——  语义搜索
        ↓
协作边界（v2+）
  ├─ Email Worker         ——  Agent 间邮件协议
  └─ Queues               ——  后台索引 + 归档
```

### 2.2 单元边界

| 概念 | 边界 | Cloudflare 实现 |
|---|---|---|
| **User** | 账号；创建 workspace 的唯一实体 | D1 users 表 |
| **Workspace** | 用户创建的 Git 仓库；一组协作者的边界 | R2 prefix + 1 个 WorkspaceDO |
| **Scope** | 某 API Key / 会话被限定的子目录前缀 | API key 的 `scope_path` 字段 |
| **File** | 仓库中的路径 | Git blob |
| **Agent Session** | 某 Agent 在某 scope 下的某次会话 | 1 个 AgentSessionDO |
| **Tool Call** | 一次 MCP 工具调用 | Worker 请求，经过 AgentSessionDO + WorkspaceDO |

**注**：Workspace 由用户自由创建（不强制对应 fund / 项目 / 任何业务概念）。需要把某个 Agent 限制在 workspace 的子目录内时，通过 **Scope** 机制实现。"一家基金公司用 1 个 workspace 存所有基金，每支基金一个 Scope"只是这个机制的一种使用方式。

### 2.3 Workspace 寻址

所有文件路径使用 URI 形式：

```
huozi://workspace/<workspace-id>/<relative/path/to/file.md>
```

- **永远不接受本地绝对路径**（`/Users/...` 直接拒绝）
- **永远不接受跨 workspace 引用**（URI 严格限定 workspace 边界）
- 路径解析前统一 `backfillObservableInput`（对齐 cc:FileEditTool.ts:115）

### 2.4 Scope 机制（子目录锁定）

Scope 是 API Key 级别的**路径前缀限定**。让一个 Agent 只能在 workspace 的某个子目录里活动，看不到也改不了外面的文件。

**语义**：Scope 是 Agent 的"虚拟根目录"。一个被 scope 到 `/funds/fund-A/` 的 Agent：
- 发 `huozi_read("report.md")` → 实际读 `workspace/<id>/funds/fund-A/report.md`
- 发 `huozi_glob("**/*.md")` → 只看到 `funds/fund-A/` 下的文件
- 尝试 `huozi_read("../fund-B/x.md")` → 拒绝，不允许逃出 scope
- 尝试 `huozi_read("/funds/fund-B/x.md")` → 拒绝，绝对路径被视为 scope 内相对路径

**与 CC 的对应**：CC 里 `getCwd()` 就是 Agent 的根；云端用 Scope 实现等价物。一个 Agent 感知到的 workspace 就是它的 Scope 范围。

**实现层次**：
- Scope 存在 API Key 元数据中（D1 `api_keys` 表的 `scope_path` 列，NULL = 全 workspace）
- 每次 MCP 请求入口，Worker 解析 Bearer token → 查 API Key → 拿到 `{ workspace_id, scope_path }`
- 工具入参的所有路径在 `backfillObservableInput` 阶段重写：`input_path → scope_path + input_path`，并校验 resolve 后的 canonical path 仍在 scope 内（防 `../`）

**Scope 不取代 ACL**——它是**前置的硬性边界**，在 ACL 规则之前裁剪可见空间。一个 Agent 即使 workspace 内有 admin ACL，也跑不出自己的 Scope。

### 2.5 核心写入 primitive + 双 adapter 模式

所有对文件的修改（Agent 通过 MCP、用户通过 huozi.app 网页、未来的移动端、外部 webhook）**必须**走同一个底层 primitive：

```ts
// 单一源头
writeFilePrimitive({
  workspace_id,
  path,                     // 经 scope 解析后的 canonical path
  content,
  author: { id, type },     // 'agent' | 'user' | 'system'
  parent_sha: string,       // 用于 staleness check
  message?: string,         // commit message
}): Promise<WriteResult>

// 实现要点：
//   1. 进 WorkspaceDO 临界区
//   2. staleness check (parent_sha vs current blob_sha)
//   3. isomorphic-git: tree 更新 + 新 commit
//   4. R2 写入 + D1 更新 files_current / commits
//   5. 广播 + 异步索引
//   6. 返回 { commit_sha, new_blob_sha, structuredPatch, gitDiff }

// 两个 adapter
mcpAdapter.huozi_edit(input)    → writeFilePrimitive(...)
restAdapter.PUT /files/...      → writeFilePrimitive(...)
```

**为什么这样做**：单一写入路径 = 单一审计 = 单一权限 = 单一 bug fix 点。两套实现必烂。

---

## 3. 术语与概念

| 术语 | 定义 |
|---|---|
| **ReadFileState** | Per-agent 持久化 Map：`{ file_path → { content, timestamp (=blob_sha), offset, limit } }` |
| **blob_sha** | Git 对象 SHA-1，替代 CC 的 mtime 作为 staleness 判据 |
| **critical section** | CC 里是同步 I/O；云端里是 `WorkspaceDO` 内的 async 队列 |
| **staleness check** | Read 后 Edit/Write 前，确认文件 blob_sha 没变；变了则强制要求重新 Read |
| **structured patch** | `diff` npm 包的 `structuredPatch` 输出（hunks），字段与 cc:FileEditTool/types.ts 完全一致 |
| **head_limit** | Grep/Glob 结果数上限；`0 = 无限`；默认 250 |
| **appliedLimit** | 只在**真的**截断时返回，告诉 Agent 需要分页（cc:GrepTool.ts:122） |
| **Scope** | API Key 上的子目录前缀限定；Agent 视为它的虚拟根目录；不可逃逸 |
| **writeFilePrimitive** | 所有写入的唯一底层入口；MCP 和 REST adapter 都调它 |
| **revert-only** | 架构不变量：rewind/undo 一律通过新建 commit 抵消旧改动，永不改写历史 |

---

## 4. 工具契约（5 个核心工具）

所有工具以 **MCP tool** 形式暴露，工具名用 `huozi_` 前缀避免与 Agent 本地同名工具冲突，但**输入输出 schema 字段级对齐 CC**。

### 4.1 `huozi_read`

**对齐**：`cc:FileReadTool/FileReadTool.ts` + `cc:sdk-tools.d.ts:FileReadInput/FileReadOutput`

**输入**：
```ts
{
  file_path: string       // 必须是 huozi:// URI
  offset?: number         // 1-indexed 行号
  limit?: number          // 读多少行；默认 MAX_LINES_TO_READ = 2000
  pages?: string          // PDF 专用，格式 "1-5"；最多 20 页
}
```

**输出**（discriminated union，对齐 cc:sdk-tools.d.ts:116-239 + huozi 扩展）：
```ts
// 文本
| { type: 'text', file: {
    filePath, content, numLines, startLine, totalLines,
    blob_sha: string,          // 🆕 huozi 扩展：幂等/并发检测用
  } }
// 缓存命中（未变更）
| { type: 'file_unchanged', file: { filePath, blob_sha: string } }
// 图像（≤ 4 MB）
| { type: 'image', file: { base64, type: 'image/...', originalSize, blob_sha, dimensions? } }
// PDF（≤ 4 MB）
| { type: 'pdf', file: { filePath, base64, originalSize, blob_sha } }
| { type: 'parts', file: { filePath, originalSize, count, outputDir, blob_sha } }
// Notebook
| { type: 'notebook', file: { filePath, cells: unknown[], blob_sha } }
// 🆕 huozi 扩展：二进制文件 > 4 MB，避开 Worker 6 MB 响应上限
| { type: 'binary_ref', file: {
    filePath: string,
    mimeType: string,
    size: number,
    sha: string,          // 即 blob_sha
    url: string,          // R2 签名 URL
    expiresAt: number,    // Unix ms
  } }
```

**关于 `blob_sha` 字段**：CC 原生 schema 没有。加入理由见调研（所有云端 MCP 都缺这个，造成静默并发覆盖）。Agent 可选择性使用：不用也能工作；用了能避免被并发写入覆盖。

**二进制返回策略**（Worker 响应体硬上限 6 MB，base64 膨胀 ~4/3）：

| 文件大小 | 返回 type | 说明 |
|---|---|---|
| ≤ 4 MB | `image` / `pdf` / `parts`（严格同 CC） | inline base64 |
| > 4 MB | `binary_ref`（huozi 扩展） | 签名 URL，20 分钟 TTL |

**不做能力协商**：所有 Agent 统一看到这个扩展类型。工具 prompt 里写清楚"大于 4 MB 的二进制会返回 `binary_ref`——你要自己 fetch URL"，让模型可以自主决策。这比引入 `capabilities` 字段简单，且 CC 原生 schema 没暴露的扩展本来就要由 Agent 的 runtime 来兼容。

**`.ipynb` 处理**（v1 read-only，对应 Q8 决议）：
- `huozi_read` **可读**——按 CC 的 `type: 'notebook'` 格式返回 cells
- `huozi_edit` / `huozi_write` **拒绝**，返回 `{ errorCode: 5, message: "File is a Jupyter Notebook. Use huozi_notebook_edit (v2, not yet available)" }`
- v2 再实现 `huozi_notebook_edit`

**行为约定**：

| 项 | 值 | 来源 |
|---|---|---|
| 默认读行数 | 2000 | cc:FileReadTool/prompt.ts:10 |
| 单次文件大小上限 | 256 KB | cc:FileReadTool/limits.ts:17 (`MAX_OUTPUT_SIZE`) |
| 单次 token 上限 | 25000 | cc:FileReadTool/limits.ts:18 (`DEFAULT_MAX_OUTPUT_TOKENS`) |
| 行号格式 | `cat -n` 风格；默认 6 字符右对齐 + tab | cc:utils/file.ts `addLineNumbers` |
| 空文件返回 | `"the file exists but the contents are empty"` | cc:FileReadTool.ts:705 |
| `file_unchanged` 触发 | `existing.offset === offset && existing.limit === limit && existing.blob_sha === current_blob_sha` | 改自 cc:FileReadTool.ts:540-573（mtime → blob_sha） |
| `file_unchanged` 提示文案 | 一字不差照抄 cc:FileReadTool/prompt.ts:7-8 `FILE_UNCHANGED_STUB` | 必须 |
| 二进制检测 | 按扩展名白名单，**不**做 null-byte check | cc:FileReadTool.ts:472-481 |

### 4.2 `huozi_edit`

**对齐**：`cc:FileEditTool/FileEditTool.ts` + `cc:FileEditTool/types.ts`

**输入**（strict，对齐 cc:FileEditTool/types.ts:6-19）：
```ts
{
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean   // 默认 false
}
```

**输出**（对齐 cc:FileEditTool/types.ts:63-80）：
```ts
{
  filePath: string
  oldString: string
  newString: string
  originalFile: string
  structuredPatch: Array<{ oldStart, oldLines, newStart, newLines, lines: string[] }>
  userModified: boolean    // 见下方"userModified 语义"
  replaceAll: boolean
  gitDiff?: { filename, status, additions, deletions, changes, patch, repository? }
}
```

**`userModified` 云端语义**（对应 Q10 决议）：
- **MCP adapter**（Agent 直接调）→ 永远 `false`
- **REST adapter**（huozi.app 网页 / 移动端用户操作）→ 若经过"人工确认"流程（例如 UI 弹窗"确认保存"点了同意）→ `true`，否则 `false`
- 此字段成为审计中"Agent 自主写入"vs"Human-approved 写入"的区分标记
- `writeFilePrimitive` 签名里增加 `author.confirmed: boolean` 字段，两个 adapter 各自负责传入

**核心行为（按执行顺序）**：

1. **`backfillObservableInput`**：path 规范化（`workspace://` URI 解析 → workspace_id + relative path）（cc:FileEditTool.ts:115）
2. **`validateInput`**：
   - `old_string === new_string` → 拒绝 `errorCode: 1`（cc:146-156）
   - ACL deny → 拒绝 `errorCode: 2`
   - 文件大小 > 1 GiB → 拒绝 `errorCode: 10`（cc:186-195）
   - 文件不存在 + `old_string !== ''` → 拒绝 `errorCode: 4`（cc:224-246）
   - 文件已存在 + `old_string === ''` + 非空 → 拒绝 `errorCode: 3`（cc:249-258）
   - `.ipynb` → 路由到 `huozi_notebook_edit`（v2）`errorCode: 5`（cc:266-273）
   - `readFileState` 无条目或 `isPartialView` → 拒绝 `errorCode: 6`（cc:275-287）
   - blob_sha 不一致 → 拒绝 `errorCode: 7`（cc:290-311，改 mtime → blob_sha）
   - `findActualString` 未命中 → 拒绝 `errorCode: 8`（cc:316-327）
   - 多次匹配 + `!replace_all` → 拒绝 `errorCode: 9`（cc:329-343）
3. **`call`**（在 WorkspaceDO 串行队列中执行）：
   - `findActualString` 引号归一
   - `preserveQuoteStyle` 保持文件原本引号风格
   - `getPatchForEdit` 生成 structuredPatch
   - 写入 Git（R2），新 commit message：`edit: <file> via <agent_id> (msg:<parent_uuid>)`
   - 更新 `readFileState`
4. **异步 fire-and-forget**：
   - 索引更新（D1 FTS5）
   - 审计事件（Workers Analytics Engine）
   - 订阅者广播（WorkspaceDO → WebSocket）

**CRLF/编码约定**：
- 读时 `\r\n → \n` 归一化（cc:FileEditTool.ts:214）
- 写时保持原文件行尾（cc:491）——与 Write **不同**
- BOM 检测：`0xFF 0xFE` → utf16le；`0xEF 0xBB 0xBF` → utf8（cc:fileRead.ts:32-48）

**desanitize 必须实现**（cc:FileEditTool/utils.ts:531-574）：`<fnr>→<function_results>`、`<n>→<name>` 等。云端要**原样**实现整张映射表。

**反模式（必须避免）**：**不要**做 "whitespace-tolerant fallback" 匹配。官方 MCP filesystem server（`edit_file` 工具）在 exact 匹配失败时回退到 whitespace-normalized 行匹配——issue #2034 已证明这在并发场景下**悄悄改到错误位置**。CC 的设计是"严格匹配失败就报错让 Agent 重新 Read"，这比"尽量匹配"安全得多。`findActualString` 只做引号归一（弯/直引号），不做任何 whitespace tolerance。

### 4.3 `huozi_write`

**对齐**：`cc:FileWriteTool/FileWriteTool.ts`

**输入**：
```ts
{
  file_path: string
  content: string
}
```

**输出**：
```ts
{
  type: 'create' | 'update'
  filePath: string
  content: string
  structuredPatch: Array<Hunk>
  originalFile: string | null     // null for 'create'
  gitDiff?: GitDiff
}
```

**关键差异于 Edit**：
- 写时**强制 LF 行尾**（cc:FileWriteTool.ts:305）——这是踩过 "bash 脚本被 CRLF 污染" bug 后的回滚决定，必须照抄
- 文件已存在时**强制要求先 Read**（cc:198-206）；新文件不需要
- 不走 `findActualString`（整体替换，无需定位）

### 4.4 `huozi_glob`

**对齐**：`cc:GlobTool/GlobTool.ts`

**输入**：
```ts
{
  pattern: string
  path?: string           // 默认 workspace 根
}
```

**输出**：
```ts
{
  durationMs: number
  numFiles: number
  filenames: string[]
  truncated: boolean      // 超过 100 则 true
}
```

**行为**：
- **默认 limit = 100**（cc:GlobTool.ts:157）
- **按 mtime 降序**——云端下"mtime" = **该文件最后一次 commit 的 committer time**（由 D1 索引表提供，不走 Git tree walk）
- 结果路径 relativize（去 workspace 根）
- 支持 `**`、`?`、`[abc]`、`{a,b,c}`、`!prefix`

### 4.5 `huozi_grep`

**对齐**：`cc:GrepTool/GrepTool.ts`

**输入**（11 个字段全部对齐 cc:GrepTool.ts:33-89）：
```ts
{
  pattern: string
  path?: string
  glob?: string           // "*.ts" 或 "*.{ts,tsx}"
  output_mode?: 'content' | 'files_with_matches' | 'count'   // 默认 files_with_matches
  '-A'?: number
  '-B'?: number
  '-C'?: number
  context?: number        // alias of -C
  '-n'?: boolean          // 默认 true (content mode)
  '-i'?: boolean
  type?: string           // 'js' | 'py' | 'rust' 等
  head_limit?: number     // 默认 250；0 = 无限
  offset?: number
  multiline?: boolean
}
```

**输出**（对齐 cc:GrepTool.ts:144-155）：
```ts
{
  mode?: 'content' | 'files_with_matches' | 'count'
  numFiles: number
  filenames: string[]
  content?: string
  numLines?: number
  numMatches?: number
  appliedLimit?: number   // 仅在截断时存在
  appliedOffset?: number
}
```

**云端派发策略**：

| 入参组合 | 实现 | 预期延迟 |
|---|---|---|
| 字面/简单子串 | D1 FTS5 (trigram) | < 100ms |
| 简单正则（`\w+`, `[a-z]*`） | D1 FTS5 + 应用层 re-filter | < 200ms |
| 复杂正则（含回溯、`multiline`） | R2 流式扫 + JS regex | 1-3s |
| `-A/-B/-C` 上下文 | 需要文件**行偏移索引**（D1 per-file） | < 500ms |

**必须复刻的 7 个"看不见的默认"**（cc:GrepTool.ts:94-108, 330-355）：

1. `--hidden` 等价（搜隐藏文件）
2. 排除 VCS 目录：`.git`, `.svn`, `.hg`, `.bzr`, `.jj`, `.sl`
3. **`--max-columns 500`** 等价——单行超 500 字符截断（防 minified JS 污染 context）
4. `head_limit` 默认 250
5. `head_limit = 0` 表示无限
6. `appliedLimit` 只在**实际截断**时返回
7. pattern 以 `-` 开头用 `-e` 防 flag collision（云端等价：检测到时走字面量分支）

**Multiline / 复杂正则的硬上限**（Worker 资源保护，严于 CC）：

| 参数 | v1 设定 | 说明 |
|---|---|---|
| 单文件扫描大小上限 | **5 MB** | 超过跳过，在返回里列入 `skipped_files` |
| 单请求总扫描字节 | **50 MB** | 到量即停，`truncated: true` |
| 单请求总耗时 | **10 s** | 到点即停，返回部分结果 |
| `maxResultSizeChars` | **20 KB**（与 CC 对齐） | 不变 |
| `multiline: true` 触发的实现 | 强制走"R2 流式扫 + JS regex"分支 | FTS5 不支持跨行 |

**超限返回结构**（扩展 GrepOutput）：
```ts
{
  ...standardGrepOutput,
  truncated?: boolean,
  skipped_files?: Array<{ path: string, reason: 'too_large' | 'timeout' }>,
  abort_reason?: 'byte_limit' | 'time_limit'
}
```

Agent 看到 `truncated: true` 或 `skipped_files` 时可以决定：缩小 `path` 范围 / 改走 `files_with_matches` 模式 / 放弃 `multiline`。

### 4.6 `huozi_batch_edit`（huozi 扩展）

**CC 没有这个工具，但真实批量场景下不可或缺。** 解决"改 10 个文件"时的原子性、性能、审计噪声三个问题。

**输入**：
```ts
{
  edits: Array<{
    file_path: string
    old_string: string
    new_string: string
    replace_all?: boolean
  }>
  message?: string        // 整批的 commit message（缺省自动生成）
  all_or_nothing?: boolean // 默认 true
}
```

**输出**：
```ts
{
  commit_sha?: string     // 成功时返回
  results: Array<{
    file_path: string
    success: boolean
    error?: { code: number, message: string }
    structuredPatch?: Hunk[]
    oldString?: string
    newString?: string
    originalFile?: string
  }>
  gitDiff?: GitDiff       // 整批的汇总 diff
  aborted: boolean        // true 表示整批回滚
}
```

**行为（严格按顺序）**：

1. 进 `WorkspaceDO` 临界区**一次**
2. 对每个 edit 做 **staleness check**（每个文件的 blob_sha 都要匹配 `readFileState`）
3. 对每个 edit 在 in-memory 上依次应用（isomorphic-git 的 tree 操作，内存中完成）
4. `all_or_nothing: true` 时任何一步失败 → 整批 abort，不写 Git
5. 成功 → **一次 commit**（包含所有文件改动）→ R2 写入 → D1 事务更新
6. 一次广播 + 入队一次 FTS5 索引任务

**失败模式**：
- 任一 staleness 不通过 → 返回 `{ aborted: true, results: [...] }`，每个失败项有 `error.code: 7`
- 任一 `old_string` 未命中 → 同上 `error.code: 8`
- `all_or_nothing: false` + 部分成功 → 成功的照样 commit，失败的在 `results` 里报告；这种模式下**可能仍创建 commit**

**性能预期**：10 个独立文件的 batch_edit ≈ 400-800 ms（vs. 单 edit × 10 ≈ 2-5 s）。

**关于合并单文件多次 edit**：同一 `file_path` 在 edits 数组里出现多次时，按顺序叠加（等价于 CC 里一个 turn 多次 Edit 同一文件）。

**审计价值**：
- 1 个 commit 代表 1 个逻辑操作 → Git history 干净
- revert 整批只需 revert 一次
- commit message 可以解释"为什么这 10 个一起改"

**v1 必做**。

### 4.7 `huozi_history`（huozi 扩展）

查询一个文件的变更历史。对齐 Dropbox/OneDrive/Box 都有的 "get revisions" 概念，但底层直接走 Git log，信息更丰富。

**输入**：
```ts
{
  file_path: string         // 指定文件（相对 scope）
  limit?: number            // 默认 20，最大 100
  before?: string           // commit_sha，翻页起点
}
```

**输出**：
```ts
{
  history: Array<{
    commit_sha: string
    parent_sha: string | null
    author: { id: string, type: 'agent' | 'user' | 'system' }
    timestamp: number       // Unix ms
    message: string
    operation: 'create' | 'edit' | 'write' | 'delete' | 'batch' | 'revert'
    additions: number
    deletions: number
    gitDiff?: GitDiff       // 仅该文件的 diff
  }>
  has_more: boolean
  next_before?: string
}
```

**实现**：直接查 D1 `commits` 表过滤 `paths_changed LIKE '%<file>%'`，按 timestamp 降序。Agent 视角天然比 CC 更强——CC 里 Agent 要自己跑 `git log --follow` 解析。

**用于 revert**：配合 `huozi_revert`（v2）按 commit_sha 或 message_uuid 撤销。v1 只提供只读查询。

### 4.8 `huozi_image_render`（huozi 扩展）

**CC 没有这个工具。** 解决「让 Agent 在文章里画图」的问题：把 SVG 源码渲染成 PNG，存进工作区的标准图库，返回路径。MD 引用 PNG，发布管道再把路径替换成公开 URL。

**为什么不只用 huozi_upload**：upload 接的是已有字节流（来自图片生成模型 / 用户截图）。render 接的是**源码**（SVG / Mermaid），由服务端用确定渲染栈生成位图。两条管道最后落到同一个 content-addressed blob，但前段动作不同 —— 一个是「存」，一个是「画并存」。

**输入**（v1 仅 `svg`）：
```ts
{
  format: 'svg'                       // v2: + 'mermaid'
  source: string                      // SVG 源码（含 <svg>…</svg>）
  scale?: 1 | 2 | 3                   // 输出像素比，默认 2（retina）
  width?: number                      // 像素宽，可选；默认按 viewBox × scale
  save_to?: string                    // 可选目标路径；默认 /__assets__/<sha-prefix>.png
  alt?: string                        // 可选语义说明，写入 D1 image_meta（v2 用）
}
```

**输出**：
```ts
{
  ok: true
  file_path: string                   // 实际写入的工作区路径
  blob_sha: string                    // PNG 的 git blob SHA
  width: number                       // 渲染后像素宽
  height: number                      // 渲染后像素高
  bytes: number                       // PNG 字节数
  content_type: 'image/png'
  commit_sha: string
}
```

**路径约定**（save_to）：

| 场景 | 默认路径 |
|---|---|
| `save_to` 缺省 | `/__assets__/<blob-sha-前 12 位>.png` |
| `save_to` 提供 | 原样使用，但必须以 `.png` 结尾且不可越界 |

#### URL 约定（图片库 SSOT）

下面四条是 huozi 图片资产从 workspace 到公开页面的**完整路径形态**。任何代码改动涉及到资产 URL 都以这里为准，不要在源码里重复推导这套规则。

| 层 | 形态 | 谁产生 |
|---|---|---|
| workspace 内部路径 | `/__assets__/<file>.png` | `huozi_image_render` 或手写 markdown |
| markdown 源码引用 | `![alt](/__assets__/<file>.png)` | Agent / 用户 |
| 公开页面 HTML（`/p/<slug>`）中的 `<img src>` | `/p/<slug>/a/<file>.png` | `src/lib/markdown/renderer.ts` 的 `rewriteAssetUrls()` |
| Next.js 反代命中的 worker 端点 | `/shares/<slug>/asset/__assets__/<file>.png` | `src/app/p/[slug]/a/[...path]/route.ts` |

**为什么 URL 上是 `/a/` 而不是 `/__assets__/`**：Next.js 把以下划线开头的路径段当作 [private folder](https://nextjs.org/docs/app/building-your-application/routing/colocation#private-folders)，不参与路由。`[slug]/__assets__/[...path]/route.ts` 永远不会被注册。所以公开 URL 用 `/a/`（短、不冲突），workspace 内部路径保留 `__assets__/`（无路由约束，且和 Agent 工具语义一致）。代理 route 的职责就是把丢失的 `__assets__/` 加回去再转给 worker。

**渲染栈**：

- **SVG**：`@resvg/resvg-wasm`。Worker 友好，无 native 依赖，包含中文字体回退（v1 仅 PingFang SC + Noto CJK 子集，包大小约 1.2 MB）
- **Mermaid（v2）**：通过外部 render 服务（独立 Worker）调用 `@mermaid-js/mermaid-cli` headless chromium。MCP tool 这一侧只做 HTTP 转发

**幂等性**：相同 `source + scale + width` → 相同 PNG 字节 → 相同 `blob_sha` → R2 自动去重。重复调用是安全的（多次 commit 但 blob 只占一份磁盘）。

**大小限制**：渲染输出 PNG 上限 5 MB。超过则返回 `FILE_TOO_LARGE`，Agent 应降低 `scale` 或拆分图。

**Last-write-wins**：和 `huozi_upload` 同语义，不要求 staleness check。Render 是「按需重画」语义，不是「编辑现有文件」。

**配套 HTTP 端点**（Worker 侧 — `GET /shares/<slug>/asset/__assets__/<path>`，URL 形态见上方「URL 约定」表）：

- 匹配的 share 必须是公开的（无 passcode）且未撤销
- 资产路径**必须**以 `__assets__/` 开头；其它路径返回 400（不是「凡是 share 同 workspace 的文件都开放」）
- 用 share 的 workspace_id 在 `files_current` 索引里查 blob_sha → 从 R2 取字节
- Headers：`Content-Type`（D1 的 `content_type` 列优先，回退扩展名）、`Cache-Control: public, max-age=3600`、`ETag: "<blob_sha>"`

**未来扩展（v2+）**：
- `format: 'mermaid'`
- `format: 'd2'`、`'graphviz'`
- preset：`'mobile' | 'desktop' | 'square' | 'story'`（对齐 `huozi_template` 的 5 种 HTML 格式）
- `huozi_image_list` —— 列工作区中所有图片 + 引用计数（清理孤儿用）

### 5.1 `ReadFileState`（核心）

**位置**：`AgentSessionDO`（per-agent，per-workspace-session）

**结构**：
```ts
interface FileStateEntry {
  content: string         // 读时返回的内容
  blob_sha: string        // 读时的 Git blob SHA（= CC 的 timestamp）
  offset?: number         // Read 时的 offset
  limit?: number          // Read 时的 limit
  readAt: number          // 读取时刻的时间戳（审计用）
}

// Map 以路径为 key
readFileState: Map<FilePath, FileStateEntry>
```

**生命周期**：
- `Read` 成功 → `set`
- `Edit`/`Write` 成功 → `set`（新 blob_sha）
- AgentSession 超时（默认 **24 小时**无活动）→ 清空
- 明确 `session_end` → 清空

**staleness 检查**（对齐 cc:FileEditTool.ts:290-311 + cc:FileWriteTool.ts:282-295）：

```ts
function isStale(path: string, agentState: ReadFileState, currentBlobSha: string): boolean {
  const entry = agentState.get(path)
  if (!entry) return true                         // 从未读过
  if (entry.blob_sha !== currentBlobSha) return true  // 已变更
  return false
}
```

**与 CC 的差异**：
- CC 走 mtime + 二阶段降级（内容比对），为了处理 Windows cloud-sync 误报
- 云端不需要——blob_sha 精确唯一
- 减一阶段，代码更简洁

### 5.2 `isPartialView` 派生

```ts
function isPartialView(entry: FileStateEntry): boolean {
  return entry.offset !== undefined || entry.limit !== undefined
}
```

- Write 拒绝 `isPartialView: true` 的条目（cc:FileWriteTool.ts:199）
- Edit 允许

---

## 6. 存储模型

### 6.1 Workspace = Git 仓库

- 每个 workspace 对应一个**独立的 Git 仓库**
- 仓库物理位置：R2 prefix `workspaces/<workspace-id>/`
- 用 `isomorphic-git` 在 Worker 内读写，R2 作为 object store

### 6.2 R2 对象布局

```
workspaces/<workspace-id>/
├── objects/
│   ├── loose/<sha-prefix>/<sha-rest>       # 热对象（当前 HEAD 下的文件）
│   └── pack/pack-<sha>.pack + .idx         # 历史归档
├── refs/
│   └── heads/main                          # HEAD 引用
└── HEAD
```

### 6.3 D1 表

```sql
-- 每个文件的当前状态（hot path 索引）
CREATE TABLE files_current (
  workspace_id TEXT NOT NULL,
  path         TEXT NOT NULL,
  blob_sha     TEXT NOT NULL,
  size         INTEGER NOT NULL,
  mtime        INTEGER NOT NULL,            -- = last commit time
  mode         INTEGER NOT NULL,            -- Git mode (0644 etc)
  encoding     TEXT,                        -- 'utf8' / 'utf16le'
  line_endings TEXT,                        -- 'LF' / 'CRLF'
  PRIMARY KEY (workspace_id, path)
);

-- FTS5 全文索引
-- 注：没有 fund_id 列；跨 scope 聚合由 path LIKE 前缀过滤完成
CREATE VIRTUAL TABLE file_index USING fts5(
  workspace_id UNINDEXED,
  path         UNINDEXED,
  content,
  tokenize = 'trigram'
);

-- API Key + Scope
CREATE TABLE api_keys (
  key_id          TEXT PRIMARY KEY,
  key_hash        TEXT NOT NULL,           -- bcrypt hash of actual token
  workspace_id    TEXT NOT NULL,
  scope_path      TEXT,                    -- NULL = 全 workspace；否则如 'funds/fund-A/'
  principal_type  TEXT NOT NULL,           -- 'user' | 'agent'
  principal_id    TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER,
  last_used_at    INTEGER,
  name            TEXT
);

-- Commit 审计流水
CREATE TABLE commits (
  workspace_id  TEXT NOT NULL,
  commit_sha    TEXT NOT NULL,
  parent_sha    TEXT,
  author_id     TEXT NOT NULL,              -- agent_id 或 user_id
  author_type   TEXT NOT NULL,              -- 'agent' | 'user'
  message       TEXT NOT NULL,
  timestamp     INTEGER NOT NULL,
  paths_changed TEXT,                       -- JSON array
  PRIMARY KEY (workspace_id, commit_sha)
);

-- 行偏移索引（供 Grep -A/-B/-C）
CREATE TABLE line_offsets (
  workspace_id  TEXT NOT NULL,
  blob_sha      TEXT NOT NULL,
  line_starts   BLOB NOT NULL,              -- 紧凑 u32 数组
  PRIMARY KEY (workspace_id, blob_sha)
);
```

### 6.4 读/写路径

**读**（hot path）：
```
Worker → D1: SELECT blob_sha FROM files_current WHERE ...
       → R2: GET objects/loose/<sha>
       → 返回（不走 Git tree walk）
```

**写**：
```
Worker → AgentSessionDO: staleness check
       → WorkspaceDO: 进入串行队列
          → isomorphic-git: 更新 tree + commit
          → R2: 写 objects + 更新 refs/heads/main
          → D1: 更新 files_current + commits
          → 广播给订阅者
          → Queue: 异步更新 FTS5
       → 返回 { structuredPatch, gitDiff }
```

---

## 7. 权限模型

### 7.1 规则类型

对齐 cc:shellRuleMatching.ts:25-37 + cc:permissions/filesystem.ts:919-952：

| 类型 | 语法 | 说明 |
|---|---|---|
| Exact | `"a/b/c.md"` | 字面量精确匹配 |
| Wildcard | `"a/*.md"` | `*` = 任意字符；`\*` = 字面 `*` |
| Gitignore-style | `"**/draft/**"` | posix 归一化 |

### 7.2 决策链

**READ**（7 层，对齐 cc:1030-1193）：
1. UNC / 恶意路径 → deny
2. deny rule 命中 → deny
3. ask rule 命中 → ask
4. 隐含允许（已有 edit 权限 → 自动 read）
5. 在 workspace 根内 + 非保护路径 → allow
6. allow rule 命中 → allow
7. 默认 → ask

**WRITE**（8 层，对齐 cc:1205-1412）：
1. UNC / 恶意路径 → deny
2. deny rule 命中 → deny
3. `.huozi/` session-only → allow（下一 session 失效）
4. 安全检查（secret 扫描、settings 文件有效性）
5. ask rule 命中 → ask
6. `acceptEdits` 模式 → allow
7. allow rule 命中 → allow
8. 默认 → ask

### 7.3 ACL 合并顺序

对齐 cc:permissions/filesystem.ts:919-952，合并优先级（后面覆盖前面）：

```
workspace 默认 → organization policy → workspace settings → session override
```

### 7.4 Scope 约束（前置硬边界）

Scope 在 ACL 决策链**之前**执行，任何请求在进入决策链前，其路径必须完全位于 scope 内。

**执行步骤**（Worker 请求入口）：

```ts
1. 解析 Bearer token → { workspace_id, scope_path, principal }
2. 对工具入参里的每个 file_path / path：
   a. 若以 '/' 开头，视为 scope_path 内的绝对路径
   b. 否则视为 scope_path 下的相对路径
   c. canonicalize（`../` 规范化）
   d. 若 canonical 路径跳出 scope_path 前缀 → 直接拒绝（403, errorCode: 101）
3. 重写 input.file_path = workspace_id + canonical_path
4. 进入 ACL 决策链（7.2 / 7.3）
```

**对 Agent 透明**：Agent 看到的 path 永远是"相对 scope 根"的。`huozi_glob('**/*.md')` 返回的也是相对路径——Agent 不知道真实全路径。

**拒绝示例**：
- scope = `/funds/fund-A/`，请求 `../fund-B/x.md` → 403
- scope = `/funds/fund-A/`，请求 `/../../../etc/passwd` → 403
- scope = `/funds/fund-A/`，请求 `report.md` → 重写为 `funds/fund-A/report.md` → 继续 ACL

### 7.5 Secret 守卫（v1 简化版）

**原则**：简化优先。v1 只防"肉眼可见的明显 secret"，不追求完整性。

**v1 规则集**（硬编码，~15-20 条）：
- AWS access key：`AKIA[0-9A-Z]{16}`
- AWS secret：40 char base64-ish 紧跟 AWS-key 上下文
- OpenAI API key：`sk-[A-Za-z0-9]{20,}`（含 `sk-proj-`、`sk-test-` 变体）
- Anthropic API key：`sk-ant-[A-Za-z0-9_-]{20,}`
- GitHub token：`ghp_[A-Za-z0-9]{36}` / `github_pat_[A-Za-z0-9_]{70,}`
- Slack token：`xox[baprs]-[A-Za-z0-9-]{10,}`
- RSA/SSH private key header：`-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----`
- JWT：`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
- 通用 `Bearer` + 32+ char token 形式

**硬编码占位符白名单**（在规则扫描**之前**先放行，避免文档/示例炸）：
- 模板变量：`<YOUR_API_KEY>`、`<API_KEY>`、`${...}`、`{{...}}`、`$ENV_NAME` 形式
- 测试/示例标识：命中 `-test-`、`-example-`、`-xxx-`、`-placeholder-` 子串的 key
- 明显掩码：`sk-...`、全零串、`xxxxxxxx...`

**注**：这个白名单也是硬编码，用户不能自定义——一旦开放自定义就回到"gitleaks 路径"。v1 放行上述明显是假的模式即可。

**行为**：
- 命中 → 硬拒绝写入，返回 `{ errorCode: 102, message: "detected secret-like pattern: <rule_name>", matched_line }`
- **不**提供 per-workspace 白名单机制

**不在 v1 做**：
- gitleaks 完整规则库（200+ 条）—— 扩展到 v2
- per-workspace 自定义白名单 —— 有真实误报再加
- 可验证性（trufflehog 风格的 API 调用验证）—— 永远不做，太重

**实现位置**：`packages/huozi-cloud/src/security/secrets.ts`，~50 行常量 + 1 个 `scanForSecrets(content: string)` 函数。

---

## 8. 并发模型

### 8.1 核心等价

| CC | huozi-cloud |
|---|---|
| 单进程同步 I/O 临界区 | `WorkspaceDO` 单线程 async 队列 |
| `readFileState` in-process Map | `AgentSessionDO` 持久化 SQLite |
| `mtime` 比对 | `blob_sha` 比对 |
| `FILE_UNEXPECTEDLY_MODIFIED_ERROR` | 同名错误，文案一字不差 |

### 8.2 WorkspaceDO 的责任

- **锁定**：所有 write 操作串行进入队列
- **广播**：提交成功后通知订阅 agents（WebSocket 推送 `{ type: 'file_changed', path, new_blob_sha, by }`）
- **commit 构造**：合并 author + message + parent
- **D1 事务**：files_current + commits 一次性更新

### 8.3 AgentSessionDO 的责任

- `ReadFileState` 持久化
- 会话超时清理（24h 无活动）
- 给 Worker 提供"当前 agent 在此 workspace 的本地观测"

### 8.4 读为什么不需要锁

- D1 查 blob_sha + R2 读 blob — 两步都是幂等
- 即使读到"刚被别人改完的新版本"也不违反语义（Agent 本来就会处理 staleness）
- 读是 `isConcurrencySafe: true`（cc:GrepTool.ts:184 等价）

---

## 9. 审计与历史

### 9.0 架构不变量：revert-only，历史不可改写

**huozi-cloud 永不提供改写历史的操作。** 所有"撤回 / rewind / 恢复到上一版本"都必须通过**新建抵消 commit** 实现。

- 不提供 `git push --force` 等价物
- 不提供 "删除 commit"、"squash" 等 API
- 管理员权限也不能
- 即使客户要求，也通过"我们可以为你做 revert，但原始 commit 保留"来应对

**为什么写死**：金融合规要求审计流水不可篡改。一旦允许 force-push，整个审计体系的可信度归零。规则越简单越难被钻空子。

### 9.1 每次 Edit/Write 都是一次 commit

- Commit message 格式：`<verb>: <path> via <agent_id> (<message_uuid>)`
  - `verb ∈ {edit, write, create, delete}`
  - `agent_id` = MCP 客户端标识
  - `message_uuid` = MCP 请求的相关 ID（若有）
- Commit author email = `<agent_id>@huozi-agent.local`（和人区分开）

### 9.2 与 CC `fileHistory` 的等价

CC 有一套 `~/.claude/file-history/{sessionId}/<hash>@v{N}` 的备份系统，云端**不需要单独造**——Git commit history 就是更强的版本。

CC 的 `fileHistoryRewind(messageId)` 等价于：
```
POST /workspaces/:id/rewind { message_uuid }
  → 找到 commit_sha WHERE message LIKE '%<message_uuid>%'
  → git revert 或 git checkout 到那个 commit
```

### 9.3 审计查询

```
GET /workspaces/:id/audit?path=...&agent=...&from=...&to=...
  → 查 commits 表
  → 返回时间线 + diff
```

---

## 10. MCP 协议暴露

### 10.1 传输

- **MCP over SSE**，按 CF 官方模板
- 认证：workspace-scoped API key，写成 Bearer token

### 10.2 Roots 协议（workspace / scope 挂载）

**采用 MCP 官方 `roots` 协议**（来自 `modelcontextprotocol/servers/filesystem` 的成熟模式）。客户端启动时发 `roots/list`；huozi-cloud 返回该 API Key 授权的 root URI 列表：

```
roots: [
  { uri: "huozi://workspace/<id>/",         name: "acme-research" },
  { uri: "huozi://workspace/<id>/funds/a/", name: "Fund A (scoped)" }
]
```

- API Key 无 scope → 返回 workspace 根
- API Key 带 scope → 返回 scope 根（Agent 不知道有更高层的 workspace）
- 用户授权新 root 时，服务端发 `roots/list_changed` → Agent 刷新可见空间
- 所有工具入参的路径**必须**落在某个 root 内；不在则拒绝

这让 Agent 把 workspace/scope 当"挂载点"理解，完全对齐它们在 CC 里对 cwd 的心智模型。

### 10.3 工具命名

| MCP 工具名 | CC 对应 |
|---|---|
| `huozi_read` | Read |
| `huozi_edit` | Edit |
| `huozi_write` | Write |
| `huozi_glob` | Glob |
| `huozi_grep` | Grep |
| `huozi_batch_edit` | 🆕 huozi 扩展（CC 没有） |
| `huozi_history` | 🆕 huozi 扩展（类似 Dropbox revisions） |
| `huozi_ls`（v2） | Bash `ls -la` 的替代 |
| `huozi_revert`（v2） | 按 commit_sha 回滚 |
| `huozi_notebook_edit`（v2） | NotebookEdit |

### 10.4 错误码约定

对齐 CC 的 errorCode 编号（cc:FileEditTool.ts 的 1-10），新增只从 100 起。

### 10.5 工具分层暴露

对齐 cc:tools.ts 的三种模式：

| 模式 | 暴露工具 |
|---|---|
| `simple`（默认） | read / edit / write / glob / grep |
| `standard` | + `huozi_ls`、`huozi_log` |
| `advanced` | + `huozi_revert`、`huozi_lock`（显式 checkout） |

---

## 11. 与 CC 的行为差异（必读）

这一节枚举所有**我们有意偏离 CC 的地方**，每条都有 why。

| # | CC 行为 | huozi-cloud 行为 | 原因 |
|---|---|---|---|
| 1 | `file_path` 必须是绝对路径（`/Users/...`） | 必须是 `huozi://workspace/<id>/<rel>` URI | 云端无"绝对路径"概念；防跨 workspace 泄露 |
| 2 | staleness 走 mtime 二阶段（+内容比对） | 走 blob_sha 单阶段 | SHA 精确，无 Windows 误报 |
| 3 | `readFileState` in-process Map | 持久化在 `AgentSessionDO` | 多设备切换 / 断线续传 |
| 4 | Edit/Write 同步写磁盘 | 进入 `WorkspaceDO` 串行队列 | 云端无同步 I/O；DO 单线程语义代替 |
| 5 | fileHistory 本地备份 `~/.claude/file-history/` | Git commit history | 更强、免费、合规友好 |
| 6 | `expandPath(~)` 用户 home | 无此概念 | workspace 就是根 |
| 7 | LSP/VSCode 通知 | v1 不做 | 金融场景用不上 |
| 8 | Skills 按路径自动发现 | v2+ 再做 | 先专注文件原语 |
| 9 | ripgrep 子进程 | D1 FTS5 + 流式 JS regex 派发 | Worker 无进程 |
| 10 | Glob 按文件系统 mtime 排 | 按**最后提交时间**排（D1 索引） | 云端无独立 mtime |
| 11 | UNC 路径特殊处理（Windows） | 直接拒绝所有非 `huozi://` URI | 更严格 |
| 12 | Team memory secrets 守卫 | 同名机制，规则可配置 | 保留但放宽 |
| 13 | `CLAUDE_CODE_SIMPLE=1` 3-tool 模式 | `mode: 'simple'` 5-tool 模式 | 云端最小集更广 |

---

## 12. v1 非目标（显式砍掉）

**坚决不做，v1 周期内**：

1. 富文本实时协同编辑（CRDT）——Edit/Write 是整块替换
2. 分支 / PR / Merge 的 UI 暴露——Git 底座留但不暴露
3. Calendar / Email 事件层（另一个存储模型，放 v2+）
4. Browser / 浏览器工具——彻底超出云盘范畴
5. Web UI 文件浏览器——先用 API + MCP
6. Skills 市场
7. 多用户实时在同一文件协作（v2 做乐观锁 + 冲突提示就够）
8. Vectorize 语义搜索（v2 加）
9. 订阅 / 支付 / 计量（v2 业务化后加）
10. Public workspace（所有 workspace 默认私有）

---

## 13. 开放问题

### 13.1 已定稿（v0.3 累计）

| # | 问题 | 决议 | 落实位置 |
|---|---|---|---|
| 1 | Workspace 由谁创建 | **仅用户**；Agent 在已存在 workspace 内自由活动，但不能自建 | §2.2 |
| 2 | Fund 是否一等公民 | **否**。Workspace 用户自由创建，业务概念通过 **Scope 机制**（子目录锁定）实现 | §2.2, §2.4, §7.4 |
| 3 | 非 Agent 写入路径 | **核心 `writeFilePrimitive` + MCP/REST 双 adapter** | §2.5 |
| 4 | Rewind 语义 | **仅 revert**（新 commit）。force-push 作为架构不变量写死禁止 | §9.0 |
| 5 | `huozi_grep` multiline 上限 | 单文件 5 MB / 单请求 50 MB / 10 s；超限返回 `truncated` + `skipped_files` | §4.5 |
| 6 | Secret scanner | **简化优先**：v1 只硬编码 ~15-20 条明显规则 + 占位符白名单（`<YOUR_KEY>`、`-test-` 等）；不引入 gitleaks 全量集，不做 per-workspace 白名单 | §7.5 |
| 7 | 跨 workspace 搜索 | **v1 完全不做**，不预声明数据库 `org_id`，将来需要时再迁移 | — |
| 8 | `.ipynb` 支持 | **v1 read-only**：`huozi_read` 可返回 notebook 格式；Edit/Write 拒绝并指向 v2 `huozi_notebook_edit` | §4.1 末尾 |
| 9 | 图像/PDF Read 返回 | **混合**：≤ 4 MB inline base64（同 CC）；> 4 MB 返回 `binary_ref` + R2 签名 URL；无能力协商 | §4.1 |
| 10 | `userModified` 字段 | **复用为"human-approved"标记**：MCP 调用永远 false；REST adapter 经人工确认流程则 true；审计可区分 Agent 自主 vs 人工放行 | §4.2 |

### 13.2 待讨论

（空——10 条已全部钉住。后续如有新问题直接追加。）

---

## 13.5 身份与认证（Identity & Auth）

> 跨 edition 的 auth 设计。三个核心差异（登录方式 / workspace 模型 / 公开注册）见 `AGENTS.md` "Three core differences"；本节细化 Worker 侧的数据模型、HTTP 端点、和 MCP 工具契约。

### 13.5.1 D1 schema 追加

```sql
-- Edge: 邮箱 + 密码凭证。一个 user 一行；Cloud 用户没有这一行（不影响）。
-- 算法 v1 锁 argon2id；hash 是 PHC 字符串（自带 salt + 参数），算法升级时
-- 比对用 PHC 头自动识别，无需迁移历史行。
CREATE TABLE IF NOT EXISTS password_credentials (
  user_id      TEXT PRIMARY KEY,
  hash         TEXT NOT NULL,        -- argon2id PHC string
  updated_at   INTEGER NOT NULL
);

-- 一次性魔法链接（Phase B 的 huozi_grant_browser_session 落地表）。
-- 单次使用，过期自动失效，consumed_at 标记后即使 token 泄露也无效。
CREATE TABLE IF NOT EXISTS magic_links (
  token        TEXT PRIMARY KEY,         -- 高熵随机串，URL 中传输
  user_id      TEXT NOT NULL,
  workspace_id TEXT NOT NULL,            -- 落地的 workspace（=cookie 中 wsid）
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,         -- 默认 created + 600s
  consumed_at  INTEGER,                  -- 首次点击后写入
  issued_by    TEXT                      -- 调用 grant 的 caller principal_id（审计用）
);

CREATE INDEX IF NOT EXISTS idx_magic_links_user ON magic_links (user_id);
```

`workspace_invites` 已存在（§ 6.3），Edge / Cloud 共用。Edge 的差异在于**接收侧不验证 email** —— 邀请者点击 URL 后可以修改 email 字段。`email` 在 Edge 等同于 username（登录标识，无所有权证明）。

### 13.5.2 浏览器闭环（Phase A — main flow）

#### Cloud first contact（OTP 驱动）

| 步 | 路径 | 动作 |
|---|---|---|
| 1 | `GET /login` | 表单：仅 email 输入框 |
| 2 | `POST /api/auth/cloud/request-otp` | 写一行 `otp_codes` + 发邮件；回 `{ ok }` |
| 3 | `GET /login?email=…&pending=1` | 表单切换到 OTP code 输入 |
| 4 | `POST /api/auth/cloud/verify-otp` | 校验 → upsert `users` → mint JWT cookie → 302 `/workspace` 或 `/select-workspace` |

新邮箱第一次走完即为注册，无独立 signup 路由。

#### Edge first contact（密码驱动）

| 步 | 路径 | 动作 |
|---|---|---|
| 1 | `GET /admin/setup?secret=$HUOZI_ADMIN_SECRET` | **仅当 D1 `users` 为空**才显示表单（email + password）；否则 404 防止重置攻击 |
| 2 | `POST /admin/setup` | upsert users + workspaces + workspace_members(owner) + password_credentials → JWT cookie |
| 3 | `POST /admin/invites`（已认证） | admin 在 `/workspace/members` 提交被邀请人 email → 写 `workspace_invites` 行 + 返回 `/invite/<token>` URL |
| 4 | `GET /invite/<token>` | 表单：**email（预填，可改）** + password |
| 5 | `POST /invite/<token>/accept` | 校验 token 未过期未消费 → upsert users（按表单 email）+ password_credentials + workspace_members(member) → JWT cookie → 302 `/workspace` |

#### Edge 后续登录（Cloud 不走这条）

| 步 | 路径 | 动作 |
|---|---|---|
| 1 | `GET /login`（Edge 模式） | 表单：email + password 两栏 |
| 2 | `POST /api/auth/edge-login` | 查 `users` by email → 比对 `password_credentials.hash`（argon2id verify）→ JWT cookie → 302 `/workspace`；任何失败统一返 `Invalid email or password`（不区分用户存在与否，防 enumeration） |

### 13.5.3 Identity tools（Phase B — MCP 层）

> 浏览器闭环之上的 Agent 快捷路径。本节工具不取代 Phase A，是补充。

#### `huozi_request_otp`（Cloud only · 匿名）

```ts
// input
{ email: string }

// output
{ ok: true, expires_in_seconds: 600 }
| { ok: false, error: 'rate_limited' | 'invalid_email' }
```

不需要 api_key（这是注册 / 首次登录的入口）。Worker 写 otp_codes 表 + 发邮件，行为与 `POST /api/auth/cloud/request-otp` 一致。

**Rate limit**：每 email 每 10 分钟 max 3 次，每 IP 每小时 max 20 次。超限返回 `rate_limited`，不暴露具体计数。

#### `huozi_verify_otp`（Cloud only · 匿名）

```ts
// input
{ email: string, code: string, agent_label?: string }

// output
{ ok: true, api_key: string, key_id: string, workspace_id: string | null }
| { ok: false, error: 'invalid_code' | 'expired' | 'rate_limited' }
```

成功时同步：upsert `users`、mint 一把 api_key（`agent_kind: 'unknown'`，name 用 `agent_label` 或默认 `"[mcp-bootstrap] <date>"`）、返回 key 给 Agent 自己存。`workspace_id: null` 时 Agent 应当提示用户用浏览器走 `/onboard` 创建第一个 workspace（`huozi_create_workspace` 不开放）。

**Rate limit**：每 email 每 10 分钟 max 5 次错误尝试，超限返回 `rate_limited`（不返 expired，避免泄露 OTP 还在有效期内）。

#### `huozi_invite`（Cloud + Edge · 已认证）

```ts
// input
{ email: string, role?: 'member' }   // v1 仅 'member'

// output
{ ok: true, invite_url: string, expires_at: number }
| { ok: false, error: 'permission_denied' | 'already_member' | 'edge_admin_only' }
```

调用者必须是当前 workspace 的 owner（Cloud：role='owner'；Edge：principal='admin'）。返回 URL 让 Agent 转给被邀请人——接受走浏览器（`/invite/<token>`），借机引导新用户配 Agent。

#### `huozi_grant_browser_session`（Cloud + Edge · 已认证）

```ts
// input
{}    // 完全无参数，从 caller 的 api_key 推断 user + workspace

// output
{ ok: true, url: string, expires_at: number }
```

Worker 写 `magic_links` 行 → 返回 `<base>/auth/m/<token>`。expire 默认 10 分钟。点击后 `GET /auth/m/<token>` 校验 + mint JWT cookie + 重定向 `/workspace`，同步标记 `consumed_at`。

**安全**：token 短暂，单次使用；Agent 被攻陷时多发链接不增加攻击面（攻陷者已经持 api_key）；workspace_id 从 caller 取，跨 ws 攻击不可能。

### 13.5.4 故意不开放的 MCP 工具

| 工具名 | 不做的原因 |
|---|---|
| `huozi_create_workspace` | Cloud 暂时一人一 ws，开放只增混乱；Edge 永远单 ws |
| `huozi_join_workspace` / `huozi_accept_invite` | 接受邀请走浏览器，是 onboarding 入口（也借机让新用户连 Agent）。MCP 走完后用户没 cookie 也没在浏览器，体验断裂 |
| `huozi_change_password` | 高破坏性，留 UI |
| `huozi_delete_workspace` / `huozi_transfer_owner` | 不可逆，留 UI 加二次确认 |

### 13.5.5 端点全表

| Method | Path | Edition | Auth | 用途 |
|---|---|---|---|---|
| `GET` | `/login` | both | none | 登录页（Edge 显示 email+password；Cloud 显示 OTP 流程）|
| `POST` | `/api/auth/cloud/request-otp` | Cloud | none | 发 OTP |
| `POST` | `/api/auth/cloud/verify-otp` | Cloud | none | 校验 OTP → cookie |
| `POST` | `/api/auth/edge-login` | Edge | none | email+password → cookie |
| `GET` | `/admin/setup` | Edge | `?secret=$HUOZI_ADMIN_SECRET` | 一次性 admin 初始化（仅 users 空时）|
| `POST` | `/admin/setup` | Edge | secret | 同上提交 |
| `POST` | `/admin/invites` | both | cookie + owner | 已存在；admin 生成邀请 URL |
| `GET` | `/invite/<token>` | both | none | 接受邀请表单（Cloud 跳过 password；Edge 含 password）|
| `POST` | `/invite/<token>/accept` | both | none | 接受 → cookie |
| `GET` | `/auth/m/<token>` | both | none | 一次性魔法链接消费 → cookie |
| `POST` | `/api/auth/logout` | both | cookie | 清 cookie |

### 13.5.6 实施分阶段

| Phase | 内容 | 风险 |
|---|---|---|
| A1 | Edge `/admin/setup` + password_credentials 表 + argon2id helper | 低（新增）|
| A2 | Edge `/login` 改密码登录 + `/api/auth/edge-login`；middleware 不变 | 中（替换 connect 路径）|
| A3 | Edge `/invite/<token>` 表单 + `/invite/<token>/accept` | 中（新流程）|
| A4 | Cloud 浏览器流程已有（无改动）| — |
| B1 | `huozi_grant_browser_session` + `/auth/m/<token>` + magic_links 表 | 低 |
| B2 | `huozi_invite`（包装现有 `/admin/invites`）| 低 |
| B3 | `huozi_request_otp` + `huozi_verify_otp`（Cloud only）+ rate-limit 中间件 | 中（暴露匿名 endpoint）|

A1-A4 独立闭环；B1-B3 可任意时机插入，不阻塞 A。

---

## 14. 变更记录

- **v0.7 (2026-05-01)**：新增 §13.5 身份与认证。锁定 Cloud / Edge 三大核心差异（OTP vs 密码 / 多 vs 单 workspace / 公开注册 vs 邀请）。Edge 浏览器闭环（`/admin/setup` + 密码 `/login` + 邀请 URL 设密码）；Identity tools Phase B 设计（`huozi_request_otp` / `huozi_verify_otp` / `huozi_invite` / `huozi_grant_browser_session`）。**故意不开放** `huozi_join_workspace` —— 接受邀请走浏览器作为新用户 onboarding 入口。新增 D1 表：`password_credentials`、`magic_links`。
- **v0.6 (2026-04-21)**：钉住 "Agent 写，人类读" 的分工（§0.3 目标 5、§0.4 新增"依据"小节、§0.2 明确 Web UI 不做编辑）。v1 Web UI（`huozi.app/cloud/workspace`）上线，支持浏览 + 历史视图；Web 编辑**显式**推到 v2 且要看真实需求再决定做不做。同一 commit 周期新增：Worker 侧 Scope 运行时强制、Secret scanner、vitest 单测套件（177 assertions）、3 个 CF-wire smoke（batch/scope/secrets 共 71 assertions）。
- **v0.5 (2026-04-20)**：基于生态调研（官方 MCP filesystem / TencentCOS / Dropbox / OneDrive / Box / `mathematic-inc/claude-tools-mcp`）的调整。**定位升级为"Agent 用的云端硬盘"**（§0.1）。新增 `huozi_batch_edit`（§4.6）和 `huozi_history`（§4.7）；Read 输出加 `blob_sha` 字段（§4.1）；Edit 明确反对 whitespace-tolerant fallback（§4.2）；MCP 暴露采用 roots 协议（§10.2）。**关键结论**：CC 方言云端硬盘是空白象限，我们是第一家。
- **v0.4 (2026-04-20)**：钉住 Q8/Q10。`.ipynb` v1 read-only；`userModified` 重新定义为 human-approved 标记；Secret scanner 增加占位符白名单（模板变量和 `-test-` 等）；Read 扩展类型不做能力协商。**所有 10 个 open questions 已全部定稿**。
- **v0.3 (2026-04-20)**：钉住 Q6/Q7/Q9。Secret scanner 走"简化优先"路线（§7.5）；跨 workspace v1 不做也不预声明；Read 大文件走 `binary_ref` 签名 URL（§4.1）。
- **v0.2 (2026-04-20)**：钉住 open questions 前 5 条。新增：Scope 机制（§2.4, §7.4）、writeFilePrimitive（§2.5）、revert-only 不变量（§9.0）、multiline grep 硬上限（§4.5）。更新 D1 schema：去掉 `fund_id`，加 `api_keys` 表。
- **v0.1 (2026-04-20)**：初稿，基于 Claude Code v2.1.114 源码调研。定稿核心架构与 5 个工具契约。

---

## 附录 A：代码复用清单（可直接从 cc-haha 拷贝）

以下文件**行级复用**到 `packages/huozi-cloud/src/cc-compat/`：

| 源文件 | 目标 | 行数 | 改动 |
|---|---|---|---|
| `src/tools/FileEditTool/utils.ts` | `cc-compat/editor.ts` | 775 | 只需改 import 路径 |
| `src/utils/diff.ts` | `cc-compat/diff.ts` | 177 | 无改动 |
| `src/utils/fileRead.ts` | `cc-compat/fileRead.ts` | 102 | 去掉 Node `fs` 依赖（改为传入 Buffer） |
| `src/utils/permissions/shellRuleMatching.ts` | `cc-compat/ruleMatching.ts` | 228 | 无改动 |
| `src/tools/FileEditTool/types.ts` (schema) | `cc-compat/tool-types.ts` | 85 | 直接复用 |

合计可直接复用：**~1370 行**。

---

## 附录 B：必须对照的 Prompt 文案（一字不差）

为保证 Agent 行为可预测，以下文案**必须原文照搬**：

1. `FILE_UNCHANGED_STUB`（cc:FileReadTool/prompt.ts:7-8）
2. Read tool description（cc:FileReadTool/prompt.ts:32-48）
3. Edit tool description（cc:FileEditTool/prompt.ts:20-28）
4. Write tool description（cc:FileWriteTool/prompt.ts:11-17）
5. Glob tool description（cc:GlobTool/prompt.ts:3-7）
6. Grep tool description（cc:GrepTool/prompt.ts:6-18）
7. Error messages：
   - `"File has not been read yet. Read it first before writing to it."`（cc:FileEditTool.ts:280-281）
   - `"File has been modified since read, either by the user or by a linter. Read it again before attempting to write it."`（cc:306-307）
   - `"String to replace not found in file.\nString: ${old_string}"`（cc:321）
   - `"Found ${matches} matches of the string to replace, but replace_all is false..."`（cc:335）
   - `"No changes to make: old_string and new_string are exactly the same."`（cc:152）

---

**End of SPEC v0.1**
