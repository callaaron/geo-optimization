// GEO AI 服务逻辑：三大能力的 prompt 与后处理
// 1) analyze  —— AI 增强诊断（补充规则引擎，给专家级 GEO 建议）
// 2) rewrite  —— 真实 LLM 改写为 AI 友好内容
// 3) citation —— AI 认知覆盖度监测（问真实行业问题，检测品牌是否被 AI 提及）
import { chat, chatJson, chatSearch, searchConfigured } from "./ark.mjs"
import { webSearch, formatSearchContext } from "./search.mjs"
import { scoreSource } from "./scorer.mjs"

const clip = (s, n = 6000) => String(s || "").slice(0, n)

/** AI 增强诊断 */
export async function aiAnalyze({ text, title, url, mode = "general" }) {
  const modeHint =
    mode === "b2b"
      ? "这是面向企业客户（B2B）的内容，请特别关注：产品规格与参数、客户实证/案例、资质与信任背书（认证/专利/资质）、转化路径（联系/询价/试用）、选型对比。"
      : "这是面向大众读者的内容。"
  const system =
    "你是资深的 GEO（生成式引擎优化）顾问，精通让内容更易被 ChatGPT / Perplexity / 豆包等 AI 引擎理解、检索与引用。你的建议必须具体、可执行、针对给定内容本身，不要泛泛而谈。只输出 JSON，不要多余文字。"
  const user = `请诊断以下内容的 GEO 就绪度。${modeHint}

标题：${title || "(无)"}
${url ? `网址：${url}\n` : ""}正文：
"""
${clip(text)}
"""

请只返回如下 JSON（中文），不要 markdown 围栏：
{
  "summary": "一句话总体判断（该内容当前被 AI 引擎引用的可能性与主因）",
  "strengths": ["已具备的、有利于被 AI 引用的要点（2-4 条，引用文中具体证据）"],
  "gaps": ["最影响被 AI 引用的缺口（2-4 条，指出具体位置/缺什么）"],
  "actions": ["可立即执行的改写动作（3-5 条，具体到加什么句子/结构/数据）"],
  "sampleQuestions": ["3 个目标用户很可能向 AI 提出、且本内容应当被引用的真实问题"]
}`
  const json = await chatJson({ system, user, temperature: 0.3, maxTokens: 1500 })
  return normalizeAnalyze(json)
}

function normalizeAnalyze(j) {
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()) : [])
  return {
    summary: typeof j?.summary === "string" ? j.summary : "",
    strengths: arr(j?.strengths),
    gaps: arr(j?.gaps),
    actions: arr(j?.actions),
    sampleQuestions: arr(j?.sampleQuestions),
  }
}

/** 真实 LLM 改写 */
export async function aiRewrite({ text, title, mode = "general" }) {
  const modeHint =
    mode === "b2b"
      ? "面向企业客户：强化产品规格、客户实证、资质信任与询价转化路径。"
      : "面向大众读者：清晰易懂、直接回答问题。"
  const system =
    "你是 GEO 内容改写专家。把用户内容重写成最易被 AI 引擎直接引用/作答的结构：开头 TL;DR、清晰小标题、关键数据锚点、实体定义、FAQ 问答。保持事实不变，不得编造未在原文出现的具体数字或名称；缺失处用【待补充：…】占位。把 JSON 放在回复最前面，不要任何前导说明文字，只输出 JSON。"
  const user = `请改写以下内容。${modeHint}

标题：${title || "(无)"}
原文：
"""
${clip(text)}
"""

只返回如下 JSON（中文），markdown 字段用真实换行：
{
  "tldr": "40 字以内的一句话摘要",
  "rewrittenMarkdown": "改写后的完整 Markdown（含 # 标题、## TL;DR、## 关键要点、## 正文、## 常见问题 FAQ）",
  "faq": [{"q":"问题","a":"简洁准确的回答"}],
  "definitions": [{"term":"实体/术语","def":"定义"}],
  "changes": ["本次改写做了哪些 GEO 优化（3-5 条）"]
}`
  const json = await chatJson({ system, user, temperature: 0.5, maxTokens: 4096 })
  return normalizeRewrite(json)
}

