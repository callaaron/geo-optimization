// GEO 引擎 B2B 可用性验证脚本（纯文本路径，Node + esbuild 运行）
// 仅验证「文本路径」：所有 analyzeGeo 调用均传 { text }，不传 html（避免触发 DOMParser）。
import { analyzeGeo, gradeOf } from "@/lib/geo/analyzer"
import { detectB2BSignals } from "@/lib/geo/b2b"
import { benchmarkSites, aggregateSite } from "@/lib/geo/benchmark"
import { buildReport } from "@/lib/geo/report"
import { fetchUrl } from "@/lib/geo/fetch"
import type {
  AnalysisRecord,
  DimensionKey,
  GeoAnalysis,
  GeoInput,
  GeoMode,
} from "@/types/geo"

// ───────────────────────── 样例文本（真实风格、中文、质量分层） ─────────────────────────
// 强：工业 MES 产品页（型号/规格/案例/认证/报价预约）
const STRONG = `# 智云 MES-9000 智能工厂执行系统

智云 MES-9000 是面向离散制造企业的生产执行系统（MES），支持设备联网、工单排产与质量追溯。

## 核心规格参数
- 部署方式：私有云 / 本地化，单节点支持 200 台设备并发
- 数据采集延迟：≤ 50ms，系统可用性 99.95%
- 兼容协议：OPC-UA、Modbus-TCP、MQTT

## 客户实证
某汽车零部件标杆客户部署后，产能利用率提升 23%，不良率下降 18%，投资回报周期约 14 个月（ROI 实测）。我们已服务 120 家制造企业。

## 资质与认证
通过 ISO 9001 质量管理体系认证，持有 8 项工业软件发明专利，属于国家专精特新「小巨人」企业生态合作伙伴。

## 选型与购买
提供标准版、专业版、旗舰版三档配置。预约演示可获取专属方案与报价单，免费试用 30 天，联系销售获取详细报价。相比自建系统，上线周期更短。`

// 中：公司介绍/方案页（有实体与数据，但缺案例与转化引导）
const MEDIUM = `# 云图科技：企业数字化转型服务商

云图科技成立于 2016 年，总部位于深圳，专注于为中小企业提供数字化转型解决方案，涵盖 ERP、CRM 与数据分析平台。

我们拥有超过 300 人的研发团队，服务客户覆盖零售、制造与物流三大行业。平台已累计处理超过 5 亿条业务数据，帮助客户平均缩短 30% 的报表生成时间。

我们的核心理念是以数据驱动决策，相信每家企业都值得拥有自己的数据资产。在数字化时代，数据已成为企业最重要的生产要素之一。

公司建立了完善的项目交付体系，提供从咨询、实施到培训的一站式服务，致力于成为客户长期信赖的合作伙伴。`

// 弱：空泛「关于我们」（套话多、无数据、无实体）
const WEAK = `# 关于我们

在当今世界，随着人工智能与数字技术的飞速发展，企业正面临前所未有的机遇与挑战。我们始终秉持客户至上的理念，致力于为每一位客户提供优质的产品与服务。

众所周知，创新是企业发展的第一动力。我们拥有一支富有激情与创造力的团队，坚持以匠心打磨每一处细节。毋庸置疑，唯有持续进化，才能在时代的浪潮中立于不败之地。

我们相信，信任源于专业，价值来自陪伴。未来，我们将继续以开放的心态拥抱变化，与广大客户和合作伙伴携手并进，共创美好明天。赋能百业，成就彼此，是我们不变的初心。`

// 竞品 1：数据集成平台（强竞品）
const COMP1 = `# 数擎 DataFlow 数据集成平台

数擎 DataFlow 是一款面向中大型企业的实时数据集成平台（ETL），支持 200 个数据源接入与秒级同步。

## 技术规格
- 吞吐能力：单集群 50 万条/秒
- 支持部署：公有云、私有云、混合云
- 数据延迟：端到端小于 1 秒
- 兼容：Kafka、Flink、Hadoop 生态

## 客户案例
某全国性零售连锁部署后，门店数据汇总时效从 T+1 提升至实时，决策效率显著提升。已服务金融、电信等领域 80 家客户，续约率 96%。

## 资质认证
通过 ISO 27001 信息安全认证，获评省级数字经济示范企业。

## 商务合作
提供标准版与企业版。预约演示即可获取定制化方案与报价，支持免费试用，联系我们了解更多。`

