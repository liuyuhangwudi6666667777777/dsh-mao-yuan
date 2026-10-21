/**
 * 客户端半边：让"毛选模式开着没有"看得见，并自动在输入框前置 /maoxuan。
 *
 * 解决两个问题：
 *  1. 用户看不出当前是否处于毛选模式 → 输入框左侧显示状态胶囊
 *  2. 每轮都要手打 /maoxuan → 模式开启时自动把 /maoxuan 放回草稿
 *
 * 状态机（纯客户端，不依赖 host）：
 *
 *   用户打出 /maoxuan …  → active = true
 *   用户发送后草稿清空    → 自动预填 "/maoxuan "（用户要的"自动带前缀"）
 *   点胶囊 / 打 /maoxuan off → active = false，并清掉预填
 *
 * 为什么可行：客户端能通过 useInput 看到实时草稿，
 * 所以"用户打了 /maoxuan"这件事在发送前就能观察到，
 * 不必等 host 回传消息。
 *
 * host 侧的 WeakMap 仍然独立工作：客户端预填的 /maoxuan 发送后，
 * host 的 agent/pre-step 钩子会看到同一条文本并激活提示词注入。
 * 两边靠命令文本保持一致，不需要额外协议。
 */
import { createElement as h, useEffect, useRef } from 'react'

const SLOT_LEFT = 'conversation.input.left'

/** 预填文本 */
const PREFIX = '/maoxuan '
/** 关闭命令 */
const OFF = '/maoxuan off'

export const inject = ['slots']

/**
 * 会话级状态。key 是 sessionId。
 * @type {Map<string, {active: boolean}>}
 */
const states = new Map()

function stateOf(sessionId) {
  const key = String(sessionId ?? '')
  let s = states.get(key)
  if (!s) {
    s = { active: false }
    states.set(key, s)
  }
  return s
}

/** 草稿是否"干净"（空或只有前缀）—— 只有干净时才允许自动写回，绝不覆盖用户输入 */
function isPristine(draft) {
  const t = (draft ?? '').trim()
  return t === '' || t === '/maoxuan'
}

/** 草稿是否已经以 /maoxuan 开头 */
function hasPrefix(draft) {
  return /^\s*\/maoxuan(\s|$)/i.test(draft ?? '')
}

/** 是否是关闭指令 */
function isOffCommand(draft) {
  const m = /^\s*\/maoxuan(?=\s|$)([^\n]*)/i.exec(draft ?? '')
  if (!m) return false
  const first = (m[1].trim().split(/\s+/)[0] ?? '').toLowerCase()
  return ['off', '关', '关闭', '停止', '退出'].includes(first)
}

/**
 * 状态胶囊 + 自动预填。
 */
function MaoYuanPill({ useInput, inputActions, sessionId }) {
  const draft = useInput((s) => s.draft)
  const st = stateOf(sessionId)
  const lastDraft = useRef(draft)

  // --- 观察用户输入，切换状态 ---
  useEffect(() => {
    const prev = lastDraft.current ?? ''
    lastDraft.current = draft ?? ''

    // 用户打了 /maoxuan off → 关闭
    if (isOffCommand(draft)) {
      st.active = false
      return
    }
    // 用户打了 /maoxuan（且之前没有）→ 开启
    if (hasPrefix(draft) && !hasPrefix(prev)) {
      st.active = true
    }
  }, [draft, st])

  // --- 自动预填：模式开启且草稿干净时，补上前缀 ---
  useEffect(() => {
    if (!st.active) return
    if (!isPristine(draft)) return
    if (hasPrefix(draft)) return
    inputActions.setDraft(PREFIX)
  }, [st.active, draft, inputActions])

  if (!st.active) return null

  return h(
    'button',
    {
      type: 'button',
      className: 'dsh-mao-yuan-pill',
      title: '毛选模式已开启（本会话持续生效）。点击关闭。',
      onClick: () => {
        st.active = false
        // 清掉预填，避免误发；用户若正在写内容则保留
        if (isPristine(draft)) inputActions.setDraft('')
      },
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        marginRight: '4px',
        border: 'none',
        borderRadius: '999px',
        fontSize: '12px',
        lineHeight: '18px',
        cursor: 'pointer',
        userSelect: 'none',
        color: '#fff',
        background: '#b91c1c',
        whiteSpace: 'nowrap',
      },
    },
    h('span', { 'aria-hidden': 'true' }, '●'),
    '毛选',
  )
}

/**
 * @param {any} ctx
 */
export function apply(ctx) {
  const slots = ctx.slots
  slots.inject(SLOT_LEFT, () =>
    slots.register(
      {
        name: SLOT_LEFT,
        id: 'mao-yuan-status',
        order: 5,
      },
      MaoYuanPill,
    ),
  )
}
