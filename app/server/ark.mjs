// Ark（火山方舟 Agent Plan）客户端 —— 只在后端运行，Key 永不进前端
// 走套餐路径 /api/plan，抵扣 AFP 额度，而非按量计费。
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// 极简 .env 解析（不引三方依赖）
function loadEnv() {
  const envPath = join(__dirname, "..", ".env")
  const env = {}
  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, "utf-8")
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const idx = t.indexOf("=")
      if (idx === -1) continue
      const k = t.slice(0, idx).trim()
      let v = t.slice(idx + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[k] = v
    }
  }
  // 允许进程环境变量覆盖 .env
  return { ...env, ...process.env }
}

const ENV = loadEnv()

// ── 文字类主 LLM 供应商 ──
// 支持 deepseek（OpenAI 兼容接口）与 ark（火山方舟 Agent Plan 套餐路径）。
// 通过 LLM_PROVIDER 选择；未显式设置时：有 DeepSeek key 则用 deepseek，否则回退 ark。
export const DEEPSEEK = {
  baseUrl: ENV.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: ENV.DEEPSEEK_API_KEY || "",
  model: ENV.DEEPSEEK_MODEL || "deepseek-v4-pro",
  // v4-pro 为思考型模型，默认开启思维链；DEEPSEEK_THINKING=off 可关闭
  thinking: (ENV.DEEPSEEK_THINKING || "enabled").toLowerCase() !== "off",
  reasoningEffort: ENV.DEEPSEEK_REASONING_EFFORT || "high",
}

export const ARK = {
  baseUrl: ENV.ARK_PLAN_BASE_URL || "https://ark.cn-beijing.volces.com/api/plan",
  apiKey: ENV.ARK_API_KEY || "",
  model: ENV.ARK_LLM_MODEL || "ark-code-latest",
}

export const PROVIDER = (ENV.LLM_PROVIDER || (DEEPSEEK.apiKey ? "deepseek" : "ark")).toLowerCase()

// CONFIG 指向「当前生效的文字模型」，兼容既有代码（index.mjs 读取 CONFIG.model/baseUrl）
export const CONFIG =
  PROVIDER === "deepseek"
    ? { provider: "deepseek", baseUrl: DEEPSEEK.baseUrl, apiKey: DEEPSEEK.apiKey, model: DEEPSEEK.model }
    : { provider: "ark", baseUrl: ARK.baseUrl, apiKey: ARK.apiKey, model: ARK.model }

export function isConfigured() {
  return !!CONFIG.apiKey
}

// ── 联网检索（真·AI 引用监测）—— 独立的普通 Ark key + 已开通联网搜索的 doubao 模型 ──
// 注意：Agent Plan 套餐 key 是套餐作用域，走不了标准 /api/v3，也调不了联网模型；
// 真·监测需另配 ARK_SEARCH_API_KEY（普通 key）+ ARK_SEARCH_MODEL（开通联网搜索的模型 ID）。
export const SEARCH = {
  baseUrl: ENV.ARK_SEARCH_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
  apiKey: ENV.ARK_SEARCH_API_KEY || "",
  model: ENV.ARK_SEARCH_MODEL || "doubao-seed-1-6-250615",
}

export function searchConfigured() {
  return !!SEARCH.apiKey
}

/**
 * 调用 Ark chat completions（走 Agent Plan 套餐路径）
 * @param {{system?:string, user:string, temperature?:number, maxTokens?:number, timeoutMs?:number}} opts
 * @returns {Promise<string>} 模型文本输出
 */
// 通用 OpenAI 兼容 chat 调用（DeepSeek / Ark 共用）
async function callChat(url, apiKey, body, timeoutMs, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const rawText = await resp.text()
    if (!resp.ok) {
      throw new Error(`${label} ${resp.status}: ${rawText.slice(0, 300)}`)
    }
    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      throw new Error(`${label} 返回非 JSON: ${rawText.slice(0, 200)}`)
    }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string") throw new Error(`${label} 返回缺少 content`)
    return content
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 调用文字类主 LLM。根据 PROVIDER 路由到 DeepSeek（OpenAI 兼容）或 Ark（Agent Plan 套餐路径）。
 * @param {{system?:string, user:string, temperature?:number, maxTokens?:number, timeoutMs?:number}} opts
 * @returns {Promise<string>} 模型文本输出
 */
export async function chat(opts) {
  if (!CONFIG.apiKey) {
    throw new Error(`${CONFIG.provider === "deepseek" ? "DEEPSEEK_API_KEY" : "ARK_API_KEY"} 未配置`)
  }
  const { system, user, temperature = 0.4, maxTokens = 1600 } = opts
  const messages = []
  if (system) messages.push({ role: "system", content: system })
  messages.push({ role: "user", content: user })

  if (CONFIG.provider === "deepseek") {
    // 思考型模型响应更慢，默认给到 120s 超时
    const timeoutMs = opts.timeoutMs || 120000
    const body = { model: CONFIG.model, messages, max_tokens: maxTokens }
    if (DEEPSEEK.thinking) {
      // 思考模式下 temperature 会被忽略/报错，故不下发；改用 reasoning_effort 控制思维强度
      body.thinking = { type: "enabled" }
      body.reasoning_effort = DEEPSEEK.reasoningEffort
    } else {
      body.temperature = temperature
    }
    return callChat(`${CONFIG.baseUrl}/chat/completions`, CONFIG.apiKey, body, timeoutMs, "DeepSeek")
  }

  // Ark Agent Plan：套餐路径 /api/plan/v3/chat/completions
  const timeoutMs = opts.timeoutMs || 60000
  const body = { model: CONFIG.model, messages, temperature, max_tokens: maxTokens }
  return callChat(`${CONFIG.baseUrl}/v3/chat/completions`, CONFIG.apiKey, body, timeoutMs, "Ark")
}

