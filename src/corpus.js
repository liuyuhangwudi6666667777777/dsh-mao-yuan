/**
 * 语料装载与段落切分。
 *
 * 切分策略：按 Markdown 标题层级 + 空行切段，保留"篇目 → 章节路径 → 段落号"，
 * 这样检索命中的每一段都能被精确回溯到原文位置。
 *
 * 两层清洗（重要，不是洁癖）：
 *  1. 题解（`> 这是毛泽东在……的报告`）—— 编者所写，不是原文。
 *  2. 注释（`------------------` + `注　　释` 之后全部）—— 人民出版社编辑作品，
 *     既非毛泽东原文，也不在公有领域内。
 * 混进检索结果会同时踩两个坑：答案张冠李戴，以及版权越界。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 文件名形如 `017-矛盾论.md`，前缀是全集排序号。 */
const FILE_RE = /^(\d+)[-－_ ]*(.+)\.md$/

/** 注释分隔线：`------------------` 或更长的连字符行 */
const NOTE_SEP_RE = /^-{5,}\s*$/
/** 注释标题行：`　　注　　释` / `注释` / `注` */
const NOTE_HEAD_RE = /^[\s\u3000]*注[\s\u3000]*释?[\s\u3000]*$/

/**
 * @typedef {object} Chunk
 * @property {string} id       稳定 id
 * @property {string} work     篇名
 * @property {number} ordinal  全集排序号
 * @property {string} path     章节路径
 * @property {number} para     该章节内段落号（从 1 起）
 * @property {string} text     段落正文
 * @property {'body'|'note'|'preface'} kind 段落类型（note/preface 默认不参与检索）
 */

/**
 * 剥掉题解与注释，只留正文。
 * @param {string} raw
 * @returns {{body: string, dropped: {notes: boolean, preface: boolean}}}
 */
export function stripApparatus(raw) {
  const lines = raw.split(/\r?\n/)
  let cutAt = lines.length
  let notes = false
  let preface = false

  for (let i = 0; i < lines.length; i++) {
    // 注释块：分隔线后面紧跟「注释」标题
    if (NOTE_SEP_RE.test(lines[i].trim())) {
      const lookahead = lines
        .slice(i + 1, i + 4)
        .map((l) => l.trim())
        .join('')
      if (NOTE_HEAD_RE.test(lookahead) || /注\s*释/.test(lookahead)) {
        cutAt = i
        notes = true
        break
      }
    }
  }

  const kept = []
  for (let i = 0; i < cutAt; i++) {
    const line = lines[i]
    // 题解：整行 blockquote，通常出现在篇名下方
    if (line.trimStart().startsWith('>')) {
      preface = true
      continue
    }
    kept.push(line)
  }

  return { body: kept.join('\n'), dropped: { notes, preface } }
}

/**
 * 把一篇 Markdown 切成段落。
 * @param {string} raw
 * @param {{work: string, ordinal: number}} meta
 * @returns {Chunk[]}
 */
export function splitWork(raw, meta) {
  const { body } = stripApparatus(raw)
  const lines = body.split(/\r?\n/)
  /** @type {Chunk[]} */
  const chunks = []
  /** @type {string[]} */
  const headingPath = []
  let para = 0
  /** @type {string[]} */
  let buf = []

  const flush = () => {
    if (buf.length === 0) return
    const text = buf.join('\n').trim()
    buf = []
    if (text.length < 4) return
    // 纯符号行（分隔线、页码）丢弃
    if (!/[\u4e00-\u9fff a-zA-Z0-9]/.test(text)) return
    para += 1
    chunks.push({
      id: `${meta.ordinal}-${chunks.length + 1}`,
      work: meta.work,
      ordinal: meta.ordinal,
      path: headingPath.length > 0 ? headingPath.join(' › ') : meta.work,
      para,
      text,
      kind: 'body',
    })
  }

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const level = heading[1].length
      headingPath.length = Math.max(0, level - 1)
      headingPath[level - 1] = heading[2].trim()
      para = 0
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    buf.push(line)
  }
  flush()

  return chunks
}

/**
 * 从目录读取全部语料。
 * @param {string} corpusDir
 * @returns {Promise<Chunk[]>}
 */
export async function loadCorpus(corpusDir) {
  const entries = await readdir(corpusDir)
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort()

  /** @type {Chunk[]} */
  const all = []

  for (const file of mdFiles) {
    const m = FILE_RE.exec(file)
    if (!m) continue
    const ordinal = Number(m[1])
    const work = m[2].trim()
    const raw = await readFile(join(corpusDir, file), 'utf8')
    all.push(...splitWork(raw, { work, ordinal }))
  }

  return all
}

export { FILE_RE }
