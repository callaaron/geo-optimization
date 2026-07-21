import { useEffect, useMemo, useState } from "react"
import {
  aiHealth,
  aiGeoAudit,
  type GeoAuditResult,
  type GeoAuditPerQuery,
  type GeoAuditSource,
  type ContentPointTracking,
} from "@/lib/ai/client"
import {
  createProject,
  runAudit,
  getReport,
  type ProjectInput,
} from "@/lib/geo/project-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/EmptyState"
import { Compass } from "lucide-react"
import { toast } from "sonner"
import {
  Search,
  Sparkles,
  Target,
  Link2,
  Gauge,
  ListChecks,
  CheckCircle2,
  AlertCircle,
  CircleSlash,
  FileDown,
  Save,
  Loader2,
  Radar,
} from "lucide-react"

function parseLines(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
}

function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function relevanceColor(v: number) {
  if (v >= 60) return "#10b981"
  if (v >= 30) return "#f59e0b"
  return "#ef4444"
}

function gradeColor(g?: string) {
  if (g === "A") return "#10b981"
  if (g === "B") return "#f59e0b"
  return "#ef4444"
}

function RelevanceBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{ width: `${value}%`, background: relevanceColor(value) }}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: ContentPointTracking["status"] }) {
  if (status === "收录")
    return <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">已收录</Badge>
  if (status === "部分")
    return <Badge className="bg-yellow-500/20 text-yellow-400 text-[10px]">部分</Badge>
  return <Badge className="bg-destructive/20 text-destructive text-[10px]">未出现</Badge>
}

const SCORE_DIMS: { key: string; label: string }[] = [
  { key: "relevance", label: "相关性" },
  { key: "authority", label: "权威度" },
  { key: "freshness", label: "时效性" },
  { key: "completeness", label: "完整度" },
  { key: "quotability", label: "可引用性" },
]

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: relevanceColor(value) }} />
      </div>
      <span className="w-7 text-right tabular-nums" style={{ color: relevanceColor(value) }}>{value}</span>
    </div>
  )
}

