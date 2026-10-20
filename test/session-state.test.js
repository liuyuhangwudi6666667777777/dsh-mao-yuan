import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isActive, setActive, clear, parseToggle, scanToggle } from '../src/session-state.js'

const A = { id: 'agent-a' }
const B = { id: 'agent-b' }

test('session-state: 默认未激活', () => {
  clear(A)
  assert.equal(isActive(A), false)
})

test('session-state: 开关只影响自己，不同 agent 隔离', () => {
  clear(A)
  clear(B)
  setActive(A, true)
  assert.equal(isActive(A), true)
  assert.equal(isActive(B), false, 'B 不应被 A 影响')

  setActive(A, false)
  assert.equal(isActive(A), false)
})

test('session-state: 非对象入参不崩', () => {
  assert.equal(isActive(undefined), false)
  assert.equal(isActive(null), false)
  assert.equal(isActive('x'), false)
  setActive(null, true) // 不应抛错
})

test('parseToggle: 裸 /maoxuan 开启', () => {
  assert.deepEqual(parseToggle('/maoxuan'), { action: 'on' })
})

test('parseToggle: /maoxuan 加问题也开启', () => {
  assert.deepEqual(parseToggle('/maoxuan 我该不该辞职'), { action: 'on' })
})

test('parseToggle: /maoxuan off 关闭', () => {
  assert.deepEqual(parseToggle('/maoxuan off'), { action: 'off' })
  assert.deepEqual(parseToggle('/maoxuan OFF'), { action: 'off' })
  assert.deepEqual(parseToggle('/maoxuan 关'), { action: 'off' })
  assert.deepEqual(parseToggle('/maoxuan 关闭'), { action: 'off' })
})

test('parseToggle: 中文问题首词不是关闭指令时不误判', () => {
  // "关掉这个项目" 不该被当成关闭
  assert.deepEqual(parseToggle('/maoxuan 关掉这个项目合适吗'), { action: 'on' })
  assert.deepEqual(parseToggle('/maoxuan 退出机制怎么设计'), { action: 'on' })
})

test('parseToggle: 行中或行首都识别', () => {
  assert.deepEqual(parseToggle('帮我看看 /maoxuan 这个事'), { action: 'on' })
  assert.deepEqual(parseToggle('/maoxuan 先说结论'), { action: 'on' })
})

test('parseToggle: 无关文本不触发', () => {
  assert.deepEqual(parseToggle('今天天气怎么样'), { action: null })
  assert.deepEqual(parseToggle('/maoxu'), { action: null })
  assert.deepEqual(parseToggle('maoxuan'), { action: null })
})

function userMsg(text) {
  return { source: { kind: 'user' }, content: [{ type: 'text', text }] }
}

test('scanToggle: 从用户消息识别开启', () => {
  assert.deepEqual(scanToggle([userMsg('/maoxuan 帮我分析')]), { action: 'on' })
})

test('scanToggle: 识别关闭', () => {
  assert.deepEqual(scanToggle([userMsg('/maoxuan off')]), { action: 'off' })
})

test('scanToggle: 忽略非用户消息（防止 system-reminder 误触发）', () => {
  const injected = {
    source: { kind: 'system-reminder' },
    content: [{ type: 'text', text: '/maoxuan off' }],
  }
  assert.deepEqual(scanToggle([injected]), { action: null })
})

test('scanToggle: 取最近一条指令', () => {
  const msgs = [userMsg('/maoxuan 开始'), userMsg('/maoxuan off')]
  assert.deepEqual(scanToggle(msgs), { action: 'off' })
})

test('scanToggle: 空数组/非数组不崩', () => {
  assert.deepEqual(scanToggle([]), { action: null })
  assert.deepEqual(scanToggle(undefined), { action: null })
})
