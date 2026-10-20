/**
 * 会话级"持续生效"状态 + 自动识别 /maoxuan 的开启与关闭。
 *
 * 需求：
 *   - `/maoxuan ...` 调用一次后，本会话后续每轮都自动带方法论；
 *   - `/maoxuan off` 关掉，之后不再带；
 *   - 不同会话互不影响；重启清空。
 *
 * 实现：用 WeakMap 以 Agent 对象为键。
 *  - Agent 是会话级对象，天然隔离；
 *  - WeakMap 不阻止回收，会话结束状态自动消失，不会内存泄漏；
 *  - 不落盘，重启即清空——符合"会话内生效"的语义。
 */

/** @type {WeakMap<object, boolean>} */
const active = new WeakMap()

/**
 * @param {object} agent
 * @returns {boolean}
 */
export function isActive(agent) {
  if (!agent || typeof agent !== 'object') return false
  return active.get(agent) === true
}

/**
 * @param {object} agent
 * @param {boolean} on
 */
export function setActive(agent, on) {
  if (!agent || typeof agent !== 'object') return
  if (on) active.set(agent, true)
  else active.delete(agent)
}

/** 仅用于测试 */
export function clear(agent) {
  if (agent && typeof agent === 'object') active.delete(agent)
}

/**
 * 从一段用户文本里判断是否在开关毛选模式。
 *
 * 语法：
 *   `/maoxuan`            → 开
 *   `/maoxuan off`        → 关
 *   `/maoxuan 关`         → 关
 *   `/maoxuan 关闭`       → 关
 *   `/maoxuan <问题>`     → 开（并继续按问题作答）
 *
 * @param {string} text
 * @returns {{action: 'on'|'off'|null}}
 */
export function parseToggle(text) {
  if (typeof text !== 'string') return { action: null }
  // 与 DSH 的 SKILL_GESTURE 对齐：/name 前须为行首或空白，后须为空白或行尾
  const re = /(^|\s)\/maoxuan(?=\s|$)([^\n]*)/i
  const m = re.exec(text)
  if (!m) return { action: null }

  const rest = m[2].trim()
  if (rest === '') return { action: 'on' }

  // 第一个词是关闭指令才算关闭，避免把 "/maoxuan 关掉这个项目吧" 误判
  const first = rest.split(/\s+/)[0].toLowerCase()
  if (['off', '关', '关闭', '停止', '退出'].includes(first)) return { action: 'off' }

  return { action: 'on' }
}

/**
 * 扫描一轮消息，决定是否切换状态。
 * 只看直接用户输入，忽略注入的 system-reminder 之类。
 *
 * @param {readonly any[]} messages
 * @returns {{action: 'on'|'off'|null}}
 */
export function scanToggle(messages) {
  if (!Array.isArray(messages)) return { action: null }
  // 从后往前找最近一条带指令的用户消息
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.source?.kind !== 'user') continue
    for (const block of message.content ?? []) {
      if (block?.type !== 'text') continue
      const { action } = parseToggle(block.text)
      if (action) return { action }
    }
  }
  return { action: null }
}
