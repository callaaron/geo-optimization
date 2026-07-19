// 可交付 B 端报告生成（纯函数，可在 Node 中经 esbuild 冒烟测试）
// buildReport → 自包含可打印 HTML（适合导出 PDF）
// recordsToCSV / citationsToCSV → 数据导出
import type { AnalysisRecord, BenchmarkResult, CitationEntry, GeoAnalysis, SiteScore } from "@/types/geo"

const DIM_LABEL: Record<string, string> = {
  structure: "结构清晰度",
  entities: "实体明确性",
  quotability: "可引用性",
  eeat: "EEAT",
  structuredData: "结构化数据",
  technical: "技术可读性",
  freshness: "新鲜度",
  uniqueness: "独特性",
  b2b: "B2B 转化信号",
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function scoreColor(s: number): string {
  if (s >= 85) return "#10b981"
  if (s >= 72) return "#22c55e"
  if (s >= 58) return "#eab308"
  if (s >= 42) return "#f97316"
  return "#ef4444"
}

function dimName(k: string): string {
  return DIM_LABEL[k] ?? k
}

function fmtDate(d: number): string {
  const dt = new Date(d)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export interface ReportOptions {
  analysis?: GeoAnalysis
  benchmark?: BenchmarkResult
  brand?: string
  site?: SiteScore
  citations?: CitationEntry[]
}

export function buildReport(opts: ReportOptions): string {
  const { analysis, benchmark, brand = "我的站点", site, citations } = opts
  const today = fmtDate(Date.now())
  const sections: string[] = []

  sections.push(`
    <div class="head">
      <div>
        <div class="title">GEO 优化诊断报告</div>
        <div class="sub">${esc(brand)} · 生成式引擎优化（Generative Engine Optimization）</div>
      </div>
      <div class="date">${today}</div>
    </div>
    <p class="lead">本报告由 GEO 优化系统生成，用于评估内容被 ChatGPT / Perplexity / 豆包等 AI 引擎理解、检索与引用的就绪度，并给出可执行的优化建议。</p>
  `)

  if (analysis) {
    const bars = analysis.dimensions
      .map(
        (d) => `
        <div class="row">
          <div class="rlabel">${esc(d.label)} <span class="rw">权重 ${Math.round(d.weight * 100)}%</span></div>
          <div class="track"><div class="fill" style="width:${d.score}%;background:${scoreColor(d.score)}"></div></div>
          <div class="rscore" style="color:${scoreColor(d.score)}">${d.score}</div>
        </div>`,
      )
      .join("")
    const sugg = analysis.topSuggestions.map((s) => `<li>${esc(s)}</li>`).join("")
    sections.push(`
      <h2>一、内容诊断（${esc(analysis.extractedTitle)}）</h2>
      <div class="overall">
        <div class="big" style="color:${scoreColor(analysis.overall)}">${analysis.overall}</div>
        <div>
          <div class="grade">等级 ${analysis.grade}</div>
          <div class="meta">${analysis.wordCount} 字 · 约 ${analysis.readingTimeMin} 分钟 · 来源：${
            analysis.source === "url" ? "网址" : "粘贴内容"
          }</div>
        </div>
      </div>
      <div class="bars">${bars}</div>
      <h3>优先优化建议</h3>
      <ol class="sugg">${sugg || "<li>暂无显著问题。</li>"}</ol>
    `)
  }

  if (benchmark && benchmark.entries.length > 0) {
    const head = `
      <tr>
        <th>站点</th><th>总分</th><th>等级</th>
        ${Object.keys(benchmark.entries[0].dimensions)
          .map((k) => `<th>${esc(dimName(k))}</th>`)
          .join("")}
      </tr>`
    const rows = benchmark.entries
      .map((e, i) => {
        const isMine = i === benchmark.yourIndex
        const cells = Object.entries(e.dimensions)
          .map(([, v]) => `<td>${v}</td>`)
          .join("")
        return `<tr class="${isMine ? "mine" : ""}"><td>${esc(e.label)}</td><td style="color:${scoreColor(e.overall)};font-weight:700">${e.overall}</td><td>${e.grade}</td>${cells}</tr>`
      })
      .join("")
    const recs = benchmark.recommendations.map((r) => `<li>${esc(r)}</li>`).join("")
    sections.push(`
      <h2>二、竞品对标</h2>
      <p class="lead">共 ${benchmark.entries.length} 个站点，最优为「${esc(benchmark.best.label)}」(${
        benchmark.best.overall
      })，最弱为「${esc(benchmark.worst.label)}」(${benchmark.worst.overall})。</p>
      <table class="bench"><thead>${head}</thead><tbody>${rows}</tbody></table>
      <h3>改进重点</h3>
      <ul class="sugg">${recs}</ul>
    `)
  }

  if (site && site.pages > 0) {
    const gradePills = Object.entries(site.gradeCounts)
      .map(([g, n]) => `<span class="pill">${g} 级：${n} 页</span>`)
      .join("")
    const dRows = Object.entries(site.byDimension)
      .map(
        ([k, v]) =>
          `<div class="row"><div class="rlabel">${esc(dimName(k))}</div><div class="track"><div class="fill" style="width:${v}%;background:${scoreColor(
            v,
          )}"></div></div><div class="rscore" style="color:${scoreColor(v)}">${v}</div></div>`,
      )
      .join("")
    sections.push(`
      <h2>三、站点聚合（${site.pages} 页）</h2>
      <div class="overall">
        <div class="big" style="color:${scoreColor(site.avgOverall)}">${site.avgOverall}</div>
        <div>
          <div class="grade">综合等级 ${site.grade}</div>
          <div class="pills">${gradePills}</div>
        </div>
      </div>
      <div class="bars">${dRows}</div>
    `)
  }

  if (citations && citations.length > 0) {
    const rows = citations
      .map(
        (c) =>
          `<tr><td>${esc(c.engine)}</td><td>${esc(c.query)}</td><td class="${
            c.found ? "ok" : "no"
          }">${c.found ? "已引用" : "未引用"}</td><td>${esc(c.note || "-")}</td></tr>`,
      )
      .join("")
    sections.push(`
      <h2>四、AI 引擎引用追踪</h2>
      <table class="bench"><thead><tr><th>引擎</th><th>查询</th><th>状态</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="note">说明：真实引用监测需接入各引擎 API；此处为人工登记基线数据。</p>
    `)
  }

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GEO 优化诊断报告 · ${esc(brand)}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",Segoe UI,sans-serif;color:#0f172a;background:#f1f5f9;margin:0;padding:32px}
  .page{max-width:880px;margin:0 auto;background:#fff;padding:40px 44px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #10b981;padding-bottom:16px}
  .title{font-size:22px;font-weight:800;color:#0f766e}
  .sub{font-size:13px;color:#475569;margin-top:4px}
  .date{font-size:13px;color:#64748b;white-space:nowrap}
  .lead{font-size:13px;color:#475569;line-height:1.7;margin:14px 0 6px}
  h2{font-size:17px;margin:28px 0 12px;padding-left:10px;border-left:4px solid #10b981;color:#0f172a}
  h3{font-size:14px;margin:18px 0 8px;color:#334155}
  .overall{display:flex;align-items:center;gap:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px}
  .big{font-size:46px;font-weight:800;line-height:1}
  .grade{font-size:15px;font-weight:700}
  .meta{font-size:12px;color:#64748b;margin-top:4px}
  .bars{margin:14px 0}
  .row{display:flex;align-items:center;gap:10px;margin:7px 0}
  .rlabel{width:140px;font-size:12px;color:#475569;flex:none}
  .rw{color:#94a3b8;font-weight:400;font-size:11px}
  .track{flex:1;height:10px;background:#e2e8f0;border-radius:6px;overflow:hidden}
  .fill{height:100%;border-radius:6px}
  .rscore{width:34px;text-align:right;font-weight:700;font-size:13px}
  .sugg{padding-left:20px;font-size:13px;line-height:1.85;color:#334155}
  .sugg li{margin:3px 0}
  table.bench{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
  table.bench th,table.bench td{border:1px solid #e2e8f0;padding:7px 9px;text-align:center}
  table.bench th{background:#f1f5f9;color:#334155;font-weight:600}
  table.bench td:first-child,table.bench th:first-child{text-align:left}
  table.bench tr.mine{background:#ecfdf5;font-weight:600}
  .ok{color:#10b981;font-weight:600}.no{color:#ef4444;font-weight:600}
  .pills{margin-top:6px}.pill{display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:2px 10px;font-size:11px;color:#475569;margin-right:6px}
  .note{font-size:11px;color:#94a3b8;margin-top:8px}
  @media print{body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0;max-width:100%}}
</style></head>
<body><div class="page">${sections.join("\n")}
<p style="margin-top:32px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px">本报告由 GEO 优化系统生成 · 数据均在本地浏览器计算，不离开设备</p>
</div></body></html>`
}

const CSV_ESC = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function recordsToCSV(records: AnalysisRecord[]): string {
  const header = ["label", "url", "overall", "structure", "entities", "quotability", "eeat", "structuredData", "technical", "freshness", "uniqueness", "b2b", "date"]
  const rows = records.map((r) =>
    [
      r.label,
      r.url || "",
      r.overall,
      r.dimensions.structure ?? "",
      r.dimensions.entities ?? "",
      r.dimensions.quotability ?? "",
      r.dimensions.eeat ?? "",
      r.dimensions.structuredData ?? "",
      r.dimensions.technical ?? "",
      r.dimensions.freshness ?? "",
      r.dimensions.uniqueness ?? "",
      r.dimensions.b2b ?? "",
      fmtDate(r.createdAt),
    ]
      .map(CSV_ESC)
      .join(","),
  )
  return [header.join(","), ...rows].join("\n")
}

export function citationsToCSV(citations: CitationEntry[]): string {
  const header = ["engine", "query", "found", "note", "date"]
  const rows = citations.map((c) =>
    [c.engine, c.query, c.found ? "已引用" : "未引用", c.note || "", fmtDate(c.createdAt)].map(CSV_ESC).join(","),
  )
  return [header.join(","), ...rows].join("\n")
}
