// 数据大屏 API 客户端

const BASE = "/api"

export interface MetricsResponse {
  fetchedAt: string
  kpis: {
    projects: number
    projectsWithAudit: number
    totalQueries: number
    totalAudits: number
    avgScore: number
    avgCitation: number
    avgSerp: number
  }
  levelDistribution: { level: string; label: string; count: number }[]
  trend: { date: string; score: number; citationRate: number; serpVisibility: number; brand: string; projectId: string }[]
  perQueryScores: { query: string; score: number; level: string; levelLabel: string; brand: string; projectId: string; inAiAnswer: boolean }[]
  topCompetitors: { name: string; mentions: number; brands: string[] }[]
  byProject: { id: string; brand: string; score: number; citation: number; serp: number; queries: number; audits: number; levelCounts: Record<string, number> }[]
}

export async function fetchMetrics(): Promise<MetricsResponse> {
  const res = await fetch(`${BASE}/metrics`)
  if (!res.ok) throw new Error(`metrics ${res.status}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || "获取仪表盘数据失败")
  return json.data
}

export async function seedDemo(): Promise<{ ok: boolean; results: { brand: string; status: string }[] }> {
  const res = await fetch(`${BASE}/demo/seed`, { method: "POST" })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || "种子数据失败")
  return json.data
}
