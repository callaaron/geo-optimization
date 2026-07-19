// GEO 评分引擎：8 维度加权评分（纯客户端、规则驱动、可解释）
import type {
  DimensionResult,
  GeoAnalysis,
  GeoInput,
  GeoMeta,
  ParsedDoc,
  GeoMode,
} from "@/types/geo"
import { parseDoc, estimateReadingTime } from "./extract"
import { detectB2BSignals, type B2BSignals } from "./b2b"

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v))

// ───────────────────────── 文本信号检测 ─────────────────────────
const STAT_RE =
  /(\d[\d,.]*\s?(?:%|％|度|元|块|万|亿|倍|kg|cm|mm|英寸|升|w|v|ah|mah|℃|°|分贝|db|hz|gb|tb|mb|寸|平米|平方米|小时|分钟|天|年|个月|kg|匹))/i
const CURRENCY_RE = /[¥$€£]\s?\d[\d,.]*/
const GENERIC = [
  "在当今世界",
  "随着",
  "众所周知",
  "毋庸置疑",
  "总而言之",
  "在数字化时代",
  "赋能",
  "抓手",
  "闭环",
  "在现阶段",
  "近年来",
  "当下",
  "我们生活在一个",
  "在这个时代",
  "随着人工智能",
  "随着互联网",
]
const OPINION = [
  "我们认为",
  "建议",
  "最佳",
  "首选",
  "推荐",
  "实测",
  "独家",
  "领先",
  "避坑",
  "心得",
  "经验",
  "相比",
  "对比",
  "vs",
  "不如",
  "更适合",
  "一定要",
  "千万别",
  "值得",
  "不值得",
  "我的建议",
  "排第一",
  "第一名",
  "首选",
  "强推",
]
const CREDENTIAL = [
  "博士",
  "教授",
  "工程师",
  "创始人",
  "ceo",
  "cto",
  "专家",
  "从业",
  "年经验",
  "资深",
  "主理人",
  "主笔",
  "编辑",
  "记者",
  "测评",
  "实验室",
  // B2B 权威/资质信号（让纯文本也能识别 EEAT）
  "认证",
  "资质",
  "专利",
  "发明",
  "荣誉",
  "获奖",
  "专精特新",
  "高新技术",
  "国标",
  "行标",
  "标准起草",
  "起草单位",
  "研究院",
  "院士",
  "iso",
  "rohs",
  "体系认证",
  "检测报告",
  "行业龙头",
  "标杆客户",
  "500强",
  "上市公司",
  "独角兽",
  "首席",
  "合伙人",
  "总监",
]
const DEF_RE = /(是指|即是|即\s|：|:\s|定义为|意思是|refers to|is a|are a)/i
const ANCHOR_STOP = ["点击", "这里", "更多", "详情", "read", "click", "here", "more", "阅读全文", "查看", "了解"]

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

function hasH1(p: ParsedDoc): boolean {
  return p.headings.some((h) => h.level === 1) || !!p.title
}

function headingHierarchyOk(p: ParsedDoc): boolean {
  if (p.headings.length < 2) return true
  let prev = p.headings[0].level
  for (let i = 1; i < p.headings.length; i++) {
    const lv = p.headings[i].level
    if (lv - prev > 1) return false
    prev = lv
  }
  return true
}

function countMatches(text: string, words: string[]): number {
  let n = 0
  for (const w of words) {
    if (text.includes(w)) n++
  }
  return n
}

function countWordMatch(text: string, words: string[], caseSensitive = false): number {
  let n = 0
  const t = caseSensitive ? text : text.toLowerCase()
  for (const w of words) {
    const target = caseSensitive ? w : w.toLowerCase()
    if (t.includes(target)) n++
  }
  return n
}

function detectStatistics(text: string): number {
  const a = (text.match(STAT_RE) || []).length
  const b = (text.match(CURRENCY_RE) || []).length
  return a + b
}