function normalizeRewrite(j) {
  const arr = (x) => (Array.isArray(x) ? x : [])
  return {
    tldr: typeof j?.tldr === "string" ? j.tldr : "",
    rewrittenMarkdown: typeof j?.rewrittenMarkdown === "string" ? j.rewrittenMarkdown : "",
    faq: arr(j?.faq)
      .filter((f) => f && typeof f.q === "string" && typeof f.a === "string")
      .map((f) => ({ q: f.q, a: f.a })),
    definitions: arr(j?.definitions)
      .filter((d) => d && typeof d.term === "string" && typeof d.def === "string")
      .map((d) => ({ term: d.term, def: d.def })),
    changes: arr(j?.changes).filter((s) => typeof s === "string" && s.trim()),
  }
}

/**
 * AI 认知覆盖度监测：
 * 第 1 步 — 用自然口吻向模型提出真实行业问题（模拟真实用户问 AI）
 * 第 2 步 — 程序化检测答案里是否出现品牌/域名，并抽取其提及的竞品
 */
export async function aiCitation({ query, brand, domain }) {
  // 真·监测：若已配置联网检索 key，则先联网搜索再作答（测「实际被引用」）；
  // 否则回退为离线固有认知（测「训练语料里有没有」）。
  const useSearch = searchConfigured()
  const system = useSearch
    ? "你是一个乐于助人的中文 AI 助手。请先联网检索，再客观、具体地回答问题；如果涉及推荐品牌/产品/服务/网站，请给出你检索到的真实名称，并在回答中标注来源网址，不要回避。"
    : "你是一个乐于助人的中文 AI 助手。请像回答普通用户那样，客观、具体地回答问题；如果涉及推荐品牌/产品/服务/网站，请给出你真实认知中的名称，不要回避。"
  const answer = useSearch
    ? await chatSearch({ system, user: query, temperature: 0.5, maxTokens: 900 })
    : await chat({ system, user: query, temperature: 0.5, maxTokens: 900 })

  const brandName = String(brand || "").trim()
  const dom = String(domain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const ans = answer || ""
  const lower = ans.toLowerCase()
  // 抽取 AI 联网给出的来源网址（真·监测的关键：检测你的域名是否在被引用的来源里）
  const sources = Array.from(
    new Set(ans.match(/https?:\/\/[^\s)\]"'<>，。；、）】]+/g) || [])
  ).slice(0, 20)
  const inSources = !!dom && sources.some((u) => u.toLowerCase().includes(dom.toLowerCase()))
  const mentioned =
    (!!brandName && ans.includes(brandName)) ||
    (!!dom && lower.includes(dom.toLowerCase())) ||
    inSources

  // 第 3 步 — 让模型对这次「是否会引用该品牌」做结构化归因（不改变上面的真实回答）
  let judge = { mentioned, brandsInAnswer: [], reason: "", suggestion: "" }
  try {
    const j = await chatJson({
      system:
        "你是 GEO 分析器。基于给定的『用户问题』和『AI 的回答』，做结构化判断。只输出 JSON。",
      user: `用户问题：${query}
目标品牌：${brandName || "(未指定)"}${dom ? `（域名 ${dom}）` : ""}
AI 的回答：
"""
${clip(ans, 3000)}
"""

只返回 JSON：
{
  "mentioned": ${mentioned}  是否在回答中提及了目标品牌（true/false，以事实为准）,
  "brandsInAnswer": ["回答中实际提到的品牌/产品/网站名称"],
  "reason": "为什么目标品牌被/未被提及（结合内容权威度、知名度、是否有结构化可引用信息）",
  "suggestion": "要让该品牌在这类问题中被 AI 引用，最关键的 1-2 个 GEO 动作"
}`,
      temperature: 0.2,
      maxTokens: 900,
    })
    judge = {
      mentioned: typeof j?.mentioned === "boolean" ? j.mentioned : mentioned,
      brandsInAnswer: Array.isArray(j?.brandsInAnswer)
        ? j.brandsInAnswer.filter((s) => typeof s === "string" && s.trim())
        : [],
      reason: typeof j?.reason === "string" ? j.reason : "",
      suggestion: typeof j?.suggestion === "string" ? j.suggestion : "",
    }
  } catch {
    // 归因失败不阻塞主结果，用程序判定兜底
  }

  return {
    query,
    brand: brandName,
    domain: dom,
    answer: ans,
    mode: useSearch ? "search" : "offline", // search=联网真监测 / offline=离线固有认知
    sources, // AI 联网给出的来源网址（offline 时通常为空）
    inSources, // 你的域名是否出现在被引用来源里（真·监测核心信号）
    mentioned: judge.mentioned,
    brandsInAnswer: judge.brandsInAnswer,
    reason: judge.reason,
    suggestion: judge.suggestion,
  }
}

/**
 * 真·GEO 引用审计（RAG 式：自己搜 → 喂给 LLM → 检测品牌可见度）
 *
 * 流程：
 * 1. 对每个行业 query → webSearch 获取真实 SERP 结果
 * 2. 检测品牌是否出现在 SERP 标题/摘要中（搜索可见度）
 * 3. 把搜索结果当上下文喂给 Ark LLM → RAG 综合回答
 * 4. 检测品牌是否出现在 LLM 回答中（AI 引用度）
 * 5. 汇总生成差距分析 + 内容建议
 *
 * 不需要联网 key——搜索由我们自己完成，LLM 只负责理解和综合。
 */
export async function aiGeoAudit({ brand, domain, queries, competitors, intendedContent }) {
  const brandName = String(brand || "").trim()
  const dom = String(domain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const queryList = Array.isArray(queries) ? queries.filter((q) => typeof q === "string" && q.trim()) : []
  const intendedList = Array.isArray(intendedContent)
    ? intendedContent.map((s) => String(s).trim()).filter(Boolean)
    : []

  // 逐条 query 执行搜索 + RAG 分析
  const perQuery = []
  for (const query of queryList) {
    try {
      const result = await auditSingleQuery(query, brandName, dom, intendedList)
      perQuery.push(result)
    } catch (err) {
      perQuery.push({
        query,
        error: String(err.message || err),
        serpResults: [],
        inSerp: false,
        aiAnswer: "",
        inAiAnswer: false,
        brandsInSerp: [],
        brandsInAnswer: [],
      })
    }
  }

  // 汇总
  const totalQueries = perQuery.length
  const serpHits = perQuery.filter((r) => r.inSerp).length
  const aiHits = perQuery.filter((r) => r.inAiAnswer).length

  // 竞品频次统计
  const competitorFreq = new Map()
  for (const r of perQuery) {
    for (const b of [...r.brandsInSerp, ...r.brandsInAnswer]) {
      const name = b.trim()
      if (name && name !== brandName) {
        competitorFreq.set(name, (competitorFreq.get(name) || 0) + 1)
      }
    }
  }
  const topCompetitors = [...competitorFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // 全局信源排名：跨 query 统计被 AI 引用次数 + 平均相关度
  const sourceMap = new Map()
  for (const r of perQuery) {
    for (const s of r.sources || []) {
      const key = s.url || s.title
      const prev =
        sourceMap.get(key) ||
        {
          rank: s.rank,
          title: s.title,
          url: s.url,
          snippet: s.snippet,
          citedCount: 0,
          relevanceSum: 0,
          appearances: 0,
        }
      prev.appearances++
      if (s.citedByAi) prev.citedCount++
      prev.relevanceSum += Number(s.relevance) || 0
      sourceMap.set(key, prev)
    }
  }
  const topSources = [...sourceMap.values()]
    .map((s) => ({ ...s, avgRelevance: Math.round(s.relevanceSum / s.appearances) }))
    .sort((a, b) => b.citedCount - a.citedCount || b.avgRelevance - a.avgRelevance)
    .slice(0, 15)

  // 内容点级追踪（跨 query 聚合：任一 query 收录即算收录）
  const pointMap = new Map()
  for (const r of perQuery) {
    for (const c of r.contentTracking || []) {
      const prev = pointMap.get(c.point)
      if (!prev) {
        pointMap.set(c.point, { ...c })
        continue
      }
      if (c.status === "收录") prev.status = "收录"
      else if (c.status === "部分" && prev.status !== "收录") prev.status = "部分"
      if (c.where.length) prev.where = [...new Set([...prev.where, ...c.where])]
    }
  }
  const contentTracking = [...pointMap.values()]
  const includedCount = contentTracking.filter((c) => c.status === "收录").length
  const partialCount = contentTracking.filter((c) => c.status === "部分").length
  const missingCount = contentTracking.filter((c) => c.status === "未出现").length

  // 让 LLM 做总体差距分析 + 内容建议
  let gapAnalysis = { summary: "", gaps: [], suggestions: [] }
  try {
    gapAnalysis = await generateGapAnalysis({
      brand: brandName,
      domain: dom,
      perQuery,
      topCompetitors,
    })
  } catch {
    // 归因失败不阻塞
  }

  return {
    brand: brandName,
    domain: dom,
    timestamp: new Date().toISOString(),
    mode: "rag-search", // 标识这是真·RAG 搜索审计
    searchEngine: perQuery[0]?.serpEngine || "360",
    totalQueries,
    serpVisibility: totalQueries > 0 ? Math.round((serpHits / totalQueries) * 100) : 0,
    aiCitationRate: totalQueries > 0 ? Math.round((aiHits / totalQueries) * 100) : 0,
    serpHits,
    aiHits,
    perQuery,
    topCompetitors,
    gapAnalysis,
    // 新增：信源排名 + 内容点追踪（监控台核心数据）
    sources: topSources, // 全局信源排名（被 AI 引用次数 + 平均相关度）
    contentTracking, // 每个"企业想表达的内容点"的 收录/部分/未出现
    intendedCount: contentTracking.length,
    includedCount,
    partialCount,
    missingCount,
  }
}

/**
 * 单条 query 的审计：搜索 → SERP 检测 → RAG 综合 → AI 引用检测
 */
/**
 * 解析 AI 回答中的 [n] 引用序号
 */
function parseCitations(answer) {
  const nums = new Set()
  const re = /\[(\d{1,2})\]/g
  let m
  while ((m = re.exec(answer || "")) !== null) nums.add(Number(m[1]))
  return nums
}

/**
 * 内容与信源的相关度（0-100）：取信源摘要的 2~3 字 n-gram，
 * 计算其中有多少出现在 AI 最终回答中，作为"回答是否基于该信源"的代理指标。
 */
function relevanceScore(text, snippet) {
  const s = String(snippet || "").trim()
  const t = String(text || "").trim()
  if (!s || !t) return 0
  const grams = new Set()
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= s.length; i++) {
      const g = s.slice(i, i + n).trim()
      if (g.length === n) grams.add(g)
    }
  }
  if (grams.size === 0) return 0
  let hit = 0
  for (const g of grams) if (t.includes(g)) hit++
  return Math.min(100, Math.round((hit / grams.size) * 100))
}

/**
 * 检测"企业想表达的内容点"是否出现在某段文本中。
 * 先精确子串匹配，未命中再用 2-gram 重叠率(≥60%)兜底（应对同义改写）。
 */
function pointHit(point, text) {
  const p = String(point || "").trim()
  const t = String(text || "").trim()
  if (!p || !t) return false
  if (t.includes(p)) return true
  const grams = new Set()
  for (let i = 0; i + 2 <= p.length; i++) grams.add(p.slice(i, i + 2))
  if (grams.size === 0) return false
  let hit = 0
  for (const g of grams) if (t.includes(g)) hit++
  return hit / grams.size >= 0.6
}

function trackPoint(point, serpText, aiAnswer) {
  const p = String(point || "").trim()
  if (!p) return null
  const serpHit = pointHit(p, serpText)
  const aiHit = pointHit(p, aiAnswer || "")
  const status = serpHit && aiHit ? "收录" : serpHit || aiHit ? "部分" : "未出现"
  const where = [serpHit ? "serp" : "", aiHit ? "ai" : ""].filter(Boolean)
  return { point: p, status, where }
}

async function auditSingleQuery(query, brandName, dom, intendedContent = []) {
  // 1. 真实网页搜索
  const { engine, results } = await webSearch(query, { count: 8 })
  const serpText = results.map((r) => `${r.title} ${r.snippet || ""}`).join(" ")

  // 2. 检测品牌在 SERP 中的出现
  const inSerp =
    (!!brandName && serpText.includes(brandName)) ||
    (!!dom && serpText.toLowerCase().includes(dom.toLowerCase()))

  // 3. 从 SERP 中抽取出现的品牌/公司名（启发式：XX食品/XX水饺/XX水产）
  const brandPattern = /([\u4e00-\u9fa5]{2,6}(?:食品|水饺|水产|餐饮|食品科技|食品有限))|(船歌鱼水饺|喜家德|湾仔码头|思念|三全|谷雨春|开海|双合园|九盈)/g
  const brandsInSerp = [...new Set(serpText.match(brandPattern) || [])]

  // 4. 把搜索结果喂给 LLM 做 RAG 综合回答
  const searchContext = formatSearchContext(results.slice(0, 6))
  const ragSystem =
    "你是一个中文 AI 助手。请仅基于下方提供的搜索结果来回答用户问题。" +
    "如果搜索结果中提到了具体品牌/公司/产品名称，请在回答中包含它们。" +
    "如果搜索结果不足以回答，请说明。" +
    "在正文里，凡引用了某个搜索结果，请紧接其后用方括号标注其序号，例如 [1]、[2]；" +
    "序号与下方『搜索结果』列表中每条的编号(1..N)一一对应。"
  const ragUser = `搜索结果：
"""
${searchContext}
"""

用户问题：${query}

请基于以上搜索结果回答：`

  const aiAnswer = await chat({
    system: ragSystem,
    user: ragUser,
    temperature: 0.3,
    maxTokens: 800,
  })

  // 5. 检测品牌在 AI 回答中的出现
  const ansLower = (aiAnswer || "").toLowerCase()
  const inAiAnswer =
    (!!brandName && aiAnswer.includes(brandName)) ||
    (!!dom && ansLower.includes(dom.toLowerCase()))

  // 6. 从 AI 回答中抽取品牌名
  const brandsInAnswer = [...new Set((aiAnswer || "").match(brandPattern) || [])]

  // 7. 解析 AI 回答中的 [n] 引用 → 映射回 SERP 信源 → 生成"信源排名表"（使用新评分体系）
  const citedNums = parseCitations(aiAnswer)
  const sources = results.slice(0, 6).map((r, i) => {
    const scoring = scoreSource({ query, title: r.title, snippet: r.snippet, url: r.url })
    return {
      rank: i + 1,
      title: r.title,
      url: r.url,
      snippet: r.snippet || "",
      citedByAi: citedNums.has(i + 1),
      relevance: scoring.scores.relevance,
      // ── 5 维质量评分（server/scorer.mjs）──
      scores: scoring.scores,
      overallScore: scoring.overall,
      qualityLevel: scoring.level,
      qualityGrade: scoring.grade,
    }
  })

  // 8. 内容点追踪：检测"企业想表达的内容"是否被 SERP / AI 收录
  const contentTracking = (Array.isArray(intendedContent) ? intendedContent : [])
    .map((p) => trackPoint(p, serpText, aiAnswer))
    .filter(Boolean)

  return {
    query,
    serpEngine: engine,
    serpResults: results.slice(0, 6).map((r) => ({ title: r.title, snippet: r.snippet, url: r.url })),
    inSerp,
    serpMatchDetail: inSerp
      ? `品牌"${brandName}"或域名"${dom}"出现在搜索结果中`
      : `品牌"${brandName}"未出现在搜索结果中`,
    aiAnswer: aiAnswer || "",
    inAiAnswer,
    aiMatchDetail: inAiAnswer
      ? `品牌"${brandName}"出现在 AI 综合回答中`
      : `品牌"${brandName}"未出现在 AI 综合回答中`,
    brandsInSerp,
    brandsInAnswer,
    sources,
    contentTracking,
  }
}

/**
 * 内容差距分析引擎：
 * 基于一次完整 GEO 审计结果，让 LLM 找出「竞品被搜索/AI 引用而目标品牌缺席」的话题缺口，
 * 产出按优先级排序的内容创作清单（写什么 / 发在哪 / 为什么 / 竞品怎么做的）。
 */
export async function aiContentGap({ brand, domain, auditResult }) {
  const brandName = String(brand || "").trim()
  const dom = String(domain || "").trim()
  const audit = auditResult && typeof auditResult === "object" ? auditResult : {}

  // 把逐条 query 的「目标品牌 vs 竞品」表现压缩成 LLM 可读的摘要
  const perQuery = Array.isArray(audit.perQuery) ? audit.perQuery : []
  const auditSummary = perQuery
    .map((r, i) => {
      const compNames = [
        ...new Set(
          [...(r.brandsInSerp || []), ...(r.brandsInAnswer || [])]
            .map((s) => String(s).trim())
            .filter((s) => s && s !== brandName)
        ),
      ]
      return (
        `Query ${i + 1}: "${r.query}"\n` +
        `  目标品牌: SERP可见=${r.inSerp ? "是" : "否"} AI引用=${r.inAiAnswer ? "是" : "否"}\n` +
        `  被提及的竞品: ${compNames.join(", ") || "(无)"}`
      )
    })
    .join("\n\n")

  const topCompetitors = Array.isArray(audit.topCompetitors) ? audit.topCompetitors : []
  const compList = topCompetitors.map((c) => `${c.name}(${c.count}次)`).join(", ")
  const gapSummary =
    audit.gapAnalysis && typeof audit.gapAnalysis.summary === "string"
      ? audit.gapAnalysis.summary
      : ""

  const system =
    "你是 GEO（生成式引擎优化）内容策略专家。基于审计数据找出竞品被搜索/AI 引用而目标品牌缺席的话题缺口，产出具体可执行、按优先级排序的内容创作清单。只输出 JSON，不要多余文字。"
  const user = `目标品牌：${brandName}${dom ? `（域名 ${dom}）` : ""}

逐条 query 审计：
${auditSummary || "(无审计数据)"}

高频竞品：${compList || "(无)"}
${gapSummary ? `\n已有差距分析结论：${gapSummary}\n` : ""}
请分析：竞品在哪些话题/问题上被引用，而目标品牌没有？针对每个缺口给出一条内容创作建议。
只返回 JSON 数组（3-6 条，按优先级从高到低排序），不要 markdown 围栏：
[
  {
    "topic": "应该创作什么内容（具体到标题/角度）",
    "platform": "建议发布在哪里（官网博客/知乎/微信公众号/小红书/行业媒体等）",
    "priority": 5,
    "reason": "为什么这条内容能补上缺口（引用审计证据）",
    "competitorExample": "竞品在这个话题上是怎么做的"
  }
]
priority 为 1-5 的整数，5 为最高优先级。`

  const json = await chatJson({ system, user, temperature: 0.4, maxTokens: 2000 })
  return normalizeContentGap(json)
}

function normalizeContentGap(j) {
  const arr = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : []
  return arr
    .filter((x) => x && typeof x === "object" && typeof x.topic === "string" && x.topic.trim())
    .map((x) => ({
      topic: String(x.topic).trim(),
      platform: typeof x.platform === "string" ? x.platform : "",
      priority: Math.min(5, Math.max(1, Number.parseInt(x.priority, 10) || 3)),
      reason: typeof x.reason === "string" ? x.reason : "",
      competitorExample: typeof x.competitorExample === "string" ? x.competitorExample : "",
    }))
    .sort((a, b) => b.priority - a.priority)
}

/**
 * LLM 生成总体差距分析 + 内容建议
 */
async function generateGapAnalysis({ brand, domain, perQuery, topCompetitors }) {
  const auditSummary = perQuery
    .map(
      (r, i) =>
        `Query ${i + 1}: "${r.query}"\n` +
        `  SERP可见: ${r.inSerp ? "是" : "否"} | AI引用: ${r.inAiAnswer ? "是" : "否"}\n` +
        `  SERP中出现品牌: ${r.brandsInSerp.join(", ") || "(无)"}\n` +
        `  AI回答中提及品牌: ${r.brandsInAnswer.join(", ") || "(无)"}`
    )
    .join("\n\n")

  const compList = topCompetitors.map((c) => `${c.name}(${c.count}次)`).join(", ")

  const system =
    "你是 GEO（生成式引擎优化）高级分析师。基于给定的审计数据，分析品牌的线上可见度差距并给出具体可执行的内容建议。只输出 JSON。"
  const user = `品牌：${brand}${domain ? `（域名 ${domain}）` : ""}

审计结果：
${auditSummary}

高频出现的竞品：${compList || "(无)"}

请分析品牌在 AI 引擎和搜索结果中的可见度差距，并给出内容建议。只返回 JSON：
{
  "summary": "一段话总体判断：品牌当前在 AI 引擎中的可见度水平、主要差距和最优先行动方向",
  "gaps": ["2-4 个具体差距：为什么品牌没出现在搜索结果/AI回答中？缺什么内容？"],
  "suggestions": ["3-5 条具体可执行的内容建议：应该创建什么内容、在哪里发布、包含什么关键词/实体"]
}`

  const j = await chatJson({ system, user, temperature: 0.3, maxTokens: 1200 })
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()) : [])
  return {
    summary: typeof j?.summary === "string" ? j.summary : "",
    gaps: arr(j?.gaps),
    suggestions: arr(j?.suggestions),
  }
}

