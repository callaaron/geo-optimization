import { useState, useCallback } from "react"
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
import {
  BarChart3, Activity, Globe, Search, PenLine, FolderOpen, Sparkles, Upload, Clipboard, Brain, Lightbulb, Moon, Sun, Menu, X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useTheme } from "@/hooks/useTheme"
import { ContentFactorySection } from "@/sections/ContentFactorySection"

// ── 4-Tab 结构 ──
type Tab = "dashboard" | "audit" | "content" | "projects"

const NAV: { key: Tab; label: string; icon: typeof BarChart3; desc: string }[] = [
  { key: "dashboard", label: "仪表盘", icon: Activity, desc: "品牌监测 · AI 可见度 · 内容收录追踪" },
  { key: "audit", label: "分析与审计", icon: Search, desc: "GEO 评分 · llms.txt · 深度审计报告" },
  { key: "content", label: "内容工厂", icon: PenLine, desc: "AI 改写 · 多格式输出 · 竞品对标" },
  { key: "projects", label: "项目管理", icon: FolderOpen, desc: "历史审计 · 数据看板 · 报告导出" },
]

// ── 智能输入面板（集成文件上传 + AI 提取 + 智能补全）──
function SmartInputPanel({
  onProfileReady,
}: {
  onProfileReady: (profile: Record<string, unknown>) => void
}) {
  const [brand, setBrand] = useState("")
  const [pastedText, setPastedText] = useState("")
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<"manual" | "paste" | "upload">("manual")

  // 上传文件 → 提取文本 → AI 解析
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: form })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || "上传失败")
      // 用提取到的文本 → AI 结构化
      const r2 = await fetch("/api/ai/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: j.data.text }),
      })
      const j2 = await r2.json()
      if (j2.ok) {
        setBrand(j2.data.brand || "")
        onProfileReady(j2.data)
        toast.success(`已从 ${file.name} 提取企业信息`)
      } else {
        toast.error(j2.error || "AI 提取失败")
      }
    } catch (err: unknown) {
      toast.error(String((err as Error)?.message || err))
    } finally {
      setLoading(false)
      // reset file input
      e.target.value = ""
    }
  }, [onProfileReady])

  // 粘贴文本 → AI 提取
  const handleExtractFromText = useCallback(async () => {
    if (!pastedText.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/ai/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText }),
      })
      const j = await res.json()
      if (j.ok) {
        setBrand(j.data.brand || "")
        onProfileReady(j.data)
        toast.success("已智能提取企业信息")
      } else {
        toast.error(j.error || "提取失败")
      }
    } catch (err: unknown) {
      toast.error(String((err as Error)?.message || err))
    } finally {
      setLoading(false)
    }
  }, [pastedText, onProfileReady])

  // 仅品牌名 → AI 补全所有衍生字段
  const handleSuggest = useCallback(async () => {
    if (!brand.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim() }),
      })
      const j = await res.json()
      if (j.ok) {
        onProfileReady({ brand: brand.trim(), ...j.data })
        toast.success(`已为「${brand}」智能生成 query / 竞品 / 内容点`)
      } else {
        toast.error(j.error || "补全失败")
      }
    } catch (err: unknown) {
      toast.error(String((err as Error)?.message || err))
    } finally {
      setLoading(false)
    }
  }, [brand, onProfileReady])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        智能输入：只需提供品牌名或一段简介，系统自动补全所有字段
      </div>

      {/* 输入模式切换 */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(["manual", "paste", "upload"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "manual" && "📝 品牌名"}
            {m === "paste" && "📋 粘贴简介"}
            {m === "upload" && "📎 上传文件"}
          </button>
        ))}
      </div>

      {/* 手动品牌名 + 一键补全 */}
      {mode === "manual" && (
        <div className="space-y-2">
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="输入品牌名，如：正岛食品"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={loading || !brand.trim()}
              onClick={handleSuggest}
              className="flex-1"
            >
              {loading ? (
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 animate-pulse" /> AI 分析中...
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Brain className="h-3 w-3" /> 智能补全
                </span>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            AI 将自动推断行业、生成搜索 query、推荐竞品和内容要点
          </p>
        </div>
      )}

      {/* 粘贴简介 + AI 提取 */}
      {mode === "paste" && (
        <div className="space-y-2">
          <Textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="粘贴公司简介 / 产品介绍... 系统自动提取品牌名、域名、行业、query、竞品等"
            className="min-h-[100px] text-sm"
          />
          <Button
            size="sm"
            disabled={loading || !pastedText.trim()}
            onClick={handleExtractFromText}
            className="w-full"
          >
            {loading ? (
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 animate-pulse" /> AI 提取中...
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Clipboard className="h-3 w-3" /> 智能提取
              </span>
            )}
          </Button>
        </div>
      )}

      {/* 上传文件 */}
      {mode === "upload" && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 transition-colors hover:border-emerald-500/50">
          {loading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 animate-pulse text-emerald-400" />
              解析中...
            </span>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                拖拽或点击上传 PPT / Word / PDF
              </span>
              <Badge variant="outline" className="text-[10px]">
                支持 .pdf .docx .pptx .txt
              </Badge>
            </>
          )}
          <input
            type="file"
            accept=".pdf,.docx,.pptx,.txt"
            onChange={handleUpload}
            className="hidden"
            disabled={loading}
          />
        </label>
      )}
    </div>
  )
}

