#!/usr/bin/env node
/**
 * 生成各 MCP 客户端的配置片段。
 *
 * 为什么需要它：不同客户端的配置文件位置和字段名都不一样，
 * 手写容易错。这个脚本读当前项目的绝对路径，直接输出可粘贴的配置。
 *
 * 用法：
 *   node mcp/print-config.mjs              # 打印全部客户端
 *   node mcp/print-config.mjs claude       # 只打印某一个
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SERVER = join(ROOT, 'mcp', 'server.mjs')

/**
 * 用原始路径。不要手动转义反斜杠——JSON.stringify 会自己做。
 * 手动再转一次会得到 C:\\\\path 这种双重转义，粘进配置文件直接失效。
 */
const serverPath = SERVER

/** 各客户端的最小配置 */
const TARGETS = {
  claude: {
    name: 'Claude Desktop / Claude Code',
    file: 'claude_desktop_config.json（macOS: ~/Library/Application Support/Claude/；Windows: %APPDATA%\\Claude\\）',
    note: 'Claude Code 用命令行：claude mcp add maoxuan -- node "' + SERVER + '"',
    config: {
      mcpServers: {
        maoxuan: {
          command: 'node',
          args: [serverPath],
        },
      },
    },
  },

  cursor: {
    name: 'Cursor',
    file: '~/.cursor/mcp.json（项目级：<项目>/.cursor/mcp.json）',
    config: {
      mcpServers: {
        maoxuan: {
          command: 'node',
          args: [serverPath],
        },
      },
    },
  },

  cline: {
    name: 'Cline（VS Code 扩展）',
    file: 'VS Code 设置 → Cline → MCP Servers → Edit MCP Settings',
    config: {
      mcpServers: {
        maoxuan: {
          command: 'node',
          args: [serverPath],
          disabled: false,
          autoApprove: ['mao_search'],
        },
      },
    },
  },

  windsurf: {
    name: 'Windsurf',
    file: '~/.codeium/windsurf/mcp_config.json',
    config: {
      mcpServers: {
        maoxuan: {
          command: 'node',
          args: [serverPath],
        },
      },
    },
  },

  continue: {
    name: 'Continue（VS Code / JetBrains）',
    file: '~/.continue/config.json（放在 mcpServers 数组里）',
    config: {
      mcpServers: [
        {
          name: 'maoxuan',
          command: 'node',
          args: [serverPath],
        },
      ],
    },
  },

  zed: {
    name: 'Zed',
    file: '~/.config/zed/settings.json（放在 context_servers 里）',
    config: {
      context_servers: {
        maoxuan: {
          command: { path: 'node', args: [serverPath] },
        },
      },
    },
  },
}

function print(key) {
  const t = TARGETS[key]
  if (!t) return false
  process.stdout.write(`\n### ${t.name}\n\n`)
  process.stdout.write(`配置文件：${t.file}\n`)
  if (t.note) process.stdout.write(`\n${t.note}\n`)
  process.stdout.write('\n```json\n')
  process.stdout.write(JSON.stringify(t.config, null, 2))
  process.stdout.write('\n```\n')
  return true
}

const arg = process.argv[2]
if (arg) {
  if (!print(arg)) {
    process.stderr.write(`未知客户端：${arg}\n可选：${Object.keys(TARGETS).join(', ')}\n`)
    process.exitCode = 1
  }
} else {
  process.stdout.write(`MCP server 路径：${SERVER}\n`)
  process.stdout.write(`\n先确认语料已就绪：node scripts/fetch-corpus.mjs\n`)
  for (const key of Object.keys(TARGETS)) print(key)
  process.stdout.write('\n---\n\n')
  process.stdout.write('装好后在客户端里问：「用毛选分析一下我们团队的问题」\n')
  process.stdout.write('模型应自动调用 mao_search，并给出 篇名 · 章节 · 第 N 段 的出处。\n')
}