function newestDate(dates: string[]): Date | null {
  let best: Date | null = null
  for (const d of dates) {
    const m =
      d.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?/) ||
      d.match(/(\d{4})年(\d{1,2})月/) ||
      d.match(/^(\d{4})$/) ||
      d.match(/(\d{1,2})月(\d{1,2})日/)
    if (!m) continue
    let y: number, mo: number, da: number
    if (m[1]) {
      y = +m[1]
      mo = +m[2] || 1
      da = +m[3] || 1
    } else if (m[4]) {
      y = +m[4]
      mo = +m[5]
      da = 1
    } else {
      y = new Date().getFullYear()
      mo = +m[6]
      da = +m[7]
    }
    const dt = new Date(y, mo - 1, da)
    if (isNaN(dt.getTime())) continue
    if (!best || dt > best) best = dt
  }
  return best
}

// ───────────────────────── 维度评分 ─────────────────────────
function scoreStructure(p: ParsedDoc): DimensionResult {
  const h1 = hasH1(p)
  const hc = p.headings.length
  const hier = headingHierarchyOk(p)
  const sections = p.headings.filter((h) => h.level <= 3).length
  const avgPara = p.wordCount / Math.max(p.paragraphs.length, 1)
  let s = 0
  if (h1) s += 20
  s += (clamp(hc, 0, 6) / 6) * 20
  s += hier ? 15 : 5
  s += sections >= 4 ? 15 : sections >= 2 ? 8 : 0
  s += p.listCount > 0 ? 12 : 0
  s += p.tableCount > 0 ? 10 : 0
  s += avgPara >= 30 && avgPara <= 160 ? 8 : avgPara > 160 ? 0 : 4
  s = clamp(s)
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (!h1) {
    issues.push("缺少明确的 H1/主标题，AI 难以判断页面主题")
    suggestions.push("为页面添加唯一且描述准确的 H1 标题")
  } else strengths.push("具备清晰主标题")
  if (hc < 3) {
    issues.push(`标题层级偏少（仅 ${hc} 个），结构扁平`)
    suggestions.push("用 H2/H3 将内容拆分为 4+ 个语义段落，每节一个明确小标题")
  } else strengths.push(`标题层级丰富（${hc} 个）`)
  if (!hier) {
    issues.push("标题层级跳跃（如 H1 直接到 H3），破坏语义树")
    suggestions.push("修正标题层级，避免跨级跳跃（H1→H2→H3 顺序嵌套）")
  }
  if (p.listCount === 0 && p.tableCount === 0) {
    issues.push("缺少列表/表格，不利于 AI 抽取要点")
    suggestions.push("将并列信息改写为有序/无序列表或对比表格")
  } else strengths.push("使用了列表/表格等结构化表达")
  if (avgPara > 160) {
    issues.push(`段落偏长（平均约 ${Math.round(avgPara)} 字），不利分块理解`)
    suggestions.push("将长段落拆分为 80–150 字的小段，一段一个论点")
  }
  return {
    key: "structure",
    label: "结构清晰度",
    weight: 0.15,
    score: s,
    summary: `标题体系${h1 ? "完整" : "缺失"}，共 ${hc} 个标题、${
      p.listCount + p.tableCount
    } 个结构化块，段落平均 ${Math.round(avgPara)} 字。`,
    strengths,
    issues,
    suggestions,
  }
}