// 竞品 2：协同办公平台（中等偏弱竞品）
const COMP2 = `# 易联企业协同办公平台

易联是一款面向成长型企业的协同办公平台，提供即时通讯、审批、文档与项目管理功能，帮助企业提升内部协作效率。

平台支持 PC 与移动端，已服务超过 5000 家企业客户。我们注重产品体验，持续迭代优化，让协作更自然。

公司成立于 2019 年，团队来自一线互联网企业，秉承简单、可靠、高效的价值观，致力于成为企业数字化办公的首选伙伴。`

interface Sample {
  key: string
  label: string
  text: string
}

const SAMPLES: Sample[] = [
  { key: "strong", label: "强·MES产品页", text: STRONG },
  { key: "medium", label: "中·公司方案页", text: MEDIUM },
  { key: "weak", label: "弱·关于我们", text: WEAK },
  { key: "comp1", label: "竞品1·数据平台", text: COMP1 },
  { key: "comp2", label: "竞品2·协同平台", text: COMP2 },
]

// ───────────────────────── 工具函数 ─────────────────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("断言失败: " + msg)
}

const ALL_DIM_KEYS: DimensionKey[] = [
  "structure", "entities", "quotability", "eeat", "structuredData",
  "technical", "freshness", "uniqueness", "b2b",
]

function dimRecord(dims: { key: DimensionKey; score: number }[]): Record<DimensionKey, number> {
  const rec = {} as Record<DimensionKey, number>
  for (const k of ALL_DIM_KEYS) rec[k] = 0
  for (const d of dims) rec[d.key] = d.score
  return rec
}

function run(input: GeoInput, mode: GeoMode): GeoAnalysis {
  return analyzeGeo(input, { mode })
}

// 把 GeoAnalysis 投影成便于打印的 {维度key: 分数} 表
function dimMap(a: GeoAnalysis): Record<string, number> {
  const m: Record<string, number> = {}
  for (const d of a.dimensions) m[d.key] = d.score
  return m
}

