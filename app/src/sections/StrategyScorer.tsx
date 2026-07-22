// Princeton GEO 9 策略评分器（参考 Aggarwal et al., 2023: https://arxiv.org/abs/2311.09735）
// 输入文本 → 逐策略打分(0-100) → GEO 总分 → 优化建议
import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Zap, Loader2 } from "lucide-react"

// Princeton 9 策略 + 权重（基于论文实测效果排序）
const STRATEGIES = [
  { key: "statistics",    label: "统计数据",   weight: 0.22, desc: "具体数字、百分比、量化指标",        icon: "📊", color: "emerald" },
  { key: "citations",     label: "引用来源",   weight: 0.18, desc: "内联引用权威文献/研究/报告",        icon: "📖", color: "blue" },
  { key: "quotations",    label: "专家引语",   weight: 0.16, desc: "名人/专家/CEO 的直接引语",           icon: "💬", color: "violet" },
  { key: "authoritative", label: "权威语调",   weight: 0.12, desc: "自信、明确、无模糊词汇的表达",        icon: "🎯", color: "amber" },
  { key: "technical",     label: "技术术语",   weight: 0.10, desc: "领域专用词汇和行业术语密度",          icon: "⚙️", color: "rose" },
  { key: "fluency",       label: "流畅可读",   weight: 0.08, desc: "句子简短、段落透气、衔接自然",        icon: "✨", color: "cyan" },
  { key: "unique",        label: "独特词汇",   weight: 0.06, desc: "与其他来源的语义差异化",             icon: "🏷️", color: "orange" },
  { key: "easy",          label: "易于理解",   weight: 0.04, desc: "避免过度专业化的表述",               icon: "💡", color: "lime" },
  { key: "keywords",      label: "关键词",     weight: 0.04, desc: "核心查询词自然嵌入 ⚠️避免堆砌",       icon: "🔑", color: "gray" },
]

// ── 评分逻辑（客户端纯计算，零 API 调用）──
function scoreText(text: string): Record<string, number> {
  if (!text || text.length < 30) return Object.fromEntries(STRATEGIES.map(s => [s.key, 0]))
  const sentences = text.split(/[。！？.!?\n]+/).filter(Boolean)
  const words = text.match(/[\u4e00-\u9fff]+|[a-zA-Z]+/g) || []
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size

  return {
    statistics: Math.min(100, Math.round(((text.match(/\d+[万亿千百%个件元年月日℃]|\d+\.?\d*%/g) || []).length / Math.max(sentences.length, 1)) * 100)),
    citations: Math.min(100, Math.round(((text.match(/根据|据|来源|引用|报告|研究|论文/g) || []).length / Math.max(sentences.length / 3, 1)) * 100)),
    quotations: Math.min(100, Math.round(((text.match(/[""「」]|表示|指出|认为|说/g) || []).length / Math.max(sentences.length / 2, 1)) * 80)),
    authoritative: 100 - Math.min(100, Math.round(((text.match(/可能|或许|大概|也许|似乎|应该|可以/g) || []).length / Math.max(sentences.length, 1)) * 200)),
    technical: Math.min(100, Math.round((words.filter(w => w.length >= 5 && /^[A-Z]/.test(w)).length / Math.max(words.length, 1)) * 300)),
    fluency: Math.min(100, Math.round((sentences.filter(s => s.length >= 15 && s.length <= 80).length / Math.max(sentences.length, 1)) * 100)),
    unique: Math.min(100, Math.round((uniqueWords / Math.max(words.length, 1)) * 150)),
    easy: Math.min(100, Math.round((sentences.filter(s => s.length >= 8 && s.length <= 50).length / Math.max(sentences.length, 1)) * 100)),
    keywords: Math.min(100, Math.round(((words.filter(w => w.length >= 2).length - uniqueWords) / Math.max(words.length, 1)) * 30 + 40)),
  }
}

function pillarScores(s: Record<string, number>) {
  return {
    structure: Math.round(s.authoritative * 0.35 + s.fluency * 0.30 + s.easy * 0.20 + s.unique * 0.15),
    content:   Math.round(s.statistics * 0.35 + s.citations * 0.30 + s.quotations * 0.20 + s.technical * 0.15),
    authority: Math.round(s.citations * 0.40 + s.quotations * 0.30 + s.authoritative * 0.30),
    access:    Math.round(s.fluency * 0.50 + s.easy * 0.50),
  }
}

export default function StrategyScorer() {
  const [text, setText] = useState("")
  const scores = useMemo(() => scoreText(text), [text])
  const pillars = useMemo(() => pillarScores(scores), [scores])
  const geoScore = useMemo(() => Math.round(STRATEGIES.reduce((sum, st) => sum + (scores[st.key] || 0) * st.weight, 0)), [scores])

  const levelColor = geoScore >= 70 ? "text-emerald-400" : geoScore >= 40 ? "text-amber-400" : "text-red-400"
  const levelLabel = geoScore >= 70 ? "优秀" : geoScore >= 40 ? "一般" : "需优化"
  const hasText = text.trim().length >= 30

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            GEO 策略评分器
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">基于 Princeton 论文 9 策略 + 四根支柱模型，自动评分</p>
        </div>
        {hasText && (
          <div className="text-right">
            <p className={`text-2xl font-bold ${levelColor}`}>{geoScore}</p>
            <Badge variant="outline" className={`text-xs ${levelColor}`}>{levelLabel}</Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="在此粘贴要评分的页面内容或 AI 生成的内容…（至少 30 字）"
          rows={5}
          className="min-h-[100px]"
        />

        {hasText && (
          <>
            {/* 四根支柱 */}
            <div className="grid grid-cols-4 gap-3">
              {[{ label: "结构", score: pillars.structure, max: 40 },
                { label: "内容", score: pillars.content, max: 35 },
                { label: "权威", score: pillars.authority, max: 15 },
                { label: "可达", score: pillars.access, max: 10 }].map(p => (
                <Card key={p.label} className="border-border/40">
                  <CardContent className="p-3 text-center space-y-1">
                    <p className="text-xs text-muted-foreground">{p.label} <span className="text-[10px]">/{p.max}</span></p>
                    <p className="text-xl font-bold text-primary">{p.score}</p>
                    <Progress value={p.score / p.max * 100} className="h-1.5" />
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* 9 策略详情 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {STRATEGIES.map(st => (
                <div key={st.key} className="rounded-lg border border-border/40 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1">
                      <span>{st.icon}</span> {st.label}
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${
                      (scores[st.key] || 0) >= 70 ? "bg-emerald-500/10 text-emerald-400" :
                      (scores[st.key] || 0) >= 30 ? "bg-amber-500/10 text-amber-400" : "bg-muted text-muted-foreground"
                    }`}>
                      {scores[st.key] || 0}/100
                    </Badge>
                  </div>
                  <Progress value={scores[st.key] || 0} className="h-1.5" />
                  <p className="text-[10px] text-muted-foreground">{st.desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
