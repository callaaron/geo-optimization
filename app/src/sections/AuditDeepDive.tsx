// 审计深度分析面板：实体密度、引用质量、竞品矩阵（参考 auto-geo doctor 8 项检查 + gego 关键词×域名矩阵）
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, Hash, Link2, Shield, Users } from "lucide-react"
import type { GeoAuditResult } from "@/lib/ai/client"

function countEntities(text: string): number {
  if (!text) return 0
  // 中文公司/品牌/产品模式
  const cn = text.match(/[\u4e00-\u9fff]{2,8}(公司|品牌|产品|平台|厂家|企业|集团|科技)/g) || []
  // 英文品牌/缩写
  const en = text.match(/\b[A-Z][a-z]+( [A-Z][a-z]+)*\b/g) || []
  // 数字+单位（数据锚点）
  const nums = text.match(/\d+[万亿千百%个件元年月日℃]/g) || []
  return cn.length + en.length + nums.length
}

function countLinks(text: string): number {
  if (!text) return 0
  return (text.match(/https?:\/\/[^\s]+/g) || []).length
}

export default function AuditDeepDive({ result }: { result: GeoAuditResult | null }) {
  if (!result) return (
    <Card className="border-dashed border-border/50">
      <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
        <Shield className="h-8 w-8 text-muted-foreground/25" />
        <p className="text-sm text-muted-foreground">运行一次引用审计后，此处将展示深度分析</p>
      </CardContent>
    </Card>
  )

  const { perQuery = [], topCompetitors = [] } = result
  const totalQueries = perQuery.length
  const directMentions = perQuery.filter(q => q.level === "direct").length
  const indirectMentions = perQuery.filter(q => q.level === "indirect").length
  const avgEntities = perQuery.length > 0 ? Math.round(perQuery.reduce((s, q) => s + countEntities(q.aiAnswer || ""), 0) / perQuery.length) : 0
  const avgLinks = perQuery.length > 0 ? Math.round(perQuery.reduce((s, q) => s + countLinks(q.aiAnswer || ""), 0) / perQuery.length) : 0
  const serpHitRate = totalQueries > 0 ? Math.round(perQuery.filter(q => q.inSerp).length / totalQueries * 100) : 0

  return (
    <div className="space-y-4">
      {/* KPI 行 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="border-border/40">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400"><Hash className="h-4 w-4" /></div>
            <div><p className="text-xs text-muted-foreground">直接引用</p><p className="text-xl font-bold text-emerald-400">{directMentions}<span className="text-xs font-normal text-muted-foreground">/{totalQueries}</span></p></div>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><Shield className="h-4 w-4" /></div>
            <div><p className="text-xs text-muted-foreground">间接提及</p><p className="text-xl font-bold text-blue-400">{indirectMentions}<span className="text-xs font-normal text-muted-foreground">/{totalQueries}</span></p></div>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400"><BarChart3 className="h-4 w-4" /></div>
            <div><p className="text-xs text-muted-foreground">SERP 命中</p><p className="text-xl font-bold text-violet-400">{serpHitRate}<span className="text-sm font-normal text-muted-foreground">%</span></p></div>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400"><Users className="h-4 w-4" /></div>
            <div><p className="text-xs text-muted-foreground">实体密度</p><p className="text-xl font-bold text-amber-400">{avgEntities}<span className="text-xs font-normal text-muted-foreground"> 平均</span></p></div>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400"><Link2 className="h-4 w-4" /></div>
            <div><p className="text-xs text-muted-foreground">链接密度</p><p className="text-xl font-bold text-rose-400">{avgLinks}<span className="text-xs font-normal text-muted-foreground"> 平均</span></p></div>
          </CardContent>
        </Card>
      </div>

      {/* Query 级明细 */}
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-base">逐条审计深度</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
              <th className="text-left py-2 px-4 font-medium">Query</th>
              <th className="text-center py-2 px-3 w-24 font-medium">引用层级</th>
              <th className="text-center py-2 px-3 w-20 font-medium">实体数</th>
              <th className="text-center py-2 px-3 w-16 font-medium">链接</th>
              <th className="text-center py-2 px-3 w-24 font-medium">SERP</th>
            </tr></thead>
            <tbody>
              {perQuery.map((q, i) => (
                <tr key={i} className="border-b border-border/20 hover:bg-muted/20">
                  <td className="py-2 px-4 max-w-md truncate">{q.query}</td>
                  <td className="py-2 px-3 text-center">
                    <Badge variant="outline" className={`text-xs h-5 border-0 ${
                      q.level === "direct" ? "bg-emerald-500/10 text-emerald-400" :
                      q.level === "indirect" ? "bg-blue-500/10 text-blue-400" :
                      q.level === "triggerable" ? "bg-amber-500/10 text-amber-400" : "bg-muted text-muted-foreground"
                    }`}>{q.levelLabel || q.level || "未提及"}</Badge>
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-amber-400">{countEntities(q.aiAnswer || "")}</td>
                  <td className="py-2 px-3 text-center font-mono text-rose-400">{countLinks(q.aiAnswer || "")}</td>
                  <td className="py-2 px-3 text-center">{q.inSerp ? <span className="text-emerald-400">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 竞品矩阵 */}
      {topCompetitors.length > 0 && (
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-base">竞品提及分布</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {topCompetitors.map((c, i) => (
                <Badge key={i} variant="outline" className="text-sm py-2 px-3 border-border/60">
                  {c.name} <span className="ml-1.5 text-primary font-bold">{c.count || 0}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
