// 生成 GEO 部署产物：llms.txt / llms-full.txt / JSON-LD / robots / meta
import type { GeoInput } from "@/types/geo"
import { parseDoc } from "./extract"

export interface GeneratedAssets {
  llmsTxt: string
  llmsFullTxt: string
  jsonLd: string
  robotsTxt: string
  metaTags: string
}

function makeSummary(text: string, max = 150): string {
  const first = text.split(/\n{2,}/)[0] || text
  const clean = first.replace(/\s+/g, " ").trim()
  return clean.length > max ? clean.slice(0, max) + "…" : clean
}

function extractOrgName(text: string): string {
  const m =
    text.match(/([一-鿿A-Za-z0-9（）()·]{2,}(?:股份有限|有限责任|有限|股份|集团)?公司)/) ||
    text.match(/([一-鿿A-Za-z0-9（）()·]{2,}厂)/)
  return m ? m[1] : ""
}

function topKeywords(text: string, n = 8): string[] {
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9-]{3,}|[一-鿿]{2,4}/g) || []
  const stop = new Set([
    "我们",
    "可以",
    "这个",
    "一个",
    "以及",
    "对于",
    "通过",
    "进行",
    "因为",
    "所以",
    "但是",
    "如果",
    "已经",
    "需要",
    "如何",
    "什么",
    "这些",
    "那些",
    "他们",
    "自己",
    "就是",
    "这样",
    "那样",
    "一种",
    "没有",
    "不是",
    "这种",
    "目前",
    "使用",
    "用户",
    "可能",
    "比较",
    "方面",
    "一些",
    "由于",
    "为了",
    "成为",
    "让你",
    "来看",
  ])
  const freq = new Map<string, number>()
  tokens.forEach((t) => {
    if (stop.has(t)) return
    freq.set(t, (freq.get(t) || 0) + 1)
  })
  // 子串折叠：丢弃被更长词条包含的碎片（如「制品」被「鱼糜制品」包含），
  // 让更长的实体/产品短语胜出，避免 2 字碎块污染 keywords。
  const allKeys = [...freq.keys()]
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .filter(([tok]) => !allKeys.some((k) => k !== tok && k.length > tok.length && k.includes(tok)))
    .slice(0, n)
    .map((e) => e[0])
}

function toMarkdown(text: string, title: string): string {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const body = paras.map((p) => p.replace(/\s+/g, " ")).join("\n\n")
  return `# ${title}\n\n${body}\n`
}

export function generateAssets(input: GeoInput): GeneratedAssets {
  const p = parseDoc(input)
  const title = p.title || "未命名页面"
  const summary = makeSummary(p.text)
  const keywords = topKeywords(p.text)
  const url = input.url || ""
  const author = input.author || p.meta.authorMeta || ""

  // ── llms.txt ──
  const sectionBullets: string[] = []
  if (p.headings.length) {
    p.headings
      .filter((h) => h.level <= 3)
      .slice(0, 8)
      .forEach((h) => sectionBullets.push(`- ${h.text}`))
  } else {
    sectionBullets.push(`- ${summary || "（页面正文）"}`)
  }
  const infoLines: string[] = []
  if (author) infoLines.push(`- 作者：${author}`)
  if (input.publishedDate) infoLines.push(`- 发布：${input.publishedDate}`)
  if (input.modifiedDate) infoLines.push(`- 更新：${input.modifiedDate}`)
  if (url) infoLines.push(`- 来源：${url}`)

  const llmsTxt =
    `# ${title}\n\n` +
    `> ${summary}\n\n` +
    `## 核心结构\n` +
    sectionBullets.join("\n") +
    `\n\n` +
    `## 全文\n` +
    `- [完整内容](llms-full.txt)：本页完整正文，供 AI 引擎直接读取\n\n` +
    (infoLines.length ? `## 信息\n` + infoLines.join("\n") + `\n\n` : "") +
    `## 其他\n` +
    `- [站点地图](/sitemap.xml)\n` +
    `- [结构化数据](/structured-data.jsonld)\n`

  // ── llms-full.txt ──
  const toc = p.headings.length
    ? `## 目录\n` + p.headings.slice(0, 12).map((h) => `${"  ".repeat(Math.max(h.level - 1, 0))}- ${h.text}`).join("\n") + `\n\n`
    : ""
  const llmsFullTxt = `# ${title}\n\n> ${summary}\n\n${toc}${toMarkdown(p.text, "").trim()}\n`

  // ── JSON-LD ──
  const jsonLdObj: any = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: summary,
    mainEntityOfPage: url || undefined,
    keywords: keywords.join(", "),
  }
  if (author) jsonLdObj.author = { "@type": "Person", name: author }
  if (input.publishedDate) jsonLdObj.datePublished = input.publishedDate
  if (input.modifiedDate) jsonLdObj.dateModified = input.modifiedDate
  else if (input.publishedDate) jsonLdObj.dateModified = input.publishedDate
  if (url) jsonLdObj.publisher = { "@type": "Organization", name: extractOrgName(p.text) || title }
  const jsonLd = `<script type="application/ld+json">\n${JSON.stringify(jsonLdObj, null, 2)}\n</script>`

  // ── robots.txt ──
  let origin = ""
  try {
    if (url) origin = new URL(url).origin
  } catch {
    origin = ""
  }
  const robotsTxt =
    `User-agent: *\n` +
    `Allow: /\n` +
    `\n` +
    `# 生成式引擎优化：声明 llms.txt 供 AI 引擎读取\n` +
    `LLMS: /llms.txt\n` +
    (origin ? `Sitemap: ${origin}/sitemap.xml\n` : `Sitemap: /sitemap.xml\n`)

  // ── meta tags ──
  const metaTags =
    `<!-- 在 <head> 中部署 -->\n` +
    `<title>${title}</title>\n` +
    `<meta name="description" content="${summary.replace(/"/g, "&quot;")}" />\n` +
    `<meta property="og:title" content="${title}" />\n` +
    `<meta property="og:description" content="${summary.replace(/"/g, "&quot;")}" />\n` +
    `<meta property="og:type" content="article" />\n` +
    (author ? `<meta name="author" content="${author}" />\n` : "") +
    `${jsonLd}\n`

  return { llmsTxt, llmsFullTxt, jsonLd, robotsTxt, metaTags }
}
