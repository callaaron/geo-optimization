import { useState, useEffect } from "react"
import "./App.css"
import type { GeoAnalysis, GeoInput } from "@/types/geo"
import { WorkflowSection } from "@/sections/WorkflowSection"
import { AnalyzerSection } from "@/sections/AnalyzerSection"
import { GeneratorSection } from "@/sections/GeneratorSection"
import { RewriterSection } from "@/sections/RewriterSection"
import { MonitorSection } from "@/sections/MonitorSection"
import { MonitorDashboard } from "@/sections/MonitorDashboard"
import { BenchmarkSection } from "@/sections/BenchmarkSection"
import { saveAnalysis } from "@/lib/geo/storage"
import type { AnalysisRecord, DimensionKey } from "@/types/geo"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart3, Radar, PenLine, TrendingUp, Globe, ChevronLeft, ChevronRight, Users, Building2, Code2, Swords } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { ContentFactorySection } from "@/sections/ContentFactorySection"
import DataScreenSection from "@/sections/DataScreenSection"
import ContentSopSection from "@/sections/ContentSopSection"
import StrategyScorer from "@/sections/StrategyScorer"
import EnginePanel from "@/sections/EnginePanel"
import SchedulerPanel from "@/sections/SchedulerPanel"
import DoctorDiagnostic from "@/sections/DoctorDiagnostic"
import TeamSection from "@/sections/TeamSection"

type Tab = "dashboard" | "monitor" | "audit" | "optimize" | "deploy" | "compete" | "reports"

const NAV: { key: Tab; label: string; icon: typeof BarChart3; step: number }[] = [
  { key: "dashboard", label: "看板", icon: BarChart3, step: 1 },
  { key: "monitor", label: "监测", icon: Building2, step: 2 },
  { key: "audit", label: "审计", icon: Radar, step: 3 },
  { key: "optimize", label: "优化", icon: PenLine, step: 4 },
  { key: "deploy", label: "部署", icon: Code2, step: 5 },
  { key: "compete", label: "竞品", icon: Swords, step: 6 },
  { key: "reports", label: "报告", icon: TrendingUp, step: 7 },
]

