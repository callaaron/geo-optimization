// 定时审计调度器 + 报告导出（参考 gego 的 scheduler + auto-geo 的 check CI）
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Clock, Calendar, FileDown, BarChart3 } from "lucide-react"

const SCHEDULE_PRESETS = [
  { key: "off", label: "手动", desc: "不自动运行，需手动点击「运行监测」" },
  { key: "daily", label: "每日", desc: "每天上午 9:00 自动审计" },
  { key: "weekly", label: "每周", desc: "每周一上午 9:00 自动审计" },
] as const

export default function SchedulerPanel() {
  const [schedule, setSchedule] = useState("off")
  const [exporting, setExporting] = useState(false)
  const [csvExporting, setCsvExporting] = useState(false)

  const handleExportReport = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/projects")
      const j = await res.json()
      if (!j.ok || !j.data?.length) { toast.error("没有可导出的项目数据"); return }
      const pid = j.data[0].id
      const r2 = await fetch("/api/geo/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: pid }) })
      const j2 = await r2.json()
      if (j2.ok && j2.data?.html) {
        const blob = new Blob([j2.data.html], { type: "text/html" })
        const url = URL.createObjectURL(blob)
        window.open(url, "_blank")
        toast.success("诊断报告已生成")
      } else {
        toast.error("该项目的审计记录为空")
      }
    } catch (e: any) { toast.error(e.message) }
    finally { setExporting(false) }
  }

  const handleExportCSV = async () => {
    setCsvExporting(true)
    try {
      const res = await fetch("/api/metrics")
      const j = await res.json()
      if (!j.ok || !j.data) { toast.error("没有数据"); return }
      const m = j.data
      const rows = [["Query","品牌","认知层级","评分"], ...(m.perQueryScores || []).map((q: any) => [q.query, q.brand, q.levelLabel, q.score])]
      const csv = rows.map((r: any[]) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = `geo-report-${new Date().toISOString().slice(0,10)}.csv`; a.click()
      toast.success("CSV 已导出")
    } catch (e: any) { toast.error(e.message) }
    finally { setCsvExporting(false) }
  }

  return (
    <div className="space-y-4">
      {/* 定时调度 */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />定时审计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_PRESETS.map(p => (
              <button key={p.key}
                onClick={() => { setSchedule(p.key); toast.success(`已设为「${p.label}」模式`) }}
                className={`rounded-lg border px-3 py-2 text-left transition-all ${
                  schedule === p.key ? "border-primary/40 bg-primary/5" : "border-border/40 hover:border-border"
                }`}>
                <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-medium">{p.label}</span><Switch checked={schedule === p.key && p.key !== "off"} className="scale-75 ml-1" /></div>
                <p className="text-[10px] text-muted-foreground mt-1">{p.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 报告导出 */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><FileDown className="h-4 w-4 text-primary" />报告导出</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleExportReport} disabled={exporting}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />{exporting ? "生成中…" : "HTML 诊断报告"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={csvExporting}>
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />{csvExporting ? "导出中…" : "CSV 数据导出"}
          </Button>
          <p className="w-full text-[10px] text-muted-foreground mt-1">HTML 报告为可打印的完整诊断页；CSV 包含全部 Query 级认知数据</p>
        </CardContent>
      </Card>
    </div>
  )
}
