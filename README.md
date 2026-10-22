# 毛选溯源参谋 · maoxuan-search

让 AI 引用《毛泽东选集》时**有据可查**——每个判断都能翻回原文的篇目、章节、段落号。

支持 **MCP**，可在 Claude、Cursor、Cline、Windsurf、Continue、Zed 等客户端使用；
也可以作为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。

> ⚠️ 本仓库只含代码，**不含《毛选》原文**。原文由你本地运行脚本获取。
> 详见 [NOTICE.md](./NOTICE.md)。

---

## 触发方式：只有 `/maoxuan`

**这个工具不会自己启动。** 无论你在 Claude、Cursor 还是 DSH 里，
都必须显式输入 `/maoxuan` 才会进入毛选模式。

```
/maoxuan 我们团队三个人，两个人互相不服
```

没打这个命令时：

| 你的输入 | 会不会触发 |
|---|---|
| `今天天气怎么样` | ❌ 不会 |
| `帮我写个函数` | ❌ 不会 |
| `用毛选分析一下我的问题` | ❌ **不会**，需要先打 `/maoxuan` |
| `按矛盾论看看这事` | ❌ **不会** |
| `毛泽东怎么看待内卷` | ❌ 不会 |
| `/maoxuan 我的问题` | ✅ **会** |

**连"用毛选分析"这种明确请求都不自动触发**，这是刻意设计的：
让模型凭语义判断"该不该用毛选"，结果一定是正常对话被污染。
宁可少触发，你要用的时候自己打命令。

> 如果你确实想让模型自己判断，DSH 插件里把 `modelInvocable` 设为 `true`。
> 但默认是关的。

### 关掉它

| 载体 | 怎么关 |
|---|---|
| **DSH 插件** | 点输入框左边的红色「● 毛选」胶囊，或输入 `/maoxuan off` |
| **MCP 客户端** | 输入 `/maoxuan off`，或直接说"退出毛选模式" |

---

## 三种载体的差异（重要）

同样是 `/maoxuan`，体验不一样：

| | **DSH 插件** | **MCP** | **豆包 Skill** |
|---|---|---|---|
| 触发 | `/maoxuan` | `/maoxuan` | 靠 description 判断 |
| **状态可见** | ✅ 红色胶囊 | ❌ 无 | ❌ 无 |
| **一键关闭** | ✅ 点胶囊 | ⚠️ 输入命令 | ❌ 无 |
| 会话内持续 | ✅ 自动 | ⚠️ 需重申 | ❌ 每次判断 |
| 检索能力 | ✅ 完整 | ✅ 完整 | ❌ 无（纯提示词） |
| 安装难度 | 中（需 DSH） | 中（改 JSON） | 低（复制文件夹） |

**只有 DSH 插件能做到"看得见状态、点一下关闭"。**

原因：DSH 允许插件往输入框插槽里放 UI 组件，MCP 和 Skill 协议里没有这个概念。
这不是实现问题，是协议能力边界。

> **豆包 Skill 版**目前**不包含检索**，所以没有溯源能力，只是提示词协议。
> 如果你要的是"能翻回原文"，请用 DSH 插件或 MCP。

---

## 它独特在哪

市面上的"毛选 AI"几乎都是提示词包。问题在于：模型可以随口说"毛泽东说过……"，
**你没法分辨真假**——而这恰恰最难发现，因为它听起来很像。

本项目加了一层**原文检索**：

| | 普通提示词包 | 本项目 |
|---|---|---|
| 模型说"毛选里讲" | 无法验证 | 必须先调 `mao_search` |
| 引用格式 | 篇名都可能是编的 | `篇名 · 章节 · 第 N 段`，可翻回原文 |
| 检索不到时 | 继续编 | 明确回答"《毛选》里没有直接谈这个" |
| 注释污染 | 无处理 | 自动剔除编者注释与题解 |

最后一条值得单说：语料里 169/229 篇带 `注　　释` 段落，179 篇带题解。
这些是**编者作品，不是毛泽东的话**。不过滤的话，检索结果会把脚注当正文返回——
实测中《为人民服务》的 Top-1 命中曾是张思德的脚注。本项目切掉了 443 条，
段落数 2508 → 2065。

### 检索效果

真实运行输出：

```
查询：主要矛盾 次要矛盾

【1】矛盾论 › 四　主要的矛盾和主要的矛盾方面 （第 1 段）
   在矛盾特殊性的问题中，还有两种情形必须特别地提出来加以分析，
   这就是主要的矛盾和主要的矛盾方面。在复杂的事物的发展过程中，
   有许多的矛盾存在，其中必有一种是主要的矛盾……

【2】工人阶级与资产阶级的矛盾是国内的主要矛盾 （第 2 段）
   在打倒地主阶级和官僚资产阶级以后，中国内部的主要矛盾即是
   工人阶级与民族资产阶级的矛盾……
```