// ───────────────────────── 主流程 ─────────────────────────
async function main(): Promise<void> {
  console.log("===== GEO 引擎 B2B 可用性验证 =====\n")

  // (a) 每个样例跑 general 与 b2b，打印 overall / grade / 各维度分
  const results: Record<string, { general: GeoAnalysis; b2b: GeoAnalysis }> = {}
  for (const s of SAMPLES) {
    const general = run({ text: s.text, title: s.label }, "general")
    const b2b = run({ text: s.text, title: s.label }, "b2b")
    results[s.key] = { general, b2b }
    const gd = dimMap(general)
    const bd = dimMap(b2b)
    console.log(`【${s.label}】`)
    console.log(
      `  general: overall=${general.overall} grade=${general.grade} | ` +
        `结构${gd.structure} 实体${gd.entities} 引用${gd.quotability} EEAT${gd.eeat} 结构数据${gd.structuredData} 技术${gd.technical} 时效${gd.freshness} 独特${gd.uniqueness}`,
    )
    console.log(
      `  b2b    : overall=${b2b.overall} grade=${b2b.grade} | ` +
        `结构${bd.structure} 实体${bd.entities} 引用${bd.quotability} EEAT${bd.eeat} 结构数据${bd.structuredData} 技术${bd.technical} 时效${bd.freshness} 独特${bd.uniqueness} B2B${bd.b2b ?? 0}`,
    )
  }
  console.log("")

  // (b) 区分度：强页 overall 明显 > 弱页 overall（差距 >= 15）
  const strongG = results.strong.general.overall
  const weakG = results.weak.general.overall
  const gap = strongG - weakG
  console.log(`区分度检查: 强页 general overall=${strongG} - 弱页 general overall=${weakG} = ${gap}`)
  assert(gap >= 15, `强页与弱页 overall 差距应 ≥ 15，实际 ${gap}`)

  // 空输入特例：返回低分(E)且不抛错
  const empty = run({ text: "" }, "general")
  console.log(`空输入检查: overall=${empty.overall} grade=${empty.grade}`)
  assert(empty.grade === "E" && empty.overall < 20, `空输入应返回低分 E 且 overall<20，实际 ${empty.grade}/${empty.overall}`)
  // 空输入 b2b 模式也不应抛错
  const emptyB2b = run({ text: "" }, "b2b")
  assert(emptyB2b.grade === "E", `空输入 b2b 模式也应返回 E，实际 ${emptyB2b.grade}`)
  console.log("")

  // (c) b2b 模式：强 B2B 页的 b2b 维度分应明显高于弱页
  const strongB2bDim = results.strong.b2b.dimensions.find((d) => d.key === "b2b")!.score
  const weakB2bDim = results.weak.b2b.dimensions.find((d) => d.key === "b2b")!.score
  const b2bGap = strongB2bDim - weakB2bDim
  console.log(`B2B 信号检查: 强页 b2b 维度=${strongB2bDim} - 弱页 b2b 维度=${weakB2bDim} = ${b2bGap}`)
  assert(b2bGap >= 30, `强页 b2b 维度应明显高于弱页（差距≥30），实际 ${b2bGap}`)

  // 额外打印强页 B2B 子信号明细，便于调优
  const sig = detectB2BSignals(STRONG)
  console.log(
    `  强页 B2B 子信号: score=${sig.score} 规格${sig.productSpec} 实证${sig.proof} 信任${sig.trust} 转化${sig.buying} 对比${sig.comparison} | detail=${JSON.stringify(sig.detail)}`,
  )
  const weakSig = detectB2BSignals(WEAK)
  console.log(
    `  弱页 B2B 子信号: score=${weakSig.score} 规格${weakSig.productSpec} 实证${weakSig.proof} 信任${weakSig.trust} 转化${weakSig.buying} 对比${weakSig.comparison} | detail=${JSON.stringify(weakSig.detail)}`,
  )
  console.log("")

  // (d) benchmarkSites：我的样例 + 两个竞品，b2b 模式
  const bench = benchmarkSites(
    [
      { text: STRONG, title: "我的站点·MES产品页" },
      { text: COMP1, title: "竞品1·数据平台" },
      { text: COMP2, title: "竞品2·协同平台" },
    ],
    { mode: "b2b" },
  )
  console.log("benchmarkSites(b2b):")
  console.log(`  entries=${bench.entries.length} yourIndex=${bench.yourIndex} best=${bench.best.label}(${bench.best.overall}) worst=${bench.worst.label}(${bench.worst.overall})`)
  console.log(`  recommendations(${bench.recommendations.length}):`)
  for (const r of bench.recommendations) console.log("   - " + r)
  assert(bench.entries.length === 3, `benchmark entries 应为 3，实际 ${bench.entries.length}`)
  assert(bench.yourIndex === 0, `benchmark yourIndex 应为 0，实际 ${bench.yourIndex}`)
  assert(bench.recommendations.length > 0, "benchmark recommendations 不应为空")
  console.log("")

  // (e) aggregateSite：用 3-5 条 AnalysisRecord（含 b2b 维）
  const records: AnalysisRecord[] = [results.strong.b2b, results.medium.b2b, results.weak.b2b, results.comp1.b2b].map(
    (a, i) => ({
      id: "rec-" + i,
      label: SAMPLES[i].label,
      overall: a.overall,
      dimensions: dimRecord(a.dimensions),
      createdAt: Date.now() - i * 86400000,
    }),
  )
  const site = aggregateSite(records)
  console.log("aggregateSite(4 条记录):")
  console.log(`  pages=${site.pages} avgOverall=${site.avgOverall} grade=${site.grade} gradeCounts=${JSON.stringify(site.gradeCounts)}`)
  console.log(`  byDimension.b2b=${site.byDimension.b2b} byDimension.structure=${site.byDimension.structure}`)
  assert(site.pages === 4, `aggregateSite pages 应为 4，实际 ${site.pages}`)
  assert(site.avgOverall > 0 && site.avgOverall <= 100, `avgOverall 应在 (0,100]，实际 ${site.avgOverall}`)
  assert(Object.keys(site.gradeCounts).length > 0, "gradeCounts 不应为空")
  console.log("")

  // (f) buildReport：对一条 analysis 跑，断言返回非空 HTML 且含「GEO」
  const report = buildReport({ analysis: results.strong.b2b, benchmark: bench, brand: "验证用品牌" })
  console.log(`buildReport: length=${report.length} containsGEO=${report.includes("GEO")}`)
  assert(report.length > 200, `buildReport 长度应 > 200，实际 ${report.length}`)
  assert(report.includes("GEO"), "buildReport 应包含『GEO』")
  console.log("")

  // (3) 尽力尝试一次真实 URL 抓取（网络被拦则跳过，绝不影响验证结果）
  try {
    const fr = await fetchUrl("https://www.haier.com")
    if (fr.ok) {
      console.log(`[live fetch] ok=true, html长度=${fr.html?.length}`)
    } else {
      console.log(`[live fetch] ok=false, error=${fr.error}`)
      console.log("live fetch skipped (network blocked)")
    }
  } catch (e) {
    console.log("live fetch skipped (network blocked): " + String(e))
  }
  console.log("")

  console.log("===== 全部断言通过 ✅ =====")
}

main().catch((e) => {
  console.error("\n❌ 验证失败：", e instanceof Error ? e.message : e)
  process.exit(1)
})
