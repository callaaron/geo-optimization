// GEO AI 后端：纯 Node 内置模块，无三方依赖。
// - 提供 /api/ai/* 接口（analyze / rewrite / citation / health）
// - 生产模式下同时托管 dist/ 静态前端，一条命令即可运行整套系统
import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join, extname, normalize } from "node:path"
import { isConfigured, searchConfigured, SEARCH, CONFIG } from "./ark.mjs"
import { aiAnalyze, aiRewrite, aiCitation, aiGeoAudit, aiContentGap } from "./ai.mjs"
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  addAudit,
} from "./project.mjs"
import { buildAuditReport } from "./report.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, "..", "dist")
const PORT = Number(process.env.PORT || 8787)

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  cors(res)
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  res.end(body)
}

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let data = ""
    let size = 0
    req.on("data", (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error("请求体过大"))
        req.destroy()
        return
      }
      data += c
    })
    req.on("end", () => {
      if (!data) return resolve({})
      try {
        resolve(JSON.parse(data))
      } catch {
        reject(new Error("请求体不是合法 JSON"))
      }
    })
    req.on("error", reject)
  })
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname)
  if (rel === "/" || rel === "") rel = "/index.html"
  // 防目录穿越
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "")
  let filePath = join(DIST, safe)
  try {
    let s = await stat(filePath).catch(() => null)
    if (!s || s.isDirectory()) {
      // SPA 回退到 index.html
      filePath = join(DIST, "index.html")
      s = await stat(filePath).catch(() => null)
      if (!s) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        res.end("dist/ 未构建。请先运行 npm run build。")
        return
      }
    }
    const buf = await readFile(filePath)
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" })
    res.end(buf)
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("读取文件失败")
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === "OPTIONS") {
    cors(res)
    res.writeHead(204)
    res.end()
    return
  }

  // ---- API ----
  if (pathname.startsWith("/api/")) {
    try {
      if (pathname === "/api/ai/health" && req.method === "GET") {
        return sendJson(res, 200, {
          ok: true,
          configured: isConfigured(),
          model: CONFIG.model,
          baseUrl: CONFIG.baseUrl,
          searchConfigured: searchConfigured(), // 联网真监测是否已配置
          searchModel: SEARCH.model,
        })
      }

      // ---- 客户项目 CRUD（纯存储，不需要 AI key）----
      if (pathname === "/api/projects" && req.method === "GET") {
        return sendJson(res, 200, { ok: true, data: await listProjects() })
      }

      if (pathname === "/api/projects" && req.method === "POST") {
        const body = await readBody(req)
        if (!body.brand || !String(body.brand).trim())
          return sendJson(res, 400, { ok: false, error: "缺少 brand" })
        const data = await createProject(body)
        return sendJson(res, 200, { ok: true, data })
      }

      const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/)
      if (projectMatch && req.method === "GET") {
        const data = await getProject(decodeURIComponent(projectMatch[1]))
        if (!data) return sendJson(res, 404, { ok: false, error: "项目不存在" })
        return sendJson(res, 200, { ok: true, data })
      }

      if (projectMatch && req.method === "PUT") {
        const body = await readBody(req)
        const data = await updateProject(decodeURIComponent(projectMatch[1]), body)
        if (!data) return sendJson(res, 404, { ok: false, error: "项目不存在" })
        return sendJson(res, 200, { ok: true, data })
      }

      if (projectMatch && req.method === "DELETE") {
        const done = await deleteProject(decodeURIComponent(projectMatch[1]))
        if (!done) return sendJson(res, 404, { ok: false, error: "项目不存在" })
        return sendJson(res, 200, { ok: true })
      }

      if (!isConfigured()) {
        return sendJson(res, 503, { ok: false, error: "后端未配置 ARK_API_KEY" })
      }

      if (pathname === "/api/ai/analyze" && req.method === "POST") {
        const body = await readBody(req)
        if (!body.text || !String(body.text).trim())
          return sendJson(res, 400, { ok: false, error: "缺少 text" })
        const data = await aiAnalyze(body)
        return sendJson(res, 200, { ok: true, data })
      }

      if (pathname === "/api/ai/rewrite" && req.method === "POST") {
        const body = await readBody(req)
        if (!body.text || !String(body.text).trim())
          return sendJson(res, 400, { ok: false, error: "缺少 text" })
        const data = await aiRewrite(body)
        return sendJson(res, 200, { ok: true, data })
      }

      if (pathname === "/api/ai/citation" && req.method === "POST") {
        const body = await readBody(req)
        if (!body.query || !String(body.query).trim())
          return sendJson(res, 400, { ok: false, error: "缺少 query" })
        const data = await aiCitation(body)
        return sendJson(res, 200, { ok: true, data })
      }

      // 真·GEO 引用审计：RAG 式搜索 → LLM 综合 → 品牌可见度检测
      if (pathname === "/api/geo/audit" && req.method === "POST") {
        const body = await readBody(req)
        if (!body.brand || !String(body.brand).trim())
          return sendJson(res, 400, { ok: false, error: "缺少 brand" })
        if (!Array.isArray(body.queries) || body.queries.length === 0)
          return sendJson(res, 400, { ok: false, error: "缺少 queries（数组）" })
        const data = await aiGeoAudit(body)
        return sendJson(res, 200, { ok: true, data })
      }

      // 纯搜索（供前端预览 SERP 结果）
      if (pathname === "/api/geo/search" && req.method === "POST") {
        const body = await readBody(req)
        if (!body.query || !String(body.query).trim())
          return sendJson(res, 400, { ok: false, error: "缺少 query" })
        const { webSearch } = await import("./search.mjs")
        const data = await webSearch(body.query, { count: body.count || 10 })
        return sendJson(res, 200, { ok: true, data })
      }

      // 为指定项目跑一次真·GEO 审计，并把结果归档到项目审计历史
      const auditMatch = pathname.match(/^\/api\/projects\/([^/]+)\/audit$/)
      if (auditMatch && req.method === "POST") {
        const id = decodeURIComponent(auditMatch[1])
        const project = await getProject(id)
        if (!project) return sendJson(res, 404, { ok: false, error: "项目不存在" })
        const body = await readBody(req)
        // 请求体可覆盖项目档案，缺省回落到项目里的 brand/domain/queries
        const brand = String(body.brand || "").trim() || project.brand
        const domain = String(body.domain || "").trim() || project.domain
        const queries =
          Array.isArray(body.queries) && body.queries.length ? body.queries : project.queries
        if (!brand) return sendJson(res, 400, { ok: false, error: "缺少 brand" })
        if (!Array.isArray(queries) || queries.length === 0)
          return sendJson(res, 400, { ok: false, error: "缺少 queries（数组）" })
        const audit = await aiGeoAudit({ brand, domain, queries, competitors: project.competitors })
        const data = await addAudit(id, audit)
        return sendJson(res, 200, { ok: true, data })
      }

      // 内容差距分析：基于一次审计结果，产出优先级排序的内容创作清单
      if (pathname === "/api/geo/content-gap" && req.method === "POST") {
        const body = await readBody(req)
        // 支持两种调用方式：{ projectId } 自动取最新审计，或 { brand, auditResult } 直接传
        let brand = body.brand
        let auditResult = body.auditResult
        if (body.projectId && !auditResult) {
          const { getProject } = await import("./project.mjs")
          const proj = await getProject(body.projectId)
          if (!proj) return sendJson(res, 404, { ok: false, error: "项目不存在" })
          brand = brand || proj.brand
          const latestAudit = proj.audits?.[proj.audits.length - 1]
          if (!latestAudit) return sendJson(res, 400, { ok: false, error: "该项目尚无审计记录，请先运行审计" })
          auditResult = latestAudit
        }
        if (!brand || !String(brand).trim())
          return sendJson(res, 400, { ok: false, error: "缺少 brand 或 projectId" })
        if (!auditResult || typeof auditResult !== "object")
          return sendJson(res, 400, { ok: false, error: "缺少 auditResult（aiGeoAudit 结果）" })
        const data = await aiContentGap({ ...body, brand, auditResult })
        return sendJson(res, 200, { ok: true, data })
      }

      // 统一审计报告：传 projectId（用其最新一次审计）或直接传 auditData → 完整可打印 HTML
      if (pathname === "/api/geo/report" && req.method === "POST") {
        const body = await readBody(req)
        let project = null
        let audit = body.auditData && typeof body.auditData === "object" ? body.auditData : null
        if (body.projectId) {
          project = await getProject(String(body.projectId))
          if (!project) return sendJson(res, 404, { ok: false, error: "项目不存在" })
          if (!audit) audit = project.audits[project.audits.length - 1] || null
        }
        if (!audit)
          return sendJson(res, 400, { ok: false, error: "缺少 auditData，或该项目暂无审计记录" })
        // 内容建议清单：优先用请求体传入的；否则现场用 LLM 生成
        let contentGaps = Array.isArray(body.contentGaps) ? body.contentGaps : null
        if (!contentGaps) {
          try {
            contentGaps = await aiContentGap({
              brand: audit.brand || project?.brand || "",
              domain: audit.domain || project?.domain || "",
              auditResult: audit,
            })
          } catch {
            contentGaps = [] // 差距分析失败不阻塞报告生成
          }
        }
        const html = buildAuditReport({
          project: project || { brand: audit.brand || "", domain: audit.domain || "" },
          audit,
          contentGaps,
        })
        return sendJson(res, 200, { ok: true, data: { html } })
      }

      return sendJson(res, 404, { ok: false, error: "未知接口" })
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: String(err?.message || err) })
    }
  }

  // ---- 静态前端 ----
  await serveStatic(req, res, pathname)
})

server.listen(PORT, () => {
  console.log(`[GEO AI] 服务已启动: http://localhost:${PORT}`)
  console.log(`[GEO AI] Ark 配置: ${isConfigured() ? "已就绪 ✅" : "未配置 ARK_API_KEY ⚠️"} | 模型 ${CONFIG.model}`)
})
