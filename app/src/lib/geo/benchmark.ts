// 竞品对标 + 站点聚合（纯函数，复用 analyzeGeo，无后端）
import type { AnalysisRecord, BenchmarkEntry, BenchmarkResult, DimensionKey, GeoAnalysis, GeoInput, GeoMode, SiteScore } from "@/types/geo"
import { analyzeGeo, gradeOf } from "./analyzer"

// DimensionKey 全量键（含 b2b）。用于把 GeoAnalysis.dimensions 投影为完整 Record<DimensionKey, number>，
// 保证 general 模式（无 b2b 维）下也补齐 b2b:0，满足 Record 类型完备性。
const ALL_DIM_KEYS: DimensionKey[] = [
  "structure",
  "entities",
  "quotability",
  "eeat",
  "structuredData",
  "technical",
  "freshness",
  "uniqueness",
  "b2b",
]

function dimsToRecord(dimensions: { key: DimensionKey; score: number }[]): Record<DimensionKey, number> {
  const rec = {} as Record<DimensionKey, number>
  for (const k of ALL_DIM_KEYS) rec[k] = 0
  for (const d of dimensions) rec[d.key] = d.score
  return rec
}

function emptyEntry(): BenchmarkEntry {
  return { label: "", overall: 0, dimensions: dimsToRecord([]), grade: "-" }
}

// 各维度落后竞品时的通用改进建议（与 label 对应，便于生成「建议…」句）
const DIM_SUGGESTION: Record<DimensionKey, string> = {
  structure: "用 H2/H3 拆分段落、增加列表与表格，提升结构清晰度",
  entities: "明确高频出现核心实体（品牌/型号/参数），并补充定义句",
  quotability: "补充量化参数与案例数据，提炼可独立引用的短结论",
  eeat: "补充作者资质背书与权威外链，建立专业可信度",
  structuredData: "部署 JSON-LD 与 Open Graph 标签，增强结构化数据",
  technical: "精简噪声、补充图片 alt 与描述性锚文本，提升技术可读性",
  freshness: "标注发布/更新时间并定期刷新内容，保持时效",
  uniqueness: "加入第一手实测经验与明确立场，减少模板化套话",
  b2b: "补充产品规格、客户案例与购买引导（预约演示/询价），强化 B2B 转化信号",
}

function buildRecommendations(entries: BenchmarkEntry[], analyses: GeoAnalysis[]): string[] {
  if (entries.length < 2) {
    return ["暂无可对比的竞品站点，建议至少再添加 1 个竞品以生成优先改进建议。"]
  }
  const labelMap = new Map(analyses[0].dimensions.map((d) => [d.key, d.label] as const))
  const mine = entries[0]

  // 对每个维度，计算我方与「领先竞品」的差距，取差距最大的若干维度给建议
  const gaps: { key: DimensionKey; gap: number; my: number; best: number; bestLabel: string }[] = []
  for (const key of ALL_DIM_KEYS) {
    const my = mine.dimensions[key] ?? 0
    let best = -1
    let bestLabel = ""
    for (let i = 1; i < entries.length; i++) {
      const s = entries[i].dimensions[key] ?? 0
      if (s > best) {
        best = s
        bestLabel = entries[i].label
      }
    }
    gaps.push({ key, gap: Math.max(best - my, 0), my, best: Math.max(best, 0), bestLabel })
  }
  gaps.sort((a, b) => b.gap - a.gap)

  const recs: string[] = []
  for (const g of gaps.slice(0, 4)) {
    if (g.gap <= 0) continue
    const label = labelMap.get(g.key) ?? g.key
    recs.push(
      `在「${label}」上落后领先竞品约 ${Math.round(g.gap)} 分（${g.bestLabel} ${Math.round(
        g.best,
      )} vs 我方 ${Math.round(g.my)}），建议${DIM_SUGGESTION[g.key]}。`,
    )
  }
  if (recs.length === 0) {
    recs.push("我方在各维度均不落后于竞品，可聚焦强化优势维度以扩大领先差距。")
  }
  return recs
}

export function benchmarkSites(inputs: GeoInput[], opts?: { mode?: GeoMode }): BenchmarkResult {
  const analyses = inputs.map((input) => analyzeGeo(input, opts))
  const entries: BenchmarkEntry[] = analyses.map((a, i) => {
    const label = inputs[i].title?.trim() || inputs[i].url || `站点 ${i + 1}`
    return {
      label,
      overall: a.overall,
      dimensions: dimsToRecord(a.dimensions),
      grade: a.grade,
    }
  })

  if (entries.length === 0) {
    return {
      entries,
      best: emptyEntry(),
      worst: emptyEntry(),
      yourIndex: 0,
      recommendations: ["未提供任何待对比站点。"],
    }
  }

  const best = entries.reduce((b, e) => (e.overall > b.overall ? e : b), entries[0])
  const worst = entries.reduce((b, e) => (e.overall < b.overall ? e : b), entries[0])
  const recommendations = buildRecommendations(entries, analyses)

  return { entries, best, worst, yourIndex: 0, recommendations }
}

export function aggregateSite(records: AnalysisRecord[]): SiteScore {
  const pages = records.length
  if (pages === 0) {
    return { pages: 0, avgOverall: 0, grade: "-", byDimension: dimsToRecord([]), gradeCounts: {} }
  }
  const avgOverall = Math.round(records.reduce((a, r) => a + r.overall, 0) / pages)
  const byDimension = {} as Record<DimensionKey, number>
  for (const k of ALL_DIM_KEYS) byDimension[k] = 0
  for (const k of ALL_DIM_KEYS) {
    let sum = 0
    for (const r of records) sum += r.dimensions[k] ?? 0
    byDimension[k] = Math.round(sum / pages)
  }
  const gradeCounts: Record<string, number> = {}
  for (const r of records) {
    const g = gradeOf(r.overall)
    gradeCounts[g] = (gradeCounts[g] ?? 0) + 1
  }
  return { pages, avgOverall, grade: gradeOf(avgOverall), byDimension, gradeCounts }
}
