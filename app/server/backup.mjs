// SQLite 自动备份 + 一键恢复
// 每日备份到 data/backups/，保留最近 7 天
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { dirname, join, basename } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, "..", "data", "geo.db")
const BACKUP_DIR = join(__dirname, "..", "data", "backups")
const MAX_BACKUPS = 7

function ensureDir() {
  mkdirSync(BACKUP_DIR, { recursive: true })
}

// ── 备份 ──
export function createBackup(label = "") {
  ensureDir()
  const now = new Date()
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const name = label ? `geo-${ts}-${label}.db` : `geo-${ts}.db`
  const dest = join(BACKUP_DIR, name)
  
  if (!existsSync(DB_PATH)) {
    return { ok: false, error: "数据库文件不存在" }
  }

  try {
    copyFileSync(DB_PATH, dest)
    // 清理超过 7 天的旧备份
    pruneBackups()
    const size = (statSync(dest).size / 1024).toFixed(1)
    console.log(`[Backup] 已创建备份: ${name} (${size} KB)`)
    return { ok: true, name, size: size + " KB", time: ts }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function pruneBackups() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".db"))
      .map(f => ({ name: f, time: statSync(join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)

    // 删除超出保留数量的旧备份
    for (let i = MAX_BACKUPS; i < files.length; i++) {
      unlinkSync(join(BACKUP_DIR, files[i].name))
      console.log(`[Backup] 已清理旧备份: ${files[i].name}`)
    }
  } catch (e) { /* ignore */ }
}

// ── 列表备份 ──
export function listBackups() {
  ensureDir()
  try {
    return readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".db"))
      .map(f => {
        const fp = join(BACKUP_DIR, f)
        const st = statSync(fp)
        return {
          name: f,
          size: (st.size / 1024).toFixed(1) + " KB",
          time: st.mtime.toISOString(),
          path: fp,
        }
      })
      .sort((a, b) => new Date(b.time) - new Date(a.time))
  } catch {
    return []
  }
}

// ── 恢复备份 ──
export function restoreBackup(filename) {
  const src = join(BACKUP_DIR, filename)
  
  // 安全检查：防止目录穿越
  if (!src.startsWith(BACKUP_DIR) || !existsSync(src)) {
    return { ok: false, error: "备份文件不存在" }
  }

  try {
    // 恢复前先创建当前备份
    const preRestore = createBackup("pre-restore")
    
    // 复制备份到数据库位置
    copyFileSync(src, DB_PATH)
    console.log(`[Backup] 已从备份恢复: ${filename}`)
    return { ok: true, restoredFrom: filename, preRestoreBackup: preRestore.name }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── 删除备份 ──
export function deleteBackup(filename) {
  const fp = join(BACKUP_DIR, filename)
  if (!fp.startsWith(BACKUP_DIR)) return { ok: false, error: "路径非法" }
  try {
    if (existsSync(fp)) {
      unlinkSync(fp)
      return { ok: true }
    }
    return { ok: false, error: "文件不存在" }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── 自动每日备份（服务器启动时调用）──
let dailyBackupTimer = null

export function startAutoBackup() {
  ensureDir()
  // 启动时立即备份一次
  createBackup("startup")
  
  // 每 24 小时备份一次
  if (dailyBackupTimer) clearInterval(dailyBackupTimer)
  dailyBackupTimer = setInterval(() => {
    createBackup("auto")
  }, 86_400_000) // 24h
  
  console.log("[Backup] 自动每日备份已启动")
}
