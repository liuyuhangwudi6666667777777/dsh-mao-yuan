/**
 * 检索质量评测。
 *
 * 判据（刻意选成可客观验证的）：
 *   Top-5 中至少有 1 个段落的「篇名 + 正文」包含用例指定的关键短语之一。
 *
 * 为什么不用"必须命中某个篇目"：同一主题在《毛选》里天然分散在多篇
 * （"批评与自我批评"在《整顿党的作风》《论联合政府》都讲，也在很多讲话里出现）。
 * 按篇目判会误伤正确结果，还会诱导过拟合。
 *
 * 用法：
 *   node scripts/eval.mjs              # 跑内置用例
 *   node scripts/eval.mjs --verbose    # 打印每条命中详情
 *
 * 退出码非 0 = 命中率低于阈值，可直接做 CI 门禁。
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCorpus } from '../src/corpus.js'
import { Bm25Index } from '../src/bm25.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CORPUS = join(ROOT, 'corpus')

const THRESHOLD = 0.85

/**
 * @typedef {object} Case
 * @property {string} q          查询
 * @property {string[]} must     Top-5 中至少一段的篇名或正文需含其中之一
 * @property {string} [note]     该用例为什么这么判
 */
/** @type {Case[]} */
const CASES = [
  { q: '什么是主要矛盾', must: ['主要矛盾', '主要的矛盾'] },
  { q: '矛盾的主要方面和次要方面', must: ['主要方面', '主要的方面'] },
  { q: '矛盾的普遍性和特殊性', must: ['普遍性', '特殊性'] },
  { q: '实践和认识的关系', must: ['实践', '认识'] },
  { q: '没有调查就没有发言权', must: ['没有调查', '调查研究'] },
  { q: '持久战的三个阶段', must: ['三个阶段', '持久战'] },
  { q: '亡国论和速胜论', must: ['亡国论', '速胜论'] },
  { q: '农村包围城市', must: ['农村包围城市', '农村', '根据地'] },
  { q: '批评与自我批评', must: ['自我批评', '批评'] },
  { q: '从群众中来 到群众中去', must: ['从群众中来', '群众中去', '群众路线'] },
  { q: '集中优势兵力 打歼灭战', must: ['优势兵力', '歼灭战', '歼灭'] },
  { q: '纸老虎', must: ['纸老虎'] },
  { q: '统一战线 又团结又斗争', must: ['统一战线', '又团结', '团结'] },
  { q: '反对党八股', must: ['党八股'] },
  { q: '为人民服务', must: ['为人民服务'] },
  { q: '十大关系', must: ['十大关系'] },
  { q: '人民内部矛盾', must: ['人民内部矛盾', '内部矛盾'] },
  { q: '党委会的工作方法', must: ['党委会', '工作方法'] },
  { q: '愚公移山', must: ['愚公移山'] },
  { q: '战略上藐视敌人 战术上重视敌人', must: ['藐视', '重视敌人', '纸老虎'] },
]

async function main() {
  const verbose = process.argv.includes('--verbose')
  console.log(`[eval] 载入语料 ${CORPUS}`)

  const chunks = await loadCorpus(CORPUS)
  console.log(`[eval] 段落数：${chunks.length}`)

  const index = new Bm25Index().build(chunks)
  console.log(`[eval] 词表规模：${index.df.size}`)

  let pass = 0
  const failures = []

  for (const c of CASES) {
    const hits = index.search(c.q, { limit: 5 })
    const ok = hits.some((h) => {
      const hay = `${h.chunk.work}\n${h.chunk.path}\n${h.chunk.text}`
      return c.must.some((m) => hay.includes(m))
    })
    if (ok) pass++
    else failures.push({ q: c.q, must: c.must, hits })

    if (verbose) {
      console.log(`\n${ok ? '✓' : '✗'} ${c.q}`)
      console.log(`  需含：${c.must.join(' / ')}`)
      hits.forEach((h, i) => {
        const snip = h.chunk.text.replace(/\s+/g, ' ').slice(0, 60)
        console.log(`  ${i + 1}. [${h.score.toFixed(2)}] ${h.chunk.work} (¶${h.chunk.para})`)
        console.log(`      ${snip}…`)
      })
    }
  }

  const rate = pass / CASES.length
  console.log(`\n[eval] 命中率：${pass}/${CASES.length} = ${(rate * 100).toFixed(1)}%`)

  if (failures.length > 0) {
    console.log('\n[eval] 未命中用例：')
    for (const f of failures) {
      console.log(`  ✗ ${f.q}  需含：${f.must.join(' / ')}`)
      for (const h of f.hits) {
        console.log(`      [${h.score.toFixed(2)}] ${h.chunk.work} (¶${h.chunk.para})`)
      }
      if (f.hits.length === 0) console.log('      （无命中）')
    }
  }

  if (rate < THRESHOLD) {
    console.error(
      `\n[eval] 失败：命中率 ${(rate * 100).toFixed(1)}% 低于阈值 ${(THRESHOLD * 100).toFixed(0)}%`,
    )
    process.exit(1)
  }
  console.log(`[eval] 通过（阈值 ${(THRESHOLD * 100).toFixed(0)}%）`)
}

main().catch((err) => {
  console.error('[eval] 失败：', err)
  process.exit(1)
})