/**
 * 联网检索调用（走标准 /api/v3，用独立的 ARK_SEARCH_API_KEY + 联网模型）。
 * 与 chat 的区别：带 web_search 工具，让模型先联网检索再作答，
 * 用于「真·AI 引用监测」（检测品牌/域名是否出现在 AI 联网给出的来源里）。
 */
export async function chatSearch(opts) {
  if (!SEARCH.apiKey) throw new Error("ARK_SEARCH_API_KEY 未配置（联网检索未开启）")
  const { system, user, temperature = 0.4, maxTokens = 1600, timeoutMs = 90000 } = opts
  const messages = []
  if (system) messages.push({ role: "system", content: system })
  messages.push({ role: "user", content: user })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${SEARCH.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SEARCH.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SEARCH.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        tools: [{ type: "web_search", web_search: { enable: true } }],
      }),
      signal: controller.signal,
    })
    const rawText = await resp.text()
    if (!resp.ok) {
      throw new Error(`ArkSearch ${resp.status}: ${rawText.slice(0, 300)}`)
    }
    let data
    try {
      data = JSON.parse(rawText)
    } catch {
      throw new Error(`ArkSearch 返回非 JSON: ${rawText.slice(0, 200)}`)
    }
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string") throw new Error("ArkSearch 返回缺少 content")
    return content
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 让模型输出严格 JSON，并鲁棒解析（剥离 ```json 围栏、截取首个 {…}）
 * 解析失败时自动重试（最多 2 次），重试时强化「只输出纯 JSON」约束，
 * 以抵御模型偶发吐出 prose / 围栏 / 残缺 JSON 导致整次失败。
 */
export async function chatJson(opts, attempts = 3) {
  const reinforce =
    "\n\n重要：必须只输出一个纯 JSON 对象，不要任何 markdown 围栏、不要解释文字、不要末尾注释。"
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const o = i === 0 ? opts : { ...opts, system: (opts.system || "") + reinforce }
      const text = await chat(o)
      return parseJsonLoose(text)
    } catch (e) {
      lastErr = e
      // 仅当是「解析失败」才重试；网络/密钥错误直接抛出
      if (e && typeof e.message === "string" && e.message.includes("可解析的 JSON")) continue
      throw e
    }
  }
  throw lastErr
}

/**
 * 修复 LLM 经常产出的「非法 JSON」：
 * 1) 字符串值内部出现未转义的真实双引号 `"`（如中文文案里写 "岛城放心消费品牌"），
 *    会被误判为字符串结束符而解析失败 —— 用「看引号后的下一个非空白字符是否为 JSON 分隔符」的
 *    启发式判断：是分隔符则保留为字符串边界，否则当作内容引号转义为 \"。
 * 2) 字符串值内部出现真实换行/制表符（JSON 不允许），转义为 \n / \t。
 * 3) 若遍历结束仍在字符串内，补一个闭合引号，避免截断导致的 unterminated string。
 */
function repairJson(input) {
  const s = String(input)
  let out = ""
  let inStr = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (escaped) {
        out += c
        escaped = false
        continue
      }
      if (c === "\\") {
        out += c
        escaped = true
        continue
      }
      if (c === '"') {
        const after = s.slice(i + 1).replace(/\s+/g, "")
        const next = after[0]
        const isDelim =
          next === undefined || next === "," || next === "}" || next === "]" || next === ":"
        if (isDelim) {
          out += '"' // 真正的字符串边界
          inStr = false
        } else {
          out += '\\"' // 内容里的引号，转义
        }
        continue
      }
      if (c === "\n") {
        out += "\\n"
        continue
      }
      if (c === "\r") {
        out += "\\r"
        continue
      }
      if (c === "\t") {
        out += "\\t"
        continue
      }
      out += c
    } else {
      if (c === '"') {
        out += c
        inStr = true
        continue
      }
      out += c
    }
  }
  if (inStr) out += '"' // 截断兜底：补闭合引号
  return out
}

export function parseJsonLoose(text) {
  let t = String(text).trim()
  // 去掉 ```json ... ``` 围栏
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  // 截取首个平衡的 JSON 对象/数组
  const start = t.search(/[[{]/)
  if (start > 0) t = t.slice(start)

  const tryParse = (s) => {
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }
  let lastObj = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"))

  let r = tryParse(t)
  if (r) return r
  if (lastObj > 0) {
    r = tryParse(t.slice(0, lastObj + 1))
    if (r) return r
  }
  // 修复未转义内部引号 / 真实换行符后再试
  const fixed = repairJson(t)
  r = tryParse(fixed)
  if (r) return r
  if (lastObj > 0) {
    r = tryParse(repairJson(t.slice(0, lastObj + 1)))
    if (r) return r
  }
  throw new Error("模型未返回可解析的 JSON")
}
