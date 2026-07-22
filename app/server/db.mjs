// SQLite 数据库层 — 替换 JSON 文件持久化（better-sqlite3，零配置，单文件）
// 迁移 project.mjs + users.mjs 的 JSON 存储，API 接口保持不变
import Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { existsSync, readFileSync, mkdirSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, "..", "data")
const DB_PATH = join(DATA_DIR, "geo.db")
const OLD_PROJECTS = join(DATA_DIR, "projects.json")
const OLD_USERS = join(DATA_DIR, "users.json")

let db

function getDb() {
  if (db) return db
  mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  initTables(db)
  migrateJsonData(db)
  return db
}

function initTables(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, brand TEXT NOT NULL, domain TEXT DEFAULT '', industry TEXT DEFAULT '',
      mode TEXT DEFAULT 'general', intendedContent TEXT DEFAULT '[]',
      createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS project_competitors (
      projectId TEXT NOT NULL, name TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS project_queries (
      projectId TEXT NOT NULL, query TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY, projectId TEXT NOT NULL,
      timestamp TEXT, mode TEXT, searchEngine TEXT,
      serpVisibility INTEGER DEFAULT 0, aiCitationRate INTEGER DEFAULT 0,
      overallScore INTEGER DEFAULT 0, serpHits INTEGER DEFAULT 0, aiHits INTEGER DEFAULT 0,
      totalQueries INTEGER DEFAULT 0, gapAnalysis TEXT DEFAULT '{}',
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audit_per_query (
      id INTEGER PRIMARY KEY AUTOINCREMENT, auditId TEXT NOT NULL,
      query TEXT, serpEngine TEXT, inSerp INTEGER DEFAULT 0,
      aiAnswer TEXT, inAiAnswer INTEGER DEFAULT 0,
      level TEXT, levelLabel TEXT, reason TEXT, suggestion TEXT,
      brandsInSerp TEXT DEFAULT '[]', brandsInAnswer TEXT DEFAULT '[]',
      FOREIGN KEY(auditId) REFERENCES audits(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audit_competitors (
      auditId TEXT NOT NULL, name TEXT NOT NULL, count INTEGER DEFAULT 0,
      FOREIGN KEY(auditId) REFERENCES audits(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT DEFAULT '', role TEXT DEFAULT '编辑',
      brand TEXT DEFAULT '', domain TEXT DEFAULT '', projectId TEXT DEFAULT '',
      active INTEGER DEFAULT 1, createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS user_queries (
      userId TEXT NOT NULL, query TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_competitors (
      userId TEXT NOT NULL, name TEXT NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
}

// ── JSON → SQLite 数据迁移（幂等：已有数据则跳过）──
function migrateJsonData(d) {
  const count = d.prepare("SELECT COUNT(*) as c FROM projects").get()
  if (count.c > 0) return // 已有数据，跳过迁移

  // 迁移 projects.json
  if (existsSync(OLD_PROJECTS)) {
    try {
      const projects = JSON.parse(readFileSync(OLD_PROJECTS, "utf-8") || "[]")
      const insertProj = d.prepare("INSERT OR IGNORE INTO projects(id,brand,domain,industry,mode,intendedContent,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)")
      const insertComp = d.prepare("INSERT OR IGNORE INTO project_competitors(projectId,name) VALUES(?,?)")
      const insertQuery = d.prepare("INSERT OR IGNORE INTO project_queries(projectId,query) VALUES(?,?)")
      const insertAudit = d.prepare("INSERT OR IGNORE INTO audits(id,projectId,timestamp,mode,searchEngine,serpVisibility,aiCitationRate,overallScore,serpHits,aiHits,totalQueries,gapAnalysis) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      const insertPQ = d.prepare("INSERT OR IGNORE INTO audit_per_query(auditId,query,serpEngine,inSerp,aiAnswer,inAiAnswer,level,levelLabel,reason,suggestion) VALUES(?,?,?,?,?,?,?,?,?,?)")
      const insertAComp = d.prepare("INSERT OR IGNORE INTO audit_competitors(auditId,name,count) VALUES(?,?,?)")

      const txn = d.transaction(() => {
        for (const p of Array.isArray(projects) ? projects : []) {
          const id = p.id || randomUUID()
          insertProj.run(id, p.brand||"", p.domain||"", p.industry||"", p.mode||"general", JSON.stringify(p.intendedContent||[]), p.createdAt||new Date().toISOString(), p.updatedAt||new Date().toISOString())
          for (const c of (Array.isArray(p.competitors)?p.competitors:[])) insertComp.run(id, c)
          for (const q of (Array.isArray(p.queries)?p.queries:[])) insertQuery.run(id, q)
          for (const a of (Array.isArray(p.audits)?p.audits:[])) {
            const aid = randomUUID()
            insertAudit.run(aid, id, a.timestamp||new Date().toISOString(), a.mode||"", a.searchEngine||"", a.serpVisibility||0, a.aiCitationRate||0, a.overallScore||0, a.serpHits||0, a.aiHits||0, p.queries?.length||0, JSON.stringify(a.gapAnalysis||{}))
            for (const r of (Array.isArray(a.perQuery)?a.perQuery:[])) insertPQ.run(aid, r.query||"", r.serpEngine||"", r.inSerp?1:0, r.aiAnswer||"", r.inAiAnswer?1:0, r.level||"none", r.levelLabel||"", r.reason||"", r.suggestion||"")
            for (const c of (Array.isArray(a.topCompetitors)?a.topCompetitors:[])) insertAComp.run(aid, c.name||"", c.count||0)
          }
        }
      })
      txn()
      console.log("[DB] 已从 projects.json 迁移数据")
    } catch(e) { console.error("[DB] 迁移 projects.json 失败:", e.message) }
  }

  // 迁移 users.json
  if (existsSync(OLD_USERS)) {
    try {
      const users = JSON.parse(readFileSync(OLD_USERS, "utf-8") || "[]")
      const insertUser = d.prepare("INSERT OR IGNORE INTO users(id,name,title,role,brand,domain,projectId,active,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)")
      const insertUQ = d.prepare("INSERT OR IGNORE INTO user_queries(userId,query) VALUES(?,?)")
      const insertUC = d.prepare("INSERT OR IGNORE INTO user_competitors(userId,name) VALUES(?,?)")
      const txn = d.transaction(() => {
        for (const u of (Array.isArray(users)?users:[])) {
          insertUser.run(u.id||randomUUID(), u.name||"", u.title||"", u.role||"编辑", u.brand||"", u.domain||"", u.projectId||"", u.active!==false?1:0, u.createdAt||new Date().toISOString(), u.updatedAt||new Date().toISOString())
          for (const q of (Array.isArray(u.queries)?u.queries:[])) insertUQ.run(u.id, q)
          for (const c of (Array.isArray(u.competitors)?u.competitors:[])) insertUC.run(u.id, c)
        }
      })
      txn()
      console.log("[DB] 已从 users.json 迁移数据")
    } catch(e) { console.error("[DB] 迁移 users.json 失败:", e.message) }
  }
}

// ── 项目 CRUD（与 project.mjs 保持相同接口）──
export async function listProjects() {
  const d = getDb()
  const projects = d.prepare("SELECT * FROM projects ORDER BY updatedAt DESC").all()
  return projects.map(p => {
    const competitors = d.prepare("SELECT name FROM project_competitors WHERE projectId=? ORDER BY rowid").all(p.id).map(r=>r.name)
    const queries = d.prepare("SELECT query FROM project_queries WHERE projectId=? ORDER BY rowid").all(p.id).map(r=>r.query)
    const audits = d.prepare("SELECT * FROM audits WHERE projectId=? ORDER BY timestamp").all(p.id).map(a => {
      const perQuery = d.prepare("SELECT * FROM audit_per_query WHERE auditId=? ORDER BY id").all(a.id)
      const topCompetitors = d.prepare("SELECT name, count FROM audit_competitors WHERE auditId=? ORDER BY count DESC").all(a.id)
      return { ...a, perQuery, topCompetitors, gapAnalysis: JSON.parse(a.gapAnalysis||"{}") }
    })
    return { ...p, competitors, queries, audits, intendedContent: JSON.parse(p.intendedContent||"[]") }
  })
}

export async function getProject(id) {
  const all = await listProjects()
  return all.find(p => p.id === id) || null
}

export async function createProject(input = {}) {
  const d = getDb()
  const id = input.id || randomUUID()
  const now = new Date().toISOString()
  const txn = d.transaction(() => {
    d.prepare("INSERT OR REPLACE INTO projects(id,brand,domain,industry,mode,intendedContent,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)").run(id, input.brand||"", input.domain||"", input.industry||"", input.mode||"general", JSON.stringify(input.intendedContent||[]), input.createdAt||now, now)
    d.prepare("DELETE FROM project_competitors WHERE projectId=?").run(id)
    d.prepare("DELETE FROM project_queries WHERE projectId=?").run(id)
    for (const c of (Array.isArray(input.competitors)?input.competitors:[]).map(String)) d.prepare("INSERT INTO project_competitors(projectId,name) VALUES(?,?)").run(id, c)
    for (const q of (Array.isArray(input.queries)?input.queries:[]).map(String)) d.prepare("INSERT INTO project_queries(projectId,query) VALUES(?,?)").run(id, q)
  })
  txn()
  return getProject(id)
}

export async function updateProject(id, patch = {}) {
  const existing = await getProject(id)
  if (!existing) return null
  return createProject({ ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
}

export async function deleteProject(id) {
  const d = getDb()
  const result = d.prepare("DELETE FROM projects WHERE id=?").run(id)
  return result.changes > 0
}

export async function addAudit(projectId, auditData = {}) {
  const d = getDb()
  const aid = randomUUID()
  const now = auditData.timestamp || new Date().toISOString()
  const txn = d.transaction(() => {
    d.prepare("INSERT OR REPLACE INTO audits(id,projectId,timestamp,mode,searchEngine,serpVisibility,aiCitationRate,overallScore,serpHits,aiHits,totalQueries,gapAnalysis) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(aid, projectId, now, auditData.mode||"", auditData.searchEngine||"", auditData.serpVisibility||0, auditData.aiCitationRate||0, auditData.overallScore||0, auditData.serpHits||0, auditData.aiHits||0, auditData.totalQueries||0, JSON.stringify(auditData.gapAnalysis||{}))
    d.prepare("DELETE FROM audit_per_query WHERE auditId=?").run(aid)
    d.prepare("DELETE FROM audit_competitors WHERE auditId=?").run(aid)
    for (const r of (Array.isArray(auditData.perQuery)?auditData.perQuery:[])) d.prepare("INSERT INTO audit_per_query(auditId,query,serpEngine,inSerp,aiAnswer,inAiAnswer,level,levelLabel,reason,suggestion) VALUES(?,?,?,?,?,?,?,?,?,?)").run(aid, r.query||"", r.serpEngine||"", r.inSerp?1:0, r.aiAnswer||"", r.inAiAnswer?1:0, r.level||"none", r.levelLabel||"", r.reason||"", r.suggestion||"")
    for (const c of (Array.isArray(auditData.topCompetitors)?auditData.topCompetitors:[])) d.prepare("INSERT INTO audit_competitors(auditId,name,count) VALUES(?,?,?)").run(aid, c.name||"", c.count||0)
    d.prepare("UPDATE projects SET updatedAt=? WHERE id=?").run(now, projectId)
  })
  txn()
  return getProject(projectId)
}

// ── 用户 CRUD ──
export async function listUsers() {
  const d = getDb()
  const users = d.prepare("SELECT * FROM users ORDER BY updatedAt DESC").all()
  return users.map(u => {
    const queries = d.prepare("SELECT query FROM user_queries WHERE userId=? ORDER BY rowid").all(u.id).map(r=>r.query)
    const competitors = d.prepare("SELECT name FROM user_competitors WHERE userId=? ORDER BY rowid").all(u.id).map(r=>r.name)
    return { ...u, queries, competitors, active: !!u.active }
  })
}

export async function getUser(id) { const all = await listUsers(); return all.find(u=>u.id===id)||null }

export async function createUser(input = {}) {
  const d = getDb()
  const id = input.id || randomUUID()
  const now = new Date().toISOString()
  const txn = d.transaction(() => {
    d.prepare("INSERT OR REPLACE INTO users(id,name,title,role,brand,domain,projectId,active,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, input.name||"", input.title||"", input.role||"编辑", input.brand||"", input.domain||"", input.projectId||"", input.active!==false?1:0, input.createdAt||now, now)
    d.prepare("DELETE FROM user_queries WHERE userId=?").run(id)
    d.prepare("DELETE FROM user_competitors WHERE userId=?").run(id)
    for (const q of (Array.isArray(input.queries)?input.queries:[]).map(String)) d.prepare("INSERT INTO user_queries(userId,query) VALUES(?,?)").run(id, q)
    for (const c of (Array.isArray(input.competitors)?input.competitors:[]).map(String)) d.prepare("INSERT INTO user_competitors(userId,name) VALUES(?,?)").run(id, c)
  })
  txn()
  return getUser(id)
}

export async function updateUser(id, patch = {}) {
  const existing = await getUser(id)
  if (!existing) return null
  return createUser({ ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
}

export async function deleteUser(id) {
  const d = getDb()
  const result = d.prepare("DELETE FROM users WHERE id=?").run(id)
  return result.changes > 0
}