function scoreEntities(p: ParsedDoc): DimensionResult {
  const quoted = (p.text.match(/[「“”‘’《]([^」“”‘’》]{2,20})[」“”‘’》]/g) || []).length
  const brand = (p.text.match(/\b[A-Z][A-Za-z]{2,}\b/g) || []).length
  const entitySignal = quoted + brand
  const sentences = splitSentences(p.text)
  const defCount = sentences.filter((s) => DEF_RE.test(s) && s.length < 120).length
  // 简单关键词频次（英文词 + 中文 2-4 字片段）
  const tokens = p.text
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}|[一-鿿]{2,4}/g)
  const freq = new Map<string, number>()
  ;(tokens || []).forEach((t) => freq.set(t, (freq.get(t) || 0) + 1))
  const topTerms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const topTermRatio = topTerms.length ? topTerms[0][1] / Math.max(p.wordCount, 1) : 0
  const stats = detectStatistics(p.text)
  let s = 0
  s += (clamp(entitySignal, 0, 8) / 8) * 30
  s += (clamp(defCount, 0, 4) / 4) * 25
  s += (clamp(topTerms.length, 0, 5) / 5) * 20
  s += quoted > 0 ? 15 : 0
  s += stats > 0 ? 10 : 0
  s = clamp(s)
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (entitySignal < 3) {
    issues.push("命名实体（品牌/产品/专有名词）稀疏，主题信号弱")
    suggestions.push("明确并高频出现核心实体（品牌、型号、参数），首次出现加引号或全称")
  } else strengths.push(`命名实体丰富（约 ${entitySignal} 处）`)
  if (defCount < 2) {
    issues.push("缺少「X 是指 Y」式定义句，AI 不易抽取实体含义")
    suggestions.push("为每个核心概念补充一句定义（如「A 是……」「A 指的是……」）")
  } else strengths.push(`包含 ${defCount} 处定义式表述`)
  if (topTermRatio < 0.004) {
    issues.push("关键词聚焦度低，主题不够突出")
    suggestions.push("围绕 3–5 个核心词展开，提升主题一致性")
  } else strengths.push("核心关键词聚焦度良好")
  return {
    key: "entities",
    label: "实体与主题明确性",
    weight: 0.15,
    score: s,
    summary: `命名实体约 ${entitySignal} 处、定义句 ${defCount} 处，核心词聚焦度 ${(
      topTermRatio * 100
    ).toFixed(1)}%。`,
    strengths,
    issues,
    suggestions,
  }
}

function scoreQuotability(p: ParsedDoc): DimensionResult {
  const stats = detectStatistics(p.text)
  const sentences = splitSentences(p.text)
  const shortDecl = sentences.filter((s) => s.length <= 45 && s.length >= 6).length
  const shortRatio = sentences.length ? shortDecl / sentences.length : 0
  const direct = sentences.filter((s) => /[：:—\-–>]/.test(s) && s.length < 100).length
  let s = 0
  s += stats > 0 ? 30 : 0
  s += (clamp(stats, 0, 5) / 5) * 25
  s += (clamp(shortRatio, 0, 0.4) / 0.4) * 20
  s += direct > 0 ? 15 : 0
  s += sentences.length > 20 ? 10 : 0
  s = clamp(s)
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (stats === 0) {
    issues.push("无具体数字/数据，难以被作为权威引用")
    suggestions.push("补充量化数据（参数、价格、占比、测试结果）作为可引用锚点")
  } else strengths.push(`含 ${stats} 处量化数据`)
  if (shortRatio < 0.15) {
    issues.push("可独立引用的短句偏少，多为长句")
    suggestions.push("提炼若干「一句话结论/要点」，便于 AI 直接引用")
  } else strengths.push("存在可直接引用的短结论句")
  if (direct === 0) {
    issues.push("缺少「标题：结论」式直给表达")
    suggestions.push("用「问题：答案」「结论：依据」结构输出关键判断")
  }
  return {
    key: "quotability",
    label: "可引用性",
    weight: 0.15,
    score: s,
    summary: `量化数据 ${stats} 处，短结论句占比 ${(shortRatio * 100).toFixed(0)}%，直给式表达 ${direct} 处。`,
    strengths,
    issues,
    suggestions,
  }
}

