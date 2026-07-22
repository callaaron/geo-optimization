import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { parseLines } from "@/lib/geo/utils"
import {
  Radar,
  Upload,
  Sparkles,
  Wand2,
  Trash2,
  Lightbulb,
  Info,
  RotateCcw,
  ClipboardList,
  Loader2,
} from "lucide-react"

export interface Config {
  brand: string
  domain: string
  competitors: string
  queries: string
  intended: string
  aliases: string  // 品牌别名，一行一个：绿的谐波\nLvde\nLeaderdrive
}

export const EMPTY_CONFIG: Config = {
  brand: "",
  domain: "",
  competitors: "",
  queries: "",
  intended: "",
  aliases: "",
}

// ── 制造业示范：谐波减速机（工业核心零部件）生产厂家 ──
export const DEMO_CONFIG: Config = {
  brand: "锐工精密",
  domain: "ruigong.com",
  competitors: "绿的谐波\n中大力德\n双环传动\n秦川机床",
  queries:
    "谐波减速机哪个品牌好\n工业机器人核心零部件厂家\n国产精密减速机推荐\n协作机器人减速器选型\n谐波减速机寿命对比",
  intended:
    "专注谐波减速机研发制造20年\n精度保持寿命超10000小时\n通过 ISO9001 与 CE 认证\n为工业机器人厂商提供定制化减速方案\n自主研发柔轮热处理工艺",
  aliases: "锐工精密\n锐工\nRuigong\nRG精密",
}

interface FieldMeta {
  key: keyof Config
  label: string
  required: boolean
  type: "input" | "textarea"
  rows?: number
  placeholder: string
  help: string
}

const FIELD_META: FieldMeta[] = [
  {
    key: "brand",
    label: "品牌名",
    required: true,
    type: "input",
    placeholder: "如：锐工精密",
    help: "企业对外统一使用的品牌 / 公司简称，是 AI 检索与引用的核心锚点。建议用简短品牌名，而非法律主体全称。",
  },
  {
    key: "domain",
    label: "官网域名",
    required: false,
    type: "input",
    placeholder: "如：ruigong.com",
    help: "企业官网域名，用于判断「被 AI 引用来源」是否指向你的站点。无官网可留空。",
  },
  {
    key: "competitors",
    label: "竞品",
    required: false,
    type: "textarea",
    rows: 2,
    placeholder: "每行一个，如：\n绿的谐波\n中大力德",
    help: "主要竞争对手品牌（每行一个）。用于对比 AI 回答中竞品被提及、而本品牌未提及的差距。",
  },
  {
    key: "queries",
    label: "监测 query",
    required: true,
    type: "textarea",
    rows: 3,
    placeholder: "每行一个，如：\n谐波减速机哪个品牌好",
    help: "用户最可能向 AI 提问的问题 / 关键词（每行一个），决定监测覆盖的「询问场景」。建议覆盖品类词、地域词、场景词。",
  },
  {
    key: "intended",
    label: "企业想表达的内容点",
    required: false,
    type: "textarea",
    rows: 3,
    placeholder: "每行一个，如：\n专注谐波减速机研发20年",
    help: "企业希望被 AI 记住的关键信息点（卖点 / 认证 / 能力，每行一个）。用于追踪「想表达 vs 已收录 vs 未出现」的内容差距。",
  },
  {
    key: "aliases",
    label: "品牌别名（归一化）",
    required: false,
    type: "textarea",
    rows: 2,
    placeholder: "每行一个，如：\n绿的谐波\nLvde\nLeaderdrive",
    help: "品牌的不同叫法、英文名、缩写等（每行一个）。检测结果中所有变体将被统一归一到规范品牌名，避免重复计数。",
  },
]

type CandidateValue = string | string[] | undefined
interface Candidates {
  brand?: string
  domain?: string
  competitors?: string[]
  queries?: string[]
  intended?: string[]
}

function fromExtract(p: {
  brand?: string
  domain?: string
  queries?: string[]
  competitors?: string[]
  contentPoints?: string[]
}): Candidates {
  return {
    brand: p.brand?.trim() || undefined,
    domain: p.domain?.trim() || undefined,
    competitors: p.competitors?.length ? p.competitors : undefined,
    queries: p.queries?.length ? p.queries : undefined,
    intended: p.contentPoints?.length ? p.contentPoints : undefined,
  }
}

