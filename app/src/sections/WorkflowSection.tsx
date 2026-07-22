import { useEffect, useMemo, useState } from "react"
import type { GeoInput } from "@/types/geo"
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  runAudit,
  getContentGap,
  getReport,
  type AuditRecord,
  type ContentGapItem,
  type Project,
} from "@/lib/geo/project-client"
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
  Legend,
} from "recharts"
import { toast } from "sonner"
import {
  Settings,
  ScanSearch,
  ClipboardList,
  Wand2,
  TrendingUp,
  Loader2,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  FileDown,
  RefreshCw,
  Target,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Building2,
  ChevronRight,
} from "lucide-react"
import { scoreColor } from "@/components/geo/ScoreRing"

type Tab = "workflow" | "analyzer" | "generator" | "rewriter" | "monitor" | "benchmark"

interface Props {
  onGoto: (tab: Tab) => void
  setDraft: (updater: (prev: GeoInput) => GeoInput) => void
}

const STEPS = [
  { n: 1, label: "项目设置", icon: Settings },
  { n: 2, label: "全面审计", icon: ScanSearch },
  { n: 3, label: "审计报告", icon: ClipboardList },
  { n: 4, label: "内容优化", icon: Wand2 },
  { n: 5, label: "验证迭代", icon: TrendingUp },
] as const

const tooltipStyle = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 12,
} as const

