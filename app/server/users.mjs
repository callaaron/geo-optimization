// 多用户配置模块：团队成员管理，JSON 文件持久化
// 参考 gego 的 JWT 角色模型，简化为无登录的配置型多用户（适配局域网 Mac Mini）
// 存储于 data/users.json
import { readFile, writeFile, mkdir, rename } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, "..", "data")
const DATA_FILE = join(DATA_DIR, "users.json")

// 写操作串行化
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
    return []
  }
}

async function saveAll(users) {
  await mkdir(DATA_DIR, { recursive: true })
  const tmp = DATA_FILE + ".tmp"
  await writeFile(tmp, JSON.stringify(users, null, 2), "utf-8")
  await rename(tmp, DATA_FILE)
}

const ROLES = ["管理员", "编辑", "只读"]
const str = (x) => String(x ?? "").trim()

function normalizeUser(u = {}) {
  const now = new Date().toISOString()
  return {
    id: u.id || randomUUID(),
    name: str(u.name),
    title: str(u.title),            // 职位/角色描述
    role: ROLES.includes(u.role) ? u.role : "编辑",
    brand: str(u.brand),            // 该用户负责的品牌
    domain: str(u.domain),
    queries: Array.isArray(u.queries) ? u.queries.map(str).filter(Boolean) : [],
    competitors: Array.isArray(u.competitors) ? u.competitors.map(str).filter(Boolean) : [],
    projectId: str(u.projectId),    // 关联的项目 ID（可选）
    active: u.active !== false,     // 是否在职
    createdAt: u.createdAt || now,
    updatedAt: now,
  }
}

export async function listUsers() {
  return loadAll()
}

export async function getUser(id) {
  const all = await loadAll()
  return all.find((u) => u.id === id) || null
}

export async function createUser(input = {}) {
  return withLock(async () => {
    const all = await loadAll()
    const user = normalizeUser(input)
    all.push(user)
    await saveAll(all)
    return user
  })
}

export async function updateUser(id, patch = {}) {
  return withLock(async () => {
    const all = await loadAll()
    const idx = all.findIndex((u) => u.id === id)
    if (idx === -1) return null
    const merged = normalizeUser({
      ...all[idx],
      ...patch,
      id,
      createdAt: all[idx].createdAt,
      updatedAt: new Date().toISOString(),
    })
    all[idx] = merged
    await saveAll(all)
    return merged
  })
}

export async function deleteUser(id) {
  return withLock(async () => {
    const all = await loadAll()
    const next = all.filter((u) => u.id !== id)
    if (next.length === all.length) return false
    await saveAll(next)
    return true
  })
}
