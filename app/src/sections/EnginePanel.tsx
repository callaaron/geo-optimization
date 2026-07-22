// 多引擎检测面板：显示可用的搜索引擎和 AI 引擎状态（参考 auto-geo 的 multi-engine check）
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Brain, Globe, Cpu } from "lucide-react"

interface EngineStatus { available: boolean; model: string }
interface HealthData {
  configured: boolean; provider: string; model: string;
  searchConfigured: boolean; searchModel: string;
  providers: Record<string, EngineStatus>;
}

const ENGINE_META: Record<string, { label: string; icon: typeof Brain; desc: string; realtime: boolean }> = {
  deepseek: { label: "DeepSeek", icon: Brain, desc: "备用文字模型（余额不足时自动回退 Ark）", realtime: false },
  ark: { label: "火山方舟(Ark)", icon: Cpu, desc: "主文字模型（Agent Plan 套餐）", realtime: false },
}

const SEARCH_META = { label: "360 搜索引擎", icon: Globe, desc: "真·RAG 搜索：360 搜索 → 喂给 AI 做综合分析" }

export default function EnginePanel() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/ai/health")
      .then(r => r.json())
      .then(j => { if (j.ok) setHealth(j); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <Card className="border-border/40">
      <CardContent className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="ml-2 text-xs text-muted-foreground">检测引擎状态…</span></CardContent>
    </Card>
  )

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" /> 引擎检测状态
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 搜索引擎 */}
          <div className="rounded-lg border border-border/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-medium">{SEARCH_META.label}</span>
              <Badge variant="outline" className={`text-[10px] h-4 ${health?.searchConfigured ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                {health?.searchConfigured ? "已配置" : "未配置"}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">{SEARCH_META.desc}</p>
            {health?.searchModel && <p className="text-[10px] text-muted-foreground">模型：{health.searchModel}</p>}
          </div>

          {/* 文字模型 */}
          {health?.providers && Object.entries(health.providers)
            .filter(([_, v]) => v.available)
            .map(([key, v]) => {
              const meta = ENGINE_META[key]
              if (!meta) return null
              const isPrimary = health.provider === key
              const Icon = meta.icon
              return (
                <div key={key} className={`rounded-lg border p-3 space-y-2 ${isPrimary ? "border-primary/40 bg-primary/5" : "border-border/40"}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium">{meta.label}</span>
                    {isPrimary ? (
                      <Badge variant="outline" className="text-[10px] h-4 bg-primary/10 text-primary border-0">主引擎</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-4 bg-muted text-muted-foreground">备用</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-4 bg-emerald-500/10 text-emerald-400 border-0">在线</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{meta.desc}</p>
                  <p className="text-[10px] text-muted-foreground">模型：{v.model}</p>
                </div>
              )
            })}
        </div>

        {/* 未来引擎占位 */}
        <div className="mt-3 pt-3 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            可扩展引擎：Perplexity · OpenAI · Claude · Gemini · Grok（需配置对应 API Key）
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
