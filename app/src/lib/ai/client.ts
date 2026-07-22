// 前端 AI 客户端：调用后端 /api/ai/*（Key 只在后端，前端永不接触）
// 带后端可用性探测；后端不可用时上层自动回退到规则引擎。
import type { GeoMode } from "@/types/geo"

const BASE = "/api/ai"

export interface AiHealth {
  ok: boolean
  configured: boolean
  model?: string
}

export interface AiAnalyzeResult {
  summary: string
  strengths: string[]
  gaps: string[]
  actions: string[]
  sampleQuestions: string[]
}

export interface AiRewriteFaq {
  q: string
  a: string
}
export interface AiRewriteDef {
  term: string
  def: string
}
export interface AiRewriteResult {
  tldr: string
  rewrittenMarkdown: string
  faq: AiRewriteFaq[]
  definitions: AiRewriteDef[]
  changes: string[]
}

export interface AiCitationResult {
  query: string
  brand: string
  domain: string
  answer: string
  mentioned: boolean
  // ── 4 级 AI 认知检测 ──
  level?: "direct" | "indirect" | "triggerable" | "none"
  levelLabel?: string
  brandsInAnswer: string[]
  reason: string
  suggestion: string
}

async function postJson<T>(path: string, body: unknown, timeoutMs = 120000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

/** 探测后端与 Key 是否就绪；任何异常都视为不可用（前端回退规则引擎） */
export async function aiHealth(): Promise<AiHealth> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const resp = await fetch(`${BASE}/health`, { signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return { ok: false, configured: false }
    const d = await resp.json()
    return { ok: !!d?.ok, configured: !!d?.configured, model: d?.model }
  } catch {
    return { ok: false, configured: false }
  }
}

export function aiAnalyze(input: {
  text: string
  title?: string
  url?: string
  mode?: GeoMode
}): Promise<AiAnalyzeResult> {
  return postJson<AiAnalyzeResult>("/analyze", input)
}

export function aiRewrite(input: {
  text: string
  title?: string
  mode?: GeoMode
}): Promise<AiRewriteResult> {
  return postJson<AiRewriteResult>("/rewrite", input)
}

export function aiCitation(input: {
  query: string
  brand?: string
  domain?: string
}): Promise<AiCitationResult> {
  return postJson<AiCitationResult>("/citation", input)
}

// ---- 真·GEO 引用审计（RAG 式：360 搜索 → LLM 综合 → 品牌可见度检测）----

export interface GeoAuditSerpResult {
  title: string
  snippet: string
  url: string
}

/** 信源：SERP 排名 + 是否被 AI 引用 + 与 AI 回答的相关度 + 5 维质量评分 */
export interface GeoAuditSource {
  rank: number
  title: string
  url: string
  snippet: string
  citedByAi: boolean
  relevance: number // 0-100
  // ── 5 维内容质量评分（server/scorer.mjs）──
  scores?: Record<string, number> // { relevance, authority, freshness, completeness, quotability }
  overallScore?: number // 0-100 综合
  qualityLevel?: "high" | "medium" | "low"
  qualityGrade?: "A" | "B" | "C"
}

/** 全局信源排名（跨 query 聚合）：被 AI 引用次数 + 平均相关度 */
export interface GeoAuditTopSource {
  rank: number
  title: string
  url: string
  snippet?: string
  citedCount: number
  avgRelevance: number // 0-100
}

/** 企业想表达的内容点 → 收录追踪 */
export interface ContentPointTracking {
  point: string
  status: "收录" | "部分" | "未出现"
  where: string[] // "serp" | "ai"
}

export interface GeoAuditPerQuery {
  query: string
  serpEngine: string
  serpResults: GeoAuditSerpResult[]
  inSerp: boolean
  serpMatchDetail: string
  aiAnswer: string
  inAiAnswer: boolean
  aiMatchDetail: string
  brandsInSerp: string[]
  brandsInAnswer: string[]
  sources?: GeoAuditSource[]
  contentTracking?: ContentPointTracking[]
  // ── 4 级 AI 认知检测 ──
  level?: "direct" | "indirect" | "triggerable" | "none"
  levelLabel?: string
  reason?: string
  suggestion?: string
  error?: string
}

export interface GeoAuditGapAnalysis {
  summary: string
  gaps: string[]
  suggestions: string[]
}

export interface GeoAuditResult {
  brand: string
  domain: string
  timestamp: string
  mode: string
  searchEngine: string
  totalQueries: number
  serpVisibility: number
  aiCitationRate: number
  serpHits: number
  aiHits: number
  perQuery: GeoAuditPerQuery[]
  topCompetitors: { name: string; count: number }[]
  gapAnalysis: GeoAuditGapAnalysis
  // 监控台核心数据
  sources?: GeoAuditTopSource[] // 全局信源排名（被 AI 引用次数 + 平均相关度）
  contentTracking?: ContentPointTracking[] // 内容点级 收录/部分/未出现
  intendedCount?: number
  includedCount?: number
  partialCount?: number
  missingCount?: number
}

export async function aiGeoAudit(input: {
  brand: string
  domain?: string
  queries: string[]
  competitors?: string[]
  intendedContent?: string[]
}): Promise<GeoAuditResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180000) // 3 分钟超时（多 query + 搜索 + LLM）
  try {
    const resp = await fetch("/api/geo/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || `请求失败 (${resp.status})`)
    }
    return data.data as GeoAuditResult
  } finally {
    clearTimeout(timer)
  }
}

// ---- 多格式内容输出（图文 / 社媒 / 视频脚本 / 落地页）----

export type ContentFormat = "article" | "social" | "video_script" | "landing"

export interface ContentFormatResult {
  title?: string
  subtitle?: string
  content?: string
  tags?: string[]
  imagePrompt?: string
  hook?: string
  script?: string
  duration?: string
  cta?: string
  pageTitle?: string
  metaDescription?: string
  sections?: { type: string; headline?: string; subheadline?: string; cta?: string; title?: string; items?: string[] }[]
  schemaType?: string
  keyEntities?: string[]
  [k: string]: unknown
}

export function aiGenerateContent(input: {
  text: string
  title?: string
  format?: ContentFormat
  brand?: string
}): Promise<ContentFormatResult> {
  return postJson<ContentFormatResult>("/ai/generate-content", {
    text: input.text,
    title: input.title,
    format: input.format || "article",
    brand: input.brand,
  })
}
