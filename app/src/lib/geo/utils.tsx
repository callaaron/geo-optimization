import { Badge } from "@/components/ui/badge"
import type { ContentPointTracking, GeoAuditResult } from "@/lib/ai/client"

export function parseLines(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
}

export function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function relevanceColor(v: number) {
  if (v >= 60) return "#10b981"
  if (v >= 30) return "#f59e0b"
  return "#ef4444"
}

export function gradeColor(g?: string) {
  if (g === "A") return "#10b981"
  if (g === "B") return "#f59e0b"
  return "#ef4444"
}

export const CITATION_LEVEL_META: Record<string, { label: string; color: string }> = {
  direct: { label: "直接引用", color: "#10b981" },
  indirect: { label: "间接提及", color: "#3b82f6" },
  triggerable: { label: "可触发提及", color: "#f59e0b" },
  none: { label: "未提及", color: "#ef4444" },
}

export function citationLevelColor(l?: string) {
  return (l && CITATION_LEVEL_META[l]?.color) || "#ef4444"
}

export function RelevanceBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{ width: `${value}%`, background: relevanceColor(value) }}
      />
    </div>
  )
}

export function StatusBadge({ status }: { status: ContentPointTracking["status"] }) {
  if (status === "收录")
    return <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">已收录</Badge>
  if (status === "部分")
    return <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">部分</Badge>
  return <Badge className="bg-destructive/20 text-destructive text-xs">未出现</Badge>
}

export const SCORE_DIMS: { key: string; label: string }[] = [
  { key: "relevance", label: "相关性" },
  { key: "authority", label: "权威度" },
  { key: "freshness", label: "时效性" },
  { key: "completeness", label: "完整度" },
  { key: "quotability", label: "可引用性" },
]

export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: relevanceColor(value) }} />
      </div>
      <span className="w-7 text-right tabular-nums" style={{ color: relevanceColor(value) }}>{value}</span>
    </div>
  )
}

// ── 品牌别名归一化 ──
export function buildAliasMap(canonical: string, aliasesRaw: string): Map<string, string> {
  const m = new Map<string, string>()
  const canon = canonical.trim()
  if (!canon) return m
  const aliases = parseLines(aliasesRaw)
  m.set(canon.toLowerCase(), canon) // 自身映射
  for (const a of aliases) {
    if (a.toLowerCase() !== canon.toLowerCase()) {
      m.set(a.toLowerCase(), canon)
    }
  }
  return m
}

export function normalizeBrand(text: string, aliasMap: Map<string, string>): string {
  const lower = text.trim().toLowerCase()
  return aliasMap.get(lower) || text.trim()
}

/** 对审计结果中的所有品牌名称做归一化 */
export function normalizeAuditResult(result: GeoAuditResult, aliases: string): GeoAuditResult {
  const aliasMap = buildAliasMap(result.brand, aliases)
  if (aliasMap.size <= 1) return result // 无别名，无需归一化

  const norm = (s: string) => normalizeBrand(s, aliasMap)

  // 深拷贝并归一化 perQuery 中的品牌名
  const perQuery = result.perQuery.map(q => ({
    ...q,
    brandsInSerp: (q.brandsInSerp || []).map(norm),
    brandsInAnswer: (q.brandsInAnswer || []).map(norm),
  }))

  return { ...result, perQuery }
}
