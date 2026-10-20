import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Bm25Index } from '../src/bm25.js'

/** 造几条可控语料 */
const CHUNKS = [
  {
    id: '1',
    work: '矛盾论',
    ordinal: 17,
    path: '矛盾论 › 四 主要的矛盾和主要的矛盾方面',
    para: 1,
    text: '在复杂的事物的发展过程中，有许多的矛盾存在，其中必有一种是主要的矛盾。',
    kind: 'body',
  },
  {
    id: '2',
    work: '论持久战',
    ordinal: 26,
    path: '论持久战',
    para: 1,
    text: '中日战争既然是持久战，最后胜利又将是属于中国的，这种持久战将具体地表现于三个阶段之中。',
    kind: 'body',
  },
  {
    id: '3',
    work: '工人阶级与资产阶级的矛盾是国内的主要矛盾',
    ordinal: 179,
    path: '工人阶级与资产阶级的矛盾是国内的主要矛盾',
    para: 1,
    text: '中国内部的主要矛盾即是工人阶级与民族资产阶级的矛盾。',
    kind: 'body',
  },
]

test('bm25: 空查询返回空', () => {
  const idx = new Bm25Index().build(CHUNKS)
  assert.deepEqual(idx.search(''), [])
  assert.deepEqual(idx.search('   '), [])
})

test('bm25: 主题词能命中对应段落', () => {
  const idx = new Bm25Index().build(CHUNKS)
  const hits = idx.search('持久战 三个阶段', { limit: 1 })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].chunk.work, '论持久战')
})

test('bm25: 长标题不会霸榜（篇名加成按长度归一化）', () => {
  const idx = new Bm25Index().build(CHUNKS)
  const hits = idx.search('主要矛盾', { limit: 3 })
  const works = hits.map((h) => h.chunk.work)
  // 《矛盾论》必须在结果里，且不应被超长篇名完全挤掉
  assert.ok(works.includes('矛盾论'), `实得：${works.join(' / ')}`)
})

test('bm25: limit 生效且按分数降序', () => {
  const idx = new Bm25Index().build(CHUNKS)
  const hits = idx.search('矛盾', { limit: 2 })
  assert.ok(hits.length <= 2)
  for (let i = 1; i < hits.length; i++) {
    assert.ok(hits[i - 1].score >= hits[i].score)
  }
})

test('bm25: 无关联查询返回空，不硬凑结果', () => {
  const idx = new Bm25Index().build(CHUNKS)
  assert.deepEqual(idx.search('量子纠缠'), [])
})

test('bm25: extractPhrases 抽连续子串并按长度降序', () => {
  const phrases = Bm25Index.extractPhrases('批评与自我批评')
  assert.ok(phrases.includes('自我批评'))
  assert.ok(phrases.includes('批评'))
  // 降序
  for (let i = 1; i < phrases.length; i++) {
    assert.ok(phrases[i - 1].length >= phrases[i].length)
  }
})