// ── 智能输入：从文本中提取企业画像 ──
/**
 * 从用户上传/粘贴的公司简介中，用 LLM 提取结构化企业信息
 * @param {{text:string}} input
 * @returns {{brand, domain, industry, businessMode, queries[], competitors[], contentPoints[], summary}}
 */
export async function aiExtractProfile({ text }) {
  const system =
    "你是企业信息提取专家。从用户提供的公司/品牌介绍中提取关键结构化信息，用于 GEO 优化系统初始化。只输出 JSON，不要任何解释。"
  const user = `请从以下企业/品牌介绍中提取信息：

"""
${clip(text, 6000)}
"""

只返回 JSON（中文），所有字段均为可选字符串或数组：
{
  "brand": "品牌/公司简称",
  "domain": "官网域名（如果有）",
  "industry": "所属行业分类（如：速冻食品/海鲜加工/B2B餐饮供应链）",
  "businessMode": "general 或 b2b",
  "queries": ["行业买家/用户可能搜索的精准 query（3-8 条）"],
  "competitors": ["该行业知名竞品品牌（3-6 个）"],
  "contentPoints": ["企业核心卖点/应被 AI 收录的关键信息点（4-8 条）"],
  "summary": "一句话企业定位描述"
}`
  const json = await chatJson({ system, user, temperature: 0.3, maxTokens: 2000 })
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()) : [])
  return {
    brand: typeof json?.brand === "string" ? json.brand : "",
    domain: typeof json?.domain === "string" ? json.domain : "",
    industry: typeof json?.industry === "string" ? json.industry : "",
    businessMode: json?.businessMode === "b2b" ? "b2b" : "general",
    queries: arr(json?.queries),
    competitors: arr(json?.competitors),
    contentPoints: arr(json?.contentPoints),
    summary: typeof json?.summary === "string" ? json.summary : "",
  }
}

