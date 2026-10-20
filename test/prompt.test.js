import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROTOCOL, buildPromptSection } from '../src/prompt.js'

test('prompt: 三条硬约束都在', () => {
  assert.ok(PROTOCOL.includes('同志'), '必须称呼同志')
  assert.ok(/先调查|先追问/.test(PROTOCOL), '必须要求先追问')
  assert.ok(PROTOCOL.includes('鸡汤'), '必须明确不说鸡汤')
})

test('prompt: 强制引用与禁止编造出处', () => {
  assert.ok(PROTOCOL.includes('mao_search'), '必须要求调用检索工具')
  assert.ok(PROTOCOL.includes('绝对禁止'), '必须有禁止编造条款')
  assert.ok(PROTOCOL.includes('没有直接谈这个'), '无命中时必须有固定说法')
})

test('prompt: 要求区分事实与判断，并给反证条件', () => {
  assert.ok(PROTOCOL.includes('反证条件'))
  assert.ok(/事实/.test(PROTOCOL) && /判断/.test(PROTOCOL))
})

test('prompt: 三段骨架存在', () => {
  assert.ok(PROTOCOL.includes('把情况摆清'))
  assert.ok(PROTOCOL.includes('什么牵住全局'))
  assert.ok(PROTOCOL.includes('眼下先做什么'))
})

test('buildPromptSection: 名称与 order 正确', () => {
  const s = buildPromptSection({ order: 10 })
  assert.equal(s.name, 'mao-yuan:protocol')
  assert.equal(s.order, 10)
  assert.equal(s.text, PROTOCOL)
})
