// 数据大屏聚合：从 projects.json 读取所有项目+审计 → 产出 KPI/图表数据
// 纯 Node, JSON 持久化，零新增依赖。
// 参考：gego 的 dashboard stats 聚合层，简化适配本系统 JSON 文件存储。
import { listProjects, createProject, addAudit } from "./project.mjs"

const CITATION_LEVELS = { direct: "直接引用", indirect: "间接提及", triggerable: "可触发提及", none: "未提及" }
const LEVEL_SCORE = { direct: 100, indirect: 60, triggerable: 30, none: 0 }

/**
 * 聚合所有项目的仪表盘数据
 * 返回 { kpis, levelDistribution, trend, perQueryScores, topCompetitors, byProject }
 */
export async function getMetrics() {
  const projects = await listProjects()
  const now = new Date().toISOString()

  // ── 基本 KPI（各项目最新审计 + 全局汇总）──
  let totalQueries = 0
  let totalAudits = 0
  let sumScore = 0
  let sumCitation = 0
  let sumSerp = 0
  let projectsWithAudit = 0
  const levelCounts = { direct: 0, indirect: 0, triggerable: 0, none: 0 }
  const trend = []         // [{ date, score, brand, projectId }]
  const perQueryScores = [] // [{ query, score, level, levelLabel, brand, projectId }]
  const competitorMap = new Map() // name → { mentions, brands }
  const byProject = []     // [{ id, brand, score, citation, serp, queries, audits, levelCounts }]

  for (const p of projects) {
    const audits = Array.isArray(p.audits) ? p.audits : []
    const latest = audits.length > 0 ? audits[audits.length - 1] : null
    totalAudits += audits.length
    const qCount = Array.isArray(p.queries) ? p.queries.length : 0
    totalQueries += qCount

    // ── 趋势：每一条审计都是时间点 ──
    for (const a of audits) {
      trend.push({
        date: a.timestamp,
        score: a.overallScore ?? 0,
        citationRate: a.aiCitationRate ?? 0,
        serpVisibility: a.serpVisibility ?? 0,
        brand: p.brand,
        projectId: p.id,
      })
    }

    if (!latest) {
      byProject.push({
        id: p.id,
        brand: p.brand,
        score: 0,
        citation: 0,
        serp: 0,
        queries: qCount,
        audits: 0,
        levelCounts: { direct: 0, indirect: 0, triggerable: 0, none: 0 },
      })
      continue
    }

    projectsWithAudit++
    sumScore += latest.overallScore ?? 0
    sumCitation += latest.aiCitationRate ?? 0
    sumSerp += latest.serpVisibility ?? 0

    const pq = Array.isArray(latest.perQuery) ? latest.perQuery : []
    const projLevels = { direct: 0, indirect: 0, triggerable: 0, none: 0 }

    for (const r of pq) {
      const lv = (r.level && CITATION_LEVELS[r.level]) ? r.level : "none"
      levelCounts[lv] = (levelCounts[lv] || 0) + 1
      projLevels[lv] = (projLevels[lv] || 0) + 1

      perQueryScores.push({
        query: r.query || "",
        score: LEVEL_SCORE[lv] || 0,
        level: lv,
        levelLabel: CITATION_LEVELS[lv] || "未提及",
        brand: p.brand,
        projectId: p.id,
        inAiAnswer: r.inAiAnswer ?? false,
      })
    }

    // 竞品提及聚合
    const comps = Array.isArray(latest.topCompetitors) ? latest.topCompetitors : []
    for (const c of comps) {
      const name = (c.name || c.brand || "").trim()
      if (!name) continue
      const cur = competitorMap.get(name) || { mentions: 0, brands: new Set() }
      cur.mentions += c.count || c.mentions || 1
      cur.brands.add(p.brand)
      competitorMap.set(name, cur)
    }

    byProject.push({
      id: p.id,
      brand: p.brand,
      score: latest.overallScore ?? 0,
      citation: latest.aiCitationRate ?? 0,
      serp: latest.serpVisibility ?? 0,
      queries: qCount,
      audits: audits.length,
      levelCounts: projLevels,
    })
  }

  const avgScore = projectsWithAudit > 0 ? Math.round(sumScore / projectsWithAudit) : 0
  const avgCitation = projectsWithAudit > 0 ? Math.round(sumCitation / projectsWithAudit) : 0
  const avgSerp = projectsWithAudit > 0 ? Math.round(sumSerp / projectsWithAudit) : 0

  // 引文层级分布（饼图/环形图用）
  const levelDistribution = Object.entries(CITATION_LEVELS).map(([key, label]) => ({
    level: key,
    label,
    count: levelCounts[key] || 0,
  }))

  // 竞品排序
  const topCompetitors = [...competitorMap.entries()]
    .map(([name, { mentions, brands }]) => ({
      name,
      mentions,
      brands: [...brands],
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 10)

  // 趋势按时间排序
  trend.sort((a, b) => new Date(a.date) - new Date(b.date))

  return {
    fetchedAt: now,
    kpis: {
      projects: projects.length,
      projectsWithAudit,
      totalQueries,
      totalAudits,
      avgScore,
      avgCitation,
      avgSerp,
    },
    levelDistribution,
    trend,
    perQueryScores,
    topCompetitors,
    byProject,
  }
}

// ── 演示种子数据：预填充 3 个制造业品牌的审计记录，大屏初始展示有料 ──
const DEMO_BRANDS = [
  {
    brand: "锐工精密", domain: "ruigong-precision.com", industry: "工业机器人",
    competitors: ["绿的谐波", "昊志机电", "日本Harmonic"],
    queries: ["谐波减速机厂家排名","国产RV减速器品牌","工业机器人核心零部件供应商","高精度减速器选型","国产减速器替代进口","协作机器人关节模组厂家","谐波减速器十大品牌","精密传动哪家好"],
    score: 62, citation: 38, serp: 75, audits: [
      { date: "2026-06-15", score: 48, citation: 25, serp: 60 },
      { date: "2026-07-01", score: 56, citation: 32, serp: 68 },
      { date: "2026-07-15", score: 62, citation: 38, serp: 75 },
    ],
    levels: { direct: 2, indirect: 3, triggerable: 2, none: 1 },
    topCompetitors: [
      { name: "绿的谐波", mentions: 5 }, { name: "昊志机电", mentions: 4 }, { name: "来福谐波", mentions: 3 },
      { name: "日本Harmonic", mentions: 3 }, { name: "大族激光", mentions: 2 },
    ],
  },
  {
    brand: "中科数控", domain: "zhongke-cnc.cn", industry: "精密机床",
    competitors: ["华中数控", "广州数控", "发那科", "西门子"],
    queries: ["国产数控系统排名","五轴联动加工中心厂家","精密数控机床品牌","CNC控制系统选型","国产高端机床替代进口","数控系统上市公司","智能制造产线供应商"],
    score: 71, citation: 45, serp: 82, audits: [
      { date: "2026-06-15", score: 58, citation: 30, serp: 70 },
      { date: "2026-07-01", score: 66, citation: 40, serp: 78 },
      { date: "2026-07-15", score: 71, citation: 45, serp: 82 },
    ],
    levels: { direct: 3, indirect: 2, triggerable: 1, none: 1 },
    topCompetitors: [
      { name: "华中数控", mentions: 6 }, { name: "广州数控", mentions: 4 }, { name: "发那科", mentions: 4 },
      { name: "西门子", mentions: 3 }, { name: "科德数控", mentions: 2 },
    ],
  },
  {
    brand: "恒达新材", domain: "hengda-nm.com", industry: "新能源材料",
    competitors: ["天赐材料", "新宙邦", "恩捷股份", "星源材质"],
    queries: ["锂电池隔膜厂家排名","电解液添加剂供应商","新能源材料上市公司","宁德时代供应商名单","锂电材料国产替代","固态电池核心材料企业","电池隔膜技术哪家强"],
    score: 55, citation: 28, serp: 65, audits: [
      { date: "2026-06-15", score: 42, citation: 18, serp: 55 },
      { date: "2026-07-01", score: 50, citation: 24, serp: 62 },
      { date: "2026-07-15", score: 55, citation: 28, serp: 65 },
    ],
    levels: { direct: 1, indirect: 3, triggerable: 2, none: 1 },
    topCompetitors: [
      { name: "天赐材料", mentions: 7 }, { name: "恩捷股份", mentions: 5 }, { name: "新宙邦", mentions: 4 },
      { name: "星源材质", mentions: 3 }, { name: "璞泰来", mentions: 2 },
    ],
  },
]

/**
 * 种子演示数据到 projects.json（幂等：已存在则跳过）
 */
export async function seedDemoData() {
  const existing = await listProjects()
  const seededBrands = new Set(existing.map((p) => p.brand))

  const results = []
  for (const b of DEMO_BRANDS) {
    if (seededBrands.has(b.brand)) {
      results.push({ brand: b.brand, status: "skipped" })
      continue
    }

    // 创建项目
    const proj = await createProject({
      brand: b.brand,
      domain: b.domain,
      industry: b.industry,
      competitors: b.competitors,
      queries: b.queries,
    })

    // 注入演示审计历史
    for (const a of b.audits) {
      const pq = b.queries.map((q) => {
        const levelRoll = Math.random()
        const level = levelRoll < 0.35 ? "direct" : levelRoll < 0.65 ? "indirect" : levelRoll < 0.85 ? "triggerable" : "none"
        return {
          query: q,
          serpEngine: "360",
          serpResults: [{ title: `${q} - 搜索结果`, snippet: `关于${q}的搜索结果摘要`, url: `https://example.com/${encodeURIComponent(q)}` }],
          inSerp: level !== "none",
          serpMatchDetail: level !== "none" ? `品牌"${b.brand}"出现在"${q}"搜索结果中` : `未出现`,
          aiAnswer: level === "direct" ? `${b.brand}是${b.industry}领域的重要参与者…` : level === "indirect" ? `在${b.industry}领域，值得关注的品牌包括…` : level === "triggerable" ? `${b.industry}相关产品选型建议…` : "",
          inAiAnswer: level === "direct" || level === "indirect",
          aiMatchDetail: level === "direct" ? `品牌"${b.brand}"出现在 AI 回答中` : level === "indirect" ? `AI 提及了品类但未点名` : "未出现在 AI 回答中",
          brandsInSerp: [b.brand],
          brandsInAnswer: level === "direct" ? [b.brand] : [],
          sources: [],
          contentTracking: [],
          level,
          levelLabel: { direct: "直接引用", indirect: "间接提及", triggerable: "可触发提及", none: "未提及" }[level],
          reason: level === "direct" ? "品牌在 AI 回答中被直接点名" : level === "indirect" ? "AI 覆盖了品类但未提及品牌" : level === "triggerable" ? "当前未被提及，但补充内容后可触发" : "未涉及该品牌",
          suggestion: level !== "direct" ? "建议补充权威数据与结构化 FAQ 提升 AI 引用概率" : "",
        }
      })

      await addAudit(proj.id, {
        brand: b.brand,
        domain: b.domain,
        timestamp: new Date(a.date).toISOString(),
        mode: "rag-search",
        searchEngine: "360",
        totalQueries: b.queries.length,
        serpVisibility: a.serp,
        aiCitationRate: a.citation,
        overallScore: a.score,
        serpHits: Math.round(a.serp / 100 * b.queries.length),
        aiHits: Math.round(a.citation / 100 * b.queries.length),
        perQuery: pq,
        topCompetitors: b.topCompetitors,
        gapAnalysis: {},
        sources: [],
        contentTracking: [],
        intendedCount: 0,
        includedCount: 0,
        partialCount: 0,
        missingCount: 0,
      })
    }

    results.push({ brand: b.brand, status: "created", audits: b.audits.length, queries: b.queries.length })
  }

  return { ok: true, results }
}