// ── 智能补全：仅需品牌名 → 推断所有衍生字段 ──
/**
 * @param {{brand:string, industry?:string}} input
 * @returns {{industry, queries[], competitors[], contentPoints[]}}
 */
export async function aiSuggest({ brand, industry = "" }) {
  const system =
    "你是行业研究专家。给定一个品牌/公司名称，推断其所属行业、潜在买家会搜索的关键词、主要竞品、以及品牌应被 AI 引擎收录的核心内容点。只输出 JSON。"
  const user = `品牌名称：${brand}${industry ? `\n所属行业（用户已指定）：${industry}` : ""}
${
  industry
    ? ""
    : "请先推断该品牌所属的具体行业。"
}
请只返回 JSON（中文）：
{
  "industry": "行业分类",
  "queries": ["精准搜索 query（5-10 条）"],
  "competitors": ["同行业知名竞品（4-8 个）"],
  "contentPoints": ["品牌核心卖点/应被收录的关键信息（5-10 条）"]
}`
  const json = await chatJson({ system, user, temperature: 0.4, maxTokens: 2000 })
  const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === "string" && s.trim()) : [])
  return {
    industry: typeof json?.industry === "string" ? json.industry : industry,
    queries: arr(json?.queries),
    competitors: arr(json?.competitors),
    contentPoints: arr(json?.contentPoints),
  }
}