function fromSuggest(s: {
  queries?: string[]
  competitors?: string[]
  contentPoints?: string[]
}): Candidates {
  return {
    competitors: s.competitors?.length ? s.competitors : undefined,
    queries: s.queries?.length ? s.queries : undefined,
    intended: s.contentPoints?.length ? s.contentPoints : undefined,
  }
}

interface Props {
  value: Config
  onChange: (next: Config) => void
  onRun: () => void
  aiReady: boolean
  loading: boolean
  onSave: () => void
  savedAt: number | null
  onReset: () => void
}

export function EnterpriseConfig({
  value,
  onChange,
  onRun,
  aiReady,
  loading,
  onSave,
  savedAt,
  onReset,
}: Props) {
  const [candidates, setCandidates] = useState<Candidates | null>(null)
  const [acq, setAcq] = useState<"upload" | "query" | "expand" | null>(null)
  const [dirty, setDirty] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function fillDemo() {
    onChange(DEMO_CONFIG)
    setCandidates(null)
    setDirty(true)
    toast.success("已填入制造业示范信息（谐波减速机厂家），可在此基础修改")
  }

  function applySingle(key: "brand" | "domain", val: string) {
    onChange({ ...value, [key]: val })
    setDirty(true)
  }
  function applyLine(key: "competitors" | "queries" | "intended", line: string) {
    const cur = parseLines(value[key])
    if (cur.includes(line)) return
    onChange({ ...value, [key]: [...cur, line].join("\n") })
    setDirty(true)
  }
  function isLineApplied(key: "competitors" | "queries" | "intended", line: string) {
    return parseLines(value[key]).includes(line)
  }
  function isSingleApplied(key: "brand" | "domain", val: string) {
    return value[key].trim() === val.trim()
  }

  async function handleUpload(file: File) {
    setAcq("upload")
    try {
      const form = new FormData()
      form.append("file", file)
      const up = await fetch("/api/upload", { method: "POST", body: form })
      const upj = await up.json()
      if (!upj.ok) throw new Error(upj.error || "上传失败")
      const ex = await fetch("/api/ai/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: upj.data.text }),
      })
      const exj = await ex.json()
      if (!exj.ok) throw new Error(exj.error || "提取失败")
      const c = fromExtract(exj.data)
      if (!c.brand && !c.domain && !c.competitors && !c.queries && !c.intended) {
        toast.warning("未从资料中提取到可用信息，请手动填写")
      } else {
        setCandidates(c)
        toast.success(`已从 ${file.name} 提取候选信息，点击下方按钮填入对应字段`)
      }
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setAcq(null)
    }
  }

  async function handleSuggest() {
    const b = value.brand.trim()
    if (!b) { toast.error("请先在「品牌名」填写企业名称"); return }
    setAcq("query")
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: b }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || "生成失败")
      const c = fromSuggest(j.data)
      if (!c.competitors && !c.queries && !c.intended) {
        toast.warning("未生成候选内容，请手动填写")
      } else {
        setCandidates(c)
        toast.success("已生成候选内容，点击下方按钮填入对应字段")
      }
    } catch (e) { toast.error(String((e as Error)?.message || e)) }
    finally { setAcq(null) }
  }

  // v2.5 智能 Query 扩展：基于品牌+已有Query推荐新高价值Query
  async function handleExpandQueries() {
    const b = value.brand.trim()
    if (!b) { toast.error("请先在「品牌名」填写企业名称"); return }
    setAcq("expand")
    try {
      const res = await fetch("/api/geo/expand-queries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: b,
          domain: value.domain.trim() || undefined,
          existingQueries: parseLines(value.queries),
          competitors: parseLines(value.competitors),
        }),
      })
      const j = await res.json()
      if (!j.ok || !j.data?.length) throw new Error(j.error || "未生成推荐 Query")
      // 将推荐的 query 追加到现有 queries 后面
      const newQueries = j.data.map((item: any) => item.query).join("\n")
      const current = value.queries.trim()
      onChange({ ...value, queries: current ? current + "\n" + newQueries : newQueries })
      toast.success(`已添加 ${j.data.length} 条推荐 Query`)
    } catch (e) { toast.error(String((e as Error)?.message || e)) }
    finally { setAcq(null) }
  }

  function clearCandidates() {
    setCandidates(null)
  }

  const hasCandidates = !!candidates

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Radar className="h-4 w-4 text-emerald-400" /> 企业监测配置
          <Badge variant="secondary" className="ml-1 text-xs">监控台</Badge>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
            onClick={fillDemo}
          >
            <Lightbulb className="mr-1 h-3.5 w-3.5" /> 一键填入示范信息
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          输入企业信息后一键监测：① 360 搜索情况 ② 各 AI 回答 ③ 信源来源与排名 ④ 内容与信源相关度；
          并追踪「企业想表达 / 最终收录 / 未出现」的内容差距。
        </p>

        {/* 信息获取方式 */}
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wand2 className="h-3.5 w-3.5 text-emerald-400" /> 信息获取方式（生成候选，点击按钮才填入）
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.pptx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ""
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={acq !== null}
              onClick={() => fileRef.current?.click()}
            >
              {acq === "upload" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3.5 w-3.5" />
              )}
              上传资料（PPT/Word/PDF/txt）
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acq !== null || !value.brand.trim()}
              onClick={handleSuggest}
            >
              {acq === "query" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              AI 生成候选（基于品牌名）
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acq !== null || !value.brand.trim()}
              onClick={handleExpandQueries}
            >
              {acq === "expand" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lightbulb className="mr-1 h-3.5 w-3.5" />
              )}
              智能扩展 Query
            </Button>
            {hasCandidates && (
              <Button size="sm" variant="ghost" onClick={clearCandidates}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> 清除候选
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            上传企业材料或输入品牌名 → 系统提炼候选内容，以按钮形式附在各字段下方，<span className="text-emerald-500">由你点击确认填入</span>，不会自动覆盖已有内容。
          </p>
        </div>

        {/* 字段 */}
        <div className="space-y-3">
          {FIELD_META.map((f) => {
            const cand = candidates?.[f.key as keyof Candidates] as CandidateValue
            const showCand =
              (Array.isArray(cand) && cand.length > 0) || (typeof cand === "string" && cand.trim())
            return (
              <div key={f.key} className="space-y-1">
                <div className="flex items-center gap-1">
                  <label className="text-xs font-medium text-foreground">
                    {f.label}
                    {f.required && <span className="ml-0.5 text-destructive">*</span>}
                  </label>
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={f.help}>
                    <Info className="h-3 w-3" /> 说明
                  </span>
                </div>
                {f.type === "input" ? (
                  <Input
                    value={value[f.key]}
                    onChange={(e) => {
                      onChange({ ...value, [f.key]: e.target.value })
                      setDirty(true)
                    }}
                    placeholder={f.placeholder}
                  />
                ) : (
                  <Textarea
                    value={value[f.key]}
                    onChange={(e) => {
                      onChange({ ...value, [f.key]: e.target.value })
                      setDirty(true)
                    }}
                    rows={f.rows}
                    placeholder={f.placeholder}
                  />
                )}
                {/* 字段说明 */}
                <p className="text-xs leading-relaxed text-muted-foreground">{f.help}</p>
                {/* 候选建议按钮 */}
                {showCand && (
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2">
                    <p className="mb-1 text-xs font-medium text-emerald-600">候选建议（点击填入）：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {typeof cand === "string" ? (
                        <button
                          disabled={isSingleApplied(f.key as "brand" | "domain", cand)}
                          onClick={() => applySingle(f.key as "brand" | "domain", cand)}
                          className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          {isSingleApplied(f.key as "brand" | "domain", cand) ? "✓ 已填入" : cand}
                        </button>
                      ) : (
                        (cand as string[]).map((line, i) => (
                          <button
                            key={i}
                            disabled={isLineApplied(f.key as "competitors" | "queries" | "intended", line)}
                            onClick={() => applyLine(f.key as "competitors" | "queries" | "intended", line)}
                            className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {isLineApplied(f.key as "competitors" | "queries" | "intended", line) ? "✓ " : "+ "}
                            {line}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 操作区 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={onRun}
            disabled={!aiReady || loading}
            className="bg-emerald-500 text-black hover:bg-emerald-400"
          >
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Radar className="mr-1 h-4 w-4" />
            )}
            {loading ? "监测中（搜索 + AI 分析，约 1-2 分钟）…" : "运行监测"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { onSave(); setDirty(false) }} disabled={!dirty}>
            <ClipboardList className="mr-1 h-3.5 w-3.5" />
            {savedAt ? "已保存配置 ✓" : "保存配置"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> 重置
          </Button>
          {!aiReady && <span className="text-xs text-amber-400">需启动后端（npm run server）后方可使用。</span>}
        </div>
      </CardContent>
    </Card>
  )
}
