/**
 * 插件入口：加载语料 → 建索引 → 注册工具 → 注入提示词。
 *
 * 生命周期约定（与 DSH 插件模型一致）：
 *  - apply() 返回一个 disposer，卸载即净；
 *  - 语料缺失时插件不崩，只是不注册工具，并在日志里说清怎么补。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCorpus } from './corpus.js'
import { Bm25Index } from './bm25.js'
import { createSearchTool } from './tool-search.js'
import { buildPromptSection } from './prompt.js'

export const name = 'dsh-mao-yuan'

export const inject = ['systemPrompt', 'tools']

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CORPUS_DIR = join(ROOT, 'corpus')

/** 提示词插在 persona 之后（persona 段 order 为 0），用 10 留出空档 */
const SECTION_ORDER = 10

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  /** @type {() => void} */
  const disposers = []
  /** @type {Bm25Index | null} */
  let index = null

  // --- 语料与索引 ---
  if (!existsSync(CORPUS_DIR)) {
    ctx.logger?.warn?.(
      `[${name}] 未找到语料目录 ${CORPUS_DIR}。` +
        '插件已加载但检索工具不可用。请先运行：node scripts/fetch-corpus.mjs',
    )
  } else {
    // 同步构建不可行（readdir 是异步的），用 Promise 在后台构建，
    // 工具调用时若索引未就绪会给出明确提示。
    const ready = loadCorpus(CORPUS_DIR)
      .then((chunks) => {
        const idx = new Bm25Index().build(chunks)
        index = idx
        ctx.logger?.info?.(`[${name}] 语料就绪：${chunks.length} 段，词表 ${idx.df.size}`)
        return idx
      })
      .catch((err) => {
        ctx.logger?.warn?.(`[${name}] 语料加载失败：${String(err?.message ?? err)}`)
        return null
      })

    // 注册工具（工具内部等索引就绪）
    const pendingTool = createSearchTool({
      search: (q, o) => (index ? index.search(q, o) : []),
      get size() {
        return index?.size ?? 0
      },
    })

    // 工具需要等 ready 才可用：包一层
    const tool = {
      ...pendingTool,
      async execute(args) {
        await ready
        if (!index) {
          return { content: '语料未就绪，无法检索。请先运行 node scripts/fetch-corpus.mjs' }
        }
        return pendingTool.execute(args)
      },
    }

    disposers.push(ctx.tools.register(tool))
  }

  // --- 提示词注入 ---
  const section = buildPromptSection({ order: SECTION_ORDER })
  disposers.push(
    ctx.systemPrompt.section({
      name: section.name,
      order: section.order,
      text: section.text,
    }),
  )

  ctx.logger?.info?.(`[${name}] 已加载`)

  return () => {
    for (const d of disposers) {
      try {
        d()
      } catch {
        /* 卸载错误不应阻断 */
      }
    }
  }
}
