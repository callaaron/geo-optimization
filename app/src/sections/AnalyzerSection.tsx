import { useEffect, useState } from "react"
import { analyzeGeo } from "@/lib/geo/analyzer"
import { fetchUrl, normalizeUrl } from "@/lib/geo/fetch"
import type { GeoAnalysis, GeoInput, GeoMode } from "@/types/geo"
import { aiAnalyze, aiHealth, type AiAnalyzeResult } from "@/lib/ai/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScoreRing, ScoreBar } from "@/components/geo/ScoreRing"
import { toast } from "sonner"
import { Loader2, Save, FileText, Wand2, CheckCircle2, AlertTriangle, Lightbulb, Building2, Sparkles } from "lucide-react"

type Tab = "analyzer" | "generator" | "rewriter" | "monitor" | "benchmark"

interface Props {
  draft: GeoInput
  setDraft: (updater: (prev: GeoInput) => GeoInput) => void
  result: GeoAnalysis | null
  onResult: (a: GeoAnalysis, input: GeoInput) => void
  onGoto: (tab: Tab) => void
  onSave: (a: GeoAnalysis) => void
}

export function AnalyzerSection({ draft, setDraft, result, onResult, onGoto, onSave }: Props) {
  const [mode, setMode] = useState<"text" | "url">("text")
  const [url, setUrl] = useState(draft.url || "")
  const [loading, setLoading] = useState(false)
  const [openDim, setOpenDim] = useState<string | null>(null)
  const [geoMode, setGeoMode] = useState<GeoMode>("general")
  const [aiReady, setAiReady] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AiAnalyzeResult | null>(null)

  useEffect(() => {
    aiHealth()
      .then((h) => setAiReady(h.ok && h.configured))
      .catch(() => setAiReady(false))
  }, [])

  async function handleAnalyze() {
    let input: GeoInput = { ...draft }
    if (mode === "url") {
      if (!url.trim()) {
        toast.error("请输入要分析的网址")
        return
      }
      setLoading(true)
      const res = await fetchUrl(url)
      if (!res.ok) {
        toast.error(res.error || "抓取失败")
        setLoading(false)
        return
      }
      const norm = normalizeUrl(url)
      input = { ...input, url: norm, html: res.html }
      setDraft((p) => ({ ...p, url: norm, html: res.html, text: p.text }))
    } else {
      if (!draft.text.trim()) {
        toast.error("请粘贴要分析的内容")
        return
      }
    }
    const a = analyzeGeo(input, { mode: geoMode })
    onResult(a, input)
    setLoading(false)
    toast.success(`分析完成，GEO 总分 ${a.overall}（${a.grade}）`)
  }

  async function handleAiDiagnose() {
    if (!draft.text.trim()) {
      toast.error("请先输入内容（AI 增强诊断需要正文）")
      return
    }
    setAiLoading(true)
    try {
      const res = await aiAnalyze({ text: draft.text, title: draft.title, url: draft.url, mode: geoMode })
      setAiResult(res)
      toast.success("AI 深度诊断完成")
    } catch (err) {
      toast.error(String((err as Error)?.message ?? err))
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* 输入区 */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-emerald-400" /> 输入内容
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "url")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">粘贴内容</TabsTrigger>
              <TabsTrigger value="url">网址 URL</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="space-y-3 pt-3">
              <Textarea
                value={draft.text}
                onChange={(e) => setDraft((p) => ({ ...p, text: e.target.value }))}
                placeholder="粘贴文章正文 / 网页内容（支持 Markdown 标题 # / 列表）"
                className="min-h-[220px] resize-y font-mono text-xs"
              />
            </TabsContent>
            <TabsContent value="url" className="space-y-3 pt-3">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
              />
              <p className="text-xs text-muted-foreground">
                经公共 CORS 代理抓取（无需后端）。若被拦截，可改用「粘贴内容」。
              </p>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">标题（可选）</label>
              <Input value={draft.title || ""} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">作者（可选）</label>
              <Input value={draft.author || ""} onChange={(e) => setDraft((p) => ({ ...p, author: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">发布时间</label>
              <Input value={draft.publishedDate || ""} placeholder="2026-07-01" onChange={(e) => setDraft((p) => ({ ...p, publishedDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">更新时间</label>
              <Input value={draft.modifiedDate || ""} placeholder="2026-07-18" onChange={(e) => setDraft((p) => ({ ...p, modifiedDate: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">评分模式</label>
              <div className="flex overflow-hidden rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setGeoMode("general")}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    geoMode === "general" ? "bg-emerald-500 text-black" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  通用
                </button>
                <button
                  type="button"
                  onClick={() => setGeoMode("b2b")}
                  className={`flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors ${
                    geoMode === "b2b" ? "bg-emerald-500 text-black" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Building2 className="h-3 w-3" /> B2B 企业
                </button>
              </div>
            </div>
            {geoMode === "b2b" && (
              <p className="rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300/90">
                将额外评估「B2B 转化信号」（产品规格 / 客户实证 / 资质信任 / 转化路径 / 选型对比），更贴合面向企业客户的官网与商单内容。
              </p>
            )}
          </div>

          <Button onClick={handleAnalyze} disabled={loading} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "分析中…" : "开始 GEO 分析"}
          </Button>

          <div className="space-y-1.5">
            <Button
              onClick={handleAiDiagnose}
              disabled={!aiReady || aiLoading}
              className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:from-violet-400 hover:to-fuchsia-400 disabled:from-muted disabled:to-muted disabled:text-muted-foreground"
            >
              {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {aiLoading ? "AI 诊断中…" : "AI 增强诊断"}
            </Button>
            {!aiReady && (
              <p className="text-center text-xs text-muted-foreground">
                AI 增强需启动后端服务（npm run server）
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 结果区 */}
      {result ? (
        <div className="space-y-6">
          {/* 概览 */}
          <Card>
            <CardContent className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-center">
              <ScoreRing score={result.overall} grade={result.grade} />
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-lg font-semibold">{result.extractedTitle}</h3>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">来源：{result.source === "url" ? "网址" : "粘贴内容"}</Badge>
                    <Badge variant="secondary">{result.wordCount} 字</Badge>
                    <Badge variant="secondary">约 {result.readingTimeMin} 分钟读完</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {result.dimensions.map((d) => (
                    <ScoreBar key={d.key} score={d.score} label={d.label} weight={d.weight} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 优先建议 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-emerald-400" /> 优先优化建议
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {result.topSuggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-400">
                      {i + 1}
                    </span>
                    <span className="text-foreground/90">{s}</span>
                  </li>
                ))}
              </ol>
              <Separator className="my-4" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onSave(result)}>
                  <Save className="mr-1 h-3.5 w-3.5" /> 保存到看板
                </Button>
                <Button size="sm" variant="outline" onClick={() => onGoto("generator")}>
                  <FileText className="mr-1 h-3.5 w-3.5" /> 生成 llms.txt
                </Button>
                <Button size="sm" variant="outline" onClick={() => onGoto("rewriter")}>
                  <Wand2 className="mr-1 h-3.5 w-3.5" /> 改写内容
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 维度明细 */}
          <div className="space-y-3">
            {result.dimensions.map((d) => {
              const open = openDim === d.key
              return (
                <Card key={d.key}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpenDim(open ? null : d.key)}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{d.label}</span>
                      <Badge variant={d.score >= 72 ? "default" : d.score >= 58 ? "secondary" : "destructive"}>{d.score}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{open ? "收起" : "展开明细"}</span>
                  </button>
                  {open && (
                    <CardContent className="space-y-3 border-t pt-4 text-sm">
                      <p className="text-muted-foreground">{d.summary}</p>
                      {d.strengths.length > 0 && (
                        <div className="space-y-1">
                          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 优势
                          </p>
                          <ul className="list-disc space-y-0.5 pl-5 text-foreground/85">
                            {d.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {d.issues.length > 0 && (
                        <div className="space-y-1">
                          <p className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5" /> 问题
                          </p>
                          <ul className="list-disc space-y-0.5 pl-5 text-foreground/85">
                            {d.issues.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {d.suggestions.length > 0 && (
                        <div className="space-y-1">
                          <p className="flex items-center gap-1 text-xs font-semibold text-sky-400">
                            <Lightbulb className="h-3.5 w-3.5" /> 建议
                          </p>
                          <ul className="list-disc space-y-0.5 pl-5 text-foreground/85">
                            {d.suggestions.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>

          {/* AI 深度诊断 */}
          {aiResult && (
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-violet-400" /> AI 深度诊断
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="rounded-lg bg-foreground/5 p-3 text-sm leading-relaxed text-foreground/90">
                  {aiResult.summary}
                </p>

                {aiResult.strengths.length > 0 && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 优势
                    </p>
                    <ul className="space-y-0.5">
                      {aiResult.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground/85">
                          <span className="text-emerald-400">✓</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiResult.gaps.length > 0 && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> 差距 / 风险
                    </p>
                    <ul className="space-y-0.5">
                      {aiResult.gaps.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground/85">
                          <span className="text-amber-400">⚠</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiResult.actions.length > 0 && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-xs font-semibold text-sky-400">
                      <Lightbulb className="h-3.5 w-3.5" /> 可执行动作
                    </p>
                    <ol className="space-y-1">
                      {aiResult.actions.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground/85">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-400">
                            {i + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {aiResult.sampleQuestions.length > 0 && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1 text-xs font-semibold text-foreground/70">
                      <Sparkles className="h-3.5 w-3.5 text-violet-400" /> 目标用户可能这样问 AI
                    </p>
                    <ul className="space-y-1">
                      {aiResult.sampleQuestions.map((s, i) => (
                        <li key={i} className="rounded-md bg-foreground/5 px-2.5 py-1.5 text-sm text-foreground/85">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="flex h-full min-h-[300px] items-center justify-center border-dashed">
          <div className="text-center text-muted-foreground">
            <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm">输入内容后点击「开始 GEO 分析」</p>
            <p className="mt-1 text-xs">系统将从 8 个维度评估内容被 AI 引擎理解、检索与引用的就绪度</p>
          </div>
        </Card>
      )}
    </div>
  )
}
