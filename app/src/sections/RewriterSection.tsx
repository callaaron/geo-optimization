import { useState, useEffect } from "react"
import { rewriteContent } from "@/lib/geo/rewriter"
import type { RewriteResult } from "@/lib/geo/rewriter"
import type { GeoInput } from "@/types/geo"
import { aiHealth, aiRewrite } from "@/lib/ai/client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toast } from "sonner"
import { Copy, Download, Wand2, CheckCircle2, ListTodo, Sparkles, Loader2 } from "lucide-react"

type RewriteMode = "rule" | "ai"

interface Props {
  draft: GeoInput
  setDraft: (updater: (prev: GeoInput) => GeoInput) => void
}

export function RewriterSection({ draft, setDraft }: Props) {
  const [out, setOut] = useState<RewriteResult | null>(null)
  const [mode, setMode] = useState<RewriteMode>("rule")
  const [aiReady, setAiReady] = useState(false)
  const [aiChecked, setAiChecked] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    aiHealth()
      .then((h) => setAiReady(h.ok && h.configured))
      .catch(() => setAiReady(false))
      .finally(() => setAiChecked(true))
  }, [])

  async function handleRewrite() {
    if (!draft.text.trim() && !draft.html) {
      toast.error("请先输入内容")
      return
    }

    if (mode === "ai") {
      if (!aiReady) {
        toast.error("AI 改写不可用：需启动后端服务（npm run server）")
        return
      }
      setAiLoading(true)
      try {
        const aiResult = await aiRewrite({ text: draft.text, title: draft.title })
        const result: RewriteResult = {
          rewrittenMarkdown: aiResult.rewrittenMarkdown,
          tldr: aiResult.tldr,
          faq: aiResult.faq,
          definitions: aiResult.definitions,
          statSentences: [],
          applied: aiResult.changes,
          pending: [],
        }
        setOut(result)
        toast.success("已用 AI 生成改写版本")
      } catch (err) {
        toast.error(String((err as Error).message))
      } finally {
        setAiLoading(false)
      }
      return
    }

    setOut(rewriteContent(draft))
    toast.success("已生成 AI 友好版本")
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("已复制改写结果")
    } catch {
      toast.error("复制失败")
    }
  }

  function download() {
    if (!out) return
    const blob = new Blob([out.rewrittenMarkdown], { type: "text/markdown;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "geo-rewritten.md"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-emerald-400" /> 内容源
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={draft.text}
            onChange={(e) => setDraft((p) => ({ ...p, text: e.target.value }))}
            placeholder="粘贴文章正文"
            className="min-h-[200px] resize-y font-mono text-xs"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">标题</label>
              <Input value={draft.title || ""} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">作者</label>
              <Input value={draft.author || ""} onChange={(e) => setDraft((p) => ({ ...p, author: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as RewriteMode)}
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-2"
              aria-label="改写模式"
            >
              <ToggleGroupItem value="rule" className="w-full">
                <Wand2 className="h-3.5 w-3.5" /> 规则改写
              </ToggleGroupItem>
              <ToggleGroupItem value="ai" className="w-full" disabled={!aiReady}>
                <Sparkles className="h-3.5 w-3.5" /> AI 改写
              </ToggleGroupItem>
            </ToggleGroup>
            {aiChecked && !aiReady && (
              <p className="text-xs text-muted-foreground">AI 改写需启动后端服务（npm run server）。</p>
            )}
          </div>

          <Button
            onClick={handleRewrite}
            disabled={aiLoading}
            className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
          >
            {aiLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {mode === "ai" ? "用 AI 改写为友好版本" : "改写为 AI 友好版本"}
          </Button>
          <p className="text-xs text-muted-foreground">
            自动生成 TL;DR、关键数据锚点、实体定义与 FAQ，并将全文重排为易被 AI 引擎引用/直接作答的结构。
          </p>
        </CardContent>
      </Card>

      <div>
        {out ? (
          <Tabs defaultValue="md" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="md" className="text-xs">改写全文</TabsTrigger>
              <TabsTrigger value="faq" className="text-xs">FAQ</TabsTrigger>
              <TabsTrigger value="def" className="text-xs">定义</TabsTrigger>
              <TabsTrigger value="todo" className="text-xs">待办</TabsTrigger>
            </TabsList>

            <TabsContent value="md">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">改写后 Markdown</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(out.rewrittenMarkdown)}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> 复制
                    </Button>
                    <Button size="sm" variant="outline" onClick={download}>
                      <Download className="mr-1 h-3.5 w-3.5" /> 下载
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[520px] overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
                    <code>{out.rewrittenMarkdown}</code>
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="faq">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">自动生成 FAQ（{out.faq.length}）</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {out.faq.map((f, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <p className="text-sm font-semibold text-emerald-400">{f.q}</p>
                      <p className="mt-1 text-sm text-foreground/85">{f.a}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="def">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">实体定义（{out.definitions.length}）</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {out.definitions.length ? (
                    out.definitions.map((d, i) => (
                      <div key={i} className="rounded-lg border p-3 text-sm">
                        <span className="font-semibold">{d.term}</span>：{d.def}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">未检测到「X 是指 Y」式定义句，可在正文中补充以提升实体锚点。</p>
                  )}
                  {out.statSentences.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-2 text-xs font-semibold text-sky-400">关键数据锚点</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/85">
                        {out.statSentences.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="todo">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" /> 已自动应用
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/85">
                      {out.applied.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ListTodo className="h-4 w-4 text-amber-400" /> 待人工处理
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {out.pending.length ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/85">
                        {out.pending.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">AI 已完成主要改写，无需额外人工处理。</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="flex h-full min-h-[300px] items-center justify-center border-dashed">
            <div className="text-center text-muted-foreground">
              <Wand2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">点击「改写为 AI 友好版本」</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
