// 内容改写引擎：把文章重写成更易被 AI 引擎引用/检索的版本
import type { GeoInput } from "@/types/geo"
import { parseDoc } from "./extract"

export interface FaqItem {
  q: string
  a: string
}

export interface Definition {
  term: string
  def: string
}

export interface RewriteResult {
  rewrittenMarkdown: string
  tldr: string
  faq: FaqItem[]
  definitions: Definition[]
  statSentences: string[]
  applied: string[] // 已自动应用的改写
  pending: string[] // 仍需人工处理的项
}

const STAT_RE =
  /(\d[\d,.]*\s?(?:%|％|度|元|块|万|亿|倍|kg|cm|mm|英寸|升|w|v|ah|mah|℃|°|分贝|db|hz|gb|tb|mb|寸|平米|平方米|小时|分钟|天|年|个月))/i
const CURRENCY_RE = /[¥$€£]\s?\d[\d,.]*/

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

function detectStatistics(text: string): number {
  return (text.match(STAT_RE) || []).length + (text.match(CURRENCY_RE) || []).length
}

function toQuestion(heading: string): string {
  const t = heading.replace(/^#+\s*/, "").trim()
  if (/[？?]$/.test(t)) return t
  if (/(是什么|是指|如何|怎么|为什么|哪些|对比|区别)/.test(t)) return t + "？"
  return `${t} 是什么？`
}

function answerFor(term: string, text: string): string {
  const sentences = splitSentences(text)
  const hit = sentences.find((s) => s.includes(term) && s.length >= 8)
  return hit || sentences[0] || "（请补充该小节的回答）"
}

function extractDefinitions(text: string): Definition[] {
  const re = /([一-鿿A-Za-z][一-鿿A-Za-z0-9\-]{1,12})[是指即:：]\s*([^。；;]{4,60})/g
  const out: Definition[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) && out.length < 6) {
    out.push({ term: m[1].trim(), def: m[2].trim() })
  }
  return out
}

function leadSummary(text: string, max = 120): string {
  const first = splitSentences(text)[0] || text
  return first.length > max ? first.slice(0, max) + "…" : first
}

export function rewriteContent(input: GeoInput): RewriteResult {
  const p = parseDoc(input)
  const title = p.title || "未命名内容"
  const sentences = splitSentences(p.text)

  // TL;DR
  const tldr = leadSummary(p.text)
  const statSentences = sentences.filter((s) => detectStatistics(s)).slice(0, 6)

  // FAQ：来自小标题 + 原文问句
  const faq: FaqItem[] = []
  const seen = new Set<string>()
  p.headings
    .filter((h) => h.level <= 3)
    .slice(0, 6)
    .forEach((h) => {
      const q = toQuestion(h.text)
      if (seen.has(q)) return
      seen.add(q)
      faq.push({ q, a: answerFor(h.text.replace(/^#+\s*/, "").trim(), p.text) })
    })
  sentences
    .filter((s) => s.includes("？") || s.includes("?"))
    .slice(0, 4)
    .forEach((q) => {
      if (seen.has(q)) return
      seen.add(q)
      const rest = sentences.slice(sentences.indexOf(q) + 1, sentences.indexOf(q) + 2)
      faq.push({ q, a: rest[0] || leadSummary(p.text) })
    })

  // 定义
  const definitions = extractDefinitions(p.text)

  // 改写后 Markdown
  const parts: string[] = []
  parts.push(`# ${title}`)
  parts.push("")
  parts.push("## TL;DR（一句话摘要）")
  parts.push(`- ${tldr}`)
  if (statSentences.length) {
    parts.push("")
    parts.push("## 关键数据（可引用锚点）")
    statSentences.forEach((s) => parts.push(`- ${s}`))
  }
  if (definitions.length) {
    parts.push("")
    parts.push("## 核心定义（实体锚点）")
    definitions.forEach((d) => parts.push(`- **${d.term}**：${d.def}`))
  }
  parts.push("")
  parts.push("## 正文")
  const paras = p.text.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
  paras.forEach((para) => parts.push(para.replace(/\s+/g, " ")))
  if (faq.length) {
    parts.push("")
    parts.push("## 常见问题 FAQ（便于 AI 直接作答）")
    faq.forEach((f) => {
      parts.push(`### ${f.q}`)
      parts.push(f.a)
      parts.push("")
    })
  }

  const rewrittenMarkdown = parts.join("\n")

  // 已应用 / 待处理
  const applied: string[] = [
    "生成 TL;DR 摘要块并置于文首",
    `基于 ${p.headings.filter((h) => h.level <= 3).length || 0} 个小标题与原文问句生成 ${faq.length} 条 FAQ`,
  ]
  if (definitions.length) applied.push(`抽取 ${definitions.length} 处实体定义并格式化为锚点`)
  if (statSentences.length) applied.push(`标注 ${statSentences.length} 条量化数据作为可引用锚点`)

  const pending: string[] = []
  if (!p.meta.authorMeta && !input.author) pending.push("补充作者署名与资质（EEAT）")
  if (p.dates.length === 0 && !input.publishedDate) pending.push("标注发布时间与更新时间（新鲜度）")
  if (p.links.filter((l) => !l.internal).length === 0) pending.push("增加权威外链引用（可信度）")
  if (!p.meta.jsonLd) pending.push("部署 JSON-LD 结构化数据（结构化数据维度）")
  if (detectStatistics(p.text) === 0) pending.push("补充具体参数/价格/测试结果（可引用性）")
  pending.push("人工校对 FAQ 答案准确性，并补充第一手实测经验（独特性）")

  return { rewrittenMarkdown, tldr, faq, definitions, statSentences, applied, pending }
}