// ── App 主组件 ──
export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const { theme, toggle } = useTheme()
  // 共享状态（跨 Tab 传递）
  const [draft, setDraft] = useState<GeoInput>({ text: "" })
  const [analysis, setAnalysis] = useState<GeoAnalysis | null>(null)
  const [analysisInput, setAnalysisInput] = useState<GeoInput | null>(null)
  // 智能输入面板 → 自动填充到表单（当前传递到下层的各 Section）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setSmartProfile] = useState<Record<string, unknown> | null>(null)
  // 侧栏折叠
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // 移动端导航抽屉
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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
    toast.success("已保存到数据看板")
  }

  function handleSaveLatest() {
    if (analysis) handleSave(analysis)
  }

  const activeNav = NAV.find((n) => n.key === tab)!

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── 顶部栏 ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <Globe className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-tight">GEO 优化系统</h1>
            <p className="text-[10px] text-muted-foreground">
              生成式引擎优化 · 让 AI 读懂、检索并引用你的内容
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Badge variant="outline" className="hidden text-[10px] px-2 py-0 h-5 border-emerald-500/30 text-emerald-600 sm:inline-flex">
              AI 就绪
            </Badge>
            <button
              onClick={toggle}
              title={theme === "dark" ? "切换到浅色" : "切换到深色"}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            {/* 移动端汉堡导航 */}
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="切换导航菜单"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {/* 4-Tab 导航（桌面端） */}
        <nav className="mx-auto hidden max-w-7xl gap-0.5 overflow-x-auto px-2 pb-1.5 md:flex">
          {NAV.map((n) => {
            const I = n.icon
            const active = tab === n.key
            return (
              <button
                key={n.key}
                onClick={() => setTab(n.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "bg-emerald-500/10 text-emerald-600 shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <I className="h-3.5 w-3.5" />
                {n.label}
              </button>
            )
          })}
        </nav>
        {/* 4-Tab 导航（移动端抽屉） */}
        {mobileNavOpen && (
          <div className="border-t border-border bg-background md:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col gap-0.5 px-2 py-2">
              {NAV.map((n) => {
                const I = n.icon
                const active = tab === n.key
                return (
                  <button
                    key={n.key}
                    onClick={() => {
                      setTab(n.key)
                      setMobileNavOpen(false)
                    }}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      active
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <I className="h-4 w-4 shrink-0" />
                    <span>{n.label}</span>
                    <span className="ml-auto truncate text-[10px] text-muted-foreground">
                      {n.desc}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        )}
      </header>

      {/* ── 左右分栏主体（非仪表盘页面才显示侧栏）── */}
      {tab === "dashboard" || tab === "projects" ? (
        /* 仪表盘和项目管理是全宽页面，不需要智能输入侧栏 */
        <main className="mx-auto max-w-7xl px-4 py-4">
          {tab === "dashboard" && <MonitorDashboard />}
          {tab === "projects" && <MonitorSection latest={analysis} onSaveLatest={handleSaveLatest} />}
        </main>
      ) : (
        <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row">
          {/* ── 左侧：智能输入面板（可折叠）── */}
          <aside
            className={`shrink-0 transition-all duration-200 ${
              sidebarCollapsed ? "hidden" : "w-full md:w-72"
            }`}
          >
            <div className="relative space-y-4 rounded-xl border border-border bg-card p-4 md:sticky md:top-20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">智能输入</span>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <SmartInputPanel onProfileReady={setSmartProfile} />
            </div>
          </aside>

          {/* 折叠态：展开按钮 */}
          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="md:sticky md:top-20 shrink-0 self-start rounded-lg border border-border bg-card p-2 text-muted-foreground hover:text-foreground"
            >
              <Lightbulb className="h-4 w-4" />
            </button>
          )}

          {/* ── 右侧：主要内容 ── */}
          <div className="min-w-0 flex-1 space-y-4">
            {/* 当前页描述 */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {activeNav.label}
              </Badge>
              <span>{activeNav.desc}</span>
            </div>

            {/* 审计 Tab：包含流程/分析器/生成器 */}
            {tab === "audit" && (
              <div className="space-y-6">
                <WorkflowSection
                  onGoto={setTab as (t: string) => void}
                  setDraft={setDraft}
                />
                <AnalyzerSection
                  draft={draft}
                  setDraft={setDraft}
                  result={analysis}
                  onResult={handleResult}
                  onGoto={setTab as (t: string) => void}
                  onSave={handleSave}
                />
                <GeneratorSection draft={draft} setDraft={setDraft} />
              </div>
            )}

            {/* 内容工厂 Tab：改写器 + 多格式工厂 + 竞品对标 */}
            {tab === "content" && (
              <div className="space-y-6">
                <RewriterSection draft={draft} setDraft={setDraft} />
                <ContentFactorySection draft={draft} />
                <BenchmarkSection />
              </div>
            )}
          </div>
        </main>
      )}

      <footer className="mx-auto max-w-7xl px-4 py-6 text-center text-[10px] text-muted-foreground">
        GEO = Generative Engine Optimization · AI 驱动的内容可见度优化
      </footer>
      <Toaster richColors position="top-center" />
    </div>
  )
}
