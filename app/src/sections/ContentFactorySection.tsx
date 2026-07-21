import { useState } from "react"
import { aiGenerateContent, type ContentFormat, type ContentFormatResult } from "@/lib/ai/client"
import type { GeoInput } from "@/types/geo"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Copy,
  Download,
  FileText,
  MessageCircle,
  Video,
  LayoutTemplate,
  Loader2,
  Sparkles,
  Hash,
  Image as ImageIcon,
} from "lucide-react"

interface Props {
  draft: GeoInput
}

const FORMATS: {
  key: ContentFormat
  label: string
  icon: typeof FileText
  desc: string
  color: string
}[] = [
  { key: "article", label: "图文", icon: FileText, desc: "公众号 / 知乎长文", color: "text-sky-400" },
  { key: "social", label: "社媒", icon: MessageCircle, desc: "小红书 / 即刻种草", color: "text-rose-400" },
  { key: "video_script", label: "视频脚本", icon: Video, desc: "60s 口播", color: "text-amber-400" },
  { key: "landing", label: "落地页", icon: LayoutTemplate, desc: "官网 GEO 结构", color: "text-emerald-400" },
]

function copy(text: string) {
  try {
    navigator.clipboard.writeText(text)
    toast.success("已复制")
  } catch {
    toast.error("复制失败")
  }
}

function download(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function ContentFactorySection({ draft }: Props) {
  const [text, setText] = useState(draft.text || "")
  const [title, setTitle] = useState(draft.title || "")
  const [brand, setBrand] = useState("")
  const [format, setFormat] = useState<ContentFormat>("article")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ContentFormatResult | null>(null)

  async function generate() {
    if (!text.trim()) {
      toast.error("请先输入内容")
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const r = await aiGenerateContent({
        text: text.trim(),
        title: title.trim() || undefined,
        format,
        brand: brand.trim() || undefined,
      })
      setResult(r)
      toast.success(`已生成「${FORMATS.find((f) => f.key === format)?.label}」内容`)
    } catch (e) {
      toast.error(`生成失败：${(e as Error).message || "后端异常"}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_1fr]">
      {/* 输入区 */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-400" /> 内容源
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴文章正文 / 企业介绍 / 产品说明..."
            className="min-h-[160px] resize-y text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">标题（可选）</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：海鲜水饺代工厂家" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">品牌（可选）</label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="如：正岛食品" />
            </div>
          </div>

          {/* 格式选择 */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">输出形式</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => {
                const I = f.icon
                const active = format === f.key
                return (
                  <button
                    key={f.key}
                    onClick={() => setFormat(f.key)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                      active
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-border hover:border-emerald-500/30 hover:bg-muted/40"
                    }`}
                  >
                    <I className={`h-4 w-4 shrink-0 ${active ? f.color : "text-muted-foreground"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{f.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{f.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <Button onClick={generate} disabled={loading} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {loading ? "AI 生成中…" : "生成内容"}
          </Button>
        </CardContent>
      </Card>

      {/* 结果区 */}
      <div>
        {result ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                {FORMATS.find((f) => f.key === format)?.label} 成稿
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(JSON.stringify(result, null, 2))}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> 复制 JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ResultView format={format} r={result} />
            </CardContent>
          </Card>
        ) : (
          <Card className="flex h-full min-h-[300px] items-center justify-center border-dashed">
            <div className="px-6 text-center text-muted-foreground">
              <LayoutTemplate className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">选择输出形式并点击「生成内容」</p>
              <p className="mt-1 text-xs">AI 将按图文 / 社媒 / 视频脚本 / 落地页 之一产出成品</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/** 按格式分开展示结果 */
function ResultView({ format, r }: { format: ContentFormat; r: ContentFormatResult }) {
  const asMarkdown =
    format === "article"
      ? [r.title && `# ${r.title}`, r.subtitle && `> ${r.subtitle}`, r.content].filter(Boolean).join("\n\n")
      : format === "social"
        ? [r.title && `# ${r.title}`, r.content, r.imagePrompt && `\n*配图建议：${r.imagePrompt}*`].filter(Boolean).join("\n\n")
        : format === "video_script"
          ? [r.title && `# ${r.title}`, r.hook && `**Hook（前 3 秒）**：${r.hook}`, r.script && `**脚本**\n${r.script}`, r.duration && `**时长**：${r.duration}`, r.cta && `**CTA**：${r.cta}`].filter(Boolean).join("\n\n")
          : null

  if (format === "landing") {
    return (
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">页面标题</p>
            <p className="text-sm font-medium">{r.pageTitle || "—"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Schema 类型</p>
            <p className="text-sm font-medium">{r.schemaType || "—"}</p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Meta Description</p>
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">{r.metaDescription || "—"}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-400">页面区块</p>
          {(r.sections || []).map((s, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{s.type}</Badge>
                <span className="text-sm font-medium">{s.headline || s.title || ""}</span>
              </div>
              {s.subheadline && <p className="mt-1 text-xs text-muted-foreground">{s.subheadline}</p>}
              {s.items && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-foreground/85">
                  {s.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              )}
              {s.cta && <p className="mt-1 text-xs text-emerald-400">CTA：{s.cta}</p>}
            </div>
          ))}
        </div>
        {r.keyEntities && r.keyEntities.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">关键实体（建议标记 Schema）</p>
            <div className="flex flex-wrap gap-1.5">
              {r.keyEntities.map((e, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{e}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {r.title && format !== "article" && (
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold">{r.title}</h3>
          {r.tags && r.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {r.tags.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  <Hash className="mr-0.5 h-2.5 w-2.5" />
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      {r.imagePrompt && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
          <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <span><span className="text-muted-foreground">配图建议：</span>{r.imagePrompt}</span>
        </div>
      )}
      {asMarkdown && (
        <>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => download(asMarkdown, `geo-${format}.md`)}>
              <Download className="mr-1 h-3.5 w-3.5" /> 下载
            </Button>
          </div>
          <pre className="max-h-[520px] overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
            <code>{asMarkdown}</code>
          </pre>
        </>
      )}
    </div>
  )
}
