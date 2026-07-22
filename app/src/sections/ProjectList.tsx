// v3.x 项目管理：列表展示所有项目 + 最近审计摘要 + 快速跳转
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Radar, TrendingUp, Building2, Trash2 } from "lucide-react"

interface ProjectItem {
  id: string; brand: string; domain: string
  competitors: string[]; queries: string[]
  audits: any[]; createdAt: string; updatedAt: string
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/projects")
      .then(r => r.json())
      .then(j => { if (j.ok) setProjects(j.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    if (!confirm("确定删除此项目？所有审计记录将一并清除。")) return
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" })
      const j = await r.json()
      if (j.ok) {
        setProjects(prev => prev.filter(p => p.id !== id))
        toast.success("项目已删除")
      } else { toast.error("删除失败") }
    } catch (e: any) { toast.error(e.message) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="ml-2 text-sm text-muted-foreground">加载项目…</span>
    </div>
  )

  if (projects.length === 0) return (
    <Card className="border-border/40">
      <CardContent className="flex flex-col items-center py-12 gap-2">
        <Building2 className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">暂无项目</p>
        <p className="text-xs text-muted-foreground">请前往「监测审计 → 运行监测」创建第一个项目</p>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {projects.map(p => {
        const latest = p.audits?.length ? p.audits[p.audits.length - 1] : null
        return (
          <Card key={p.id} className="border-border/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">{p.brand}</CardTitle>
                  {p.domain && <span className="text-xs text-muted-foreground">{p.domain}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {latest && (
                    <Badge className="text-xs" variant={
                      latest.aiCitationRate > 30 ? "default" : "secondary"
                    } style={latest.aiCitationRate > 30 ? { background: "#10b98122", color: "#10b981" } : {}}>
                      引用率 {latest.aiCitationRate}%
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">监测 Query（{p.queries?.length || 0}）</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {p.queries?.slice(0, 5).join(" · ") || "—"}
                    {(p.queries?.length || 0) > 5 && "…"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">竞品（{p.competitors?.length || 0}）</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {p.competitors?.join(" · ") || "—"}
                  </p>
                </div>
              </div>
              {latest && (
                <div className="mt-3 flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  <span>最近审计：{new Date(latest.timestamp).toLocaleDateString("zh-CN")}</span>
                  <span>可见度 {latest.serpVisibility}%</span>
                  <span>·</span>
                  <span>{latest.totalQueries} 条 query</span>
                </div>
              )}
              {!latest && (
                <p className="mt-3 text-xs text-muted-foreground">尚无审计记录，请前往「监测审计」运行</p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