function scoreEeat(p: ParsedDoc, input: GeoInput): DimensionResult {
  const hasAuthor = !!(
    p.meta.authorMeta ||
    input.author ||
    /(作者\s*[:：]|文\/|by\s+[a-z一-鿿]|author\s*[:：])/i.test(p.text.slice(0, 500))
  )
  const ext = p.links.filter((l) => !l.internal).length
  const hasDates = p.dates.length > 0
  const cred = countWordMatch(p.text, CREDENTIAL)
  const hasCred = cred > 0 || /关于作者|作者简介|作者简介|主理人/i.test(p.text)
  let s = 0
  s += hasAuthor ? 25 : 0
  s += (Math.min(ext, 4) / 4) * 25
  s += hasDates ? 15 : 0
  s += hasCred ? Math.min(15 + (cred - 1) * 5, 30) : 0
  s += p.meta.description || p.meta.ogDescription ? 15 : 0
  s = clamp(s)
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (!hasAuthor) {
    issues.push("未识别到作者/来源署名，权威性存疑")
    suggestions.push("添加作者署名与简介（含资质/经验），建立 EEAT")
  } else strengths.push("具备作者/来源署名")
  if (ext === 0) {
    issues.push("无外链引用，缺乏证据支撑")
    suggestions.push("引用权威来源（官网、论文、检测报告）并用描述性锚文本")
  } else strengths.push(`含 ${ext} 条外链引用`)
  if (!hasDates) {
    issues.push("未标注发布/更新时间")
    suggestions.push("添加发布时间与更新时间，体现时效与维护")
  } else strengths.push("已标注时间信息")
  if (!hasCred) {
    issues.push("缺少资质/经验背书信号")
    suggestions.push("在文首或作者简介中说明专业资质与从业经验")
  }
  return {
    key: "eeat",
    label: "经验/专业/权威/可信 (EEAT)",
    weight: 0.12,
    score: s,
    summary: `作者署名${hasAuthor ? "有" : "无"}、外链 ${ext} 条、时间${hasDates ? "有" : "无"}、资质信号${
      hasCred ? "有" : "无"
    }。`,
    strengths,
    issues,
    suggestions,
  }
}

function scoreStructuredData(p: ParsedDoc): DimensionResult {
  let s = 0
  s += p.meta.jsonLd ? 35 : 0
  s += p.meta.description ? 15 : 0
  s += p.meta.ogTitle || p.meta.ogDescription ? 15 : 0
  s += p.meta.ogType ? 10 : 0
  s += p.hasHtml && p.headings.length > 0 ? 15 : 0
  s += p.hasHtml ? 10 : 0
  s = clamp(s)
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (!p.meta.jsonLd) {
    issues.push("未检测到 JSON-LD 结构化数据")
    suggestions.push("部署 schema.org/Article 的 JSON-LD，便于 AI 理解实体关系")
  } else strengths.push(`含结构化数据：${p.meta.jsonLdTypes.join("、") || "JSON-LD"}`)
  if (!p.meta.description) {
    issues.push("缺少 meta description")
    suggestions.push("补充精准的 meta description（150 字内，含核心实体）")
  } else strengths.push("具备 meta description")
  if (!p.meta.ogTitle && !p.meta.ogDescription) {
    issues.push("缺少 Open Graph 标签")
    suggestions.push("补充 og:title / og:description / og:type，提升社交与引擎识别")
  } else strengths.push("具备 Open Graph 标签")
  if (!p.hasHtml) {
    issues.push("当前为纯文本输入，无法承载结构化数据与元数据")
    suggestions.push("将内容发布为网页并嵌入上述结构化标记后再分析")
  }
  return {
    key: "structuredData",
    label: "结构化数据",
    weight: 0.12,
    score: s,
    summary: `JSON-LD ${p.meta.jsonLd ? "有" : "无"}、meta description ${
      p.meta.description ? "有" : "无"
    }、OG 标签 ${p.meta.ogTitle || p.meta.ogDescription ? "有" : "无"}。`,
    strengths,
    issues,
    suggestions,
  }
}

