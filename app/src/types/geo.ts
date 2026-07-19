// GEO 优化系统 —— 核心类型定义
// GEO = Generative Engine Optimization（生成式引擎优化）

export type DimensionKey =
  | "structure" // 结构清晰度
  | "entities" // 实体与主题明确性
  | "quotability" // 可引用性
  | "eeat" // 经验/专业/权威/可信
  | "structuredData" // 结构化数据
  | "technical" // 技术可读性
  | "freshness" // 新鲜度
  | "uniqueness" // 独特性 / 反模板
  | "b2b" // B2B 转化信号（仅 B2B 模式）

export interface GeoInput {
  url?: string
  title?: string
  html?: string // 抓取到的原始 HTML（可选）
  text: string // 正文纯文本（必填）
  author?: string
  publishedDate?: string
  modifiedDate?: string
}

export interface ParsedHeading {
  level: number
  text: string
}

export interface ParsedLink {
  href: string
  text: string
  internal: boolean
}

export interface ParsedImage {
  alt: string
  hasAlt: boolean
}

export interface ParsedMeta {
  description?: string
  ogTitle?: string
  ogDescription?: string
  ogType?: string
  jsonLd: boolean
  jsonLdTypes: string[]
  authorMeta?: string
}

export interface ParsedDoc {
  title: string
  text: string
  headings: ParsedHeading[]
  paragraphs: string[]
  listCount: number
  tableCount: number
  links: ParsedLink[]
  images: ParsedImage[]
  meta: ParsedMeta
  dates: string[]
  wordCount: number
  hasHtml: boolean
}

export interface DimensionResult {
  key: DimensionKey
  label: string
  weight: number // 0-1
  score: number // 0-100
  summary: string
  strengths: string[]
  issues: string[]
  suggestions: string[]
}

export interface GeoMeta {
  hasH1: boolean
  headingCount: number
  headingHierarchyOk: boolean
  listCount: number
  tableCount: number
  linkCount: number
  internalLinkCount: number
  externalLinkCount: number
  imageCount: number
  imageWithAlt: number
  hasJsonLd: boolean
  hasMetaDescription: boolean
  hasOgTags: boolean
  hasAuthor: boolean
  hasDates: boolean
  hasStatistics: boolean
  entitySignal: number
  genericPhraseHits: number
  opinionSignal: number
  readingTimeMin: number
}

export interface GeoAnalysis {
  overall: number // 0-100 加权总分
  grade: string // A/B/C/D/E
  dimensions: DimensionResult[]
  wordCount: number
  readingTimeMin: number
  extractedTitle: string
  source: "url" | "text"
  meta: GeoMeta
  topSuggestions: string[] // 聚合后的优先建议
  analyzedAt: number
}

// 监控看板记录
export interface AnalysisRecord {
  id: string
  label: string // 站点/文章名
  url?: string
  overall: number
  dimensions: Record<DimensionKey, number>
  createdAt: number
  note?: string
}

export interface CitationEntry {
  id: string
  engine: string // ChatGPT / Perplexity / 豆包 / 文心一言 ...
  query: string // 被检索的问题
  found: boolean // 是否被引用/提及
  url?: string
  note?: string
  createdAt: number
}

export type GeoMode = "general" | "b2b"

// 竞品对标：单个站点在基准集中的表现
export interface BenchmarkEntry {
  label: string
  overall: number
  dimensions: Record<DimensionKey, number>
  grade: string
}

export interface BenchmarkResult {
  entries: BenchmarkEntry[]
  best: BenchmarkEntry
  worst: BenchmarkEntry
  yourIndex: number
  recommendations: string[]
}

// 站点聚合：多页/多记录汇总
export interface SiteScore {
  pages: number
  avgOverall: number
  grade: string
  byDimension: Record<DimensionKey, number>
  gradeCounts: Record<string, number>
}