// ── 多格式内容输出 ──
/**
 * 根据输出策略生成对应格式的内容
 * @param {{text:string, title?:string, format:"article"|"social"|"video_script"|"landing", brand?:string}} opts
 * @returns 对应格式的文本内容
 */
export async function aiGenerateContent({ text, title = "", format = "article", brand = "" }) {
  const prompts = {
    article: {
      system: "你是资深新媒体编辑。把给定内容改写为适合公众号/知乎发布的图文文章。",
      user: `请将以下内容改写为一篇适合公众号/知乎发布的高质量图文文章。${brand ? `品牌：${brand}。` : ""}
标题：${title || "请根据内容生成吸引人的标题"}
原文："""${clip(text, 4000)}"""

返回 JSON（中文）：
{
  "title": "最终标题（15-25 字）",
  "subtitle": "副标题/导语（1-2 句）",
  "content": "正文（Markdown 格式，含 H2 小标题分段，每段 3-5 句，含 1 个 CTA 引导）",
  "tags": ["3-5 个标签/话题"]
}`,
    },
    social: {
      system: "你是社交媒体运营专家。把内容改写为适合小红书/即刻发布的短文案。",
      user: `请将以下内容改写为小红书风格的种草/科普笔记。${brand ? `品牌：${brand}。` : ""}
原文："""${clip(text, 2000)}"""

返回 JSON（中文）：
{
  "title": "笔记标题（含 emoji，15 字以内）",
  "content": "正文（口语化，3-5 段，含 emoji 和话题标签 #）",
  "imagePrompt": "配图建议（详细描述应该配什么图，用于 AI 生图提示词）"
}`,
    },
    video_script: {
      system: "你是短视频编剧。把内容改写为 60 秒口播脚本。",
      user: `请将以下内容改写为一条 60 秒的短视频口播脚本。${brand ? `品牌：${brand}。` : ""}
原文："""${clip(text, 2000)}"""

返回 JSON（中文）：
{
  "title": "视频标题（吸引点击，15 字以内）",
  "hook": "开头 hook（前 3 秒抓住注意力，10 字以内）",
  "script": "完整口播稿（按时间分段，每段标注【画面建议】）",
  "duration": "预计时长（秒）",
  "cta": "结尾行动号召"
}`,
    },
    landing: {
      system: "你是 SEO/GEO 落地页设计师。根据品牌审计结果，生成官网落地页结构。",
      user: `请为以下品牌生成一个官网落地页的页面结构。${brand ? `品牌：${brand}。` : ""}
输入信息："""${clip(text, 4000)}"""

返回 JSON（中文）：
{
  "pageTitle": "页面 <title>（含品牌+核心关键词）",
  "metaDescription": "meta description（120-160 字）",
  "sections": [
    { "type": "hero", "headline": "...", "subheadline": "...", "cta": "..." },
    { "type": "features", "title": "...", "items": ["..."] },
    { "type": "faq", "title": "常见问题", "items": [{"q":"...","a":"..."}] },
    { "type": "cta", "headline": "...", "button": "..." }
  ],
  "schemaType": "Organization 或 Product",
  "keyEntities": ["应标记为 Schema 的实体列表"]
}`,
    },
  }

  const cfg = prompts[format] || prompts.article
  const json = await chatJson({ system: cfg.system, user: cfg.user, temperature: 0.6, maxTokens: 4096 })
  return json
}