function scoreTechnical(p: ParsedDoc, input: GeoInput): DimensionResult {
  let s = 0
  if (p.hasHtml && input.html) {
    const ratio = clamp(p.text.length / Math.max(input.html.length, 1), 0, 1)
    s += ratio * 45
    const altCov = p.images.length > 0 ? p.images.filter((i) => i.hasAlt).length / p.images.length : 0.85
    s += altCov * 25
    const goodAnchor = p.links.filter((l) => l.text.length > 2 && !ANCHOR_STOP.some((w) => l.text.includes(w))).length
    const anchorRatio = p.links.length ? goodAnchor / p.links.length : 0
    s += anchorRatio * 20
    const avgPara = p.wordCount / Math.max(p.paragraphs.length, 1)
    s += avgPara >= 30 && avgPara <= 220 ? 10 : 0
  } else {
    // 纯文本：用结构/可读性代理评估（无 HTML 噪声信号可用）
    const paras = p.paragraphs.length
    const words = p.wordCount
    const avgPara = words / Math.max(paras, 1)
    s += clamp((Math.min(paras, 6) / 6) * 35)
    s += avgPara >= 30 && avgPara <= 400 ? 25 : avgPara > 0 ? 10 : 0
    s += clamp((Math.min(p.headings.length, 4) / 4) * 25)
    s += words >= 400 ? 15 : words >= 150 ? 8 : 0
    s = clamp(s)
  }
  s = clamp(s)
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (p.hasHtml) {
    const ratio = clamp(p.text.length / Math.max(input.html!.length, 1), 0, 1)
    if (ratio < 0.15) {
      issues.push("正文占比过低，疑似大量模板/广告噪声")
      suggestions.push("精简导航/侧栏/广告，提升正文信号密度")
    } else strengths.push("正文信号密度良好")
    if (p.images.length > 0) {
      const cov = p.images.filter((i) => i.hasAlt).length / p.images.length
      if (cov < 0.6) {
        issues.push(`图片 alt 覆盖率低（${Math.round(cov * 100)}%）`)
        suggestions.push("为图片补充描述性 alt 文本，承载可被检索的信息")
      } else strengths.push("图片 alt 覆盖良好")
    }
    const goodAnchor = p.links.filter((l) => l.text.length > 2 && !ANCHOR_STOP.some((w) => l.text.includes(w))).length
    if (p.links.length && goodAnchor / p.links.length < 0.6) {
      issues.push("存在「点击这里」类等低信息锚文本")
      suggestions.push("链接用描述性文字（如「2024 能效标准原文」）而非「点击查看」")
    }
  } else {
    issues.push("纯文本模式，无法评估噪声/alt/锚文本等技术可读性")
    suggestions.push("发布为网页后可获取完整技术可读性诊断")
  }
  return {
    key: "technical",
    label: "技术可读性",
    weight: 0.1,
    score: s,
    summary: p.hasHtml
      ? `正文占比 ${Math.round((p.text.length / Math.max(input.html!.length, 1)) * 100)}%，图片 ${
          p.images.length
        } 张、链接 ${p.links.length} 条。`
      : "纯文本输入，按干净正文计。",
    strengths,
    issues,
    suggestions,
  }
}

function scoreFreshness(p: ParsedDoc, input: GeoInput): DimensionResult {
  const dates = [...p.dates]
  if (input.publishedDate) dates.push(input.publishedDate)
  if (input.modifiedDate) dates.push(input.modifiedDate)
  let s: number
  if (dates.length === 0) {
    s = 30
  } else {
    const nd = newestDate(dates)
    if (!nd) s = 35
    else {
      const ageDays = (Date.now() - nd.getTime()) / 86400000
      if (ageDays < 180) s = 100
      else if (ageDays < 365) s = 85
      else if (ageDays < 730) s = 65
      else s = 15 // 已知过时：低于「无日期」默认值，体现陈旧惩罚
    }
  }
  // 显式时效词加权（无绝对日期但声明最新/近期时）
  if (/最新|近期|今年|本月|近日|日前|刚刚|更新于/.test(p.text) && s < 100) s = clamp(s + 12)
  const hasBoth = !!(input.publishedDate && input.modifiedDate)
  s = clamp(s + (hasBoth ? 0 : 0))
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (dates.length === 0) {
    issues.push("未检测到任何时间信息")
    suggestions.push("标注发布时间与更新时间，并定期刷新内容")
  } else {
    const nd = newestDate(dates)
    const ageDays = nd ? Math.round((Date.now() - nd.getTime()) / 86400000) : 9999
    if (ageDays > 365) {
      issues.push(`内容已 ${Math.round(ageDays / 365)} 年未更新，时效性弱`)
      suggestions.push("更新数据/结论并标注新版本时间，触发重抓取")
    } else strengths.push(`时效良好（约 ${ageDays} 天前更新）`)
  }
  if (!hasBoth && dates.length > 0) {
    suggestions.push("同时提供发布时间与更新时间，体现持续维护")
  }
  return {
    key: "freshness",
    label: "新鲜度",
    weight: 0.08,
    score: s,
    summary: dates.length ? `检测到 ${dates.length} 个时间信息` : "未检测到时间信息。",
    strengths,
    issues,
    suggestions,
  }
}

