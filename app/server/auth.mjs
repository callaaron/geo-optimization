// JWT 认证模块：登录/注册/权限中间件
// 基于 jsonwebtoken + bcryptjs（纯 JS，无原生依赖）
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import Database from "better-sqlite3"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, "..", "data", "geo.db")

// 生产环境应从环境变量读取；开发环境用固定 key
const JWT_SECRET = process.env.JWT_SECRET || "geo-system-jwt-secret-key-2026"
const JWT_EXPIRES = "24h"
const REFRESH_EXPIRES = "7d"

function getDb() {
  const db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  return db
}

// 确保 users 表有 password 列（兼容旧数据迁移）
function ensurePasswordColumn() {
  const db = getDb()
  try {
    db.exec("ALTER TABLE users ADD COLUMN password TEXT DEFAULT ''")
    console.log("[Auth] 已添加 password 列")
  } catch (e) {
    // 列已存在，忽略
  }
  // 为无密码的用户设置默认密码（首次使用）
  const users = db.prepare("SELECT id, name FROM users WHERE password IS NULL OR password = ''").all()
  for (const u of users) {
    const defaultPwd = bcrypt.hashSync("123456", 10)
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(defaultPwd, u.id)
  }
  if (users.length > 0) {
    console.log(`[Auth] 已为 ${users.length} 个用户设置默认密码（123456）`)
  }
  db.close()
}

// ── Token 操作 ──
export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

export function signRefreshToken(payload) {
  return jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

// ── 用户认证 ──
export function authenticateUser(name, password) {
  const db = getDb()
  try {
    const user = db.prepare("SELECT * FROM users WHERE name = ? AND active = 1").get(name)
    if (!user) return null
    if (!user.password) return null // 无密码，不允许登录
    const valid = bcrypt.compareSync(password, user.password)
    if (!valid) return null
    // 不返回 password 字段
    const { password: _, ...safe } = user
    return safe
  } finally {
    db.close()
  }
}

export function getUserById(id) {
  const db = getDb()
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(id)
    if (!user) return null
    const { password: _, ...safe } = user
    return safe
  } finally {
    db.close()
  }
}

export function setUserPassword(userId, newPassword) {
  const db = getDb()
  try {
    const hash = bcrypt.hashSync(newPassword, 10)
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, userId)
    return true
  } finally {
    db.close()
  }
}

export function listUsersSafe() {
  const db = getDb()
  try {
    const users = db.prepare("SELECT id, name, title, role, brand, domain, projectId, active, createdAt, updatedAt FROM users ORDER BY updatedAt DESC").all()
    return users
  } finally {
    db.close()
  }
}

// ── HTTP 中间件：从 Authorization header 解析用户 ──
export function authMiddleware(req) {
  const header = req.headers["authorization"] || ""
  const token = header.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null
  const decoded = verifyToken(token)
  if (!decoded) return null
  return { id: decoded.sub, name: decoded.name, role: decoded.role }
}

// ── 角色权限检查 ──
export function requireRole(user, allowedRoles) {
  if (!user) return false
  return allowedRoles.includes(user.role)
}

// 初始化：调用此函数确保 password 列存在
ensurePasswordColumn()
