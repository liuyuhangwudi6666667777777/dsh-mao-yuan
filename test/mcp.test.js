/**
 * MCP server 的协议层测试。
 *
 * 走真实 stdio，不 mock —— 因为最容易出错的正是
 * "stdout 被日志污染" 这类只有在真进程里才暴露的问题。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SERVER = join(ROOT, 'mcp', 'server.mjs')

/**
 * 起一个 server 进程，返回 call(method, params)。
 */
function startServer() {
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] })
  let buf = ''
  const pending = new Map()
  let seq = 1
  const stderrChunks = []

  child.stdout.on('data', (d) => {
    buf += d.toString('utf8')
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        // stdout 出现非 JSON = 日志污染了协议通道，记为错误
        pending.set('__bad__', line)
        continue
      }
      const cb = pending.get(msg.id)
      if (cb) {
        pending.delete(msg.id)
        cb(msg)
      }
    }
  })
  child.stderr.on('data', (d) => stderrChunks.push(d.toString('utf8')))

  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = seq++
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 20000)
      pending.set(id, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })

  return {
    child,
    call,
    pending,
    stderr: () => stderrChunks.join(''),
    close: () => {
      child.stdin.end()
      child.kill()
    },
  }
}

test('mcp: initialize 返回协议版本与工具能力', async () => {
  const s = startServer()
  try {
    const res = await s.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    })
    assert.equal(res.jsonrpc, '2.0')
    assert.equal(res.result.protocolVersion, '2024-11-05')
    assert.ok(res.result.capabilities.tools !== undefined)
    assert.equal(res.result.serverInfo.name, 'maoxuan-search')
  } finally {
    s.close()
  }
})

test('mcp: tools/list 暴露 mao_search 且 schema 合法', async () => {
  const s = startServer()
  try {
    await s.call('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
    const res = await s.call('tools/list', {})
    const tools = res.result.tools
    assert.equal(tools.length, 1)
    assert.equal(tools[0].name, 'mao_search')
    assert.equal(tools[0].inputSchema.type, 'object')
    assert.deepEqual(tools[0].inputSchema.required, ['query'])
    assert.ok(tools[0].inputSchema.properties.query.description.length > 0)
  } finally {
    s.close()
  }
})

test('mcp: tools/call 能检索到原文并带出处', async () => {
  const s = startServer()
  try {
    await s.call('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
    const res = await s.call('tools/call', {
      name: 'mao_search',
      arguments: { query: '矛盾', limit: 2 },
    })
    const text = res.result.content[0].text
    assert.equal(res.result.content[0].type, 'text')
    assert.ok(text.includes('命中'), '应报告命中数')
    // 必须带篇名 · 章节 · 段落号
    assert.match(text, /【1】.+›.+（第 \d+ 段）/)
    assert.ok(text.includes('引用时请标注'))
  } finally {
    s.close()
  }
})

test('mcp: 未命中返回明确否定信号，不编造', async () => {
  const s = startServer()
  try {
    await s.call('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
    const res = await s.call('tools/call', {
      name: 'mao_search',
      arguments: { query: '量子纠缠与区块链' },
    })
    const text = res.result.content[0].text
    assert.ok(text.startsWith('未命中'), `实得：${text.slice(0, 40)}`)
    assert.ok(text.includes('不得编造出处'))
  } finally {
    s.close()
  }
})

test('mcp: 未知工具返回 -32602', async () => {
  const s = startServer()
  try {
    await s.call('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
    const res = await s.call('tools/call', { name: 'nope', arguments: {} })
    assert.equal(res.error.code, -32602)
    assert.match(res.error.message, /Unknown tool/)
  } finally {
    s.close()
  }
})

test('mcp: 未知方法返回 -32601', async () => {
  const s = startServer()
  try {
    const res = await s.call('bogus/method', {})
    assert.equal(res.error.code, -32601)
  } finally {
    s.close()
  }
})

test('mcp: stdout 只输出 JSON-RPC，日志走 stderr', async () => {
  const s = startServer()
  try {
    await s.call('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
    await s.call('tools/list', {})
    // 等待 stderr 有内容
    await new Promise((r) => setTimeout(r, 300))
    assert.ok(s.stderr().includes('[maoxuan-search]'), 'stderr 应有日志')
    // stdout 出现非 JSON 会被记在 __bad__
    assert.equal(s.pending.get('__bad__'), undefined, 'stdout 不得被日志污染')
  } finally {
    s.close()
  }
})
