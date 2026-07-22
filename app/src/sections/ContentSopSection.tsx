// 七块 SOP 内容优化器（参考 auto-geo: doctor → write → check 闭环）
// 每一块对应 GEO 优化页面架构中的一个标准组件
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Sparkles, Copy, ChevronDown, ChevronRight, FileText, ListChecks, Link2, MessageCircle, Info, BookOpen } from "lucide-react"

const SOP_BLOCKS = [
  { id: "tldr", icon: FileText, label: "TL;DR 答案胶囊", desc: "40-60 词的直接答案，AI 引擎优先抓取", color: "emerald" },
  { id: "intro", icon: BookOpen, label: "Intro 介绍段落", desc: "背景与上下文设定", color: "blue" },
  { id: "sections", icon: ListChecks, label: "主体段落", desc: "H2 问题格式标题 + 答案胶囊先行 + 展开段落", color: "violet" },
  { id: "guides", icon: Link2, label: "相关指南", desc: "4-8 条内部链接，提升实体密度", color: "amber" },
  { id: "takeaways", icon: ListChecks, label: "关键要点", desc: "4-6 条声明性结论", color: "rose" },
  { id: "faq", icon: MessageCircle, label: "FAQ 问答", desc: "3-10 对问答，每答 40-60 词，Schema 驱动", color: "cyan" },
  { id: "disclosure", icon: Info, label: "声明与来源", desc: "时间戳、发布者、引用来源", color: "gray" },
]
export default function ContentSopSection() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ tldr: true })
  const [topic, setTopic] = useState("")
  const [generating, setGenerating] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<Record<string, string>>({})

  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const generateBlock = async (blockId: string) => {
    if (!topic.trim()) { toast.error("请先输入目标话题或查询词"); return }
    setGenerating(blockId)
    try {
      const block = SOP_BLOCKS.find(b => b.id === blockId)!
      const res = await fetch("/api/ai/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `请为以下话题生成 GEO 优化页面的&laquo;${block.label}&raquo;块。话题：${topic}。要求：${block.desc}。只输出内容，不要包含任何其他解释。`,
          format: blockId,
        }),
      })
      const j = await res.json()
      if (j.ok) {
        setBlocks(b => ({ ...b, [blockId]: j.data?.text || j.data?.html || "" }))
        toast.success(`「${block.label}」已生成`)
      } else {
        toast.error(j.error || "生成失败")
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setGenerating(null)
    }
  }

  const handleCopyAll = () => {
    const full = SOP_BLOCKS.map(b => `## ${b.label}\n\n${blocks[b.id] || "（待生成）"}`).join("\n\n---\n\n")
    navigator.clipboard.writeText(full).then(() => toast.success("已复制全部内容到剪贴板"))
  }

  const generatedCount = Object.values(blocks).filter(Boolean).length

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            七块 SOP 内容生成器
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            参考 auto-geo 七块页面架构：结构化块 &gt; 长篇叙事 · 答案胶囊先行 · Schema 驱动实体密度
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{generatedCount}/{SOP_BLOCKS.length} 块已生成</Badge>
          {generatedCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              <Copy className="mr-1 h-3.5 w-3.5" />导出全部
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 话题输入 */}
        <div className="flex gap-2">
          <Input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="输入目标关键词或用户查询，如：谐波减速机哪个品牌好"
            className="flex-1"
          />
          <Button size="sm" disabled={!topic.trim() || !!generating}
            onClick={() => SOP_BLOCKS.forEach(b => generateBlock(b.id))}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {generating ? "生成中…" : "一键生成全部"}
          </Button>
        </div>

        {/* 七个 SOP 块 */}
        <div className="space-y-2">
          {SOP_BLOCKS.map(block => {
            const isOpen = expanded[block.id]
            const content = blocks[block.id]
            const isGen = generating === block.id
            const Icon = block.icon
            return (
              <div key={block.id} className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggle(block.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-${block.color}-500/10 text-${block.color}-500`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{block.label}</p>
                    <p className="text-xs text-muted-foreground">{block.desc}</p>
                  </div>
                  {content && <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-0">已生成</Badge>}
                  {isGen && <Sparkles className="h-4 w-4 text-primary animate-pulse" />}
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    {content ? (
                      <div className="rounded-lg bg-muted/30 p-3">
                        <pre className="text-sm whitespace-pre-wrap font-sans">{content}</pre>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">尚未生成。点击右侧按钮通过 AI 生成。</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => generateBlock(block.id)} disabled={!!generating}>
                        {isGen ? <Sparkles className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                        {isGen ? "生成中…" : content ? "重新生成" : "AI 生成"}
                      </Button>
                      {content && (
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(content); toast.success("已复制") }}>
                          <Copy className="mr-1 h-3 w-3" />复制
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