function SourceRow({ s }: { s: GeoAuditSource }) {
  const [open, setOpen] = useState(false)
  const grade = s.qualityGrade
  const score = s.overallScore ?? s.relevance
  return (
    <div className="rounded-md border border-border/60">
      <button
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{s.rank}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{s.title}</p>
          <p className="truncate text-xs text-muted-foreground">{s.url}</p>
        </div>
        {grade && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold"
            style={{ background: `${gradeColor(grade)}22`, color: gradeColor(grade) }}
            title={`内容质量评级 ${grade}`}
          >
            {grade}
          </span>
        )}
        {s.citedByAi ? (
          <Badge className="shrink-0 bg-violet-500/20 text-violet-300 text-[10px]">被 AI 引用</Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-[10px]">未引用</Badge>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <RelevanceBar value={s.relevance} />
          <span className="w-8 text-right text-xs tabular-nums" style={{ color: relevanceColor(s.relevance) }}>{s.relevance}</span>
        </div>
      </button>
      {open && s.scores && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted-foreground">5 维内容质量评分（综合 {score}）</p>
          {SCORE_DIMS.map((d) => (
            <ScoreBar key={d.key} label={d.label} value={s.scores![d.key] ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}

function QueryCard({
  q,
  open,
  onToggle,
}: {
  q: GeoAuditPerQuery
  open: boolean
  onToggle: () => void
}) {
  if (q.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {q.query} — 监测失败：{q.error}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border">
      <button
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={onToggle}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Radar className="h-4 w-4 shrink-0 text-sky-400" />
          <span className="truncate text-sm font-medium">{q.query}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {q.inSerp ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">SERP ✓</Badge>
          ) : (
            <Badge className="bg-destructive/20 text-destructive text-[10px]">SERP ✗</Badge>
          )}
          {q.inAiAnswer ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">AI ✓</Badge>
          ) : (
            <Badge className="bg-destructive/20 text-destructive text-[10px]">AI ✗</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {/* 维度① 360 搜索情况 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-sky-400">
              ① 360 搜索情况（{q.serpEngine}）
            </p>
            {q.serpResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">未抓到搜索结果。</p>
            ) : (
              <div className="space-y-1.5">
                {q.serpResults.map((r, i) => (
                  <div key={i} className="rounded-md border border-border/50 px-3 py-2">
                    <p className="text-sm font-medium">
                      <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>
                      {r.title}
                    </p>
                    {r.snippet && <p className="mt-0.5 text-xs text-muted-foreground">{r.snippet}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* 维度② 各 AI 回答情况（v1：自有 Ark RAG 综合回答） */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-violet-400">
              ② AI 回答情况 <span className="text-[10px] text-muted-foreground">（基于真实 360 搜索的 RAG 综合 · 多 AI 适配器预留）</span>
            </p>
            <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
              {q.aiAnswer || "(空)"}
            </div>
            {q.brandsInAnswer.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {q.brandsInAnswer.map((b) => (
                  <Badge key={b} variant="secondary" className="text-[10px]">
                    {b}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* 维度③ 信源来源 + 排名 + 被 AI 引用 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-emerald-400">③ 信源来源 + 排名（被 AI 引用标记）</p>
            <div className="space-y-1.5">
              {(q.sources || []).map((s) => (
                <SourceRow key={s.rank} s={s} />
              ))}
            </div>
          </div>

          <Separator />

          {/* 维度④ 内容与信源相关度 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-400">④ 内容与信源相关度（AI 回答对该信源的依赖程度）</p>
            <div className="space-y-1.5">
              {(q.sources || []).map((s) => (
                <div key={s.rank} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 text-center font-bold text-muted-foreground">{s.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.title}</span>
                  <RelevanceBar value={s.relevance} />
                  <span className="w-8 text-right tabular-nums" style={{ color: relevanceColor(s.relevance) }}>
                    {s.relevance}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function MonitorDashboard() {
  const [brand, setBrand] = useState("正岛食品")
  const [domain, setDomain] = useState("zhengdao.com")
  const [competitors, setCompetitors] = useState("船歌鱼水饺\n喜家德\n湾仔码头\n双合园")
  const [queries, setQueries] = useState(
    "海鲜水饺代工厂家\n青岛海鲜水饺品牌\n鱼糜制品生产厂家\n海鲜水饺 OEM 贴牌",
  )
  const [intended, setIntended] = useState(
    "专注海鲜水饺 OEM/ODM 代工\n青岛本地海鲜原料直采\n通过 HACCP 食品安全认证\n为餐饮品牌提供定制化水饺研发",
  )
  const [aiReady, setAiReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GeoAuditResult | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [trackFilter, setTrackFilter] = useState<"all" | "收录" | "部分" | "未出现">("all")

  useEffect(() => {
    aiHealth().then((h) => setAiReady(h.ok && h.configured))
  }, [])

  async function run() {
    const qs = parseLines(queries)
    const ic = parseLines(intended)
    if (!brand.trim()) {
      toast.error("请填写品牌名")
      return
    }
    if (qs.length === 0) {
      toast.error("请填写至少一条监测 query")
      return
    }
    setLoading(true)
    setResult(null)
    setSavedId(null)
    try {
      const res = await aiGeoAudit({
        brand: brand.trim(),
        domain: domain.trim() || undefined,
        queries: qs,
        competitors: parseLines(competitors),
        intendedContent: ic,
      })
      setResult(res)
      setExpanded(res.perQuery[0]?.query ?? null)
      toast.success(`监测完成：搜索可见度 ${res.serpVisibility}% / AI 引用率 ${res.aiCitationRate}%`)
    } catch (e) {
      toast.error(`监测失败：${(e as Error).message || "后端异常"}`)
    } finally {
      setLoading(false)
    }
  }

  async function save(): Promise<string | null> {
    if (!result) return null
    if (savedId) return savedId
    try {
      const input: ProjectInput = {
        brand: result.brand,
        domain: result.domain,
        industry: "",
        mode: "general",
        competitors: parseLines(competitors),
        queries: parseLines(queries),
        intendedContent: parseLines(intended),
      }
      const proj = await createProject(input)
      await runAudit(proj.id, { brand: proj.brand, domain: proj.domain, queries: proj.queries })
      setSavedId(proj.id)
      toast.success("已保存为项目快照，可在「监控看板」看趋势")
      return proj.id
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`)
      return null
    }
  }

  async function exportReport() {
    let id = savedId
    if (!id) id = await save()
    if (!id) return
    try {
      const html = await getReport(id)
      downloadHtml(`geo-monitor-${result?.brand || "report"}-${Date.now()}.html`, html)
      toast.success("已导出监测报告（HTML，可打印/存 PDF）")
    } catch (e) {
      toast.error(`报告生成失败：${(e as Error).message}`)
    }
  }

  const includedRate = useMemo(() => {
    if (!result?.intendedCount) return null
    return Math.round(((result.includedCount || 0) / result.intendedCount) * 100)
  }, [result])

  const trackingList = useMemo(() => {
    const list = result?.contentTracking || []
    if (trackFilter === "all") return list
    return list.filter((c) => c.status === trackFilter)
  }, [result, trackFilter])

  return (
    <div className="space-y-6">
      {/* 企业信息录入 */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-emerald-400" /> 企业监测配置
            <Badge variant="secondary" className="ml-1 text-[10px]">监控台</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            输入企业信息后一键监测：① 360 搜索情况 ② 各 AI 回答 ③ 信源来源与排名 ④ 内容与信源相关度；
            并追踪「企业想表达 / 最终收录 / 未出现」的内容差距。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">品牌名 *</label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="如：正岛食品" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">域名（可选）</label>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="如：zhengdao.com" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">竞品（每行一个，可选）</label>
            <textarea
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">监测 query（每行一个）*</label>
            <textarea
              value={queries}
              onChange={(e) => setQueries(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">企业想表达的内容点（每行一个，用于收录追踪）</label>
            <textarea
              value={intended}
              onChange={(e) => setIntended(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={run}
              disabled={!aiReady || loading}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            >
              {loading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1 h-4 w-4" />
              )}
              {loading ? "监测中（搜索 + AI 分析，约 1-2 分钟）…" : "运行监测"}
            </Button>
            {!aiReady && <span className="text-xs text-amber-400">需启动后端（npm run server）后方可使用。</span>}
          </div>
        </CardContent>
      </Card>

      {result ? (
        <>
          {/* 汇总指标 */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-sky-400" />
                <span className="text-xs font-medium text-muted-foreground">搜索可见度</span>
              </div>
              <p className="mt-1 text-3xl font-bold" style={{ color: result.serpVisibility > 0 ? "#10b981" : "#ef4444" }}>
                {result.serpVisibility}%
              </p>
              <p className="text-xs text-muted-foreground">{result.serpHits}/{result.totalQueries} 条 query 命中</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-400" />
                <span className="text-xs font-medium text-muted-foreground">AI 引用率</span>
              </div>
              <p className="mt-1 text-3xl font-bold" style={{ color: result.aiCitationRate > 0 ? "#10b981" : "#ef4444" }}>
                {result.aiCitationRate}%
              </p>
              <p className="text-xs text-muted-foreground">{result.aiHits}/{result.totalQueries} 条被 AI 提及</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-muted-foreground">信源总数</span>
              </div>
              <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{result.sources?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">跨 query 去重</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-medium text-muted-foreground">内容收录率</span>
              </div>
              <p className="mt-1 text-3xl font-bold" style={{ color: (includedRate ?? 0) > 0 ? "#10b981" : "#ef4444" }}>
                {includedRate === null ? "—" : `${includedRate}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {result.includedCount ?? 0}/{result.intendedCount ?? 0} 内容点已收录
              </p>
            </div>
          </div>

          {/* 逐 query 监测明细 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">逐 query 监测明细（{result.perQuery.length}）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.perQuery.map((q) => (
                <QueryCard
                  key={q.query}
                  q={q}
                  open={expanded === q.query}
                  onToggle={() => setExpanded(expanded === q.query ? null : q.query)}
                />
              ))}
            </CardContent>
          </Card>

          {/* 全局信源排名 */}
          {result.sources && result.sources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4 text-emerald-400" /> 全局信源排名
                  <span className="text-xs font-normal text-muted-foreground">（被 AI 引用次数 → 平均相关度）</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {result.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                    <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                    </div>
                    {s.citedCount > 0 ? (
                      <Badge className="shrink-0 bg-violet-500/20 text-violet-300 text-[10px]">
                        被引 {s.citedCount} 次
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">未引用</Badge>
                    )}
                    <div className="flex shrink-0 items-center gap-2">
                      <RelevanceBar value={s.avgRelevance} />
                      <span className="w-8 text-right text-xs tabular-nums" style={{ color: relevanceColor(s.avgRelevance) }}>
                        {s.avgRelevance}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* 内容追踪：想表达 / 已收录 / 未出现 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4 text-amber-400" /> 内容收录追踪
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> 已收录 {result.includedCount ?? 0}
                </Badge>
                <Badge className="bg-yellow-500/20 text-yellow-400">
                  <AlertCircle className="mr-1 h-3 w-3" /> 部分 {result.partialCount ?? 0}
                </Badge>
                <Badge className="bg-destructive/20 text-destructive">
                  <CircleSlash className="mr-1 h-3 w-3" /> 未出现 {result.missingCount ?? 0}
                </Badge>
                <div className="ml-auto flex items-center gap-1">
                  {(["all", "收录", "部分", "未出现"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTrackFilter(f)}
                      className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                        trackFilter === f
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {f === "all" ? "全部" : f}
                    </button>
                  ))}
                </div>
              </div>
              {trackingList.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">暂无内容点（请在配置中填写「企业想表达的内容点」）。</p>
              ) : (
                <div className="space-y-2">
                  {trackingList.map((c, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                        c.status === "未出现" ? "border-destructive/40 bg-destructive/5" : "border-border"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.point}</p>
                        {c.where.length > 0 && (
                          <p className="text-xs text-muted-foreground">出现于：{c.where.join(" / ")}</p>
                        )}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                「未出现」的内容点即企业想表达、但当前 360 搜索与 AI 回答都没收录的缺口——这是后续内容创作的重点。
              </p>
            </CardContent>
          </Card>

          {/* 差距分析 + 行动建议 */}
          {result.gapAnalysis && (result.gapAnalysis.summary || result.gapAnalysis.gaps.length > 0) && (
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="h-4 w-4 text-violet-400" /> 差距分析与行动建议
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.gapAnalysis.summary && (
                  <p className="text-sm leading-relaxed">{result.gapAnalysis.summary}</p>
                )}
                {result.gapAnalysis.gaps.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-destructive">关键差距</p>
                    {result.gapAnalysis.gaps.map((g, i) => (
                      <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                        {i + 1}. {g}
                      </p>
                    ))}
                  </div>
                )}
                {result.gapAnalysis.suggestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-emerald-400">行动建议</p>
                    {result.gapAnalysis.suggestions.map((s, i) => (
                      <p key={i} className="text-xs leading-relaxed">
                        {i + 1}. {s}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 交付动作 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={save} disabled={!!savedId}>
              <Save className="mr-1 h-3.5 w-3.5" /> {savedId ? "已保存为项目" : "保存为项目快照"}
            </Button>
            <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={exportReport}>
              <FileDown className="mr-1 h-3.5 w-3.5" /> 导出监测报告
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Compass className="h-8 w-8" />}
          title="尚未运行监测"
          desc="填写上方「企业监测配置」后点击「运行监测」，即可查看搜索可见度、AI 引用率与信源质量评分。"
          hint="提示：左侧智能输入面板可粘贴简介一键补全品牌与 query"
        />
      )}
    </div>
  )
}
