import { useMemo, useState } from "react"
import type { GeoAuditResult, GeoAuditPerQuery, GeoAuditSource } from "@/lib/ai/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import AuditDeepDive from "@/sections/AuditDeepDive"
import {
  Sparkles, Target, Link2, Gauge, ListChecks,
  CheckCircle2, AlertCircle, CircleSlash,
  FileDown, Save, Radar,
} from "lucide-react"
import { toast } from "sonner"
import {
  relevanceColor, gradeColor, citationLevelColor,
  CITATION_LEVEL_META, RelevanceBar, ScoreBar, StatusBadge, SCORE_DIMS,
  downloadHtml,
} from "@/lib/geo/utils"
import { createProject, runAudit, getReport, type ProjectInput } from "@/lib/geo/project-client"

// ── SourceRow ──
function SourceRow({ s }: { s: GeoAuditSource }) {
  const [open, setOpen] = useState(false)
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
        {s.qualityGrade && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold"
            style={{ background: `${gradeColor(s.qualityGrade)}22`, color: gradeColor(s.qualityGrade) }}
            title={`内容质量评级 ${s.qualityGrade}`}
          >
            {s.qualityGrade}
          </span>
        )}
        {s.citedByAi ? (
          <Badge className="shrink-0 bg-violet-500/20 text-violet-300 text-xs">被 AI 引用</Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-xs">未引用</Badge>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <RelevanceBar value={s.relevance} />
          <span className="w-8 text-right text-xs tabular-nums" style={{ color: relevanceColor(s.relevance) }}>{s.relevance}</span>
        </div>
      </button>
      {open && s.scores && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-2.5">
          <p className="text-xs font-medium text-muted-foreground">5 维内容质量评分（综合 {score}）</p>
          {SCORE_DIMS.map((d) => (
            <ScoreBar key={d.key} label={d.label} value={s.scores![d.key] ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── QueryCard ──
function QueryCard({ q, open, onToggle }: { q: GeoAuditPerQuery; open: boolean; onToggle: () => void }) {
  if (q.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {q.query} — 监测失败：{q.error}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border">
      <button className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={onToggle}>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Radar className="h-4 w-4 shrink-0 text-sky-400" />
          <span className="truncate text-sm font-medium">{q.query}</span>
        </span>
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
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          {/* ① 360 搜索情况 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-sky-400">① 360 搜索情况（{q.serpEngine}）</p>
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

          {/* ② AI 回答 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-violet-400">
                ② AI 回答情况 <span className="text-xs text-muted-foreground">（基于真实 360 搜索的 RAG 综合）</span>
              </p>
              {q.level && (
                <Badge className="text-xs" style={{ background: `${citationLevelColor(q.level)}22`, color: citationLevelColor(q.level) }}>
                  {q.levelLabel || q.level}
                </Badge>
              )}
            </div>
            <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
              {q.aiAnswer || "(空)"}
            </div>
            {q.brandsInAnswer.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {q.brandsInAnswer.map((b) => (
                  <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
                ))}
              </div>
            )}
            {q.reason && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs leading-relaxed">
                <span className="font-medium text-muted-foreground">判定理由：</span>
                <span className="text-foreground/85">{q.reason}</span>
              </div>
            )}
            {q.suggestion && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs leading-relaxed">
                <span className="font-medium text-amber-400">GEO 建议：</span>
                <span className="text-foreground/85">{q.suggestion}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* ③ 信源来源 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-emerald-400">③ 信源来源 + 排名（被 AI 引用标记）</p>
            <div className="space-y-1.5">
              {(q.sources || []).map((s) => <SourceRow key={s.rank} s={s} />)}
            </div>
          </div>

          <Separator />

          {/* ④ 内容与信源相关度 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-400">④ 内容与信源相关度</p>
            <div className="space-y-1.5">
              {(q.sources || []).map((s) => (
                <div key={s.rank} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 text-center font-bold text-muted-foreground">{s.rank}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.title}</span>
                  <RelevanceBar value={s.relevance} />
                  <span className="w-8 text-right tabular-nums" style={{ color: relevanceColor(s.relevance) }}>{s.relevance}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 主组件：监测结果视图 ──
interface ResultViewProps {
  result: GeoAuditResult
  competitors: string[]
  queries: string[]
  intended: string[]
  onSaveComplete: (id: string) => void
  savedId: string | null
}

export function ResultView({ result, competitors, queries, intended, onSaveComplete, savedId }: ResultViewProps) {
  const [expanded, setExpanded] = useState<string | null>(result.perQuery[0]?.query ?? null)
  const [trackFilter, setTrackFilter] = useState<"all" | "收录" | "部分" | "未出现">("all")

  const includedRate = useMemo(() => {
    if (!result.intendedCount) return null
    return Math.round(((result.includedCount || 0) / result.intendedCount) * 100)
  }, [result])

  const trackingList = useMemo(() => {
    const list = result.contentTracking || []
    if (trackFilter === "all") return list
    return list.filter((c) => c.status === trackFilter)
  }, [result, trackFilter])

  async function save(): Promise<string | null> {
    if (savedId) return savedId
    try {
      const input: ProjectInput = {
        brand: result.brand,
        domain: result.domain,
        industry: "",
        mode: "general",
        competitors,
        queries,
        intendedContent: intended,
      }
      const proj = await createProject(input)
      await runAudit(proj.id, { brand: proj.brand, domain: proj.domain, queries: proj.queries })
      onSaveComplete(proj.id)
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
      downloadHtml(`geo-monitor-${result.brand || "report"}-${Date.now()}.html`, html)
      toast.success("已导出监测报告（HTML，可打印/存 PDF）")
    } catch (e) {
      toast.error(`报告生成失败：${(e as Error).message}`)
    }
  }

  return (
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

      {/* 4 级 AI 认知分布 */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          AI 认知层级分布 <span className="text-xs">（每条 query 的品牌被引用深度）</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {(["direct", "indirect", "triggerable", "none"] as const).map((lv) => {
            const n = (result.perQuery || []).filter((q) => q.level === lv).length
            const meta = CITATION_LEVEL_META[lv]
            return (
              <div key={lv} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1" style={{ borderColor: `${meta.color}55` }}>
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{n}</span>
              </div>
            )
          })}
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
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                </div>
                {s.citedCount > 0 ? (
                  <Badge className="shrink-0 bg-violet-500/20 text-violet-300 text-xs">被引 {s.citedCount} 次</Badge>
                ) : (
                  <Badge variant="secondary" className="shrink-0 text-xs">未引用</Badge>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  <RelevanceBar value={s.avgRelevance} />
                  <span className="w-8 text-right text-xs tabular-nums" style={{ color: relevanceColor(s.avgRelevance) }}>{s.avgRelevance}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 内容追踪 */}
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
                    trackFilter === f ? "bg-emerald-500/20 text-emerald-400" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f === "all" ? "全部" : f}
                </button>
              ))}
            </div>
          </div>
          {trackingList.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              暂无内容点（请在配置中填写「企业想表达的内容点」）。
            </p>
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
                  <p key={i} className="text-xs leading-relaxed text-muted-foreground">{i + 1}. {g}</p>
                ))}
              </div>
            )}
            {result.gapAnalysis.suggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-emerald-400">行动建议</p>
                {result.gapAnalysis.suggestions.map((s, i) => (
                  <p key={i} className="text-xs leading-relaxed">{i + 1}. {s}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 交付动作 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => save()} disabled={!!savedId}>
          <Save className="mr-1 h-3.5 w-3.5" /> {savedId ? "已保存为项目" : "保存为项目快照"}
        </Button>
        <Button size="sm" className="bg-emerald-500 text-black hover:bg-emerald-400" onClick={exportReport}>
          <FileDown className="mr-1 h-3.5 w-3.5" /> 导出监测报告
        </Button>
      </div>

      <AuditDeepDive result={result} />
    </>
  )
}
