import { useState } from "react"
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
import { BarChart3, FileText, Wand2, Activity, Globe, Scale, Rocket, Radar } from "lucide-react"

type Tab = "dashboard" | "workflow" | "analyzer" | "generator" | "rewriter" | "monitor" | "benchmark"

const NAV: { key: Tab; label: string; icon: typeof BarChart3; desc: string }[] = [
  { key: "dashboard", label: "监控台", icon: Radar, desc: "企业信息录入 → 360搜索/AI回答/信源排名/相关度 + 内容收录追踪" },
  { key: "workflow", label: "GEO 服务流程", icon: Rocket, desc: "项目设置 → 审计 → 报告 → 优化 → 验证迭代" },
  { key: "analyzer", label: "分析评分器", icon: BarChart3, desc: "通用 / B2B 双模式 GEO 诊断" },
  { key: "generator", label: "llms.txt 生成", icon: FileText, desc: "结构化数据与部署文件" },
  { key: "rewriter", label: "内容改写", icon: Wand2, desc: "重写为 AI 友好版本" },
  { key: "benchmark", label: "竞品对标", icon: Scale, desc: "多站点横向比较与报告" },
  { key: "monitor", label: "数据看板", icon: Activity, desc: "历史趋势 / 引用追踪 / 报告导出" },
]

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [draft, setDraft] = useState<GeoInput>({ text: "" })
  const [analysis, setAnalysis] = useState<GeoAnalysis | null>(null)
  const [analysisInput, setAnalysisInput] = useState<GeoInput | null>(null)

  function handleResult(a: GeoAnalysis, input: GeoInput) {
    setAnalysis(a)
    setAnalysisInput(input)
  }

  function buildRecord(a: GeoAnalysis): AnalysisRecord {
    return {
      id: `rec_${Date.now()}`,
      label: a.extractedTitle || "未命名内容",
      url: analysisInput?.url,
      overall: a.overall,
      dimensions: Object.fromEntries(a.dimensions.map((d) => [d.key, d.score])) as Record<DimensionKey, number>,
      createdAt: Date.now(),
    }
  }

  function handleSave(a: GeoAnalysis) {
    saveAnalysis(buildRecord(a))
    toast.success("已保存到监控看板")
  }

  function handleSaveLatest() {
    if (analysis) handleSave(analysis)
  }

  const ActiveIcon = NAV.find((n) => n.key === tab)!.icon

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-black">
            <Globe className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-semibold">GEO 优化系统</h1>
            <p className="text-[11px] text-muted-foreground">生成式引擎优化 · 让 AI 读懂、检索并引用你的内容</p>
          </div>
        </div>
        {/* 导航 */}
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((n) => {
            const I = n.icon
            const active = tab === n.key
            return (
              <button
                key={n.key}
                onClick={() => setTab(n.key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <I className="h-4 w-4" />
                <span className="font-medium">{n.label}</span>
              </button>
            )
          })}
        </nav>
      </header>

      {/* 主体 */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
          <ActiveIcon className="h-4 w-4 text-emerald-400" />
          <span>{NAV.find((n) => n.key === tab)!.desc}</span>
        </div>
        {tab === "dashboard" && <MonitorDashboard />}
        {tab === "workflow" && <WorkflowSection onGoto={setTab} setDraft={setDraft} />}
        {tab === "analyzer" && (
          <AnalyzerSection
            draft={draft}
            setDraft={setDraft}
            result={analysis}
            onResult={handleResult}
            onGoto={setTab}
            onSave={handleSave}
          />
        )}
        {tab === "generator" && <GeneratorSection draft={draft} setDraft={setDraft} />}
        {tab === "rewriter" && <RewriterSection draft={draft} setDraft={setDraft} />}
        {tab === "benchmark" && <BenchmarkSection />}
        {tab === "monitor" && <MonitorSection latest={analysis} onSaveLatest={handleSaveLatest} />}
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-muted-foreground">
        GEO = Generative Engine Optimization · 纯客户端运行，数据不离开浏览器
      </footer>
      <Toaster richColors position="top-center" />
    </div>
  )
}
