// 内容抽取：将 HTML / 纯文本解析为统一的 ParsedDoc 结构
import type { GeoInput, ParsedDoc, ParsedHeading, ParsedLink, ParsedImage, ParsedMeta } from "@/types/geo"

// 中英文混合字数统计：CJK 按字计，英文按词计
export function countWords(text: string): number {
  const cjk = (text.match(/[一-鿿]/g) || []).length
  const latin = (text
    .replace(/[一-鿿]/g, " ")
    .match(/[A-Za-z0-9]+/g) || []).length
  return cjk + latin
}

// 估算阅读时长（分钟）：CJK ~ 400 字/分，英文 ~ 200 词/分
export function estimateReadingTime(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 350))
}

// 抽取日期字符串（多种常见格式）
const DATE_RE =
  /\b(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?\b|\b(\d{4})年(\d{1,2})月\b|\b(\d{1,2})月(\d{1,2})日\b/g
// 仅年份（如「2016 年」「2024」），用于时效粗判；限定 1990-2029 以降误报
const YEAR_RE = /\b(?:19[9]\d|20[0-2]\d)\s*年?/g

export function extractDates(text: string): string[] {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  DATE_RE.lastIndex = 0
  while ((m = DATE_RE.exec(text))) {
    out.add(m[0])
  }
  YEAR_RE.lastIndex = 0
  while ((m = YEAR_RE.exec(text))) {
    const y = m[0].replace(/[^\d]/g, "")
    if (y) out.add(y)
  }
  return [...out].slice(0, 12)
}

const REMOVE_TAGS = ["script", "style", "noscript", "svg", "template"]

function cleanTextFromHtml(html: string): { text: string; doc: Document } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  REMOVE_TAGS.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((el) => el.remove())
  })
  // 去除常见噪声区块
  doc
    .querySelectorAll("nav, header, footer, aside, .nav, .footer, .sidebar, .header, [role='navigation'], [role='banner'], [role='contentinfo']")
    .forEach((el) => el.remove())
  const text = (doc.body?.textContent || "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  return { text, doc }
}

function getMeta(doc: Document): ParsedMeta {
  const jsonLdTypes: string[] = []
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    try {
      const data = JSON.parse((node.textContent || "").trim())
      const arr = Array.isArray(data) ? data : [data]
      arr.forEach((d: any) => {
        if (d && d["@type"]) jsonLdTypes.push(d["@type"])
      })
    } catch {
      /* ignore */
    }
  })
  const get = (sel: string, attr = "content") => doc.querySelector(sel)?.getAttribute(attr) || undefined
  const ogTitle = get('meta[property="og:title"]')
  const ogDescription = get('meta[property="og:description"]')
  const ogType = get('meta[property="og:type"]')
  const authorMeta =
    get('meta[name="author"]') || get('meta[property="article:author"]') || undefined
  return {
    description: get('meta[name="description"]'),
    ogTitle,
    ogDescription,
    ogType,
    jsonLd: jsonLdTypes.length > 0,
    jsonLdTypes,
    authorMeta,
  }
}

function getHeadings(doc: Document): ParsedHeading[] {
  const out: ParsedHeading[] = []
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    const level = Number(el.tagName.substring(1))
    const text = (el.textContent || "").trim()
    if (text) out.push({ level, text })
  })
  return out
}

function getLinks(doc: Document, baseUrl?: string): ParsedLink[] {
  const out: ParsedLink[] = []
  const baseHost = baseUrl ? safeHost(baseUrl) : null
  doc.querySelectorAll("a[href]").forEach((el) => {
    const href = (el.getAttribute("href") || "").trim()
    const text = (el.textContent || "").trim()
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
    const host = safeHost(href)
    const internal = baseHost ? host === baseHost : !/^https?:\/\//i.test(href) ? true : false
    out.push({ href, text: text.slice(0, 80), internal })
  })
  return out
}

function safeHost(url: string): string | null {
  try {
    return new URL(url, "https://x.test").host
  } catch {
    return null
  }
}

function getImages(doc: Document): ParsedImage[] {
  const out: ParsedImage[] = []
  doc.querySelectorAll("img").forEach((el) => {
    const alt = (el.getAttribute("alt") || "").trim()
    out.push({ alt, hasAlt: alt.length > 0 })
  })
  return out
}

function deriveTitleFromText(text: string): string {
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || ""
  return firstLine.slice(0, 60) || "未命名内容"
}

export function parseDoc(input: GeoInput): ParsedDoc {
  const hasHtml = !!input.html && input.html.length > 0
  let text = input.text || ""
  let title = input.title || ""
  let headings: ParsedHeading[] = []
  let paragraphs: string[] = []
  let listCount = 0
  let tableCount = 0
  let links: ParsedLink[] = []
  let images: ParsedImage[] = []
  let meta: ParsedMeta = { jsonLd: false, jsonLdTypes: [] }

  if (hasHtml) {
    const parsed = cleanTextFromHtml(input.html!)
    text = text || parsed.text
    const doc = parsed.doc
    title = input.title || doc.querySelector("title")?.textContent?.trim() || deriveTitleFromText(parsed.text)
    headings = getHeadings(doc)
    listCount = doc.querySelectorAll("ul, ol").length
    tableCount = doc.querySelectorAll("table").length
    links = getLinks(doc, input.url)
    images = getImages(doc)
    meta = getMeta(doc)
    paragraphs = (parsed.text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0))
  } else {
    title = title || deriveTitleFromText(text)
    // 纯文本：用空行分段的段落；尝试从 "标题" 行推断 heading
    paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0)
    // 首行若像标题（较短且非标点开头），视为 H1
    const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || ""
    if (firstLine && firstLine.length <= 60 && !/^[，。、,.]/.test(firstLine)) {
      headings.push({ level: 1, text: firstLine.slice(0, 80) })
    }
    // 以 "# " 或 "数字. " 开头的行视为小标题
    const hRe = /^(#{1,6}\s+.+|第[一二三四五六七八九十\d]+[章节部分][：:].*|[\d]+[.、][\s]*\S+)$/
    text.split("\n").forEach((line) => {
      const t = line.trim()
      if (t && hRe.test(t)) headings.push({ level: 2, text: t.replace(/^#+\s*/, "").slice(0, 80) })
    })
    meta = {
      jsonLd: false,
      jsonLdTypes: [],
      authorMeta: input.author,
    }
    if (input.author) meta.authorMeta = input.author
  }

  const dates = extractDates(text)
  const wordCount = countWords(text)

  if (!title) title = deriveTitleFromText(text)

  return {
    title,
    text,
    headings,
    paragraphs,
    listCount,
    tableCount,
    links,
    images,
    meta,
    dates,
    wordCount,
    hasHtml,
  }
}