---

## 安装

### 第 1 步：拿到代码和语料

```bash
git clone https://github.com/liuyuhangwudi6666667777777/maoxuan-search.git
cd maoxuan-search

node scripts/fetch-corpus.mjs     # 下载 229 篇到 corpus/（约 1.3 MB）
node scripts/eval.mjs             # 验证：应输出 20/20 = 100%
```

> 需要能访问 GitHub。脚本走 `codeload` tarball，比 `raw.githubusercontent.com` 稳。
> 完全离线也行：自己准备 Markdown 放 `corpus/`，命名 `NNN-篇名.md`。

### 第 2 步：接到你的 AI 客户端

先打印出适合你机器的配置（路径已填好，直接复制）：

```bash
node mcp/print-config.mjs           # 打印全部客户端
node mcp/print-config.mjs cursor    # 只打印某一个
```

下面是各客户端的配置方式。

<details open>
<summary><b>Claude Desktop</b></summary>

配置文件：
- macOS `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "maoxuan": {
      "command": "node",
      "args": ["/绝对路径/maoxuan-search/mcp/server.mjs"]
    }
  }
}
```

改完**完全退出** Claude（不是关窗口），再打开。

</details>

<details>
<summary><b>Claude Code</b></summary>

一条命令：

```bash
claude mcp add maoxuan -- node "/绝对路径/maoxuan-search/mcp/server.mjs"
```

</details>

<details>
<summary><b>Cursor</b></summary>

配置文件：`~/.cursor/mcp.json`（全局）或 `<项目>/.cursor/mcp.json`（项目级）

```json
{
  "mcpServers": {
    "maoxuan": {
      "command": "node",
      "args": ["/绝对路径/maoxuan-search/mcp/server.mjs"]
    }
  }
}
```

在 Cursor 设置 → MCP 里确认服务显示绿灯。

</details>

<details>
<summary><b>Cline（VS Code 扩展）</b></summary>

Cline 面板 → MCP Servers → Configure → 编辑 `cline_mcp_settings.json`：

```json
{
  "mcpServers": {
    "maoxuan": {
      "command": "node",
      "args": ["/绝对路径/maoxuan-search/mcp/server.mjs"],
      "disabled": false,
      "autoApprove": ["mao_search"]
    }
  }
}
```

`autoApprove` 让检索不用每次点确认。

</details>

<details>
<summary><b>Windsurf</b></summary>

配置文件：`~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "maoxuan": {
      "command": "node",
      "args": ["/绝对路径/maoxuan-search/mcp/server.mjs"]
    }
  }
}
```

</details>

<details>
<summary><b>Continue（VS Code / JetBrains）</b></summary>

配置文件：`~/.continue/config.json`，注意是**数组**：

```json
{
  "mcpServers": [
    {
      "name": "maoxuan",
      "command": "node",
      "args": ["/绝对路径/maoxuan-search/mcp/server.mjs"]
    }
  ]
}
```

</details>

<details>
<summary><b>Zed</b></summary>

配置文件：`~/.config/zed/settings.json`，字段名是 `context_servers`：

```json
{
  "context_servers": {
    "maoxuan": {
      "command": {
        "path": "node",
        "args": ["/绝对路径/maoxuan-search/mcp/server.mjs"]
      }
    }
  }
}
```

</details>

<details>
<summary><b>其他 MCP 客户端</b></summary>

只要支持 stdio 传输的 MCP 客户端，通用写法都是：

```
command: node
args:    ["/绝对路径/maoxuan-search/mcp/server.mjs"]
```

不需要 API key，不需要网络（语料已在本地），不需要额外依赖。

</details>

### 第 3 步：让它按毛选的方式回答

MCP 只提供**检索能力**。要让 AI 用毛选的方法论回答，还得告诉它怎么用。

把下面这段贴进你的客户端（Claude 用 Project 说明，Cursor/Cline 用 `.cursorrules`
或自定义指令）：

```markdown
只有我输入 `/maoxuan` 时才进入毛选模式。其他任何情况——包括我说"用毛选分析"
"按矛盾论看"——都不要自动进入，先提示我打 `/maoxuan`。

进入后按以下方式工作：

1. 先调查再发言。信息不足时先问 3–5 个具体问题，不要急着下结论。
2. 任何"毛泽东认为""毛选里讲"的断言，必须先调用 mao_search 取证。
3. 引用格式：篇名 · 章节 · 第 N 段。
4. 检索不到就明确说"《毛选》里没有直接谈这个"，不得编造出处。
5. 区分事实与判断，判断要带反证条件。
6. 称我为"同志"，不说鸡汤，给能验证的下一步。

我说 `/maoxuan off` 或"退出毛选模式"时立即退出。
```

