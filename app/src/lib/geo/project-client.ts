// 前端项目 / 审计 API 客户端：调用后端 /api/projects 与 /api/geo/*（与 backend-dev 约定一致）
// 统一处理 { ok, data } 响应信封；失败抛出带后端错误信息的 Error。

const BASE = "/api"

// ---- 类型定义（与后端 API 约定一致）----

export interface AuditQueryDetail {
  query: string
  serpEngine?: string
  serpResults?: { title: string; snippet: string; url: string }[]
  inSerp?: boolean
  serpMatchDetail?: string
  aiAnswer?: string
  inAiAnswer?: boolean
  aiMatchDetail?: string
  brandsInSerp?: string[]
  brandsInAnswer?: string[]
  error?: string
}

export interface AuditRecord {
  timestamp: string
  serpVisibility: number // 0-100
  aiCitationRate: number // 0-100
  overallScore: number // 0-100
  perQuery: AuditQueryDetail[]
  topCompetitors: { name: string; count: number }[]
  gapAnalysis: { summary: string; gaps: string[]; suggestions: string[] }
}

export interface Project {
  id: string
  brand: string
  domain: string
  industry: string
  mode: "general" | "b2b"
  competitors: string[]
  queries: string[]
  intendedContent: string[]
  audits: AuditRecord[]
  createdAt: number
  updatedAt: number
}

export interface ProjectInput {
  brand: string
  domain: string
  industry: string
  mode: "general" | "b2b"
  competitors: string[]
  queries: string[]
  intendedContent?: string[]
}

export interface ContentGapItem {
  topic: string
  platform: string
  priority: number
  reason: string
  competitorExample: string
}

// ---- 请求封装 ----

async function req<T>(path: string, init?: RequestInit, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      signal: controller.signal,
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || `请求失败 (${resp.status})`)
    }
    return data.data as T
  } finally {
    clearTimeout(timer)
  }
}

function post<T>(path: string, body: unknown, timeoutMs = 30000): Promise<T> {
  return req<T>(path, { method: "POST", body: JSON.stringify(body) }, timeoutMs)
}

// ---- 项目 CRUD ----

export function listProjects(): Promise<Project[]> {
  return req<Project[]>("/projects")
}

export function getProject(id: string): Promise<Project> {
  return req<Project>(`/projects/${encodeURIComponent(id)}`)
}

export function createProject(input: ProjectInput): Promise<Project> {
  return post<Project>("/projects", input)
}

export function updateProject(id: string, input: Partial<ProjectInput>): Promise<Project> {
  return req<Project>(`/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
}

export function deleteProject(id: string): Promise<void> {
  return req<void>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" })
}

// ---- 审计 / 差距分析 / 报告 ----

/** 触发一次完整 GEO 审计（搜索 + AI RAG，约 1-2 分钟），返回更新后的项目 */
export function runAudit(
  id: string,
  body: { brand: string; domain: string; queries: string[] },
): Promise<Project> {
  return post<Project>(`/projects/${encodeURIComponent(id)}/audit`, body, 240000)
}

/** 获取内容差距建议清单 */
export function getContentGap(projectId: string): Promise<ContentGapItem[]> {
  return post<ContentGapItem[]>("/geo/content-gap", { projectId })
}

/** 生成审计报告 HTML，返回 HTML 字符串（前端自行下载） */
export async function getReport(projectId: string): Promise<string> {
  const data = await post<{ html: string }>("/geo/report", { projectId }, 120000)
  return data.html
}
