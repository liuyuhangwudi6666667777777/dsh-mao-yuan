import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenize } from '../src/tokenize.js'
import { stripApparatus, splitWork } from '../src/corpus.js'

test('tokenize: 中文切 bigram，ASCII 小写归一', () => {
  assert.deepEqual(tokenize('矛盾'), ['矛盾'])
  assert.deepEqual(tokenize('持久战'), ['持久', '久战'])
  assert.deepEqual(tokenize('BM25 检索'), ['bm25', '检索'])
  assert.deepEqual(tokenize(''), [])
})

test('tokenize: 单字保留，标点不产生词', () => {
  assert.deepEqual(tokenize('矛'), ['矛'])
  assert.deepEqual(tokenize('，。！'), [])
})

test('stripApparatus: 切掉注释块', () => {
  const raw = ['# 篇名', '', '正文第一段。', '', '------------------', '　　注　　释', '　　〔1〕这是注释。'].join('\n')
  const { body, dropped } = stripApparatus(raw)
  assert.equal(dropped.notes, true)
  assert.ok(body.includes('正文第一段'))
  assert.ok(!body.includes('这是注释'))
})

test('stripApparatus: 切掉题解 blockquote，保留正文', () => {
  const raw = ['# 篇名', '', '> 这是毛泽东在某会上的报告。', '', '正文在这里。'].join('\n')
  const { body, dropped } = stripApparatus(raw)
  assert.equal(dropped.preface, true)
  assert.ok(!body.includes('在某会上的报告'))
  assert.ok(body.includes('正文在这里'))
})

test('splitWork: 按标题与空行切段，段落号连续', () => {
  const raw = ['# 矛盾论', '', '引言段落。', '', '## 一 两种宇宙观', '', '第一段。', '', '第二段。'].join('\n')
  const chunks = splitWork(raw, { work: '矛盾论', ordinal: 17 })
  assert.ok(chunks.length >= 3)
  // 章节路径应记录到 path
  const inSection = chunks.filter((c) => c.path.includes('两种宇宙观'))
  assert.equal(inSection.length, 2)
  assert.deepEqual(inSection.map((c) => c.para), [1, 2])
  // id 唯一
  const ids = new Set(chunks.map((c) => c.id))
  assert.equal(ids.size, chunks.length)
})

test('splitWork: 丢弃纯符号行', () => {
  const raw = ['# 篇名', '', '正文。', '', '----------', '', '更多正文。'].join('\n')
  const chunks = splitWork(raw, { work: '篇名', ordinal: 1 })
  assert.ok(chunks.every((c) => /[\u4e00-\u9fff]/.test(c.text)))
})