const TAB_META: Record<Tab, { title: string; desc: string; subs?: { key: string; label: string }[] }> = {
  dashboard: { title: "GEO 看板", desc: "全局 KPI · 引文层级 · 品牌趋势 · 竞品动态" },
  monitor: { title: "品牌监测", desc: "配置品牌/域名/竞品/查询词 · 运行 AI 引擎检测 · 查看检测结果", subs: [
    { key: "config", label: "监测配置" }, { key: "doctor", label: "页面诊断" },
  ]},
  audit: { title: "审计与趋势", desc: "历史审计记录 · GEO 评分趋势 · 报告导出", subs: [
    { key: "trends", label: "历史趋势" }, { key: "reports", label: "报告导出" },
  ]},
  optimize: { title: "内容优化", desc: "基于 Princeton 9 策略：统计·引用·引语·权威语调", subs: [
    { key: "sop", label: "七块 SOP" }, { key: "rewrite", label: "AI 改写" }, { key: "format", label: "多格式" }, { key: "score", label: "策略评分" },
  ]},
  deploy: { title: "技术部署", desc: "Schema JSON-LD · llms.txt · robots.txt · 结构化数据", subs: [
    { key: "schema", label: "Schema" }, { key: "llms", label: "llms.txt" },
  ]},
  compete: { title: "竞品对标", desc: "多维度评分对比 · 差距分析 · 改进建议" },
  reports: { title: "趋势报告", desc: "项目管理 · GEO 评分趋势 · 诊断报告导出" },
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [sub, setSub] = useState("config")
  const [collapsed, setCollapsed] = useState(false)
  const [showTeam, setShowTeam] = useState(false)
  const [draft, setDraft] = useState<GeoInput>({ text: "" })
  const [analysis, setAnalysis] = useState<GeoAnalysis | null>(null)
  const [analysisInput, setAnalysisInput] = useState<GeoInput | null>(null)

  function handleResult(a: GeoAnalysis, input: GeoInput) { setAnalysis(a); setAnalysisInput(input) }
  function buildRecord(a: GeoAnalysis): AnalysisRecord {
    return { id: `rec_${Date.now()}`, label: a.extractedTitle || "未命名内容", url: analysisInput?.url, overall: a.overall, dimensions: Object.fromEntries(a.dimensions.map(d => [d.key, d.score])) as Record<DimensionKey, number>, createdAt: Date.now() }
  }
  function handleSave(a: GeoAnalysis) { saveAnalysis(buildRecord(a)); toast.success("已保存") }
  function handleSaveLatest() { if (analysis) handleSave(analysis) }

  const meta = TAB_META[tab]

  // 浏览器标题随 Tab 切换
  useEffect(() => { document.title = `${meta.title} — GEO 优化系统` }, [tab, meta.title])

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ── 左侧菜单 ── */}
      <aside className={`flex shrink-0 flex-col border-r border-border bg-card transition-all duration-200 ${collapsed ? "w-16" : "w-48"}`}>
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Globe className="h-3.5 w-3.5" /></div>
          {!collapsed && <span className="text-sm font-bold tracking-tight">GEO</span>}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-auto px-2 py-2">
          {NAV.map(n => {
            const active = tab === n.key
            const Icon = n.icon
            return (
              <button key={n.key} onClick={() => { setTab(n.key); setSub(TAB_META[n.key].subs?.[0]?.key || "") }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  active ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n.step}</span>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {!collapsed && <span>{n.label}</span>}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-border px-2 py-2 space-y-1">
          <button onClick={() => setShowTeam(true)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />{!collapsed && <span>团队</span>}
          </button>
          <div className="flex items-center justify-between px-2 pt-1">
            {!collapsed && <ThemeToggle />}
            <button onClick={() => setCollapsed(v => !v)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title={collapsed ? "展开" : "折叠"}>
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ── 右侧内容 ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-2.5">
          <div>
            <h2 className="text-base font-semibold">{meta.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
          </div>
          <Badge variant="outline" className="text-xs border-primary/40 text-primary">AI 就绪</Badge>
        </header>

        {/* ── 子 Tab 导航 ── */}
        {meta.subs && meta.subs.length > 0 && (
          <div className="shrink-0 border-b border-border px-6 py-1.5 bg-muted/20">
            <Tabs value={sub} onValueChange={setSub}>
              <TabsList className="h-8 bg-transparent gap-1">
                {meta.subs.map(s => (
                  <TabsTrigger key={s.key} value={s.key} className="text-xs h-7 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">{s.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* ── 主内容 ── */}
        <main className="flex-1 overflow-auto px-6 py-5">
          {/* ① 看板 */}
          {tab === "dashboard" && <DataScreenSection />}

          {/* ② 监测：配置 + 运行审计 / 页面诊断 */}
          {tab === "monitor" && (
            <div className="space-y-5">
              {(!sub || sub === "config") && (
                <>
                  <EnginePanel />
                  <MonitorDashboard />
                </>
              )}
              {sub === "doctor" && <DoctorDiagnostic />}
            </div>
          )}

          {/* ③ 审计：结果 + 趋势 + 深度分析 */}
          {tab === "audit" && (
            <div className="space-y-5">
              <EnginePanel />
              {sub === "trends" && <MonitorSection latest={analysis} onSaveLatest={handleSaveLatest} />}
              {sub === "reports" && <SchedulerPanel />}
            </div>
          )}

          {/* ④ 优化 */}
          {tab === "optimize" && (
            <>
              {sub === "sop" && <ContentSopSection />}
              {sub === "rewrite" && <RewriterSection draft={draft} setDraft={setDraft} />}
              {sub === "format" && <ContentFactorySection draft={draft} />}
              {sub === "score" && <StrategyScorer />}
            </>
          )}

          {/* ⑤ 部署 */}
          {tab === "deploy" && <GeneratorSection draft={draft} setDraft={setDraft} />}

          {/* ⑥ 竞品 */}
          {tab === "compete" && <BenchmarkSection />}

          {/* ⑦ 报告 */}
          {tab === "reports" && (
            <div className="space-y-6">
              <WorkflowSection onGoto={setTab as (t: string) => void} setDraft={setDraft} />
              <AnalyzerSection draft={draft} setDraft={setDraft} result={analysis} onResult={handleResult} onGoto={setTab as (t: string) => void} onSave={handleSave} />
            </div>
          )}
        </main>
      </div>

      {showTeam && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40" onClick={e => { if (e.target === e.currentTarget) setShowTeam(false) }}>
          <div className="w-full max-w-5xl max-h-[80vh] overflow-auto rounded-xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3"><h3 className="text-base font-semibold">团队管理</h3><button onClick={() => setShowTeam(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">✕</button></div>
            <div className="p-5"><TeamSection /></div>
          </div>
        </div>
      )}

      <Toaster richColors position="top-center" />

      {/* ── 移动端底部 Tab 栏 ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card md:hidden">
        {NAV.map(n => {
          const active = tab === n.key
          const Icon = n.icon
          return (
            <button key={n.key} onClick={() => setTab(n.key)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 text-[10px] font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}>
              <Icon className="h-4 w-4 mb-0.5" />
              {n.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
