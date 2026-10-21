/**
 * 插件入口：加载语料 → 建索引 → 注册检索工具 → 注册按需 skill → 挂动态提醒。
 *
 * 三层"要不要用毛选"的设计：
 *
 *  1. **skill 目录**（常驻，只占一行）
 *     模型判断相关时自动加载，用户也能 `/maoxuan` 触发。
 *     问天气、查文档、写代码不会触发。
 *
 *  2. **会话级持续生效**
 *     `/maoxuan` 调用一次后，本会话后续每轮自动带方法论，
 *     不需要反复输入。`/maoxuan off` 关闭。
 *     状态存在 WeakMap<Agent, boolean>，会话隔离、重启清空。
 *
 *  3. **插件级开关**
 *     enabled / modelInvocable / userInvocable，全关等于插件不存在。
 *
 * 检索工具 `mao_search` 全局注册但被动：没人调用就什么也不做。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCorpus } from './corpus.js'
import { Bm25Index } from './bm25.js'
import { createSearchTool } from './tool-search.js'
import { buildSkillRegistration, SKILL_NAME } from './skill.js'
import { isActive, setActive, scanToggle } from './session-state.js'
import { buildDynamicSection } from './active-reminder.js'

export const name = 'maoxuan-search'

export const inject = ['skills', 'tools', 'systemPrompt']

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CORPUS_DIR = join(ROOT, 'corpus')

/** 动态提醒段排在 persona 之后、工具说明之前 */
const REMINDER_ORDER = 10

/**
 * @typedef {object} Config
 * @property {boolean} enabled          插件总开关
 * @property {boolean} modelInvocable   允许模型在相关问题出现时自动加载 skill
 * @property {boolean} userInvocable    允许用户用 /maoxuan 手动触发
 * @property {boolean} sticky           允许会话内持续生效（默认开）
 */

/** @type {Required<Config>} */
export const DEFAULTS = {
  enabled: true,
  modelInvocable: true,
  userInvocable: true,
  sticky: true,
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
  // 检索与格式化都在 search-core.js，与 MCP server 共用同一份实现
  const baseTool = createSearchTool(() => index)

  const tool = {
    ...baseTool,
    async execute(args) {
      await ready
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
  }

  // --- 会话级持续生效 ---
  // 记录"最近一次组装提示词的是哪个 agent"，供动态段落求值时查询。
  /** @type {object | undefined} */
  let currentAgent

  if (cfg.sticky) {
    // 动态提醒段：未激活时返回空串，不占 token
    disposers.push(
      ctx.systemPrompt.section(
        buildDynamicSection({
          order: REMINDER_ORDER,
          getAgent: () => currentAgent,
        }),
      ),
    )

    // 每轮开始前：识别 /maoxuan 与 /maoxuan off，切换本会话状态
    ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
      currentAgent = agent
      if (agent) {
        const { action } = scanToggle(messages)
        if (action === 'on' && !isActive(agent)) {
          setActive(agent, true)
          ctx.logger?.info?.(`[${name}] 本会话已进入毛选模式（持续生效）`)
        } else if (action === 'off' && isActive(agent)) {
          setActive(agent, false)
          ctx.logger?.info?.(`[${name}] 本会话已退出毛选模式`)
        }
      }
      return next()
    })
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
