// 定时审计调度器 + 飞书通知 + 报告导出（对接后端 node-cron）
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Clock, Calendar, FileDown, BarChart3, Bell, Webhook } from "lucide-react"

const SCHEDULE_PRESETS = [
  { key: "off", label: "手动", desc: "不自动运行，需手动点击「运行监测」", cron: "" },
  { key: "daily", label: "每日", desc: "每天上午 9:00 自动审计", cron: "0 9 * * *" },
  { key: "hourly", label: "每小时", desc: "每小时整点自动审计", cron: "0 * * * *" },
  { key: "weekly", label: "每周", desc: "每周一上午 9:00 自动审计", cron: "0 9 * * 1" },
] as const

interface ScheduleState {
  enabled: boolean
  cron: string
  label: string
  feishuWebhook: string
  notifOnComplete: boolean
}

export default function SchedulerPanel() {
  const [schedule, setSchedule] = useState<ScheduleState>({
    enabled: false, cron: "", label: "手动", feishuWebhook: "", notifOnComplete: false,
  })
  const [activePreset, setActivePreset] = useState("off")
  const [exporting, setExporting] = useState(false)
  const [csvExporting, setCsvExporting] = useState(false)
  const [saving, setSaving] = useState(false)

  // 从后端加载当前调度配置
  useEffect(() => {
    fetch("/api/scheduler").then(r => r.json()).then(j => {
      if (j.ok && j.data) {
        setSchedule(j.data)
        // 反向匹配 preset
        const match = SCHEDULE_PRESETS.find(p => p.cron === j.data.cron)
        setActivePreset(match?.key || "off")
      }
    }).catch(() => {})
  }, [])

  async function applyPreset(key: string) {
    const preset = SCHEDULE_PRESETS.find(p => p.key === key)
    if (!preset) return
    setSaving(true)
    try {
      const enabled = key !== "off"
      const r = await fetch("/api/scheduler", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, cron: preset.cron, label: preset.label }),
      })
      const j = await r.json()
      if (j.ok) {
        setSchedule(j.data)
        setActivePreset(key)
        toast.success(enabled ? `已启用「${preset.label}」定时审计` : "已关闭定时审计")
      } else {
        toast.error("保存失败")
      }
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  async function updateWebhook() {
    setSaving(true)
    try {
      const r = await fetch("/api/scheduler", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feishuWebhook: schedule.feishuWebhook,
          notifOnComplete: schedule.notifOnComplete,
        }),
      })
      const j = await r.json()
      if (j.ok) {
        setSchedule(j.data)
        toast.success("飞书通知配置已保存")
      }
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

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
                onClick={() => applyPreset(p.key)}
                disabled={saving}
                className={`rounded-lg border px-3 py-2 text-left transition-all ${
                  activePreset === p.key ? "border-primary/40 bg-primary/5" : "border-border/40 hover:border-border"
                }`}>
                <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-medium">{p.label}</span><Switch checked={activePreset === p.key && p.key !== "off"} className="scale-75 ml-1" /></div>
                <p className="text-[10px] text-muted-foreground mt-1">{p.desc}</p>
              </button>
            ))}
          </div>
          {saving && <p className="mt-2 text-xs text-muted-foreground">保存中…</p>}
        </CardContent>
      </Card>

      {/* 飞书通知 */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4 text-primary" />飞书通知</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">审计完成后推送结果</span>
            <Switch
              checked={schedule.notifOnComplete}
              onCheckedChange={(v) => setSchedule(s => ({ ...s, notifOnComplete: v }))}
            />
          </div>
          <Input
            placeholder="飞书 Webhook URL（可选）"
            value={schedule.feishuWebhook}
            onChange={(e) => setSchedule(s => ({ ...s, feishuWebhook: e.target.value }))}
            className="text-xs h-8"
          />
          <Button size="sm" variant="outline" onClick={updateWebhook} disabled={saving}>
            <Bell className="mr-1.5 h-3.5 w-3.5" /> 保存通知配置
          </Button>
          <p className="text-[10px] text-muted-foreground">获取方式：飞书群 → 群设置 → 群机器人 → 添加自定义机器人 → 复制 Webhook 地址</p>
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

      {/* v3.0 Webhook 事件推送 */}
      <WebhookConfig />
    </div>
  )
}

// ── v3.0 Webhook 事件配置 ──
function WebhookConfig() {
  const [webhook, setWebhook] = useState({ enabled: false, url: "", events: { auditComplete: true, scoreChange: true, competitorAlert: true }, secret: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/webhooks").then(r => r.json()).then(j => { if (j.ok) setWebhook(j.data) }).catch(() => {})
  }, [])

  async function saveWebhook() {
    setSaving(true)
    try {
      const r = await fetch("/api/webhooks", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhook),
      })
      const j = await r.json()
      if (j.ok) { toast.success("Webhook 配置已保存") } else { toast.error(j.error || "保存失败") }
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Webhook className="h-4 w-4 text-primary" />Webhook 事件推送</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">启用 Webhook</span>
          <Switch checked={webhook.enabled} onCheckedChange={v => setWebhook(w => ({ ...w, enabled: v }))} />
        </div>
        {webhook.enabled && (
          <>
            <Input placeholder="Webhook URL（接收 POST JSON）" value={webhook.url} onChange={e => setWebhook(w => ({ ...w, url: e.target.value }))} className="text-xs h-8" />
            <Input placeholder="签名密钥（可选，HMAC-SHA256）" value={webhook.secret} onChange={e => setWebhook(w => ({ ...w, secret: e.target.value }))} className="text-xs h-8" />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">触发事件</p>
              {[
                { key: "auditComplete", label: "审计完成" },
                { key: "scoreChange", label: "评分变化 >10分" },
                { key: "competitorAlert", label: "竞品首次被AI引用" },
              ].map((e: { key: string; label: string }) => (
                <label key={e.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(webhook.events as any)[e.key]} onChange={ev => setWebhook(w => ({ ...w, events: { ...w.events, [e.key]: ev.target.checked } }))} className="rounded" />
                  <span className="text-xs">{e.label}</span>
                </label>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={saveWebhook} disabled={saving || !webhook.url}>
              <Webhook className="mr-1.5 h-3.5 w-3.5" /> 保存配置
            </Button>
          </>
        )}
        <p className="text-[10px] text-muted-foreground">审计完成/评分变化/竞品异动时自动 POST JSON 到配置的 URL。Header 含 X-GEO-Signature（HMAC-SHA256）。</p>
      </CardContent>
    </Card>
  )
}