function scoreUniqueness(p: ParsedDoc): DimensionResult {
  const opinion = countWordMatch(p.text, OPINION)
  const generic = countMatches(p.text, GENERIC)
  const firstPerson = /(我|我们|本人|我的|我们公司|我公司|本实验室|本站)/.test(p.text)
  const stats = detectStatistics(p.text)
  // 具体案例：同句含品牌词+数字
  const specific = splitSentences(p.text).filter((s) => /\b[A-Z][A-Za-z]{2,}\b/.test(s) && /\d/.test(s)).length
  let s = 0
  s += (clamp(opinion, 0, 5) / 5) * 30
  s += specific > 0 ? 20 : 0
  s += firstPerson ? 15 : 0
  s += stats > 0 ? 10 : 0
  s -= generic * 6
  s = clamp(s)
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (opinion < 2) {
    issues.push("缺乏观点/立场表达，内容偏「百科式」")
    suggestions.push("加入明确立场与建议（如「更推荐 X，因为……」）")
  } else strengths.push(`含 ${opinion} 处观点/立场表达`)
  if (generic >= 2) {
    issues.push(`存在 ${generic} 处套话/模板化表达，稀释独特性`)
    suggestions.push("删除「在当今世界/随着…发展」等套话，直接切入主题")
  }
  if (!firstPerson) {
    issues.push("缺少第一手经验信号")
    suggestions.push("补充实测/使用心得等一手经验，提升可信与独特")
  } else strengths.push("具备第一手经验信号")
  if (specific === 0) {
    issues.push("缺少「品牌+数据」式具体案例")
    suggestions.push("用具体型号+实测数据支撑论点，避免空泛")
  } else strengths.push(`含 ${specific} 处具体案例（品牌+数据）`)
  return {
    key: "uniqueness",
    label: "独特性 / 反模板",
    weight: 0.13,
    score: s,
    summary: `观点 ${opinion} 处、套话 ${generic} 处、一手经验${firstPerson ? "有" : "无"}、具体案例 ${specific} 处。`,
    strengths,
    issues,
    suggestions,
  }
}

function gradeOf(score: number): string {
  if (score >= 85) return "A"
  if (score >= 72) return "B"
  if (score >= 58) return "C"
  if (score >= 42) return "D"
  return "E"
}

// B2B 模式第 9 维度：企业转化信号（产品规格 / 实证 / 信任 / 转化 / 对比）
function scoreB2BSignals(sig: B2BSignals): DimensionResult {
  const s = sig.score
  const issues: string[] = []
  const strengths: string[] = []
  const suggestions: string[] = []
  if (sig.productSpec < 10) {
    issues.push("缺乏产品规格/型号/参数信号，B 端客户难以评估匹配度")
    suggestions.push("补充产品型号、规格参数表（尺寸/功率/容量等量化指标）")
  } else strengths.push(`产品规格信号充分（${sig.detail.productSpecKw} 处关键词 + ${sig.detail.modelCodes} 个型号代码）`)
  if (sig.proof < 10) {
    issues.push("缺少客户案例/实证，说服力不足")
    suggestions.push("加入客户案例、白皮书、ROI / 续约率等实证材料")
  } else strengths.push(`具备客户实证信号（${sig.detail.proofKw} 处）`)
  if (sig.trust < 10) {
    issues.push("资质/认证/合规信号不足，影响信任与入围")
    suggestions.push("突出 ISO / CE / 专利 / 行业认证与合作伙伴生态")
  } else strengths.push(`信任背书充足（${sig.detail.trustKw} 处）`)
  if (sig.buying < 8) {
    issues.push("缺少明确的转化路径（询价/预约/试用）")
    suggestions.push("增加「预约演示 / 免费试用 / 获取方案」等转化入口")
  } else strengths.push("具备清晰转化路径信号")
  if (sig.comparison < 8) {
    issues.push("缺少选型对比/决策辅助内容")
    suggestions.push("提供选型指南、竞品对比、优劣分析，降低决策成本")
  } else strengths.push("具备选型对比/决策辅助内容")
  return {
    key: "b2b",
    label: "B2B 转化信号",
    weight: 0.1,
    score: s,
    summary: `规格 ${sig.productSpec} · 实证 ${sig.proof} · 信任 ${sig.trust} · 转化 ${sig.buying} · 对比 ${sig.comparison}`,
    strengths,
    issues,
    suggestions,
  }
}

