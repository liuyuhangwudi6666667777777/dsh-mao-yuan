/**
 * BM25 关键词检索。
 *
 * 三个分数相加：
 *  1. 正文 BM25（k1=1.2, b=0.75，中文短段落常用值）
 *  2. 篇名/章节路径加成 —— 按篇名长度归一化，否则《工人阶级与资产阶级的
 *     矛盾是国内的主要矛盾》这类长标题会把"矛盾""主要"全部吃掉，霸榜。
 *  3. 短语加成 —— 查询的连续子串原样出现在正文时加分。中文 bigram 会把
 *     "批评与自我批评"切出"与自""我批"这类跨词噪音，短语加成能把真正的
 *     "自我批评"捞回来。
 */
import { tokenize, termFreq } from './tokenize.js'

const K1 = 1.2
const B = 0.75

/** 篇名加成的总权重（相对正文） */
const W_TITLE = 2.0
/** 短语加成：每命中一个查询子串的权重 */
const W_PHRASE = 1.5
/** 参与短语匹配的查询子串长度范围 */
const PHRASE_MIN = 2
const PHRASE_MAX = 6

export class Bm25Index {
  constructor() {
    /** @type {import('./corpus.js').Chunk[]} */
    this.chunks = []
    /** @type {Map<string, number>} */
    this.df = new Map()
    /** @type {Map<string, number>[]} */
    this.tfs = []
    /** @type {number[]} */
    this.lens = []
    this.avgLen = 0
    /** @type {Map<string, number>[]} 篇名 + 路径的词集合（用于加成） */
    this.titleTf = []
    /** @type {number[]} 篇名 token 数，用于归一化 */
    this.titleLen = []
    /** @type {string[]} 正文小写缓存，用于短语匹配 */
    this.bodyCache = []
  }

  /** @param {import('./corpus.js').Chunk[]} chunks */
  build(chunks) {
    this.chunks = chunks
    this.df = new Map()
    this.tfs = []
    this.lens = []
    this.titleTf = []
    this.titleLen = []
    this.bodyCache = []

    for (const c of chunks) {
      const bodyTokens = tokenize(c.text)
      const tf = termFreq(bodyTokens)
      this.tfs.push(tf)
      this.lens.push(bodyTokens.length)
      this.bodyCache.push(c.text)

      const titleTokens = [...tokenize(c.work), ...tokenize(c.path)]
      const ttf = termFreq(titleTokens)
      this.titleTf.push(ttf)
      this.titleLen.push(Math.max(1, titleTokens.length))

      for (const t of new Set([...tf.keys(), ...ttf.keys()])) {
        this.df.set(t, (this.df.get(t) ?? 0) + 1)
      }
    }

    const total = this.lens.reduce((a, b) => a + b, 0)
    this.avgLen = this.lens.length > 0 ? total / this.lens.length : 1
    return this
  }

  get size() {
    return this.chunks.length
  }

  /** 从查询里抽连续子串，用于短语匹配（去重、按长度降序） */
  static extractPhrases(query) {
    const runs = query.match(/[\u4e00-\u9fff]+/g) ?? []
    const set = new Set()
    for (const run of runs) {
      for (let len = Math.min(PHRASE_MAX, run.length); len >= PHRASE_MIN; len--) {
        for (let i = 0; i + len <= run.length; i++) {
          set.add(run.slice(i, i + len))
        }
      }
    }
    // 长短语信息量更大，优先
    return [...set].sort((a, b) => b.length - a.length)
  }

  /**
   * @param {string} query
   * @param {{limit?: number, minScore?: number}} [opts]
   * @returns {{chunk: import('./corpus.js').Chunk, score: number}[]}
   */
  search(query, opts = {}) {
    const limit = opts.limit ?? 5
    const minScore = opts.minScore ?? 0
    const qTokens = [...new Set(tokenize(query))]
    if (qTokens.length === 0 || this.size === 0) return []

    const N = this.size
    const phrases = Bm25Index.extractPhrases(query)
    /** @type {{chunk: any, score: number}[]} */
    const scored = []

    for (let i = 0; i < N; i++) {
      const tf = this.tfs[i]
      const ttf = this.titleTf[i]
      const len = this.lens[i] || 1
      let score = 0

      // 1) 正文 BM25
      for (const t of qTokens) {
        const df = this.df.get(t) ?? 0
        if (df === 0) continue
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
        const f = tf.get(t) ?? 0
        if (f === 0) continue
        const denom = f + K1 * (1 - B + (B * len) / this.avgLen)
        score += idf * ((f * (K1 + 1)) / denom)
      }

      // 2) 篇名加成：idf 加权后按篇名长度归一化
      let titleScore = 0
      for (const t of qTokens) {
        if (!ttf.has(t)) continue
        const df = this.df.get(t) ?? 1
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
        titleScore += idf
      }
      if (titleScore > 0) {
        score += (W_TITLE * titleScore) / Math.log2(2 + this.titleLen[i])
      }

      // 3) 短语加成：查询子串原样出现在正文
      if (phrases.length > 0) {
        let phraseHit = 0
        const body = this.bodyCache[i]
        for (const p of phrases) {
          if (body.includes(p)) {
            // 越长越值钱
            phraseHit += p.length - 1
            if (phraseHit >= 12) break // 封顶，避免长段落通吃
          }
        }
        if (phraseHit > 0) score += W_PHRASE * Math.log1p(phraseHit)
      }

      if (score > minScore) scored.push({ chunk: this.chunks[i], score })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }
}
