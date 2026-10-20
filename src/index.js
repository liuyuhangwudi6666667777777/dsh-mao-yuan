/**
 * 插件入口：加载语料 → 建索引 → 注册检索工具 → 注册**按需加载**的 skill。
 *
 * 关键设计（针对"装了之后问什么都变毛选"的问题）：
 *
 *  - 提示词**不**常驻注入 system prompt。
 *    改为注册一个 skill：只进技能目录（名字 + 一句话描述），
 *    模型判断相关时才加载全文，用户也可以 `/maoxuan` 手动触发。
 *    问天气、查文档、写代码都不会被这套方法论污染。
 *
 *  - 检索工具 `mao_search` 保持全局可用。
 *    它是被动的：没人调用就什么也不做。模型在没有加载 skill 时不会去调它。
 *
 *  - 三层开关：
 *      1. 插件总开关 `enabled`
 *      2. skill 是否允许模型自动加载 `modelInvocable`
 *      3. skill 是否允许用户 `/maoxuan` 触发 `userInvocable`
 *    全关 = 插件等于不存在。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCorpus } from './corpus.js'
import { Bm25Index } from './bm25.js'
import { createSearchTool } from './tool-search.js'
import { buildSkillRegistration, SKILL_NAME } from './skill.js'

export const name = 'dsh-mao-yuan'

export const inject = ['skills', 'tools']

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CORPUS_DIR = join(ROOT, 'corpus')

/**
 * @typedef {object} Config
 * @property {boolean} enabled         插件总开关
 * @property {boolean} modelInvocable  允许模型在相关问题出现时自动加载 skill
 * @property {boolean} userInvocable   允许用户用 /maoxuan 手动触发
 */

/** @type {Required<Config>} */
export const DEFAULTS = {
  enabled: true,
  modelInvocable: true,
  userInvocable: true,
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Partial<Config>} [config]
 */
export function apply(ctx, config = {}) {
  const cfg = { ...DEFAULTS, ...config }
  /** @type {(() => void)[]} */
  const disposers = []

  if (!cfg.enabled) {
    ctx.logger?.info?.(`[${name}] 已被 enabled:false 关闭，未注册任何能力`)
    return () => {}
  }

  // --- 语料与索引（后台构建）---
  /** @type {Bm25Index | null} */
  let index = null

  if (!existsSync(CORPUS_DIR)) {
    ctx.logger?.warn?.(
      `[${name}] 未找到语料目录 ${CORPUS_DIR}。检索工具会返回明确错误。` +
        '请先运行：node scripts/fetch-corpus.mjs',
    )
  }

  const ready = existsSync(CORPUS_DIR)
    ? loadCorpus(CORPUS_DIR)
        .then((chunks) => {
          index = new Bm25Index().build(chunks)
          ctx.logger?.info?.(`[${name}] 语料就绪：${chunks.length} 段，词表 ${index.df.size}`)
        })
        .catch((err) => {
          ctx.logger?.warn?.(`[${name}] 语料加载失败：${String(err?.message ?? err)}`)
        })
    : Promise.resolve()

  // --- 检索工具（全局，被动）---
  const baseTool = createSearchTool({
    search: (q, o) => (index ? index.search(q, o) : []),
    get size() {
      return index?.size ?? 0
    },
  })

  const tool = {
    ...baseTool,
    async execute(args) {
      await ready
      if (!index) {
        return {
          content:
            '语料未就绪，无法检索。请先在插件目录运行 node scripts/fetch-corpus.mjs，然后重启会话。',
        }
      }
      return baseTool.execute(args)
    },
  }
  disposers.push(ctx.tools.register(tool))

  // --- 按需加载的 skill ---
  if (cfg.modelInvocable || cfg.userInvocable) {
    const reg = buildSkillRegistration({
      modelInvocable: cfg.modelInvocable,
      userInvocable: cfg.userInvocable,
    })
    disposers.push(ctx.skills.register(reg))
    ctx.logger?.info?.(
      `[${name}] 已注册 skill /${SKILL_NAME}` +
        `（模型可自动加载：${cfg.modelInvocable}，用户可手动触发：${cfg.userInvocable}）`,
    )
  } else {
    ctx.logger?.info?.(`[${name}] skill 未注册（modelInvocable 与 userInvocable 均为 false）`)
  }

  ctx.logger?.info?.(`[${name}] 已加载`)

  return () => {
    for (const d of disposers) {
      try {
        d()
      } catch {
        /* 卸载错误不应阻断 */
      }
    }
  }
}
