// 统一审计报告生成器：把一次 GEO 审计 + 内容差距分析渲染为完整可打印 HTML
// 纯 HTML + 内联 CSS，零三方依赖，中文排版，可直接浏览器另存/打印为 PDF。

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

/** ISO 时间 → "YYYY-MM-DD HH:mm"（本地时区） */
function fmtTime(iso) {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return String(iso || "")
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const MODE_LABEL = {
  "rag-search": "RAG 联网搜索审计",
  search: "联网真监测",
  offline: "离线固有认知",
}

/** 分数分档着色：>=70 优 / >=40 中 / <40 差 */
const scoreClass = (n) => (n >= 70 ? "good" : n >= 40 ? "mid" : "bad")

const yesNo = (b) =>
  b ? '<span class="yes">✓ 是</span>' : '<span class="no">✗ 否</span>'

/**
 * 生成完整审计报告 HTML
 * @param {{project?: object, audit?: object, contentGaps?: Array}} opts
 * @returns {string} 完整 HTML 文档
 */
export function buildAuditReport({ project = {}, audit = {}, contentGaps = [] } = {}) {
  const brand = project.brand || audit.brand || "(未命名品牌)"
  const domain = project.domain || audit.domain || ""
  const industry = project.industry || ""
  const perQuery = Array.isArray(audit.perQuery) ? audit.perQuery : []
  const topCompetitors = Array.isArray(audit.topCompetitors) ? audit.topCompetitors : []
  const gapAnalysis = audit.gapAnalysis && typeof audit.gapAnalysis === "object" ? audit.gapAnalysis : {}
  const gaps = Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : []
  const gapSuggestions = Array.isArray(gapAnalysis.suggestions) ? gapAnalysis.suggestions : []
  const items = (Array.isArray(contentGaps) ? contentGaps : [])
    .filter((x) => x && typeof x === "object")
    .slice()
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))

  const sources = Array.isArray(audit.sources) ? audit.sources : []
  const contentTracking = Array.isArray(audit.contentTracking) ? audit.contentTracking : []
  const intendedCount = Number(audit.intendedCount) || contentTracking.length
  const includedCount = Number(audit.includedCount) || 0
  const partialCount = Number(audit.partialCount) || 0
  const missingCount = Number(audit.missingCount) || 0
  const includedRate = intendedCount ? Math.round((includedCount / intendedCount) * 100) : null

  const serpVisibility = Number(audit.serpVisibility) || 0
  const aiCitationRate = Number(audit.aiCitationRate) || 0
  const overallScore =
    Number(audit.overallScore) || Math.round(aiCitationRate * 0.6 + serpVisibility * 0.4)
  const modeLabel = MODE_LABEL[audit.mode] || audit.mode || "标准审计"
  const auditTime = fmtTime(audit.timestamp)
  const generatedAt = fmtTime()

  // 竞品 → 出现在哪些 query（从逐条审计明细反查）
  const compQueries = new Map()
  for (const r of perQuery) {
    const names = [...(r.brandsInSerp || []), ...(r.brandsInAnswer || [])].map((s) =>
      String(s).trim()
    )
    for (const n of new Set(names)) {
      if (!n || n === brand) continue
      if (!compQueries.has(n)) compQueries.set(n, new Set())
      compQueries.get(n).add(r.query)
    }
  }

  // ---- 3. 逐条 query 审计表 ----
  const queryRows = perQuery
    .map((r, i) => {
      const comps = [
        ...new Set(
          [...(r.brandsInSerp || []), ...(r.brandsInAnswer || [])]
            .map((s) => String(s).trim())
            .filter((s) => s && s !== brand)
        ),
      ]
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="query">${esc(r.query)}</td>
        <td>${yesNo(!!r.inSerp)}</td>
        <td>${yesNo(!!r.inAiAnswer)}</td>
        <td>${comps.length ? esc(comps.join("、")) : '<span class="muted">—</span>'}</td>
      </tr>`
    })
    .join("\n")

  // ---- 4. 竞品情报表 ----
  const compRows = topCompetitors
    .map((c, i) => {
      const seen = compQueries.get(c.name)
      const queryList = seen ? [...seen] : []
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="query">${esc(c.name)}</td>
        <td><span class="badge">${Number(c.count) || 0} 次</span></td>
        <td>${queryList.length ? esc(queryList.join("；")) : '<span class="muted">—</span>'}</td>
      </tr>`
    })
    .join("\n")

  // ---- 4b. 信源排名表（新增）----
  const sourceRows = sources
    .map((s, i) => {
      const rel = Number(s.avgRelevance) || 0
      const relColor = rel >= 60 ? "#15803d" : rel >= 30 ? "#b45309" : "#b91c1c"
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="query">${esc(s.title)}</td>
        <td class="muted">${esc(s.url || "")}</td>
        <td>${Number(s.citedCount) > 0 ? `<span class="badge">被引 ${s.citedCount} 次</span>` : '<span class="muted">未引用</span>'}</td>
        <td><b style="color:${relColor}">${rel}</b></td>
      </tr>`
    })
    .join("\n")

  // ---- 4c. 内容收录追踪表（新增）----
  const trackRows = contentTracking
    .map((c) => {
      const color = c.status === "收录" ? "#15803d" : c.status === "部分" ? "#b45309" : "#b91c1c"
      const where = Array.isArray(c.where) ? c.where.join(" / ") : ""
      return `<tr>
        <td class="query">${esc(c.point)}</td>
        <td><b style="color:${color}">${esc(c.status)}</b></td>
        <td class="muted">${where ? esc(where) : "—"}</td>
      </tr>`
    })
    .join("\n")

  // ---- 5. 差距分析 ----
  const gapLis = gaps.map((g) => `<li>${esc(g)}</li>`).join("\n")
  const gapSugLis = gapSuggestions.map((g) => `<li>${esc(g)}</li>`).join("\n")

  // ---- 6. 内容建议清单 ----
  const PRIORITY_LABEL = { 5: "P5 最高", 4: "P4 高", 3: "P3 中", 2: "P2 低", 1: "P1 最低" }
  const itemCards = items
    .map((x) => {
      const p = Math.min(5, Math.max(1, Number(x.priority) || 3))
      return `<div class="item">
        <div class="item-head">
          <span class="prio prio-${p}">${PRIORITY_LABEL[p]}</span>
          <span class="item-topic">${esc(x.topic)}</span>
        </div>
        <div class="item-meta">建议发布平台：${esc(x.platform || "—")}</div>
        ${x.reason ? `<p class="item-text"><b>为什么做：</b>${esc(x.reason)}</p>` : ""}
        ${x.competitorExample ? `<p class="item-text"><b>竞品参照：</b>${esc(x.competitorExample)}</p>` : ""}
      </div>`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GEO 审计报告 · ${esc(brand)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
      "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    color: #1c2532; background: #eef1f5; line-height: 1.75;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 920px; margin: 24px auto; background: #fff; padding: 56px 60px;
    box-shadow: 0 2px 16px rgba(15, 30, 55, .08); }
  .report-header { border-bottom: 3px solid #14532d; padding-bottom: 24px; margin-bottom: 32px; }
  .report-tag { display: inline-block; font-size: 12px; letter-spacing: .2em; color: #14532d;
    border: 1px solid #14532d; border-radius: 3px; padding: 2px 10px; margin-bottom: 14px; }
  h1 { font-size: 28px; font-weight: 700; color: #101a28; }
  .meta { margin-top: 10px; font-size: 14px; color: #5b6b80; }
  .meta span { margin-right: 18px; }
  h2 { font-size: 18px; font-weight: 700; color: #14532d; margin: 36px 0 14px;
    padding-left: 12px; border-left: 4px solid #14532d; }
  .metrics { display: flex; gap: 14px; flex-wrap: wrap; }
  .metric { flex: 1 1 180px; border: 1px solid #e3e8ef; border-radius: 10px; padding: 18px 20px;
    background: #fafbfc; }
  .metric .label { font-size: 13px; color: #5b6b80; }
  .metric .value { font-size: 34px; font-weight: 800; line-height: 1.25; margin-top: 4px; }
  .metric .value small { font-size: 15px; font-weight: 600; color: #8a97a8; }
  .good { color: #15803d; } .mid { color: #b45309; } .bad { color: #b91c1c; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border: 1px solid #e3e8ef; padding: 9px 12px; text-align: left; vertical-align: top; }
  th { background: #f2f6f3; color: #14532d; font-weight: 700; white-space: nowrap; }
  tr:nth-child(even) td { background: #fafcfb; }
  td.num { width: 36px; text-align: center; color: #8a97a8; }
  td.query { font-weight: 600; }
  .yes { color: #15803d; font-weight: 700; } .no { color: #b91c1c; font-weight: 700; }
  .muted { color: #9aa7b6; }
  .badge { display: inline-block; background: #e8f2ec; color: #14532d; border-radius: 20px;
    padding: 1px 10px; font-size: 13px; font-weight: 700; }
  .summary-box { background: #f2f6f3; border: 1px solid #d4e4da; border-radius: 10px;
    padding: 16px 20px; font-size: 14.5px; }
  ul.gaps { margin: 12px 0 0 22px; font-size: 14.5px; }
  ul.gaps li { margin-bottom: 8px; }
  .item { border: 1px solid #e3e8ef; border-radius: 10px; padding: 16px 20px; margin-bottom: 14px; }
  .item-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .prio { font-size: 12px; font-weight: 800; border-radius: 4px; padding: 2px 8px; white-space: nowrap; }
  .prio-5 { background: #b91c1c; color: #fff; } .prio-4 { background: #b45309; color: #fff; }
  .prio-3 { background: #14532d; color: #fff; } .prio-2, .prio-1 { background: #64748b; color: #fff; }
  .item-topic { font-size: 15.5px; font-weight: 700; }
  .item-meta { font-size: 13px; color: #14532d; margin-top: 6px; font-weight: 600; }
  .item-text { font-size: 14px; color: #37455a; margin-top: 6px; }
  .report-footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid #e3e8ef;
    font-size: 12.5px; color: #8a97a8; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; max-width: none; box-shadow: none; padding: 24px 8px; }
    h2, .item, .metric { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- 1. 头部 -->
  <div class="report-header">
    <div class="report-tag">GEO AUDIT REPORT</div>
    <h1>${esc(brand)} · 品牌可见度审计报告</h1>
    <div class="meta">
      ${domain ? `<span>域名：<b>${esc(domain)}</b></span>` : ""}
      ${industry ? `<span>行业：${esc(industry)}</span>` : ""}
      <span>审计日期：${esc(auditTime)}</span>
      <span>审计模式：${esc(modeLabel)}</span>
    </div>
  </div>

  <!-- 2. 核心指标 -->
  <h2>核心指标</h2>
  <div class="metrics">
    <div class="metric"><div class="label">GEO 总分</div>
      <div class="value ${scoreClass(overallScore)}">${overallScore}<small> / 100</small></div></div>
    <div class="metric"><div class="label">搜索可见度</div>
      <div class="value ${scoreClass(serpVisibility)}">${serpVisibility}<small> %</small></div></div>
    <div class="metric"><div class="label">AI 引用率</div>
      <div class="value ${scoreClass(aiCitationRate)}">${aiCitationRate}<small> %</small></div></div>
    <div class="metric"><div class="label">监测 Query 数 / 竞品数</div>
      <div class="value">${perQuery.length}<small> 条 / </small>${topCompetitors.length}<small> 个</small></div></div>
    <div class="metric"><div class="label">信源总数</div>
      <div class="value">${sources.length}<small> 个</small></div></div>
    <div class="metric"><div class="label">内容收录率</div>
      <div class="value ${includedRate === null ? "" : scoreClass(includedRate)}">${includedRate === null ? "—" : `${includedRate}<small> %</small>`}</div>
      <div class="label">已收录 ${includedCount} / 未出现 ${missingCount}</div></div>
  </div>

  <!-- 3. 逐条 query 审计 -->
  <h2>逐条 Query 审计明细</h2>
  <table>
    <thead><tr><th>#</th><th>监测 Query</th><th>搜索可见</th><th>AI 引用</th><th>出现的竞品</th></tr></thead>
    <tbody>
${queryRows || '<tr><td colspan="5" class="muted">（无审计明细）</td></tr>'}
    </tbody>
  </table>

  <!-- 4. 竞品情报 -->
  <h2>竞品情报</h2>
  <table>
    <thead><tr><th>#</th><th>竞品品牌</th><th>出现频次</th><th>被引用的 Query</th></tr></thead>
    <tbody>
${compRows || '<tr><td colspan="4" class="muted">（未监测到竞品）</td></tr>'}
    </tbody>
  </table>

  <!-- 4b. 信源排名 -->
  ${sources.length ? `<h2>信源排名（被 AI 引用次数 → 平均相关度）</h2>
  <table>
    <thead><tr><th>#</th><th>信源标题</th><th>网址</th><th>被 AI 引用</th><th>相关度</th></tr></thead>
    <tbody>
${sourceRows}
    </tbody>
  </table>` : ""}

  <!-- 5. 差距分析 -->
  <h2>差距分析</h2>
  ${gapAnalysis.summary ? `<div class="summary-box">${esc(gapAnalysis.summary)}</div>` : ""}
  ${gapLis ? `<ul class="gaps">\n${gapLis}\n</ul>` : '<p class="muted">（无差距分析数据）</p>'}
  ${gapSugLis ? `<h2>审计建议</h2>\n<ul class="gaps">\n${gapSugLis}\n</ul>` : ""}

  <!-- 5b. 内容收录追踪 -->
  ${contentTracking.length ? `<h2>内容收录追踪（企业想表达 → 最终收录）</h2>
  <div class="summary-box" style="margin-bottom:14px">
    已收录 <b class="good">${includedCount}</b> · 部分 <b style="color:#b45309">${partialCount}</b> · 未出现 <b class="bad">${missingCount}</b>
    （共 ${intendedCount} 个内容点）
  </div>
  <table>
    <thead><tr><th>企业想表达的内容点</th><th>收录状态</th><th>出现于</th></tr></thead>
    <tbody>
${trackRows}
    </tbody>
  </table>` : ""}

  <!-- 6. 内容建议清单（按优先级排序） -->
  <h2>内容创作清单（按优先级排序）</h2>
${itemCards || '<p class="muted">（暂无内容建议，可调用 /api/geo/content-gap 生成）</p>'}

  <!-- 7. 页脚 -->
  <div class="report-footer">
    <span>报告生成时间：${esc(generatedAt)}</span>
    <span>GEO AI · 生成式引擎优化系统</span>
  </div>

</div>
</body>
</html>`
}
