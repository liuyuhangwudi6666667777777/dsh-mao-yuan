import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SKILL_NAME,
  SKILL_DESCRIPTION,
  SKILL_WHEN_TO_USE,
  SKILL_BODY,
  buildSkillRegistration,
} from '../src/skill.js'

test('skill: 名称是可用于 /命令 的 kebab-case', () => {
  assert.equal(SKILL_NAME, 'maoxuan')
  assert.match(SKILL_NAME, /^[a-z][a-z0-9-]*$/)
})

test('skill: 描述里写明了不该用的场景（防止过度触发）', () => {
  assert.ok(SKILL_DESCRIPTION.includes('不要用'), '必须显式排除日常问题')
  assert.ok(/日常问答|技术问题/.test(SKILL_DESCRIPTION))
})

test('skill: whenToUse 强调用户普通提问时不要主动加载', () => {
  assert.ok(SKILL_WHEN_TO_USE.includes('不要主动加载'))
})

test('skill: 三条硬约束都在正文里', () => {
  assert.ok(SKILL_BODY.includes('同志'), '必须称呼同志')
  assert.ok(/先调查|先追问/.test(SKILL_BODY), '必须要求先追问')
  assert.ok(SKILL_BODY.includes('鸡汤'), '必须明确不说鸡汤')
})

test('skill: 强制引用与禁止编造出处', () => {
  assert.ok(SKILL_BODY.includes('mao_search'), '必须要求调用检索工具')
  assert.ok(SKILL_BODY.includes('绝对禁止'), '必须有禁止编造条款')
  assert.ok(SKILL_BODY.includes('没有直接谈这个'), '无命中时必须有固定说法')
})

test('skill: 区分事实与判断并给反证条件', () => {
  assert.ok(SKILL_BODY.includes('反证条件'))
  assert.ok(SKILL_BODY.includes('事实') && SKILL_BODY.includes('判断'))
})

test('skill: 三段骨架存在', () => {
  assert.ok(SKILL_BODY.includes('把情况摆清'))
  assert.ok(SKILL_BODY.includes('什么牵住全局'))
  assert.ok(SKILL_BODY.includes('眼下先做什么'))
})

test('buildSkillRegistration: 默认模型与用户都可触发', () => {
  const reg = buildSkillRegistration()
  assert.equal(reg.name, 'maoxuan')
  assert.equal(reg.invocation.modelInvocable, true)
  assert.equal(reg.invocation.userInvocable, true)
  assert.ok(reg.content.length > 500)
})

test('buildSkillRegistration: 可单独关闭模型自动加载', () => {
  const reg = buildSkillRegistration({ modelInvocable: false, userInvocable: true })
  assert.equal(reg.invocation.modelInvocable, false)
  assert.equal(reg.invocation.userInvocable, true)
})

test('buildSkillRegistration: 可单独关闭用户触发', () => {
  const reg = buildSkillRegistration({ modelInvocable: true, userInvocable: false })
  assert.equal(reg.invocation.modelInvocable, true)
  assert.equal(reg.invocation.userInvocable, false)
})
