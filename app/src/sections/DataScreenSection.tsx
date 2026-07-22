// 数据大屏：GEO 监测全局看板（Recharts + shadcn 大屏风）
import { useEffect, useState, useCallback, useMemo, useRef, type ComponentType } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, AreaChart, Area,
} from "recharts"
import {
  BarChart3, Globe, Zap, Target, Loader2, Database, Shield, Eye, RefreshCw, Search, Clock,
} from "lucide-react"
import { fetchMetrics, seedDemo, type MetricsResponse } from "@/lib/geo/metrics"
import { useTheme } from "next-themes"

const LEVEL_COLORS: Record<string, string> = { direct: "#22c55e", indirect: "#3b82f6", triggerable: "#f59e0b", none: "#6b7280" }
const BRAND_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"]
const DATE_FMT = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" })

function pivotTrend(trend: { date: string; score: number; brand: string }[]) {
  const brandSet = new Set<string>()
  const map = new Map<string, Record<string, number | string>>()
  for (const t of trend) { brandSet.add(t.brand); if (!map.has(t.date)) map.set(t.date, { date: t.date }); map.get(t.date)![t.brand] = t.score }
  return { data: [...map.values()].sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()), brands: [...brandSet] }
}

function KPICard({ icon: Icon, label, value, suffix = "", color = "text-emerald-400" }: {
  icon: ComponentType<{ className?: string }>; label: string; value: number | string; suffix?: string; color?: string
}) {
  return (
    <Card className="relative overflow-hidden border-border bg-card shadow-sm hover:border-primary/40 hover:shadow-md transition-all group">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-3 flex items-center gap-2.5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 ${color}`}><Icon className="h-4.5 w-4.5" /></div>
        <div className="min-w-0 flex-1"><p className="text-sm text-muted-foreground truncate">{label}</p><p className={`text-2xl font-bold tabular-nums ${color}`}>{value}{suffix}</p></div>
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="border-border bg-card/30"><CardContent className="p-3"><Skeleton className="h-10 w-full" /></CardContent></Card>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map(i => <Card key={i} className="border-border bg-card/30"><CardContent className="p-4"><Skeleton className="h-52 w-full" /></CardContent></Card>)}
      </div>
    </div>
  )
}

export default function DataScreenSection() {
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [queryFilter, setQueryFilter] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { resolvedTheme } = useTheme()

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true); else setRefreshing(true)
    setError(null)
    try { setData(await fetchMetrics()) } catch (e: any) { setError(e.message || "加载失败") }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null }
    if (autoRefresh) autoRef.current = setInterval(() => load(false), 30_000)
    return () => { if (autoRef.current) clearInterval(autoRef.current) }
  }, [autoRefresh, load])

  useEffect(() => {
    if (!data?.fetchedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(data.fetchedAt).getTime()) / 1000))
    tick(); const id = setInterval(tick, 10_000); return () => clearInterval(id)
  }, [data?.fetchedAt])

  const handleSeed = async () => {
    setSeeding(true)
    try { await seedDemo(); await load(false) } catch (e: any) { setError(e.message || "种子数据失败") }
    finally { setSeeding(false) }
  }

  const isDark = resolvedTheme === "dark"
  const textColor = isDark ? "#e2e8f0" : "#334155"
  const mutedColor = isDark ? "#64748b" : "#94a3b8"
  const gridColor = isDark ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.15)"

  // ── ⚠️ 所有 hooks / computed 值必须在条件 return 之前（React 规则）──
  const kpis = data?.kpis
  const hasAudits = kpis ? kpis.projectsWithAudit > 0 : false
  const trend = useMemo(() => data ? pivotTrend(data.trend) : { data: [], brands: [] }, [data])
  const filteredQueries = useMemo(() => {
    if (!data) return []
    if (!queryFilter.trim()) return data.perQueryScores
    const q = queryFilter.toLowerCase()
    return data.perQueryScores.filter(p => p.query.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q))
  }, [data?.perQueryScores, queryFilter])
  const elapsedStr = elapsed < 60 ? `${elapsed}s 前` : elapsed < 3600 ? `${Math.floor(elapsed / 60)}m 前` : `${Math.floor(elapsed / 3600)}h 前`
  const chartCardClass = "border-border bg-card"

  if (loading) return <LoadingSkeleton />

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <Database className="h-10 w-10 text-muted-foreground" />
      <p className="text-muted-foreground">{error || "暂无数据"}</p>
      <Button variant="outline" size="sm" onClick={() => load()}>重新加载</Button>
    </div>
  )

  if (!kpis || kpis.projects === 0) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
      <h3 className="text-lg font-semibold">GEO 数据大屏</h3>
      <p className="text-muted-foreground text-sm text-center max-w-md">尚未配置任何监测项目。点击下方按钮加载制造业演示数据，即刻体验全局看板。</p>
      <Button onClick={handleSeed} disabled={seeding} size="lg" className="mt-1">
        {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
        {seeding ? "生成中…" : "加载演示数据"}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end flex-wrap gap-2">



        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{elapsedStr}</span>
          <div className="flex items-center gap-1 mr-1"><Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" /><span className="text-sm text-muted-foreground">自动</span></div>
          <Button variant="ghost" size="sm" className="h-7 text-sm text-muted-foreground" onClick={handleSeed} disabled={seeding}>
            {seeding ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}{seeding ? "播种…" : "演示数据"}</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => load(false)} disabled={refreshing} title="刷新">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KPICard icon={Database} label="项目总数" value={kpis.projects} color="text-cyan-400" />
        <KPICard icon={Target} label="GEO 均分" value={kpis.avgScore} suffix="分" color="text-emerald-400" />
        <KPICard icon={Globe} label="AI 引用率" value={kpis.avgCitation} suffix="%" color="text-blue-400" />
        <KPICard icon={Eye} label="SERP 可见" value={kpis.avgSerp} suffix="%" color="text-amber-400" />
        <KPICard icon={Shield} label="监测 Query" value={kpis.totalQueries} color="text-violet-400" />
        <KPICard icon={Zap} label="历史审计" value={kpis.totalAudits} color="text-rose-400" />
      </div>

      {hasAudits && (
        <div className="flex flex-wrap gap-3">
          {data.byProject.filter(p => p.audits > 0).map(p => (
            <Card key={p.id} className="flex-1 min-w-[180px] border-border bg-card">
              <CardContent className="p-3 flex items-center justify-between">
                <div><p className="text-sm font-medium">{p.brand}</p><p className="text-sm text-muted-foreground">{p.audits} 次审计 · {p.queries} queries</p></div>
                <div className="text-right"><p className="text-2xl text-emerald-400">{p.score}</p><p className="text-sm text-muted-foreground">GEO 评分</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!hasAudits && (
        <Card className="border-dashed border-border/40 bg-card/20">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
            <BarChart3 className="h-8 w-8 text-muted-foreground/25" />
            <p className="text-muted-foreground text-sm">已有 {kpis.projects} 个项目，但尚未运行审计</p>
            <p className="text-muted-foreground text-sm">请前往「项目中心」配置并运行 GEO 审计，数据将实时汇聚到此看板</p>
          </CardContent>
        </Card>
      )}

      {hasAudits && (<>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className={chartCardClass}>
            <CardHeader className="pb-1.5"><CardTitle className="text-sm font-medium">引文层级分布</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.levelDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={78} paddingAngle={3} dataKey="count" nameKey="label">
                    {data.levelDistribution.map(e => <Cell key={e.level} fill={LEVEL_COLORS[e.level] || "#6b7280"} stroke={isDark ? "#0f172a" : "#f8fafc"} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8, fontSize: 13, color: textColor }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 flex-wrap -mt-1">
                {data.levelDistribution.map(l => (
                  <div key={l.level} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLORS[l.level] }} />{l.label} <span className="font-semibold text-foreground">{l.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className={chartCardClass}>
            <CardHeader className="pb-1.5"><CardTitle className="text-sm font-medium">GEO 评分趋势（按品牌）</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trend.data}>
                  <defs>{trend.brands.map((b, i) => (
                    <linearGradient key={b} id={`grad-${b}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0.25} /><stop offset="100%" stopColor={BRAND_COLORS[i % BRAND_COLORS.length]} stopOpacity={0.02} />
                    </linearGradient>
                  ))}</defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="date" tick={{ fontSize: 13, fill: mutedColor }} tickFormatter={(d: string) => DATE_FMT.format(new Date(d))} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 13, fill: mutedColor }} width={30} />
                  <Tooltip contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8, fontSize: 13, color: textColor }} labelFormatter={(d: string) => new Date(d).toLocaleDateString("zh-CN")} />
                  <Legend wrapperStyle={{ fontSize: 13 }} iconSize={8} />
                  {trend.brands.map((b, i) => <Area key={b} type="monotone" dataKey={b} stroke={BRAND_COLORS[i % BRAND_COLORS.length]} fill={`url(#grad-${b})`} strokeWidth={2} name={b} dot={false} />)}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className={chartCardClass}>
            <CardHeader className="pb-1.5"><CardTitle className="text-sm font-medium">品牌对比</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.byProject.filter(p => p.audits > 0)} layout="vertical" margin={{ left: 55, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 13, fill: mutedColor }} />
                  <YAxis type="category" dataKey="brand" tick={{ fontSize: 13, fill: textColor }} width={55} />
                  <Tooltip contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8, fontSize: 13, color: textColor }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} iconSize={8} />
                  <Bar dataKey="score" fill="#10b981" name="GEO" radius={[0, 3, 3, 0]} barSize={14} />
                  <Bar dataKey="citation" fill="#3b82f6" name="引用率" radius={[0, 3, 3, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className={chartCardClass}>
            <CardHeader className="pb-1.5"><CardTitle className="text-sm font-medium">竞品提及频次</CardTitle></CardHeader>
            <CardContent>
              {data.topCompetitors.length === 0 ? (
                <div className="flex items-center justify-center h-44 text-muted-foreground text-sm">暂无竞品数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.topCompetitors.slice(0, 8)} layout="vertical" margin={{ left: 60, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 13, fill: mutedColor }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: textColor }} width={60} />
                    <Tooltip contentStyle={{ background: isDark ? "#1e293b" : "#fff", border: "1px solid rgba(148,163,184,0.3)", borderRadius: 8, fontSize: 13, color: textColor }} formatter={(v: number) => [`${v} 次`, "提及"]} />
                    <Bar dataKey="mentions" fill="#8b5cf6" name="提及" radius={[0, 3, 3, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className={chartCardClass}>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Query 级认知明细</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input className="h-7 w-44 pl-7 text-sm" placeholder="搜索 Query 或品牌…" value={queryFilter} onChange={e => setQueryFilter(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground bg-muted/30">
                <th className="text-left py-2 px-4 font-medium">Query</th>
                <th className="text-left py-2 px-4 font-medium w-32">品牌</th>
                <th className="text-center py-2 px-4 font-medium w-32">认知层级</th>
                <th className="text-right py-2 px-4 font-medium w-24">评分</th>
              </tr></thead>
              <tbody>
                {filteredQueries.slice(0, 30).map((q, i) => (
                  <tr key={`${q.projectId}-${i}`} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-4 text-foreground">{q.query}</td>
                    <td className="py-2 px-4 text-muted-foreground">{q.brand}</td>
                    <td className="py-2 px-4 text-center"><Badge variant="outline" className="text-xs h-5 border-0 px-2" style={{ background: (LEVEL_COLORS[q.level] || "#6b7280") + "20", color: LEVEL_COLORS[q.level] }}>{q.levelLabel}</Badge></td>
                    <td className="py-2 px-4 text-right text-lg font-bold tabular-nums" style={{ color: LEVEL_COLORS[q.level] }}>{q.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredQueries.length === 0 && queryFilter && <p className="text-sm text-muted-foreground text-center py-4">无匹配 "{queryFilter}" 的 Query</p>}
            {filteredQueries.length > 30 && <p className="text-xs text-muted-foreground text-center py-2">显示前 30 条，共 {filteredQueries.length} 条</p>}
          </CardContent>
        </Card>
      </>)}
    </div>
  )
}
