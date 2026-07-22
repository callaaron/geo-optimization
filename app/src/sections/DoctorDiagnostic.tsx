// 8 项 Doctor 诊断（对标 auto-geo doctor 命令）
// 检查页面是否具备被 AI 引擎引用的形态就绪度
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { Loader2, Link2, Check, X, AlertTriangle, Stethoscope } from "lucide-react"

const CHECKS = [
  { key: "tldr",       label: "TL;DR 答案胶囊",   weight: 15, desc: "页面开头是否有 40-60 词的直接答案",     fix: "在页面顶部添加一个简洁的答案段落，直接回答核心查询" },
  { key: "h2questions", label: "H2 问题格式标题",   weight: 15, desc: "H2 标题是否以用户查询的形式书写",       fix: "将 H2 标题改写为用户向 AI 提出的问题格式（如「XX品牌哪家好？」）" },
  { key: "schema",      label: "Schema JSON-LD",   weight: 15, desc: "是否包含 Article/FAQPage/Organization Schema", fix: "添加 FAQPage 和 Article Schema JSON-LD 到页面 head" },
  { key: "entities",    label: "实体密度",          weight: 15, desc: "命名实体（公司/品牌/产品/人名）的密度",     fix: "增加品牌名、产品名和行业术语的提及频率，并添加链接" },
  { key: "answerfirst",  label: "答案先行结构",      weight: 10, desc: "每节是否以答案开头再展开",               fix: "每节先写 40-60 词答案胶囊，再用 1-3 段展开" },
  { key: "faq",         label: "FAQ 结构",          weight: 10, desc: "是否包含 FAQ 问答区块（3-10对）",          fix: "添加 FAQ 区块，每答 40-60 词，配合 FAQPage Schema" },
  { key: "disclosure",  label: "来源声明",           weight: 10, desc: "是否有时间戳、发布者、引用来源",         fix: "添加发布日期、作者信息、数据来源引用" },
  { key: "images",      label: "图片节奏",           weight: 10, desc: "是否有图片且含 alt 描述文本",             fix: "每 300-500 词插入一张图片，并添加描述性 alt 文本" },
]

