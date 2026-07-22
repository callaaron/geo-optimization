import { useEffect, useState } from "react"
import { aiHealth, aiGeoAudit, type GeoAuditResult } from "@/lib/ai/client"
import { EmptyState } from "@/components/EmptyState"
import { EnterpriseConfig, EMPTY_CONFIG, type Config } from "@/sections/EnterpriseConfig"
import { ResultView } from "@/sections/ResultView"
import { parseLines, normalizeAuditResult } from "@/lib/geo/utils"
import { Compass } from "lucide-react"
import { toast } from "sonner"

// ── 企业监测配置本地持久化 ──
const CONFIG_KEY = "geo-enterprise-config"
function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...EMPTY_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...EMPTY_CONFIG }
}
function persistConfig(c: Config) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)) } catch { /* ignore */ }
}

export function MonitorDashboard() {
  const [config, setConfig] = useState<Config>(loadConfig)
  const [savedAt, setSavedAt] = useState<number | null>(() => {
    try { return localStorage.getItem(CONFIG_KEY) ? Date.now() : null } catch { return null }
  })
  const [aiReady, setAiReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GeoAuditResult | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => { aiHealth().then((h) => setAiReady(h.ok && h.configured)) }, [])

  function handleSaveConfig() {
    persistConfig(config)
    setSavedAt(Date.now())
    toast.success("配置已保存")
  }

  function handleResetConfig() {
    setConfig({ ...EMPTY_CONFIG })
    persistConfig({ ...EMPTY_CONFIG })
    setSavedAt(null)
    toast.info("已重置为空白配置")
  }

  async function run() {
    const qs = parseLines(config.queries)
    const ic = parseLines(config.intended)
    if (!config.brand.trim()) { toast.error("请填写品牌名"); return }
    if (qs.length === 0) { toast.error("请填写至少一条监测 query"); return }
    setLoading(true)
    setResult(null)
    setSavedId(null)
    try {
      const res = await aiGeoAudit({
        brand: config.brand.trim(),
        domain: config.domain.trim() || undefined,
        queries: qs,
        competitors: parseLines(config.competitors),
        intendedContent: ic,
      })
      setResult(normalizeAuditResult(res, config.aliases))
      toast.success(`监测完成：搜索可见度 ${res.serpVisibility}% / AI 引用率 ${res.aiCitationRate}%`)
    } catch (e) {
      const msg = (e as Error).message || "后端异常"
      const friendly = /aborted|abort|timeout|timed out/i.test(msg)
        ? "请求超时或被中断，请减少 query 数量后重试"
        : msg
      toast.error(`监测失败：${friendly}`)
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <EnterpriseConfig
        value={config}
        onChange={setConfig}
        onRun={run}
        aiReady={aiReady}
        loading={loading}
        onSave={handleSaveConfig}
        savedAt={savedAt}
        onReset={handleResetConfig}
      />

      {result ? (
        <ResultView
          result={result}
          competitors={parseLines(config.competitors)}
          queries={parseLines(config.queries)}
          intended={parseLines(config.intended)}
          onSaveComplete={setSavedId}
          savedId={savedId}
        />
      ) : (
        <EmptyState
          icon={<Compass className="h-8 w-8" />}
          title="尚未运行监测"
          desc="填写上方「企业监测配置」后点击「运行监测」，即可查看搜索可见度、AI 引用率与信源质量评分。"
          hint="提示：可点击「一键填入示范信息」快速体验，或上传资料 / 输入品牌名让 AI 生成候选后点击填入"
        />
      )}
    </div>
  )
}
