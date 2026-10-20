import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVE_REMINDER, buildDynamicSection } from '../src/active-reminder.js'
import { setActive, clear } from '../src/session-state.js'

test('reminder: 未激活时返回空串（不占 token）', () => {
  const agent = { id: 'x' }
  clear(agent)
  const section = buildDynamicSection({ order: 10, getAgent: () => agent })
  assert.equal(section.text(), '')
})

test('reminder: 无 agent 时返回空串', () => {
  const section = buildDynamicSection({ order: 10, getAgent: () => undefined })
  assert.equal(section.text(), '')
})

test('reminder: 激活后返回提醒正文', () => {
  const agent = { id: 'y' }
  setActive(agent, true)
  const section = buildDynamicSection({ order: 10, getAgent: () => agent })
  assert.equal(section.text(), ACTIVE_REMINDER)
  clear(agent)
})

test('reminder: 关闭后立即恢复空串（每次组装重新求值）', () => {
  const agent = { id: 'z' }
  const section = buildDynamicSection({ order: 10, getAgent: () => agent })

  setActive(agent, true)
  assert.notEqual(section.text(), '')

  setActive(agent, false)
  assert.equal(section.text(), '', '关闭后不应再注入')
  clear(agent)
})

test('reminder: 正文包含关键约束与关闭方式', () => {
  assert.ok(ACTIVE_REMINDER.includes('同志'))
  assert.ok(ACTIVE_REMINDER.includes('mao_search'), '必须提醒取证')
  assert.ok(ACTIVE_REMINDER.includes('不得编造出处'))
  assert.ok(ACTIVE_REMINDER.includes('/maoxuan off'), '必须告诉用户怎么关')
})

test('reminder: 正文足够短（每轮都在，不能太长）', () => {
  assert.ok(ACTIVE_REMINDER.length < 500, `实际 ${ACTIVE_REMINDER.length} 字符，过长会每轮消耗 token`)
})

test('reminder: section 名称与 order 正确', () => {
  const section = buildDynamicSection({ order: 10, getAgent: () => undefined })
  assert.equal(section.name, 'mao-yuan:active-reminder')
  assert.equal(section.order, 10)
  assert.equal(typeof section.text, 'function', 'text 必须是函数才能每轮求值')
})
