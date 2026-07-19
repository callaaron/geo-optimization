// 客户项目模型 + JSON 文件持久化
// 一个 Project 聚合某品牌的 GEO 资产：监测 query 集、竞品清单、历次审计快照。
// 存储为 data/projects.json（目录不存在则自动创建），纯 node:fs/promises，零三方依赖。
import { readFile, writeFile, mkdir, rename } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, "..", "data")
const DATA_FILE = join(DATA_DIR, "projects.json")

// 写操作串行化：避免并发请求交叉写入导致 JSON 损坏
let queue = Promise.resolve()
function withLock(fn) {
  const run = queue.then(fn)
  queue = run.catch(() => {})
  return run
}

async function loadAll() {
  try {
    const raw = await readFile(DATA_FILE, "utf-8")
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return [] // 文件不存在/损坏时按空库处理
  }
}

async function saveAll(projects) {
  await mkdir(DATA_DIR, { recursive: true })
  const tmp = DATA_FILE + ".tmp"
  await writeFile(tmp, JSON.stringify(projects, null, 2), "utf-8")
  await rename(tmp, DATA_FILE) // 原子替换，避免半截文件
}

const str = (x) => String(x ?? "").trim()
const strArr = (x) => (Array.isArray(x) ? x.map(str).filter(Boolean) : [])

/** 把一次 aiGeoAudit 结果归档为项目审计快照（补齐缺失字段、计算总分） */
function normalizeAudit(a = {}) {
  const serpVisibility = Number(a.serpVisibility) || 0
  const aiCitationRate = Number(a.aiCitationRate) || 0
  return {
    timestamp: a.timestamp || new Date().toISOString(),
    mode: str(a.mode), // 审计模式（rag-search / search / offline）
    searchEngine: str(a.searchEngine),
    serpVisibility,
    aiCitationRate,
    // GEO 总分：AI 引用率权重更高（GEO 的核心是被 AI 引用）
    overallScore:
      Number(a.overallScore) || Math.round(aiCitationRate * 0.6 + serpVisibility * 0.4),
    perQuery: Array.isArray(a.perQuery) ? a.perQuery : [],
    topCompetitors: Array.isArray(a.topCompetitors) ? a.topCompetitors : [],
    gapAnalysis: a.gapAnalysis && typeof a.gapAnalysis === "object" ? a.gapAnalysis : {},
  }
}

function normalizeProject(p = {}) {
  const now = new Date().toISOString()
  return {
    id: p.id || randomUUID(),
    brand: str(p.brand),
    domain: str(p.domain),
    industry: str(p.industry),
    mode: p.mode === "b2b" ? "b2b" : "general",
    competitors: strArr(p.competitors),
    queries: strArr(p.queries),
    intendedContent: strArr(p.intendedContent),
    audits: (Array.isArray(p.audits) ? p.audits : []).map(normalizeAudit),
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
  }
}

/** 全部项目列表 */
export async function listProjects() {
  return loadAll()
}

/** 按 id 取项目，不存在返回 null */
export async function getProject(id) {
  const all = await loadAll()
  return all.find((p) => p.id === id) || null
}

/** 创建项目 */
export async function createProject(input = {}) {
  return withLock(async () => {
    const all = await loadAll()
    const project = normalizeProject(input)
    all.push(project)
    await saveAll(all)
    return project
  })
}

/** 更新项目档案（id / createdAt / audits 不可通过此接口修改） */
export async function updateProject(id, patch = {}) {
  return withLock(async () => {
    const all = await loadAll()
    const idx = all.findIndex((p) => p.id === id)
    if (idx === -1) return null
    const merged = normalizeProject({
      ...all[idx],
      ...patch,
      id, // id 不可改
      createdAt: all[idx].createdAt, // 创建时间不可改
      audits: patch.audits ?? all[idx].audits, // 审计记录默认保留，经 addAudit 追加
      updatedAt: new Date().toISOString(),
    })
    all[idx] = merged
    await saveAll(all)
    return merged
  })
}

/** 删除项目，返回是否删除成功 */
export async function deleteProject(id) {
  return withLock(async () => {
    const all = await loadAll()
    const next = all.filter((p) => p.id !== id)
    if (next.length === all.length) return false
    await saveAll(next)
    return true
  })
}

/** 把一次审计结果追加到项目审计历史，返回更新后的项目 */
export async function addAudit(projectId, auditData = {}) {
  return withLock(async () => {
    const all = await loadAll()
    const idx = all.findIndex((p) => p.id === projectId)
    if (idx === -1) return null
    const audit = normalizeAudit(auditData)
    all[idx] = {
      ...all[idx],
      audits: [...all[idx].audits, audit],
      updatedAt: new Date().toISOString(),
    }
    await saveAll(all)
    return all[idx]
  })
}