export { gradeOf }

export function analyzeGeo(input: GeoInput, opts?: { mode?: GeoMode }): GeoAnalysis {
  const mode: GeoMode = opts?.mode ?? "general"
  const p = parseDoc(input)
  const dims: DimensionResult[] = [
    scoreStructure(p),
    scoreEntities(p),
    scoreQuotability(p),
    scoreEeat(p, input),
    scoreStructuredData(p),
    scoreTechnical(p, input),
    scoreFreshness(p, input),
    scoreUniqueness(p),
  ]
  if (mode === "b2b") {
    // 新增 B2B 维度，权重 10%；其余 8 维各 ×0.9 重新归一（总和仍 = 1.0）
    const factor = 0.9
    dims.forEach((d) => {
      d.weight = Math.round(d.weight * factor * 1000) / 1000
    })
    dims.push(scoreB2BSignals(detectB2BSignals(p.text)))
  }
  const overall = Math.round(dims.reduce((acc, d) => acc + d.score * d.weight, 0))
  const grade = gradeOf(overall)

  // 聚合优先建议：按「权重 × (100-分数)」排序，取低分维度建议
  const ranked = [...dims].sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))
  const topSuggestions: string[] = []
  for (const d of ranked) {
    for (const sug of d.suggestions) {
      if (!topSuggestions.includes(sug)) topSuggestions.push(sug)
      if (topSuggestions.length >= 8) break
    }
    if (topSuggestions.length >= 8) break
  }

  const readingTimeMin = estimateReadingTime(p.wordCount)
  const meta: GeoMeta = {
    hasH1: hasH1(p),
    headingCount: p.headings.length,
    headingHierarchyOk: headingHierarchyOk(p),
    listCount: p.listCount,
    tableCount: p.tableCount,
    linkCount: p.links.length,
    internalLinkCount: p.links.filter((l) => l.internal).length,
    externalLinkCount: p.links.filter((l) => !l.internal).length,
    imageCount: p.images.length,
    imageWithAlt: p.images.filter((i) => i.hasAlt).length,
    hasJsonLd: p.meta.jsonLd,
    hasMetaDescription: !!p.meta.description,
    hasOgTags: !!(p.meta.ogTitle || p.meta.ogDescription),
    hasAuthor: !!(p.meta.authorMeta),
    hasDates: p.dates.length > 0,
    hasStatistics: detectStatistics(p.text) > 0,
    entitySignal: (p.text.match(/[「“”‘’《][^」“”‘’》]{2,20}[」“”‘’》]/g) || []).length +
      (p.text.match(/\b[A-Z][A-Za-z]{2,}\b/g) || []).length,
    genericPhraseHits: countMatches(p.text, GENERIC),
    opinionSignal: countWordMatch(p.text, OPINION),
    readingTimeMin,
  }

  return {
    overall,
    grade,
    dimensions: dims,
    wordCount: p.wordCount,
    readingTimeMin,
    extractedTitle: p.title,
    source: input.url && p.hasHtml ? "url" : "text",
    meta,
    topSuggestions,
    analyzedAt: Date.now(),
  }
}
