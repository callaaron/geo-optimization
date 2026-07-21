/**
 * server/scorer.mjs — 外部内容质量评分体系
 *
 * 对搜索/抓取到的每条外部信源计算 5 维评分（0-100）：
 *   相关性(40%) + 权威度(20%) + 时效性(15%) + 完整度(10%) + 可引用性(15%)
 *
 * 替代原先 search.mjs 里单维度 n-gram 近似的 relevanceScore()。
 * 零额外依赖，纯 Node 运行时。
 */

// ── 权威度：域名白名单 + 行业媒体 ──
const AUTHORITY_TIERS = {
  gov_edu: 100,
  major_portal: 80,
  vertical_media: 60,
  b2b_platform: 50,
  company_site: 35,
  personal: 15,
  unknown: 5,
}

function classifyDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    if (host.endsWith(".gov.cn") || host.endsWith(".edu.cn")) return "gov_edu"
    if (/\.(gov|edu)$/.test(host)) return "gov_edu"
    const majorPortals = [
      "163.com","sina.com.cn","sohu.com","qq.com","tencent.com",
      "people.com.cn","xinhuanet.com","cctv.com","cntv.cn",
      "huanqiu.com","chinanews.com","ifeng.com",
    ]
    for (const p of majorPortals) {
      if (host === p || host.endsWith("." + p)) return "major_portal"
    }
    const verticalMedia = [
      "36kr.com","huxiu.com","geekpark.net","tmtpost.com",
      "iyiou.com","cls.cn","stcn.com","eastmoney.com",
    ]
    for (const v of verticalMedia) {
      if (host === v || host.endsWith("." + v)) return "vertical_media"
    }
    const b2bPlatforms = [
      "1688.com","alibaba.com","made-in-china.com","hc360.com",
      "spjx.com.cn","foodjx.com","cnfoods.cn",
    ]
    for (const b of b2bPlatforms) {
      if (host === b || host.endsWith("." + b)) return "b2b_platform"
    }
    if (/\.(com|cn|net|org|co)$/.test(host)) return "company_site"
    if (host.includes("blog") || host.includes("github.io") || host.includes("zhihu.com/people")) return "personal"
    return "unknown"
  } catch {
    return "unknown"
  }
}

function authorityScore(url) {
  return AUTHORITY_TIERS[classifyDomain(url)] || AUTHORITY_TIERS.unknown
}

// ── 时效性：页面日期距今天数 ──
const DATE_PATTERNS = [
  /(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/,
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
]

function extractDate(text) {
  for (const re of DATE_PATTERNS) {
    const m = text.match(re)
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      if (!Number.isNaN(d.getTime())) return d
    }
  }
  return null
}

function freshnessScore(text) {
  const d = extractDate(String(text || ""))
  if (!d) return 0
  const now = Date.now()
  const days = (now - d.getTime()) / (1000 * 60 * 60 * 24)
  if (days < 30) return 100
  if (days < 90) return 80
  if (days < 180) return 60
  if (days < 365) return 40
  if (days < 730) return 20
  return 5
}

// ── 相关性：关键词 TF + 实体重叠，Jensen-Shannon 归一化 ──
function tokenize(text) {
  // 中文按 2-gram 切分，同时保留英文单词
  const s = String(text || "").toLowerCase()
  const tokens = []
  // 英文单词
  const words = s.match(/[a-z0-9]+/g) || []
  tokens.push(...words)
  // 中文 2-gram
  const chinese = s.replace(/[^\u4e00-\u9fff]/g, "")
  for (let i = 0; i + 1 < chinese.length; i++) {
    tokens.push(chinese[i] + chinese[i + 1])
  }
  return tokens
}

function tfVector(tokens) {
  const total = tokens.length || 1
  const freq = new Map()
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1)
  }
  const vec = new Map()
  for (const [t, f] of freq) {
    vec.set(t, f / total)
  }
  return vec
}

function jsDivergence(vecA, vecB) {
  const all = new Set([...vecA.keys(), ...vecB.keys()])
  let sum = 0
  for (const k of all) {
    const p = vecA.get(k) || 0
    const q = vecB.get(k) || 0
    const m = (p + q) / 2
    if (m > 0) {
      sum += (p > 0 ? p * Math.log(p / m) : 0) + (q > 0 ? q * Math.log(q / m) : 0)
    }
  }
  return sum / 2
}