<details>
<summary><b>用 DSH 的话，这段已经内置了，而且有状态按钮</b></summary>

如果你用的是 DeepSeek Harness，装成插件即可，提示词和 UI 都自带：

```bash
dsh plugin --profile web add link:/绝对路径/maoxuan-search
```

重启 `dsh web` 后，在会话里输入：

```
/maoxuan 我们团队三个人，两个人互相不服
```

**这是三种载体里唯一有 UI 状态的：**

| 表现 | 含义 |
|---|---|
| 输入框左边出现红色「● 毛选」胶囊 | 模式已开启 |
| 胶囊消失 | 模式已关闭 |
| 点击胶囊 | 立即关闭，并清掉预填的 `/maoxuan` |
| 草稿自动出现 `/maoxuan ` | 模式开着，直接接着写问题 |

**本会话内持续生效**，后续追问不用重复打命令。

> 路径含空格时 `dsh plugin add` 会报错（实测会截断路径）。
> 这时手工登记更稳：建 junction 到 `~/.dsh/profiles/web/node_modules/maoxuan-search`，
> 再在 profile 的 `package.json` 里加进 `dependencies` 和 `dsh.profile.bundles`，
> 最后 `dsh plugin --profile web install`。改前记得备份。

</details>

---

## 验证它真的在工作

先打命令，再问一个毛选确实谈过的问题：

```
/maoxuan 什么是主要矛盾？
```

**期望**：AI 调用 `mao_search`，回答里出现 `矛盾论 › 四 主要的矛盾和主要的矛盾方面 （第 1 段）` 这样的出处。

再问一个毛选没谈过的（仍在毛选模式下）：

```
/maoxuan 怎么优化 React 的渲染性能？
```

**期望**：AI 明确说"《毛选》里没有直接谈这个"，然后可以讲方法论的一般用法，
但要标明那是推演，不是原文。

**如果它编了一个不存在的篇名——那就是没接上检索，检查第 2 步的配置。**

### 验证触发纪律

这条同样重要——确认它**不会自己启动**：

```
（不输入 /maoxuan，直接问）
用毛选分析一下我的团队问题
```

**期望**：AI 提示你先输入 `/maoxuan`，而不是直接进入毛选模式。
如果它直接开始用"同志"称呼你、开始引用毛选——**说明触发条件太宽，请提 Issue**。

本地也可以直接验证检索本身：

```bash
node mcp/server.mjs --selftest
```

---

## 项目结构

```
maoxuan-search/
├── mcp/
│   ├── server.mjs          # MCP server（stdio，零依赖）
│   └── print-config.mjs    # 生成各客户端配置片段
├── src/
│   ├── search-core.js      # 检索核心，MCP 与 DSH 共用
│   ├── bm25.js             # BM25 + 篇名/短语加成
│   ├── tokenize.js         # 无词典 bigram 中文分词
│   ├── corpus.js           # 装载 + 剔除注释题解 + 段落切分
│   ├── index.js            # DSH 插件入口
│   ├── skill.js            # DSH 的按需加载 skill
│   ├── session-state.js    # DSH 会话级状态
│   ├── active-reminder.js  # DSH 动态提示词段
│   └── tool-search.js      # DSH 的 defineTool 包装
├── lib/client.js           # DSH 浏览器端（状态胶囊 + 自动预填）
├── scripts/                # 语料拉取、检索评测
└── corpus/                 # 语料（gitignore，不入库）
```

**核心是 `src/search-core.js`**：MCP 和 DSH 两个入口都调它，
所以两边引用格式完全一致。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| **纯关键词检索** | 没有向量。问"我该不该辞职"这类语义模糊的问题，召回不如问"矛盾""持久战" |
| **不判断时效** | 语料是 1925–1957 年的文本，问 2026 年的具体事件它没有依据 |
| **依赖第三方语料源** | 拉取脚本指向的仓库未声明许可证，可能变更或删除，需要自备语料 |
| **MCP 只管检索** | 提示词协议要你自己贴（DSH 插件才内置） |

第 1 条最影响体验。加向量做混合召回会显著改善，欢迎 PR。

---

## 开发

```bash
npm test                  # 60 个测试
node scripts/eval.mjs     # 检索评测，低于 85% 退出码非 0
npm run mcp:selftest      # MCP 检索自检
npm run mcp:config        # 打印客户端配置
```

## License

代码 MIT，见 [LICENSE](./LICENSE)。
语料版权与第三方来源见 [NOTICE.md](./NOTICE.md)。
