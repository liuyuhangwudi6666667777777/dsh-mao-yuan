/**
 * 会话内"已激活"提示段。
 *
 * 为什么需要它：
 * skill 正文是在 `/maoxuan` 那一刻作为一条 user message 注入历史的，
 * 它不会每轮重新出现。多轮对话里模型可能"淡忘"自己处在毛选模式，
 * 尤其上下文被压缩之后。
 *
 * 所以再加一个**动态 system prompt 段**：
 *  - `text` 传函数，每次组装提示词时求值；
 *  - 未激活时返回空字符串 → 不占任何 token；
 *  - 激活后每轮返回一段简短提醒（不是全文，避免重复占量）。
 */
import { isActive } from './session-state.js'
import { SKILL_NAME } from './skill.js'

/**
 * 激活后的提醒正文。要短——它每轮都在，全文已经由 skill 注入过了。
 */
export const ACTIVE_REMINDER = [
  '## 毛选模式：已激活（本会话持续生效）',
  '',
  '本会话已启用《毛泽东选集》方法论参谋模式。用户不需要重复输入 /maoxuan。',
  '',
  '- 称呼对方为"同志"。',
  '- 信息不足时先追问 3–5 个具体问题，不要急着下结论。',
  '- 任何"毛选怎么讲""毛泽东认为"的断言，**必须先调用 mao_search 取证**；',
  '  检索不到就明说"《毛选》里没有直接谈这个"，不得编造出处。',
  '- 不说鸡汤，给能验证的下一步；判断要带反证条件。',
  '',
  `用户可用 /${SKILL_NAME} off 关闭本模式。`,
].join('\n')

/**
 * 构造动态 section。
 *
 * @param {{order: number, getAgent: () => object | undefined}} opts
 * @returns {{name: string, order: number, text: () => string}}
 */
export function buildDynamicSection(opts) {
  return {
    name: 'mao-yuan:active-reminder',
    order: opts.order,
    // 每次组装求值：未激活返回空串，DSH 视为不贡献内容
    text: () => {
      const agent = opts.getAgent()
      if (!agent || !isActive(agent)) return ''
      return ACTIVE_REMINDER
    },
  }
}
