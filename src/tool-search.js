/**
 * mao_search 工具：把检索能力交给模型自己调用。
 *
 * 为什么是工具而不是自动注入上下文：
 *  - 模型能自己决定查几次、换什么词、要不要再查；
 *  - 检索为空时能拿到明确的"未命中"信号，从而说"毛选没直接谈这个"，
 *    而不是硬编一个出处。
 *
 * 返回的每一段都带 篇目 / 章节路径 / 段落号 / 原文，可被精确回溯。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Bm25Index } from './bm25.js'

/** 单次最多返回段落数 */
const MAX_LIMIT = 8
/** 默认返回数 */
const DEFAULT_LIMIT = 4
/** 原文摘录上限（字符） */
const EXCERPT_MAX = 320

/**
 * @param {Bm25Index} index
 * @returns {import('@deepseek-ai/dsh-tools').ToolDefinition}
 */
export function createSearchTool(index) {
  return defineTool({
    name: 'mao_search',
    description:
      '检索《毛泽东选集》原文。按主题词返回相关段落，每段带篇目、章节路径、段落号与原文摘录，用于引用出处、核对方法论依据。' +
      '凡要给出"毛泽东怎么看/毛选怎么讲"的判断，必须先调用本工具取证；没有命中时不得编造出处。',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: '检索主题词或短语，如「主要矛盾」「论持久战 三个阶段」「调查研究」',
      },
      limit: {
        type: 'number',
        description: `返回段落数，默认 ${DEFAULT_LIMIT}，最大 ${MAX_LIMIT}`,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          content: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.content }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const query = String(args.query ?? '').trim()
      if (!query) return { content: '请提供检索词。' }

      const rawLimit = Number(args.limit)
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
        : DEFAULT_LIMIT

      const hits = index.search(query, { limit })

      if (hits.length === 0) {
        return {
          content:
            `未命中：语料库中没有与「${query}」相关的段落。\n` +
            '此时必须明确告诉用户"《毛选》里没有直接谈这个"，不得编造出处或假装引用。\n' +
            '可以改用更概括的方法论词重试一次，例如：主要矛盾、实践、调查研究、持久战、统一战线、群众路线。',
        }
      }

      const parts = [`检索「${query}」命中 ${hits.length} 段：`, '']
      hits.forEach((h, i) => {
        const excerpt =
          h.chunk.text.length > EXCERPT_MAX
            ? `${h.chunk.text.slice(0, EXCERPT_MAX)}……`
            : h.chunk.text
        parts.push(`【${i + 1}】${h.chunk.work} › ${h.chunk.path} （第 ${h.chunk.para} 段）`)
        parts.push(excerpt)
        parts.push('')
      })
      parts.push('引用时请标注：篇名 · 章节 · 段落号。不要改写原文措辞。')

      return { content: parts.join('\n') }
    },
  })
}
