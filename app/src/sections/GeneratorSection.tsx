import { useState } from "react"
import { generateAssets } from "@/lib/geo/llmstxt"
import type { GeoInput } from "@/types/geo"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { toast } from "sonner"
import { Copy, Download, FileCode2 } from "lucide-react"

interface Props {
  draft: GeoInput
  setDraft: (updater: (prev: GeoInput) => GeoInput) => void
  sub?: string
}

export function GeneratorSection({ draft, setDraft, sub }: Props) {
  const [assets, setAssets] = useState<ReturnType<typeof generateAssets> | null>(null)
  const activeTab = sub === "llms" ? "llms" : "schema"

  function handleGenerate() {
    if (!draft.text.trim() && !draft.html) {
      toast.error("请先输入内容（粘贴正文或经分析器抓取网址）")
      return
    }
    setAssets(generateAssets(draft))
    toast.success("已生成部署产物")
  }

  async function copy(text: string, name: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${name} 已复制`)
    } catch {
      toast.error("复制失败，请手动选择")
    }
  }

  function download(text: string, filename: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const files: { key: string; label: string; content: string; file: string }[] = assets
    ? [
        { key: "llms", label: "llms.txt", content: assets.llmsTxt, file: "llms.txt" },
        { key: "full", label: "llms-full.txt", content: assets.llmsFullTxt, file: "llms-full.txt" },
        { key: "jsonld", label: "JSON-LD", content: assets.jsonLd, file: "structured-data.jsonld" },
        { key: "robots", label: "robots.txt", content: assets.robotsTxt, file: "robots.txt" },
        { key: "meta", label: "meta 标签", content: assets.metaTags, file: "meta.html" },
      ]
    : []

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode2 className="h-4 w-4 text-emerald-400" /> 内容源
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={draft.text}
            onChange={(e) => setDraft((p) => ({ ...p, text: e.target.value }))}
            placeholder="粘贴文章正文，或先在「分析器」抓取网址后会自动带入"
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
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">网址</label>
              <Input value={draft.url || ""} onChange={(e) => setDraft((p) => ({ ...p, url: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">发布时间</label>
              <Input value={draft.publishedDate || ""} onChange={(e) => setDraft((p) => ({ ...p, publishedDate: e.target.value }))} />
            </div>
          </div>
          <Button onClick={handleGenerate} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
            生成 GEO 部署产物
          </Button>
          <p className="text-xs text-muted-foreground">
            生成符合 llms.txt 规范的摘要文件、Article 结构化数据、robots 与 meta 标签，部署后便于 ChatGPT / Perplexity / 豆包等引擎直接读取。
          </p>
        </CardContent>
      </Card>

      <div>
        {assets ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">部署产物</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={activeTab} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  {files.map((f) => (
                    <TabsTrigger key={f.key} value={f.key} className="text-xs">
                      {f.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {files.map((f) => (
                  <TabsContent key={f.key} value={f.key}>
                    <div className="mb-2 flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => copy(f.content, f.label)}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> 复制
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => download(f.content, f.file)}>
                        <Download className="mr-1 h-3.5 w-3.5" /> 下载
                      </Button>
                    </div>
                    <pre className="max-h-[460px] overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
                      <code>{f.content}</code>
                    </pre>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex h-full min-h-[300px] items-center justify-center border-dashed">
            <div className="text-center text-muted-foreground">
              <FileCode2 className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">点击「生成 GEO 部署产物」</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