function fmtTime(ts: string | number): string {
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function priorityBadge(p: number) {
  if (p >= 3) return <Badge className="bg-destructive/20 text-destructive text-xs">P{p} 高优先</Badge>
  if (p === 2) return <Badge className="bg-amber-500/20 text-amber-400 text-xs">P{p} 中优先</Badge>
  return <Badge className="bg-muted text-muted-foreground text-xs">P{p} 低优先</Badge>
}

function Delta({ curr, prev, suffix = "" }: { curr: number; prev: number; suffix?: string }) {
  const d = curr - prev
  if (d === 0) return <span className="text-muted-foreground">→ 持平</span>
  return d > 0 ? (
    <span className="text-emerald-400">↑ +{d}{suffix}</span>
  ) : (
    <span className="text-destructive">↓ {d}{suffix}</span>
  )
}

export function WorkflowSection({ onGoto, setDraft }: Props) {
  const [step, setStep] = useState(1)
  const [projects, setProjects] = useState<Project[]>([])
  const [backendDown, setBackendDown] = useState(false)
  const [current, setCurrent] = useState<Project | null>(null)

  // 项目表单
  const [editingId, setEditingId] = useState<string | null>(null)
  const [brand, setBrand] = useState("")
  const [domain, setDomain] = useState("")
  const [industry, setIndustry] = useState("")
  const [mode, setMode] = useState<"general" | "b2b">("general")
  const [competitors, setCompetitors] = useState("")
  const [queries, setQueries] = useState("")
  const [saving, setSaving] = useState(false)

  // 审计 / 报告 / 差距
  const [auditLoading, setAuditLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [gapItems, setGapItems] = useState<ContentGapItem[]>([])
  const [gapLoading, setGapLoading] = useState(false)

  async function reloadProjects(selectId?: string) {
    try {
      const list = await listProjects()
      setProjects(list)
      setBackendDown(false)
      const sid = selectId ?? current?.id
      if (sid) {
        const found = list.find((p) => p.id === sid)
        if (found) setCurrent(found)
      }
    } catch {
      setBackendDown(true)
    }
  }

  useEffect(() => {
    reloadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function fillForm(p: Project) {
    setEditingId(p.id)
    setBrand(p.brand)
    setDomain(p.domain)
    setIndustry(p.industry)
    setMode(p.mode)
    setCompetitors(p.competitors.join(", "))
    setQueries(p.queries.join("\n"))
    setCurrent(p)
  }

  function resetForm() {
    setEditingId(null)
    setBrand("")
    setDomain("")
    setIndustry("")
    setMode("general")
    setCompetitors("")
    setQueries("")
  }

  function parseForm() {
    return {
      brand: brand.trim(),
      domain: domain.trim(),
      industry: industry.trim(),
      mode,
      competitors: competitors
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      queries: queries
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    }
  }

  async function saveAndAudit() {
    const input = parseForm()
    if (!input.brand) {
      toast.error("请填写品牌名")
      return
    }
    if (input.queries.length === 0) {
      toast.error("请填写至少一条行业查询词")
      return
    }
    setSaving(true)
    try {
      const p = editingId ? await updateProject(editingId, input) : await createProject(input)
      toast.success(editingId ? "项目已更新" : "项目已创建")
      setEditingId(p.id)
      setCurrent(p)
      await reloadProjects(p.id)
      setStep(2)
      startAuditFor(p)
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  async function startAuditFor(p: Project) {
    setAuditLoading(true)
    try {
      const updated = await runAudit(p.id, { brand: p.brand, domain: p.domain, queries: p.queries })
      setCurrent(updated)
      await reloadProjects(updated.id)
      const last = updated.audits[updated.audits.length - 1]
      toast.success(
        `审计完成：SERP 可见度 ${last?.serpVisibility ?? 0}%，AI 引用率 ${last?.aiCitationRate ?? 0}%`,
      )
      setStep(3)
    } catch (e) {
      toast.error(`审计失败：${(e as Error).message}`)
    } finally {
      setAuditLoading(false)
    }
  }

  async function handleExportReport() {
    if (!current) return
    setReportLoading(true)
    try {
      const html = await getReport(current.id)
      const blob = new Blob([html], { type: "text/html;charset=utf-8" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `geo-audit-${current.brand}-${Date.now()}.html`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success("已导出审计报告（HTML）")
    } catch (e) {
      toast.error(`导出失败：${(e as Error).message}`)
    } finally {
      setReportLoading(false)
    }
  }

  async function enterStep4() {
    setStep(4)
    if (!current || gapItems.length > 0) return
    setGapLoading(true)
    try {
      const items = await getContentGap(current.id)
      setGapItems(items)
    } catch (e) {
      toast.error(`内容建议加载失败：${(e as Error).message}`)
    } finally {
      setGapLoading(false)
    }
  }

  function gotoRewrite(item: ContentGapItem) {
    setDraft((prev) => ({
      ...prev,
      title: item.topic,
      text: `【待优化主题】${item.topic}\n【建议发布平台】${item.platform}\n\n【优化原因】${item.reason}\n\n【竞品参考】${item.competitorExample}\n\n（在此粘贴或撰写需要改写的原文内容）`,
    }))
    toast.success("已把优化主题带入内容改写引擎")
    onGoto("rewriter")
  }

  async function handleDeleteProject(id: string) {
    try {
      await deleteProject(id)
      toast.success("项目已删除")
      if (current?.id === id) {
        setCurrent(null)
        resetForm()
      }
      await reloadProjects()
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  // ---- 派生数据 ----
  const audits = useMemo(
    () => [...(current?.audits ?? [])].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [current],
  )
  const latestAudit: AuditRecord | null = audits.length > 0 ? audits[audits.length - 1] : null
  const prevAudit: AuditRecord | null = audits.length > 1 ? audits[audits.length - 2] : null

  const trendData = useMemo(
    () =>
      audits.map((a) => ({
        name: fmtTime(a.timestamp),
        serpVisibility: a.serpVisibility,
        aiCitationRate: a.aiCitationRate,
        overallScore: a.overallScore,
      })),
    [audits],
  )

  function canVisit(n: number): boolean {
    if (n === 1) return true
    if (!current) return false
    if (n === 3) return audits.length > 0
    return true
  }

  // ================= 渲染 =================

  return (
    <div className="space-y-6">
      {/* 步骤导航 */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-1.5">
        {STEPS.map((s, i) => {
          const I = s.icon
          const active = step === s.n
          const done = step > s.n
          const visitable = canVisit(s.n)
          return (
            <div key={s.n} className="flex items-center">
              {i > 0 && <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
              <button
                onClick={() => visitable && setStep(s.n)}
                disabled={!visitable}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-emerald-500/15 text-emerald-400"
                    : done
                      ? "text-foreground hover:bg-muted"
                      : visitable
                        ? "text-muted-foreground hover:bg-muted"
                        : "cursor-not-allowed text-muted-foreground/40"
                }`}
              >
                <I className="h-3.5 w-3.5" />
                {s.n}. {s.label}
              </button>
            </div>
          )
        })}
      </div>

      {backendDown && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-2 p-3 text-xs text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            无法连接后端项目服务（/api/projects）。请确认后端已启动（npm run server），然后
            <button className="underline" onClick={() => reloadProjects()}>
              重试
            </button>
            。
          </CardContent>
        </Card>
      )}

      {/* ========== 步骤 1：项目设置 ========== */}
      {step === 1 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
          {/* 已有项目 */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-400" /> 已有项目（{projects.length}）
                </span>
                <Button size="sm" variant="outline" onClick={resetForm}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> 新建
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {projects.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  暂无项目。在右侧创建你的第一个客户项目。
                </p>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                      current?.id === p.id ? "border-emerald-500/50 bg-emerald-500/5" : ""
                    }`}
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => fillForm(p)}>
                      <p className="truncate text-sm font-medium">{p.brand}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.domain || "（无域名）"} · {p.audits.length} 次审计
                      </p>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => handleDeleteProject(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* 新建 / 编辑表单 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editingId ? "编辑项目" : "新建项目"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">品牌名 *</label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="如：正岛食品" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">域名</label>
                  <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="如：zhengdao.com" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">行业</label>
                  <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="如：速冻食品" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">业务模式</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "general" | "b2b")}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="general">通用</option>
                    <option value="b2b">B2B</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">竞品品牌（逗号分隔）</label>
                <Input
                  value={competitors}
                  onChange={(e) => setCompetitors(e.target.value)}
                  placeholder="如：思念食品, 湾仔码头, 海霸王"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">行业查询词（每行一条）*</label>
                <textarea
                  value={queries}
                  onChange={(e) => setQueries(e.target.value)}
                  rows={5}
                  placeholder={"海鲜水饺代工厂家\n青岛海鲜水饺品牌\n鱼糜制品生产厂家"}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">保存后将自动进入全面审计（约 1-2 分钟）</p>
                <Button
                  onClick={saveAndAudit}
                  disabled={saving || auditLoading}
                  className="bg-emerald-500 text-black hover:bg-emerald-400"
                >
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}
                  {saving ? "保存中…" : "保存并开始审计"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== 步骤 2：全面审计 ========== */}
      {step === 2 && current && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanSearch className="h-4 w-4 text-violet-400" /> 全面审计：{current.brand}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">品牌：</span>
                  <span className="font-medium">{current.brand}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">域名：</span>
                  {current.domain || "（未填写）"}
                </p>
                <p>
                  <span className="text-muted-foreground">行业：</span>
                  {current.industry || "（未填写）"}
                </p>
                <p>
                  <span className="text-muted-foreground">竞品：</span>
                  {current.competitors.length > 0 ? current.competitors.join("、") : "（未填写）"}
                </p>
              </div>
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground">将对以下 {current.queries.length} 条查询词逐一执行真实搜索 + AI 综合分析：</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {current.queries.map((q) => (
                  <Badge key={q} variant="secondary" className="text-xs">
                    {q}
                  </Badge>
                ))}
              </div>
            </div>

            {auditLoading ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-violet-500/30 bg-violet-500/5 py-10">
                <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
                <p className="text-sm font-medium">正在搜索中文网页并分析品牌可见度</p>
                <p className="text-xs text-muted-foreground">约需 1-2 分钟，请耐心等待，不要关闭页面…</p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> 返回项目设置
                </Button>
                <Button onClick={() => startAuditFor(current)} className="bg-violet-500 text-white hover:bg-violet-400">
                  <ScanSearch className="mr-1 h-4 w-4" /> 开始审计
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========== 步骤 3：审计报告 ========== */}
      {step === 3 && current && latestAudit && (
        <div className="space-y-6">
          {/* 核心指标卡 */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-sky-400" />
                  <span className="text-xs font-medium text-muted-foreground">SERP 可见度</span>
                </div>
                <p
                  className="mt-1 text-3xl font-bold"
                  style={{ color: latestAudit.serpVisibility > 0 ? "#10b981" : "#ef4444" }}
                >
                  {latestAudit.serpVisibility}%
                </p>
                <p className="text-xs text-muted-foreground">品牌出现在搜索结果中的查询占比</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  <span className="text-xs font-medium text-muted-foreground">AI 引用率</span>
                </div>
                <p
                  className="mt-1 text-3xl font-bold"
                  style={{ color: latestAudit.aiCitationRate > 0 ? "#10b981" : "#ef4444" }}
                >
                  {latestAudit.aiCitationRate}%
                </p>
                <p className="text-xs text-muted-foreground">AI 综合回答中提及品牌的查询占比</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-medium text-muted-foreground">GEO 总分</span>
                </div>
                <p className="mt-1 text-3xl font-bold" style={{ color: scoreColor(latestAudit.overallScore) }}>
                  {latestAudit.overallScore}
                </p>
                <p className="text-xs text-muted-foreground">
                  审计时间：{fmtTime(latestAudit.timestamp)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 竞品情报 */}
          {latestAudit.topCompetitors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">竞品情报（谁在搜索与 AI 回答中高频出现）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {latestAudit.topCompetitors.map((c) => (
                    <Badge key={c.name} variant="secondary" className="text-xs">
                      {c.name} <span className="ml-1 text-muted-foreground">{c.count} 次</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 逐条 query 结果 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">逐条查询详情</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {latestAudit.perQuery.map((q, i) => (
                <div key={i} className="rounded-lg border border-border">
                  <button
                    className="flex w-full items-center justify-between gap-2 p-3 text-left"
                    onClick={() => setExpanded(expanded === `q${i}` ? null : `q${i}`)}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.query}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {q.error ? (
                        <Badge className="bg-amber-500/20 text-amber-400 text-xs">出错</Badge>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </button>
                  {expanded === `q${i}` && (
                    <div className="space-y-3 border-t border-border p-3">
                      {q.serpResults && q.serpResults.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            搜索结果（{q.serpEngine || "搜索引擎"}）
                          </p>
                          {q.serpResults.map((r, j) => (
                            <div key={j} className="rounded border border-border/50 p-2 text-xs">
                              <p className="font-medium">{r.title}</p>
                              {r.snippet && <p className="mt-0.5 text-muted-foreground">{r.snippet}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {q.aiAnswer && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-violet-400">AI 基于搜索结果的综合回答</p>
                          <div className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
                            {q.aiAnswer}
                          </div>
                        </div>
                      )}
                      {((q.brandsInAnswer?.length ?? 0) > 0 || (q.brandsInSerp?.length ?? 0) > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                          {[...new Set([...(q.brandsInSerp ?? []), ...(q.brandsInAnswer ?? [])])].map((b) => (
                            <Badge key={b} variant="secondary" className="text-xs">
                              {b}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {q.error && <p className="text-xs text-amber-400">错误：{q.error}</p>}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 差距分析 + 内容建议 */}
          {latestAudit.gapAnalysis &&
            (latestAudit.gapAnalysis.summary ||
              latestAudit.gapAnalysis.gaps.length > 0 ||
              latestAudit.gapAnalysis.suggestions.length > 0) && (
              <Card className="border-violet-500/30 bg-violet-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-violet-400" /> 差距分析与内容建议
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {latestAudit.gapAnalysis.summary && (
                    <p className="text-sm leading-relaxed">{latestAudit.gapAnalysis.summary}</p>
                  )}
                  {latestAudit.gapAnalysis.gaps.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-destructive">关键差距</p>
                      {latestAudit.gapAnalysis.gaps.map((g, i) => (
                        <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                          {i + 1}. {g}
                        </p>
                      ))}
                    </div>
                  )}
                  {latestAudit.gapAnalysis.suggestions.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-emerald-400">内容建议（可立即执行）</p>
                      {latestAudit.gapAnalysis.suggestions.map((s, i) => (
                        <p key={i} className="text-xs leading-relaxed">
                          {i + 1}. {s}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleExportReport} disabled={reportLoading}>
              {reportLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-1 h-4 w-4" />
              )}
              {reportLoading ? "生成中…" : "导出报告"}
            </Button>
            <Button onClick={enterStep4} className="bg-emerald-500 text-black hover:bg-emerald-400">
              去优化内容 <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ========== 步骤 4：内容优化 ========== */}
      {step === 4 && current && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="h-4 w-4 text-emerald-400" /> 内容优化建议清单：{current.brand}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gapLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> 正在生成内容建议…
                </div>
              ) : gapItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  暂无内容建议。请先完成一次审计，或稍后在「监控看板」查看。
                </p>
              ) : (
                gapItems.map((item, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.topic}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        {priorityBadge(item.priority)}
                        <Badge variant="secondary" className="text-xs">
                          {item.platform}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
                    {item.competitorExample && (
                      <p className="text-xs text-amber-400">竞品参考：{item.competitorExample}</p>
                    )}
                    <div>
                      <Button size="sm" variant="outline" onClick={() => gotoRewrite(item)}>
                        <Wand2 className="mr-1 h-3.5 w-3.5" /> 去改写
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>优化完成并发布后，记得重新跑审计验证效果。</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setStep(3)}>
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回报告
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-500 text-black hover:bg-emerald-400"
                  onClick={() => setStep(5)}
                >
                  去验证迭代 <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== 步骤 5：验证迭代（趋势追踪看板） ========== */}
      {step === 5 && current && (
        <div className="space-y-6">
          {/* 前后对比 */}
          {latestAudit && prevAudit && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">SERP 可见度</p>
                  <p className="mt-1 text-lg font-bold">
                    {prevAudit.serpVisibility}% → {latestAudit.serpVisibility}%
                  </p>
                  <p className="text-sm">
                    <Delta curr={latestAudit.serpVisibility} prev={prevAudit.serpVisibility} suffix="%" />
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">AI 引用率</p>
                  <p className="mt-1 text-lg font-bold">
                    {prevAudit.aiCitationRate}% → {latestAudit.aiCitationRate}%
                  </p>
                  <p className="text-sm">
                    <Delta curr={latestAudit.aiCitationRate} prev={prevAudit.aiCitationRate} suffix="%" />
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">GEO 总分</p>
                  <p className="mt-1 text-lg font-bold">
                    {prevAudit.overallScore} → {latestAudit.overallScore}
                  </p>
                  <p className="text-sm">
                    <Delta curr={latestAudit.overallScore} prev={prevAudit.overallScore} />
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 趋势图 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-emerald-400" /> 指标趋势（{audits.length} 次审计）
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#e2e8f0" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="serpVisibility"
                      name="SERP 可见度%"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="aiCitationRate"
                      name="AI 引用率%"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="overallScore"
                      name="GEO 总分"
                      stroke="#0ea5e9"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  暂无审计记录。点击「重新审计」生成第一条趋势数据。
                </p>
              )}
            </CardContent>
          </Card>

          {/* 竞品频次（最近一次审计） */}
          {latestAudit && latestAudit.topCompetitors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">竞品出现频次（最近一次审计）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={latestAudit.topCompetitors} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "#1e293b" }} contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="出现次数" radius={[4, 4, 0, 0]}>
                      {latestAudit.topCompetitors.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "#f59e0b" : "#334155"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* 审计历史 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">审计历史（{audits.length}）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {audits.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">暂无审计记录</p>
              ) : (
                [...audits].reverse().map((a, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
                    <span className="text-muted-foreground">{fmtTime(a.timestamp)}</span>
                    <span>
                      可见度 <span className="font-medium text-emerald-400">{a.serpVisibility}%</span>
                    </span>
                    <span>
                      引用率 <span className="font-medium text-violet-400">{a.aiCitationRate}%</span>
                    </span>
                    <span>
                      总分{" "}
                      <span className="font-medium" style={{ color: scoreColor(a.overallScore) }}>
                        {a.overallScore}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(4)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> 返回内容优化
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={auditLoading}
              className="bg-violet-500 text-white hover:bg-violet-400"
            >
              <RefreshCw className="mr-1 h-4 w-4" /> 重新审计
            </Button>
          </div>
        </div>
      )}

      {/* 步骤 2-5 但无项目时的兜底 */}
      {step > 1 && !current && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            请先在「项目设置」中选择或创建一个项目。
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 去项目设置
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