function relevanceScore(query, snippet) {
  const qTokens = tokenize(query)
  const sTokens = tokenize(snippet)
  if (qTokens.length === 0 || sTokens.length === 0) return 0
  const qVec = tfVector(qTokens)
  const sVec = tfVector(sTokens)
  const jsDiv = jsDivergence(qVec, sVec)
  // JS 散度越小 → 越相似 → 映射为 0-100 分
  // 典型无关文本 JS ~0.5, 高度相关 ~0.05
  const similarity = Math.max(0, 1 - jsDiv * 2)
  return Math.round(similarity * 100)
}

// ── 完整度：文本长度 + 结构化信号 ──
function completenessScore(text, snippet) {
  const s = String(text || snippet || "")
  let score = 0
  if (s.length > 500) score += 30
  else if (s.length > 200) score += 20
  else if (s.length > 50) score += 10
  // 结构化信号
  if (/<table|<ul|<ol|<li|<h[1-6]/i.test(String(text || ""))) score += 25
  if (/\d+[年月日时分秒%]/.test(s) && s.match(/\d+/g)?.length >= 3) score += 20
  return Math.min(100, score)
}

// ── 可引用性：含实体定义 / 数据锚点 / FAQ / 引用编号 ──
function quotabilityScore(text) {
  const s = String(text || "")
  let score = 0
  // 含数字+单位（可被 AI 作为具体数据引用）
  if (/\d+[万亿千百%个件元]/.test(s)) score += 30
  if (/\d+[万亿千百%个件元]/g.test(s)) score += 10  // 多个数据点
  // 含定义式表述
  if (/(是指|所谓|被称为|定义为|即|指的是)/.test(s)) score += 15
  // 含 FAQ 结构
  if (/(\?|？).{1,30}(\n|。|；).{1,100}/.test(s)) score += 20
  // 含引用编号（如 [1] 或 ①）
  if (/\[\d+\]|[①②③④⑤]/.test(s)) score += 15
  // 含实体名称模式（XX公司/XX品牌/XX产品）
  if (/[\u4e00-\u9fff]{2,8}(公司|品牌|产品|平台)/.test(s)) score += 10
  return Math.min(100, score)
}

// ── 聚合评分 ──
const WEIGHTS = {
  relevance: 0.40,
  authority: 0.20,
  freshness: 0.15,
  completeness: 0.10,
  quotability: 0.15,
}

/**
 * 对单条信源做 5 维评分
 * @param {{query:string, title?:string, snippet?:string, url:string, text?:string}} source
 * @returns {{scores, overall, grade, level}}
 */
export function scoreSource({ query, title = "", snippet = "", url = "", text = "" }) {
  const content = [title, snippet, text].filter(Boolean).join(" ")

  const scores = {
    relevance: relevanceScore(query, content),
    authority: authorityScore(url),
    freshness: freshnessScore(content),
    completeness: completenessScore(text, snippet),
    quotability: quotabilityScore(content),
  }

  const overall = Math.round(
    Object.entries(WEIGHTS).reduce((sum, [key, w]) => sum + (scores[key] || 0) * w, 0)
  )

  const grade = overall >= 70 ? "A" : overall >= 40 ? "B" : "C"
  const level = grade === "A" ? "high" : grade === "B" ? "medium" : "low"

  return { scores, overall, grade, level }
}

/**
 * 批量评分 + 排序
 * @param {Array} sources
 * @param {string} query - 用于计算相关性
 * @returns {Array} 按 overall 降序排列的信源列表（附带评分）
 */
export function scoreSources(sources, query) {
  return (sources || [])
    .map((s) => ({
      ...s,
      scoring: scoreSource({ query, ...s }),
    }))
    .sort((a, b) => b.scoring.overall - a.scoring.overall)
}

/**
 * 过滤高质量信源（≥70 分）
 */
export function filterHighQuality(sources, query) {
  const scored = scoreSources(sources, query)
  return scored.filter((s) => s.scoring.level === "high")
}

export const LEVEL_LABELS = {
  high: "🟢 高质量信源 — 优先引用",
  medium: "🟡 中等 — 可引用但标注",
  low: "🔴 低质量 — 仅参考",
}
