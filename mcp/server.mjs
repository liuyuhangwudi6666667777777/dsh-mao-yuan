#!/usr/bin/env node
/**
 * MCP server：把 mao_search 暴露给所有支持 MCP 的 AI 客户端。
 *
 * 支持：Claude Desktop / Claude Code / Cursor / Cline / Windsurf /
 *       Continue / Zed / 任何 MCP 兼容客户端。
 *
 * 传输：stdio（JSON-RPC 2.0 按行分隔），MCP 最通用的方式。
 * 零依赖：不引入 @modelcontextprotocol/sdk，避免版本漂移和安装体积。
 *
 * 用法：
 *   node mcp/server.mjs            # 由客户端拉起
 *   node mcp/server.mjs --selftest # 本地自检，打印一次检索结果
 */
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCorpus } from '../src/corpus.js'
import { Bm25Index } from '../src/bm25.js'
import {
  TOOL_DESCRIPTION,
  TOOL_PARAMETERS,
  runSearch,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from '../src/search-core.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CORPUS_DIR = join(ROOT, 'corpus')

/** MCP 协议版本 */
const PROTOCOL_VERSION = '2024-11-05'

/** 服务信息 */
const SERVER_INFO = {
  name: 'maoxuan-search',
  version: '1.0.0',
}

// ---------------------------------------------------------------- 索引

/** @type {Bm25Index | null} */
let index = null
/** @type {Promise<void> | null} */
let readyPromise = null

/**
 * 懒加载语料。第一次调用工具时才建索引，避免拖慢启动。
 * 语料缺失不崩，让工具返回明确错误，用户知道怎么办。
 */
function ensureIndex() {
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    if (!existsSync(CORPUS_DIR)) {
      log(`语料目录不存在：${CORPUS_DIR}`)
      return
    }
    const chunks = await loadCorpus(CORPUS_DIR)
    index = new Bm25Index().build(chunks)
    log(`语料就绪：${chunks.length} 段，词表 ${index.df.size}`)
  })().catch((err) => {
    log(`语料加载失败：${String(err?.message ?? err)}`)
  })
  return readyPromise
}

/** 日志走 stderr —— stdout 是 JSON-RPC 通道，绝不能污染 */
function log(msg) {
  process.stderr.write(`[maoxuan-search] ${msg}\n`)
}

// ---------------------------------------------------------------- 工具定义

const TOOL = {
  name: 'mao_search',
  description: TOOL_DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: TOOL_PARAMETERS.query.description,
      },
      limit: {
        type: 'number',
        description: TOOL_PARAMETERS.limit.description,
        minimum: 1,
        maximum: MAX_LIMIT,
        default: DEFAULT_LIMIT,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
}

// ---------------------------------------------------------------- JSON-RPC

/**
 * @param {any} id
 * @param {any} result
 */
function respond(id, result) {
  write({ jsonrpc: '2.0', id, result })
}

/**
 * @param {any} id
 * @param {number} code
 * @param {string} message
 */
function respondError(id, code, message) {
  write({ jsonrpc: '2.0', id, error: { code, message } })
}

/** @param {any} msg */
function write(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`)
}

/**
 * 处理一条 JSON-RPC 请求。
 * @param {any} msg
 */
async function handle(msg) {
  const { id, method, params } = msg ?? {}

  // 通知（无 id）不需要回复
  const isNotification = id === undefined || id === null

  switch (method) {
    case 'initialize': {
      respond(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      })
      return
    }

    case 'notifications/initialized':
      // 客户端确认，无需回复
      return

    case 'tools/list': {
      respond(id, { tools: [TOOL] })
      return
    }

    case 'tools/call': {
      const name = params?.name
      if (name !== TOOL.name) {
        respondError(id, -32602, `Unknown tool: ${String(name)}`)
        return
      }
      const args = params?.arguments ?? {}
      await ensureIndex()
      const content = runSearch(index, args.query, args.limit)
      respond(id, { content: [{ type: 'text', text: content }] })
      return
    }

    case 'ping': {
      respond(id, {})
      return
    }

    default: {
      if (isNotification) return
      respondError(id, -32601, `Method not found: ${String(method)}`)
    }
  }
}

// ---------------------------------------------------------------- 启动

async function selftest() {
  log('自检模式')
  await ensureIndex()
  if (!index) {
    log('语料未就绪，自检失败')
    process.exitCode = 1
    return
  }
  const out = runSearch(index, '主要矛盾 次要矛盾', 2)
  process.stdout.write(out + '\n')
}

function serve() {
  log('MCP server 已启动（stdio）')
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch {
      log(`忽略无法解析的行：${trimmed.slice(0, 80)}`)
      return
    }
    void handle(msg).catch((err) => {
      log(`处理请求出错：${String(err?.message ?? err)}`)
      if (msg?.id !== undefined) respondError(msg.id, -32603, 'Internal error')
    })
  })

  rl.on('close', () => {
    log('stdin 关闭，退出')
    process.exit(0)
  })
}

const isSelftest = process.argv.includes('--selftest')
if (isSelftest) {
  void selftest()
} else {
  serve()
}
