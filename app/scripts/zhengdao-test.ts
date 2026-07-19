// 正岛食品 GEO 测试 harness（规则引擎部分，纯前端逻辑在 Node 中跑）
// 用法：node /tmp/zhengdao.cjs <analyzer|rewriter|generator|benchmark|all>
import { analyzeGeo } from "@/lib/geo/analyzer"
import { detectB2BSignals } from "@/lib/geo/b2b"
import { rewriteContent } from "@/lib/geo/rewriter"
import { generateAssets } from "@/lib/geo/llmstxt"
import { benchmarkSites } from "@/lib/geo/benchmark"
import { ZHENGDAO, COMPETITORS } from "./zhengdao-data"

const MODE = "b2b" as const

function analyzer() {
  const a = analyzeGeo(ZHENGDAO, { mode: MODE })
  const b2b = detectB2BSignals(ZHENGDAO.text)
  return {
    mode: MODE,
    overall: a.overall,
    grade: a.grade,
    dimensions: a.dimensions,
    comment: (a as any).comment,
    suggestions: (a as any).suggestions || [],
    b2bSignals: b2b,
  }
}

function rewriter() {
  return rewriteContent(ZHENGDAO)
}

function generator() {
  const g = generateAssets(ZHENGDAO)
  return {
    llmsTxt: g.llmsTxt,
    jsonLd: g.jsonLd,
    robotsTxt: g.robotsTxt,
    metaTags: g.metaTags,
  }
}

function benchmark() {
  const inputs = [ZHENGDAO, ...COMPETITORS]
  return benchmarkSites(inputs, { mode: MODE })
}

const which = process.argv[2] || "all"
let out: any
if (which === "analyzer") out = analyzer()
else if (which === "rewriter") out = rewriter()
else if (which === "generator") out = generator()
else if (which === "benchmark") out = benchmark()
else out = { analyzer: analyzer(), rewriter: rewriter(), generator: generator(), benchmark: benchmark() }

console.log(JSON.stringify(out, null, 2))
