import { useEffect, useMemo, useState } from "react"
import {
  listAnalyses,
  deleteAnalysis,
  listCitations,
  saveCitation,
  deleteCitation,
} from "@/lib/geo/storage"
import { aiHealth, aiCitation, aiGeoAudit, type AiCitationResult, type GeoAuditResult } from "@/lib/ai/client"
import { buildReport, recordsToCSV, citationsToCSV } from "@/lib/geo/report"
import { aggregateSite } from "@/lib/geo/benchmark"
import type { AnalysisRecord, CitationEntry, DimensionKey, GeoAnalysis } from "@/types/geo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts"
import { toast } from "sonner"
import { Trash2, Activity, Quote, Plus, FileDown, Sparkles, Search, Target, AlertTriangle } from "lucide-react"
import { scoreColor } from "@/components/geo/ScoreRing"

const DIM_LABELS: Record<DimensionKey, string> = {
  structure: "结构",
  entities: "实体",
  quotability: "可引用",
  eeat: "EEAT",
  structuredData: "结构化",
  technical: "技术",
  freshness: "新鲜度",
  uniqueness: "独特性",
  b2b: "B2B",
}

export function MonitorSection({
  latest,
  onSaveLatest,
}: {
  latest: GeoAnalysis | null
  onSaveLatest?: () => void
}) {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [citations, setCitations] = useState<CitationEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [engine, setEngine] = useState("")
  const [query, setQuery] = useState("")
  const [found, setFound] = useState(true)
  const [note, setNote] = useState("")
  const [brand, setBrand] = useState("")
  const [aiReady, setAiReady] = useState(false)
  const [aiQuery, setAiQuery] = useState("")
  const [aiBrand, setAiBrand] = useState("")
  const [aiDomain, setAiDomain] = useState("")
  const [aiCite, setAiCite] = useState<AiCitationResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // 真·GEO 引用审计状态
  const [auditBrand, setAuditBrand] = useState("")
  const [auditDomain, setAuditDomain] = useState("")
  const [auditQueries, setAuditQueries] = useState("")
  const [auditResult, setAuditResult] = useState<GeoAuditResult | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditExpanded, setAuditExpanded] = useState<string | null>(null)

  function reload() {
    setRecords(listAnalyses())
    setCitations(listCitations())
  }

  function downloadFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }
  function handleReport() {
    const html = buildReport({
      analysis: latest ?? undefined,
      brand: brand || undefined,
      citations: citations.length ? citations : undefined,
    })
    downloadFile(`geo-report-${Date.now()}.html`, html, "text/html;charset=utf-8")
    toast.success("已导出诊断报告（HTML，可打印/存 PDF）")
  }
  function handleCsv() {
    if (records.length === 0) {
      toast.error("暂无已保存分析")
      return
    }
    downloadFile(`geo-analyses-${Date.now()}.csv`, recordsToCSV(records), "text/csv;charset=utf-8")
    toast.success("已导出分析 CSV")
  }
  function handleCiteCsv() {
    if (citations.length === 0) {
      toast.error("暂无引用记录")
      return
    }
    downloadFile(`geo-citations-${Date.now()}.csv`, citationsToCSV(citations), "text/csv;charset=utf-8")
    toast.success("已导出引用 CSV")
  }
  useEffect(() => {
    reload()
    aiHealth().then((h) => setAiReady(h.ok && h.configured))
  }, [])

  // 来自分析器的最新结果，可一键存入看板（保存逻辑在 App 层实现，便于带上 URL）
  function removeRecord(id: string) {
    deleteAnalysis(id)
    reload()
    if (selectedId === id) setSelectedId(null)
  }

  function addCitation() {
    if (!engine.trim() || !query.trim()) {
      toast.error("请填写引擎与查询问题")
      return
    }
    const entry: CitationEntry = {
      id: `cite_${Date.now()}`,
      engine: engine.trim(),
      query: query.trim(),
      found,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    }
    saveCitation(entry)
    setEngine("")
    setQuery("")
    setNote("")
    setFound(true)
    reload()
    toast.success("已记录引用追踪")
  }

  function removeCitation(id: string) {
    deleteCitation(id)
    reload()
  }

  async function runAiCitation() {
    if (!aiQuery.trim() || !aiBrand.trim()) {
      toast.error("请填写行业问题与品牌名")
      return
    }
    setAiLoading(true)
    try {
      const res = await aiCitation({
        query: aiQuery.trim(),
        brand: aiBrand.trim(),
        domain: aiDomain.trim() || undefined,
      })
      setAiCite(res)
    } catch (e) {
      toast.error(`检测失败：${(e as Error).message || "后端服务异常"}`)
    } finally {
      setAiLoading(false)
    }
  }

  async function runAudit() {
    const queries = auditQueries
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean)
    if (!auditBrand.trim()) {
      toast.error("请填写品牌名")
      return
    }
    if (queries.length === 0) {
      toast.error("请填写至少一条行业查询词")
      return
    }
    setAuditLoading(true)
    setAuditResult(null)
    try {
      const res = await aiGeoAudit({
        brand: auditBrand.trim(),
        domain: auditDomain.trim() || undefined,
        queries,
      })
      setAuditResult(res)
      toast.success(`审计完成：SERP 可见度 ${res.serpVisibility}%，AI 引用率 ${res.aiCitationRate}%`)
    } catch (e) {
      toast.error(`审计失败：${(e as Error).message || "后端服务异常"}`)
    } finally {
      setAuditLoading(false)
    }
  }

  function saveAiCitation() {
    if (!aiCite) return
    saveCitation({
      id: `cite_${Date.now()}`,
      engine: "豆包/Ark",
      query: aiQuery.trim(),
      found: aiCite.mentioned,
      note: aiCite.reason?.slice(0, 200),
      createdAt: Date.now(),
    })
    reload()
    toast.success("已存入追踪记录")
  }

  const site = useMemo(() => aggregateSite(records), [records])

  function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportReport() {
    const html = buildReport({
      analysis: latest || undefined,
      brand: brand.trim() || "我的站点",
      site: records.length > 0 ? site : undefined,
      citations: citations.length > 0 ? citations : undefined,
    })
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    toast.success("已生成诊断报告（新标签页）")
  }

  const trendData = useMemo(
    () =>
      [...records]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((r) => ({
          name: new Date(r.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
          score: r.overall,
          label: r.label,
        })),
    [records],
  )

  const selected = records.find((r) => r.id === selectedId) || null
  const dimData = selected
    ? (Object.keys(DIM_LABELS) as DimensionKey[]).map((k) => ({
        name: DIM_LABELS[k],
        score: selected.dimensions[k] ?? 0,
      }))
    : []

  const citeStats = useMemo(() => {
    const map = new Map<string, { total: number; found: number }>()
    citations.forEach((c) => {
      const s = map.get(c.engine) || { total: 0, found: 0 }
      s.total++
      if (c.found) s.found++
      map.set(c.engine, s)
    })
    return [...map.entries()]
  }, [citations])

  return (
    <div className="space-y-6">
      {latest && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="text-sm">
              <p className="font-medium">检测到最新分析结果：{latest.extractedTitle}</p>
              <p className="text-xs text-muted-foreground">总分 {latest.overall}（{latest.grade}）· 可存入看板追踪趋势</p>
            </div>
            <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={onSaveLatest}>
              <Plus className="mr-1 h-3.5 w-3.5" /> 存入看板
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium">导出与汇报</p>
            <p className="text-xs text-muted-foreground">
              生成面向客户的可打印诊断报告（HTML/PDF），或导出 CSV 用于后续分析。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="品牌 / 客户名"
              className="h-8 w-36 text-xs"
            />
            <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={exportReport}>
              <FileDown className="mr-1 h-3.5 w-3.5" /> 诊断报告
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(`geo_records_${Date.now()}.csv`, recordsToCSV(records))}
            >
              分析 CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(`geo_citations_${Date.now()}.csv`, citationsToCSV(citations))}
            >
              引用 CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 真·GEO 引用审计：360 搜索 → LLM RAG → 品牌可见度 */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-violet-400" /> 真·GEO 引用审计
            <Badge variant="secondary" className="ml-1 text-xs">RAG 搜索</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              真实搜索中文网页（360 搜索）→ 把结果喂给 AI 做 RAG 综合回答 → 检测你的品牌是否出现在搜索结果和 AI 回答中。
              无需额外 API key，全流程自动完成。
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <Input
                value={auditBrand}
                onChange={(e) => setAuditBrand(e.target.value)}
                placeholder="品牌名（如：正岛食品）"
              />
              <Input
                value={auditDomain}
                onChange={(e) => setAuditDomain(e.target.value)}
                placeholder="域名（可选，如：zhengdao.com）"
              />
            </div>
            <textarea
              value={auditQueries}
              onChange={(e) => setAuditQueries(e.target.value)}
              placeholder={"每行一条行业查询词，如：\n海鲜水饺代工厂家\n青岛海鲜水饺品牌\n鱼糜制品生产厂家"}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              onClick={runAudit}
              disabled={!aiReady || auditLoading}
              className="bg-violet-500 text-white hover:bg-violet-400"
            >
              <Search className="mr-1 h-4 w-4" />
              {auditLoading ? "正在审计（搜索+AI分析，约1-2分钟）…" : "开始引用审计"}
            </Button>
            {!aiReady && (
              <p className="text-xs text-amber-400">需启动后端服务（npm run server）后方可使用。</p>
            )}
          </div>

          {auditResult && (
            <div className="space-y-4">
              {/* 汇总指标 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-sky-400" />
                    <span className="text-xs font-medium text-muted-foreground">搜索可见度</span>
                  </div>
                  <p className="mt-1 text-3xl font-bold" style={{ color: auditResult.serpVisibility > 0 ? "#10b981" : "#ef4444" }}>
                    {auditResult.serpVisibility}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {auditResult.serpHits}/{auditResult.totalQueries} 条查询出现在搜索结果
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-400" />
                    <span className="text-xs font-medium text-muted-foreground">AI 引用率</span>
                  </div>
                  <p className="mt-1 text-3xl font-bold" style={{ color: auditResult.aiCitationRate > 0 ? "#10b981" : "#ef4444" }}>
                    {auditResult.aiCitationRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {auditResult.aiHits}/{auditResult.totalQueries} 条查询被 AI 回答提及
                  </p>
                </div>
              </div>

              {/* 竞品情报 */}
              {auditResult.topCompetitors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-amber-400">竞品情报（搜索结果和 AI 回答中高频出现的品牌）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {auditResult.topCompetitors.map((c) => (
                      <Badge key={c.name} variant="secondary" className="text-xs">
                        {c.name} <span className="ml-1 text-muted-foreground">{c.count}次</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 逐条 Query 详情 */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-sky-400">逐条查询详情</p>
                {auditResult.perQuery.map((q, i) => (
                  <div key={i} className="rounded-lg border border-border">
                    <button
                      className="flex w-full items-center justify-between gap-2 p-3 text-left"
                      onClick={() => setAuditExpanded(auditExpanded === `q${i}` ? null : `q${i}`)}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.query}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {q.inSerp ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">SERP ✓</Badge>
                        ) : (
                          <Badge className="bg-destructive/20 text-destructive text-xs">SERP ✗</Badge>
                        )}
                        {q.inAiAnswer ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">AI ✓</Badge>
                        ) : (
                          <Badge className="bg-destructive/20 text-destructive text-xs">AI ✗</Badge>
                        )}
                      </div>
                    </button>
                    {auditExpanded === `q${i}` && (
                      <div className="space-y-3 border-t border-border p-3">
                        {/* SERP 结果 */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">搜索结果（{q.serpEngine}）</p>
                          {q.serpResults.map((r, j) => (
                            <div key={j} className="rounded border border-border/50 p-2 text-xs">
                              <p className="font-medium">{r.title}</p>
                              {r.snippet && <p className="mt-0.5 text-muted-foreground">{r.snippet}</p>}
                            </div>
                          ))}
                        </div>
                        {/* AI RAG 回答 */}
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-violet-400">AI 基于搜索结果的综合回答</p>
                          <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                            {q.aiAnswer || "(空)"}
                          </div>
                        </div>
                        {/* 检测到的品牌 */}
                        {(q.brandsInSerp.length > 0 || q.brandsInAnswer.length > 0) && (
                          <div className="flex flex-wrap gap-1.5">
                            {q.brandsInAnswer.filter((b) => !q.brandsInSerp.includes(b)).map((b) => (
                              <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 差距分析 + 内容建议 */}
              {auditResult.gapAnalysis && (auditResult.gapAnalysis.summary || auditResult.gapAnalysis.gaps.length > 0) && (
                <div className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-violet-400" />
                    <span className="text-sm font-medium">差距分析与内容建议</span>
                  </div>
                  {auditResult.gapAnalysis.summary && (
                    <p className="text-sm leading-relaxed">{auditResult.gapAnalysis.summary}</p>
                  )}
                  {auditResult.gapAnalysis.gaps.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-destructive">关键差距</p>
                      {auditResult.gapAnalysis.gaps.map((g, i) => (
                        <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                          {i + 1}. {g}
                        </p>
                      ))}
                    </div>
                  )}
                  {auditResult.gapAnalysis.suggestions.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-emerald-400">内容建议（可立即执行）</p>
                      {auditResult.gapAnalysis.suggestions.map((s, i) => (
                        <p key={i} className="text-xs leading-relaxed">
                          {i + 1}. {s}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {records.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">站点聚合（{site.pages} 页）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-4xl font-bold tabular-nums" style={{ color: scoreColor(site.avgOverall) }}>
                {site.avgOverall}
              </span>
              <div className="text-sm">
                <p className="font-medium">综合等级 {site.grade}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(site.gradeCounts).map(([g, n]) => (
                    <Badge key={g} variant="secondary">
                      {g} 级 {n} 页
                    </Badge>
                  ))}
                </p>
              </div>
            </div>
            <Separator />
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {(Object.keys(site.byDimension) as DimensionKey[]).map((k) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground">{DIM_LABELS[k] ?? k}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${site.byDimension[k]}%`, background: scoreColor(site.byDimension[k]) }}
                    />
                  </div>
                  <span className="w-6 text-right tabular-nums" style={{ color: scoreColor(site.byDimension[k]) }}>
                    {site.byDimension[k]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,360px)]">
        {/* 趋势 + 维度 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-emerald-400" /> GEO 总分趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  暂无记录。在「分析器」中分析后点击「保存到看板」即可追踪趋势。
                </p>
              )}
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">维度明细：{selected.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dimData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "#1e293b" }}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {dimData.map((d, i) => (
                        <Cell key={i} fill={scoreColor(d.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 记录列表 */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">已保存分析（{records.length}）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {records.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">暂无</p>
            ) : (
              records.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                    selectedId === r.id ? "border-emerald-500/50 bg-emerald-500/5" : ""
                  }`}
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(r.id)}>
                    <p className="truncate text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("zh-CN")} ·{" "}
                      <span style={{ color: scoreColor(r.overall) }}>{r.overall}</span>
                    </p>
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => removeRecord(r.id)} className="text-muted-foreground">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI 认知覆盖度检测（真实调用） */}
      <Card className="border-sky-500/30 bg-sky-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-sky-400" /> AI 认知覆盖度检测（真实调用）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_160px_auto]">
            <Input
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder="行业问题，如：国内有哪些做家电测评的第三方机构？"
            />
            <Input value={aiBrand} onChange={(e) => setAiBrand(e.target.value)} placeholder="你的品牌名" />
            <Input
              value={aiDomain}
              onChange={(e) => setAiDomain(e.target.value)}
              placeholder="域名（可选）"
            />
            <Button
              onClick={runAiCitation}
              disabled={!aiReady || aiLoading}
              className="bg-sky-500 text-black hover:bg-sky-400"
            >
              <Sparkles className="mr-1 h-4 w-4" />
              {aiLoading ? "检测中…" : "用 AI 检测"}
            </Button>
          </div>
          {!aiReady && (
            <p className="text-xs text-amber-400">需启动后端服务（npm run server）后方可使用真实检测。</p>
          )}

          {aiCite && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge
                  className={
                    aiCite.mentioned ? "bg-emerald-500 text-black" : "bg-destructive text-destructive-foreground"
                  }
                >
                  {aiCite.mentioned ? "已被 AI 提及 ✓" : "未被 AI 提及"}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{aiCite.query}</span>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-400">归因</p>
                <p className="text-sm">{aiCite.reason}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-400">GEO 建议</p>
                <p className="text-sm font-medium">{aiCite.suggestion}</p>
              </div>

              {aiCite.brandsInAnswer.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-sky-400">AI 实际提到的品牌 / 机构（竞品情报）</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiCite.brandsInAnswer.map((b) => (
                      <Badge key={b} variant="secondary">
                        {b}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">AI 完整回答</p>
                <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
                  {aiCite.answer}
                </div>
              </div>

              <Button size="sm" variant="outline" onClick={saveAiCitation}>
                <Plus className="mr-1 h-3.5 w-3.5" /> 存为追踪记录
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 引用追踪 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Quote className="h-4 w-4 text-emerald-400" /> AI 引擎引用追踪
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr_120px_1fr_auto]">
            <Input value={engine} onChange={(e) => setEngine(e.target.value)} placeholder="引擎（如 豆包）" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="被检索的问题" />
            <select
              value={found ? "yes" : "no"}
              onChange={(e) => setFound(e.target.value === "yes")}
              className="rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="yes">已被引用</option>
              <option value="no">未引用</option>
            </select>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注 / URL" />
            <Button onClick={addCitation} className="bg-emerald-500 text-black hover:bg-emerald-400">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {citeStats.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {citeStats.map(([eng, s]) => (
                <Badge key={eng} variant="secondary">
                  {eng}：{s.found}/{s.total} 被引用
                </Badge>
              ))}
            </div>
          )}

          <Separator />

          {citations.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">暂无引用记录，手动登记各引擎的检索表现。</p>
          ) : (
            <div className="space-y-2">
              {citations.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium text-emerald-400">{c.engine}</span>
                      <span className="ml-2 text-muted-foreground">{c.query}</span>
                    </p>
                    {c.note && <p className="truncate text-xs text-muted-foreground">{c.note}</p>}
                  </div>
                  <Badge variant={c.found ? "default" : "destructive"}>{c.found ? "已引用" : "未引用"}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => removeCitation(c.id)} className="text-muted-foreground">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            说明：「AI 认知覆盖度」检测的是模型在无联网检索下对品牌的固有认知与推荐倾向，反映品牌在 AI 训练语料中的存在感。上方的「真·GEO 引用审计」通过 360 搜索 + AI RAG 综合分析，检测品牌在真实搜索结果和 AI 回答中的可见度——这是更强的信号。此处人工登记作为补充基线。
          </p>
        </CardContent>
      </Card>

      {/* 导出交付物 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="h-4 w-4 text-emerald-400" /> 导出交付物
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">客户 / 品牌名（报告抬头，可选）</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="如：XX 家电" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={handleReport}>
              <FileDown className="mr-1 h-3.5 w-3.5" /> 导出诊断报告
            </Button>
            <Button size="sm" variant="outline" onClick={handleCsv}>
              <FileDown className="mr-1 h-3.5 w-3.5" /> 分析 CSV
            </Button>
            <Button size="sm" variant="outline" onClick={handleCiteCsv}>
              <FileDown className="mr-1 h-3.5 w-3.5" /> 引用 CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            报告含总分 / 维度 / 建议 / 竞品对比（看板已存）/ 站点汇总 / 引用表，可直接交付 B 端客户或内部汇报。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
