/**
 * 平台无关的检索核心。
 *
 * 从 tool-search.js 里抽出来，因为它混了两件事：
 *   1. 检索 + 格式化结果  ← 任何平台都能用
 *   2. defineTool 包装     ← 只有 DSH 能懂
 *
 * 抽出来之后，DSH 插件和 MCP server 共用同一份检索与输出格式，
 * 保证两边引用格式完全一致（篇名 · 章节 · 第 N 段）。
 */

/** 单次最多返回段落数 */
export const MAX_LIMIT = 8
/** 默认返回数 */
export const DEFAULT_LIMIT = 4
/** 原文摘录上限（字符） */
export const EXCERPT_MAX = 320

/**
 * 工具描述。DSH 与 MCP 共用，避免两边说法不一致。
 *
 * 触发纪律写在描述最前面：MCP 客户端里模型会自己决定要不要调工具，
 * 所以必须明确"只在用户输入 /maoxuan 之后才用"。
 */
export const TOOL_DESCRIPTION =
  '检索《毛泽东选集》原文，返回带篇目、章节、段落号的段落，用于引用出处。' +
  '【使用前提】仅当用户在本轮或本会话早些时候输入过 `/maoxuan` 命令时才可调用。' +
  '用户只是提到毛泽东、毛选、矛盾、教员，或讨论管理/战略问题，都不构成调用理由。' +
  '调用后须按「篇名 · 章节 · 第 N 段」标注引用；未命中时明确说"《毛选》里没有直接谈这个"，不得编造出处。'

export const TOOL_PARAMETERS = {
  query: {
    type: 'string',
    required: true,
    description: '检索主题词或短语，如「主要矛盾」「论持久战 三个阶段」「调查研究」',
  },
  limit: {
    type: 'number',
    description: `返回段落数，默认 ${DEFAULT_LIMIT}，最大 ${MAX_LIMIT}`,
  },
}

/**
 * 归一化 limit 参数。
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeLimit(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT)
}

/**
 * 把检索结果格式化成模型可读的文本。
 *
 * 未命中时返回明确的否定信号，而不是空串——
 * 这样模型才知道该说"毛选没直接谈这个"，而不是自己编一个出处。
 *
 * @param {string} query
 * @param {{chunk: {work: string, path: string, para: number, text: string}, score: number}[]} hits
 * @returns {string}
 */
export function formatHits(query, hits) {
  if (hits.length === 0) {
    return (
      `未命中：语料库中没有与「${query}」相关的段落。\n` +
      '此时必须明确告诉用户"《毛选》里没有直接谈这个"，不得编造出处或假装引用。\n' +
      '可以改用更概括的方法论词重试一次，例如：主要矛盾、实践、调查研究、持久战、统一战线、群众路线。'
    )
  }

  const parts = [`检索「${query}」命中 ${hits.length} 段：`, '']
  hits.forEach((h, i) => {
    const text = h.chunk.text
    const excerpt = text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX)}……` : text
    parts.push(`【${i + 1}】${h.chunk.work} › ${h.chunk.path} （第 ${h.chunk.para} 段）`)
    parts.push(excerpt)
    parts.push('')
  })
  parts.push('引用时请标注：篇名 · 章节 · 段落号。不要改写原文措辞。')
  return parts.join('\n')
}

/**
 * 检索并格式化。两个平台的唯一入口。
 *
 * @param {{search: (q: string, o?: {limit?: number}) => any[], size: number} | null} index
 * @param {string} rawQuery
 * @param {unknown} [rawLimit]
 * @returns {string}
 */
export function runSearch(index, rawQuery, rawLimit) {
  const query = String(rawQuery ?? '').trim()
  if (!query) return '请提供检索词。'
  if (!index) {
    return '语料未就绪，无法检索。请先运行 node scripts/fetch-corpus.mjs 获取语料。'
  }
  const limit = normalizeLimit(rawLimit)
  return formatHits(query, index.search(query, { limit }))
}
