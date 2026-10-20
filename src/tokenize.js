/**
 * 中文分词：无词典 bigram + ASCII 词。
 *
 * 为什么不用 jieba：插件要零重依赖、跨平台、可离线。
 * 中文 BM25 用二元组（bigram）切分是成熟做法，对术语命中足够好
 * （"矛盾"→"矛盾"；"持久战"→"持久"+"久战"），且不会因词典缺失切错专名。
 */

const ASCII_RE = /[a-zA-Z0-9_]+/g
const CJK_RUN_RE = /[\u4e00-\u9fff]+/g

/** @param {string} text @returns {string[]} */
export function tokenize(text) {
  if (!text) return []
  const tokens = []

  // ASCII / 数字：整体作为一个词，小写归一
  const ascii = text.match(ASCII_RE)
  if (ascii) for (const s of ascii) tokens.push(s.toLowerCase())

  // 中文：连续汉字串切成 bigram；单字保留单字
  const runs = text.match(CJK_RUN_RE)
  if (runs) {
    for (const run of runs) {
      if (run.length === 1) {
        tokens.push(run)
        continue
      }
      for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2))
    }
  }

  return tokens
}

/** 词频表 @param {string[]} tokens @returns {Map<string, number>} */
export function termFreq(tokens) {
  const tf = new Map()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return tf
}
