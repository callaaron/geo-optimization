// Cron 定时审计调度器 + 飞书通知
// 对标 gego 的分布式调度器，简化版：node-cron 单进程调度
import cron from "node-cron"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, "..", "data")
const SCHEDULE_PATH = join(DATA_DIR, "schedule.json")
const LOG_PATH = join(DATA_DIR, "scheduler-log.json")

// ── 数据结构 ──
const DEFAULT_SCHEDULE = {
  enabled: false,
  cron: "0 9 * * *",
  label: "每日",
  feishuWebhook: "",
  notifOnComplete: false,
}

let currentTask = null
let auditCallback = null  // 审计执行回调，返回摘要

// ── 持久化 ──
function loadSchedule() {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    if (existsSync(SCHEDULE_PATH)) {
      return { ...DEFAULT_SCHEDULE, ...JSON.parse(readFileSync(SCHEDULE_PATH, "utf-8")) }
    }
  } catch (e) { console.error("[Scheduler] 加载配置失败:", e.message) }
  return { ...DEFAULT_SCHEDULE }
}

function saveSchedule(cfg) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(SCHEDULE_PATH, JSON.stringify(cfg, null, 2), "utf-8")
  } catch (e) { console.error("[Scheduler] 保存配置失败:", e.message) }
}

function appendLog(entry) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    const logs = existsSync(LOG_PATH) ? JSON.parse(readFileSync(LOG_PATH, "utf-8") || "[]") : []
    logs.unshift(entry)
    // 只保留最近 100 条
    writeFileSync(LOG_PATH, JSON.stringify(logs.slice(0, 100), null, 2), "utf-8")
  } catch (e) { /* ignore */ }
}

// ── 飞书通知 ──
async function sendFeishu(webhook, summary) {
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "interactive",
        card: {
          header: { title: { tag: "plain_text", content: "GEO 定时审计报告" }, template: "blue" },
          elements: [
            { tag: "markdown", content: summary },
            { tag: "hr" },
            { tag: "note", elements: [{ tag: "plain_text", content: `自动生成 · ${new Date().toLocaleString("zh-CN")}` }] },
          ],
        },
      }),
    })
  } catch (e) { console.error("[Scheduler] 飞书通知失败:", e.message) }
}

// ── 调度核心 ──
export function getSchedule() {
  return loadSchedule()
}

export function updateSchedule(patch) {
  const cfg = { ...loadSchedule(), ...patch }
  saveSchedule(cfg)
  applySchedule(cfg)
  return cfg
}

export function getLogs() {
  try {
    if (existsSync(LOG_PATH)) return JSON.parse(readFileSync(LOG_PATH, "utf-8") || "[]")
  } catch { /* ignore */ }
  return []
}

/** 注册审计执行回调 */
export function setAuditCallback(fn) {
  auditCallback = fn
}

function applySchedule(cfg) {
  // 停止旧任务
  if (currentTask) {
    currentTask.stop()
    currentTask = null
  }

  if (!cfg.enabled || !cfg.cron) return

  if (!cron.validate(cfg.cron)) {
    console.error("[Scheduler] 无效的 cron 表达式:", cfg.cron)
    return
  }

  currentTask = cron.schedule(cfg.cron, async () => {
    console.log(`[Scheduler] 定时任务触发: ${cfg.label} (${cfg.cron})`)
    const start = Date.now()
    let summary = ""
    try {
      if (auditCallback) {
        summary = await auditCallback()
      } else {
        summary = "审计回调未注册"
      }
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      const result = `✅ 完成 (${elapsed}s)\n${summary}`
      appendLog({ time: new Date().toISOString(), action: cfg.label, result })
      if (cfg.notifOnComplete && cfg.feishuWebhook) {
        await sendFeishu(cfg.feishuWebhook, `**${cfg.label} 审计完成** (${elapsed}s)\n\n${summary}`)
      }
    } catch (e) {
      const msg = `❌ 失败: ${e.message}`
      appendLog({ time: new Date().toISOString(), action: cfg.label, result: msg })
      console.error("[Scheduler] 定时任务失败:", e.message)
    }
  }, { scheduled: true })

  console.log(`[Scheduler] 已启动定时任务: ${cfg.label} (${cfg.cron})`)
}

// ── 启动时加载已有配置 ──
export function initScheduler() {
  const cfg = loadSchedule()
  if (cfg.enabled) {
    applySchedule(cfg)
    console.log(`[Scheduler] 初始化完成: ${cfg.enabled ? cfg.label : "已禁用"}`)
  }
}
