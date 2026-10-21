/**
 * 拉取《毛泽东选集》语料到本地。
 *
 * 为什么单独拉：语料不在公有领域内自由分发（详见 README「版权」一节），
 * 所以仓库只存索引与短引，全文由使用者本地获取。
 *
 * 为什么走 tarball 而不是 raw.githubusercontent.com：
 * 后者在部分网络环境下会 ECONNRESET；codeload/tarball 更稳且一次拿全。
 *
 * 用法：
 *   node scripts/fetch-corpus.mjs              # 默认拉 MaoZeDongAnthology
 *   node scripts/fetch-corpus.mjs --dir D:\c   # 指定目录
 *   node scripts/fetch-corpus.mjs --force      # 强制重拉
 */
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DEFAULT_DIR = join(ROOT, 'corpus')

const SOURCE = {
  name: 'MaoZeDongAnthology',
  repo: 'weiyinfu/MaoZeDongAnthology',
  branch: 'master',
  subdir: 'src',
}

function parseArgs(argv) {
  const out = { dir: DEFAULT_DIR, force: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) out.dir = argv[++i]
    else if (argv[i] === '--force') out.force = true
  }
  return out
}

/**
 * 极简 tar 解析：只处理 ustar/pax 常规文件条目。
 * @param {Buffer} buf
 * @returns {{name: string, data: Buffer}[]}
 */
function untar(buf) {
  const out = []
  let off = 0
  let paxPath = null

  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512)
    // 全零块表示结束
    if (header.every((b) => b === 0)) break

    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim()
    const typeflag = String.fromCharCode(header[156] || 48)
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(sizeStr, 8) || 0

    let name = prefix ? `${prefix}/${rawName}` : rawName
    const dataStart = off + 512
    const dataEnd = dataStart + size
    const data = buf.subarray(dataStart, dataEnd)

    if (typeflag === 'x') {
      // pax 扩展头：下一项的路径在这里（含 UTF-8 长名）
      const text = data.toString('utf8')
      const m = /\d+ path=([^\n]*)\n/.exec(text)
      if (m) paxPath = m[1]
    } else if (typeflag === '0' || typeflag === '\0') {
      if (paxPath) {
        name = paxPath
        paxPath = null
      }
      out.push({ name, data: Buffer.from(data) })
    } else {
      paxPath = null
    }

    off = dataStart + Math.ceil(size / 512) * 512
  }
  return out
}

async function main() {
  const { dir, force } = parseArgs(process.argv.slice(2))
  console.log(`[corpus] 目标目录：${dir}`)

  if (!force && existsSync(dir)) {
    const existing = (await readdir(dir)).filter((f) => f.endsWith('.md'))
    if (existing.length > 0) {
      console.log(`[corpus] 已存在 ${existing.length} 个 md 文件，跳过下载。`)
      console.log('[corpus] 如需重新拉取：node scripts/fetch-corpus.mjs --force')
      return
    }
  }

  await mkdir(dir, { recursive: true })

  const url = `https://codeload.github.com/${SOURCE.repo}/tar.gz/refs/heads/${SOURCE.branch}`
  console.log(`[corpus] 下载 ${SOURCE.repo}…`)

  const res = await fetch(url, { headers: { 'user-agent': 'maoxuan-search' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`下载失败 ${res.status} ${res.statusText}`)

  const gz = Buffer.from(await res.arrayBuffer())
  console.log(`[corpus] 收到 ${(gz.length / 1024).toFixed(0)} KB，解压中…`)

  const tar = gunzipSync(gz)
  const entries = untar(tar)

  let done = 0
  for (const e of entries) {
    // 形如 `MaoZeDongAnthology-master/src/017-矛盾论.md`
    const marker = `/${SOURCE.subdir}/`
    const at = e.name.indexOf(marker)
    if (at < 0) continue
    const base = e.name.slice(at + marker.length)
    if (!base.endsWith('.md') || base.includes('/')) continue
    if (base === 'SUMMARY.md' || base === '目录.md') continue

    await writeFile(join(dir, base), e.data, 'utf8')
    done++
  }

  console.log(`[corpus] 完成：${done} 篇 -> ${dir}`)
  if (done === 0) throw new Error('未解析到任何 md 文件，tar 结构可能已变化')
  console.log('[corpus] 下一步：node scripts/eval.mjs')
}

main().catch((err) => {
  console.error('[corpus] 失败：', err)
  process.exit(1)
})
