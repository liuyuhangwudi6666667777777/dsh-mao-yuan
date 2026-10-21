/**
 * mao_search 工具（DSH 适配层）。
 *
 * 检索与格式化逻辑全部在 search-core.js 里，
 * 这里只做 DSH 的 defineTool 包装，让 MCP 那边能复用同一份实现。
 *
 * 为什么是工具而不是自动注入上下文：
 *  - 模型能自己决定查几次、换什么词、要不要再查；
 *  - 检索为空时能拿到明确的"未命中"信号，从而说"毛选没直接谈这个"，
 *    而不是硬编一个出处。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TOOL_DESCRIPTION, TOOL_PARAMETERS, runSearch } from './search-core.js'

/**
 * @param {() => ({search: Function, size: number} | null)} getIndex
 * @returns {import('@deepseek-ai/dsh-tools').ToolDefinition}
 */
export function createSearchTool(getIndex) {
  return defineTool({
    name: 'mao_search',
    description: TOOL_DESCRIPTION,
    parameters: TOOL_PARAMETERS,
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
      return { content: runSearch(getIndex(), args.query, args.limit) }
    },
  })
}