function checkPage(html: string): Record<string, { score: number; detail: string }> {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  const words = text.split(/\s+/).length
  const empty: Record<string, { score: number; detail: string }> = {}
  if (words < 20) { CHECKS.forEach(c => { empty[c.key] = { score: 0, detail: "内容不足" } }); return empty }

  const firstPara = text.slice(0, 300)
  return {
    tldr: { score: firstPara.length >= 80 && firstPara.length <= 400 ? 85 : firstPara.length >= 40 ? 60 : 20,
      detail: `首段 ${firstPara.length} 字${firstPara.length >= 80 && firstPara.length <= 400 ? '，符合 40-60 词标准' : firstPara.length >= 40 ? '，偏短' : '，过短或缺失'}` },
    h2questions: { score: (html.match(/<h2[^>]*>/gi) || []).length >= 2 ? 75 : (html.match(/<h2[^>]*>/gi) || []).length >= 1 ? 40 : 10,
      detail: `检测到 ${(html.match(/<h2[^>]*>/gi) || []).length} 个 H2 标题${(html.match(/[？?]/g) || []).length >= (html.match(/<h2[^>]*>/gi) || []).length ? '，含问号' : ''}` },
    schema: { score: html.includes("application/ld+json") ? 80 : html.includes("schema.org") ? 50 : 5,
      detail: html.includes("application/ld+json") ? "检测到 Schema JSON-LD" : html.includes("schema.org") ? "检测到 schema.org 引用" : "未检测到结构化数据" },
    entities: { score: Math.min(100, Math.round(((text.match(/[\u4e00-\u9fff]{2,8}(公司|品牌|产品|平台|厂家|集团|科技)/g) || []).length + (text.match(/\b[A-Z][a-z]+( [A-Z][a-z]+)*\b/g) || []).length) / Math.max(words / 50, 1) * 60)),
      detail: `检测到约 ${(text.match(/[\u4e00-\u9fff]{2,8}(公司|品牌|产品|平台|厂家|集团|科技)/g) || []).length} 个中文实体名` },
    answerfirst: { score: (text.match(/[。！？.!?\n]/g) || []).length >= 3 ? 65 : 30,
      detail: `${(text.match(/[。！？.!?\n]/g) || []).length} 个句子，结构${(text.match(/[。！？.!?\n]/g) || []).length >= 5 ? '较丰富' : '偏简略'}` },
    faq: { score: (html.match(/<h[23][^>]*>.*[？?].*<\/h[23]>/gi) || []).length >= 3 ? 80 : (html.match(/<h[23][^>]*>.*[？?].*<\/h[23]>/gi) || []).length >= 1 ? 40 : 10,
      detail: `检测到 ${(html.match(/<h[23][^>]*>.*[？?].*<\/h[23]>/gi) || []).length} 个 FAQ 式标题` },
    disclosure: { score: (text.match(/发布|更新|日期|来源|作者|202[0-9]/g) || []).length >= 3 ? 75 : (text.match(/202[0-9]/g) || []).length >= 1 ? 40 : 10,
      detail: `${(text.match(/202[0-9]/g) || []).length} 个日期/时间引用` },
    images: { score: (html.match(/<img[^>]+alt="[^"]+"/gi) || []).length >= 2 ? 80 : (html.match(/<img/gi) || []).length >= 1 ? (html.match(/<img[^>]+alt=/gi) || []).length >= 1 ? 50 : 30 : 10,
      detail: `${(html.match(/<img/gi) || []).length} 张图片，${(html.match(/<img[^>]+alt=/gi) || []).length} 张有 alt 文本` },
  }
}

export default function DoctorDiagnostic() {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [scores, setScores] = useState<Record<string, { score: number; detail: string }> | null>(null)

  const totalScore = scores ? Math.round(Object.entries(scores).reduce((sum, [k, v]) => sum + v.score * (CHECKS.find(c => c.key === k)?.weight || 0) / 100, 0)) : 0
  const grade = totalScore >= 70 ? "A" : totalScore >= 50 ? "B" : totalScore >= 30 ? "C" : "D"

  const run = async () => {
    if (!url.trim()) { toast.error("请输入页面 URL"); return }
    setLoading(true); setScores(null)
    try {
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)
      if (!res.ok && res.status !== 502) {
        // fallback: use a simple HEAD check + text extraction via our own /api/ai/analyze
        const res2 = await fetch(`/api/ai/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: url, type: "url" }) })
        const j2 = await res2.json()
        if (j2.ok && j2.data?.originalText) {
          setScores(checkPage(j2.data.originalText || ""))
        } else {
          toast.error("无法获取该页面内容")
        }
      } else {
        const html = await res.text()
        setScores(checkPage(html))
      }
    } catch {
      toast.error("获取页面失败，请检查 URL 是否正确")
    }
    finally { setLoading(false) }
  }

  // 手动输入 HTML 检测
  const handlePaste = async () => {
    try { const text = await navigator.clipboard.readText(); if (text) { setScores(checkPage(text)); toast.success("已分析剪贴板内容") } }
    catch { toast.error("无法读取剪贴板") }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" />Doctor 页面诊断</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">对标 auto-geo doctor：8 项引用就绪度检查，0-100 分</p>
        </div>
        {scores && (
          <div className="text-right"><p className={`text-2xl font-bold ${grade==="A"?"text-emerald-400":grade==="B"?"text-blue-400":"text-amber-400"}`}>{totalScore}</p><Badge variant="outline" className="text-xs">{grade} 级</Badge></div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="输入要诊断的页面 URL（如 https://example.com/product）" className="flex-1" />
          <Button size="sm" onClick={run} disabled={loading}>{loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}{loading ? "检测中" : "诊断"}</Button>
          <Button size="sm" variant="outline" onClick={handlePaste}>粘贴 HTML</Button>
        </div>

        {scores && (
          <div className="space-y-2">
            {CHECKS.map(c => {
              const s = scores[c.key]
              const pct = Math.round(s.score * c.weight / 100)
              const icon = s.score >= 70 ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : s.score >= 30 ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> : <X className="h-3.5 w-3.5 text-red-400" />
              return (
                <div key={c.key} className="rounded-lg border border-border/40 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {icon}
                      <span className="text-xs font-medium">{c.label}</span>
                      <Badge variant="outline" className={`text-[10px] h-4 ${s.score >= 70 ? "bg-emerald-500/10 text-emerald-400" : s.score >= 30 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>{s.score}/100</Badge>
                      <span className="text-[10px] text-muted-foreground">权重 {c.weight}·贡献 {pct}</span>
                    </div>
                  </div>
                  <Progress value={s.score} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground">{s.detail}</p>
                  {s.score < 70 && <p className="text-[10px] text-amber-400">💡 {c.fix}</p>}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
