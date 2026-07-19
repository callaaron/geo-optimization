import { useState } from "react"
import { benchmarkSites, aggregateSite } from "@/lib/geo/benchmark"
import type { BenchmarkResult, SiteScore, DimensionKey, GeoMode } from "@/types/geo"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts"
import { toast } from "sonner"
import { Plus, Trash2, GitCompare, Building2 } from "lucide-react"
import { scoreColor } from "@/components/geo/ScoreRing"
import { listAnalyses } from "@/lib/geo/storage"

interface SiteRow {
  id: string
  label: string
  url: string
  text: string
}

const BENCH_LABELS: Record<DimensionKey, string> = {
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

const COLORS = ["#10b981", "#f59e0b", "#38bdf8", "#a78bfa"]

export function BenchmarkSection() {
  const [sites, setSites] = useState<SiteRow[]>([
    { id: "mine", label: "我的站点", url: "", text: "" },
    { id: "c1", label: "竞品 1", url: "", text: "" },
  ])
  const [mode, setMode] = useState<GeoMode>("general")
  const [result, setResult] = useState<BenchmarkResult | null>(null)
  const [siteSummary, setSiteSummary] = useState<SiteScore | null>(null)

  function update(id: string, patch: Partial<SiteRow>) {
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  function addSite() {
    if (sites.length >= 4) {
      toast.error("最多对比 4 个站点")
      return
    }
    setSites((prev) => [...prev, { id: `c${prev.length}_${Date.now()}`, label: `竞品 ${prev.length}`, url: "", text: "" }])
  }
  function removeSite(id: string) {
    if (sites.length <= 2) {
      toast.error("至少保留 2 个站点")
      return
    }
    setSites((prev) => prev.filter((s) => s.id !== id))
  }

  function handleRun() {
    const inputs = sites
      .map((s) => ({ title: s.label, url: s.url || undefined, text: s.text }))
      .filter((i) => (i.text && i.text.trim()) || i.url)
    if (inputs.length < 2) {
      toast.error("请至少填写 2 个站点的内容或网址")
      return
    }
    const res = benchmarkSites(inputs, { mode })
    setResult(res)
    toast.success(`对标完成：${res.entries.length} 个站点`)
  }

  function handleSiteSummary() {
    const records = listAnalyses()
    if (records.length === 0) {
      toast.error("看板暂无已保存的分析记录")
      return
    }
    setSiteSummary(aggregateSite(records))
  }

  const dimKeys = result && result.entries[0] ? (Object.keys(result.entries[0].dimensions) as DimensionKey[]) : []
  const chartData = dimKeys.map((k) => {
    const row: Record<string, string | number> = { dim: BENCH_LABELS[k] ?? k }
    result!.entries.forEach((e, i) => {
      row[`s${i}`] = e.dimensions[k] ?? 0
    })
    return row
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-4 w-4 text-emerald-400" /> 竞品对标 · 多站点 GEO 对比
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">B2B 模式</span>
            <Switch checked={mode === "b2b"} onCheckedChange={(v) => setMode(v ? "b2b" : "general")} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sites.map((s, idx) => (
            <div key={s.id} className={`rounded-lg border p-3 ${idx === 0 ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}>
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={s.label}
                  onChange={(e) => update(s.id, { label: e.target.value })}
                  className="max-w-[160px]"
                  placeholder="站点名"
                />
                {idx === 0 && <Badge variant="secondary">我的</Badge>}
                <div className="flex-1" />
                {sites.length > 2 && (
                  <Button size="icon" variant="ghost" onClick={() => removeSite(s.id)} className="text-muted-foreground">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Input
                value={s.url}
                onChange={(e) => update(s.id, { url: e.target.value })}
                placeholder="网址（可选，留空则粘贴内容）"
                className="mb-2"
              />
              <Textarea
                value={s.text}
                onChange={(e) => update(s.id, { text: e.target.value })}
                placeholder="粘贴该站点正文 / 抓取到的内容"
                className="min-h-[90px] resize-y font-mono text-xs"
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={addSite}>
              <Plus className="mr-1 h-3.5 w-3.5" /> 添加竞品
            </Button>
            <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={handleRun}>
              开始对标
            </Button>
            <Button size="sm" variant="outline" onClick={handleSiteSummary}>
              <Building2 className="mr-1 h-3.5 w-3.5" /> 用已保存记录做站点汇总
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            支持「粘贴内容」或「网址」（经 CORS 代理抓取）。首个站点视为「我的站点」，与后续竞品逐项维度对比并给出优先改进建议。
          </p>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-6">
          {/* 总览表 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">对标结果</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">站点</th>
                    <th className="py-2 pr-3 font-medium">总分</th>
                    <th className="py-2 pr-3 font-medium">等级</th>
                    {dimKeys.map((k) => (
                      <th key={k} className="py-2 pr-3 text-right font-medium">
                        {BENCH_LABELS[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((e, i) => (
                    <tr key={i} className={`border-b ${i === result.yourIndex ? "bg-emerald-500/5" : ""}`}>
                      <td className="py-2 pr-3 font-medium">
                        {e.label}
                        {i === result.yourIndex && <span className="ml-1 text-xs text-emerald-400">·我</span>}
                      </td>
                      <td className="py-2 pr-3 font-semibold" style={{ color: scoreColor(e.overall) }}>
                        {e.overall}
                      </td>
                      <td className="py-2 pr-3">{e.grade}</td>
                      {dimKeys.map((k) => (
                        <td key={k} className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {e.dimensions[k] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* 维度分组对比图 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">维度对比（各站点）</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(260, dimKeys.length * 34)}>
                <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="dim" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: "#1e293b" }}
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {result.entries.map((e, i) => (
                    <Bar key={i} dataKey={`s${i}`} name={e.label} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 优先建议 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">优先改进建议</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-400">
                      {i + 1}
                    </span>
                    <span className="text-foreground/90">{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {siteSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-emerald-400" /> 站点汇总（{siteSummary.pages} 页已保存记录）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold" style={{ color: scoreColor(siteSummary.avgOverall) }}>
                  {siteSummary.avgOverall}
                </div>
                <div className="text-xs text-muted-foreground">站点平均 GEO 分</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(siteSummary.gradeCounts).map(([g, n]) => (
                  <Badge key={g} variant="secondary">
                    等级 {g}：{n} 页
                  </Badge>
                ))}
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {dimKeys.map((k) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{BENCH_LABELS[k]}</span>
                  <span className="font-medium" style={{ color: scoreColor(siteSummary.byDimension[k] ?? 0) }}>
                    {siteSummary.byDimension[k] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
