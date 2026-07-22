// Webhook 事件系统：审计完成 / 评分变化 / 竞品异动 → POST JSON 到外部 URL
// 对标 v3.0 平台集成能力
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, "..", "data")
const CONFIG_PATH = join(DATA_DIR, "webhook.json")

const DEFAULT_CONFIG = {
  enabled: false,
  url: "",                 // Webhook URL
  events: {                // 触发事件
    auditComplete: true,   // 审计完成
    scoreChange: true,     // 健康度评分变化 > 10
    competitorAlert: true, // 竞品首次被 AI 引用
  },
  secret: "",              // 签名密钥（可选，HMAC-SHA256）
}

function load() {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    if (existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function save(cfg) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8")
  } catch { /* ignore */ }
}

export function getWebhookConfig() { return load() }
export function updateWebhookConfig(patch) {
  const cfg = { ...load(), ...patch }
  save(cfg)
  return cfg
}

// ── 发送 Webhook ──
async function fire(event, payload) {
  const cfg = load()
  if (!cfg.enabled || !cfg.url) return
  if (!cfg.events[event]) return

  const body = {
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  }

  const headers = { "Content-Type": "application/json" }
  if (cfg.secret) {
    const crypto = await import("node:crypto")
    const hmac = crypto.createHmac("sha256", cfg.secret)
    hmac.update(JSON.stringify(body))
    headers["X-GEO-Signature"] = hmac.digest("hex")
  }

  try {
    await fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    console.log(`[Webhook] ${event} 已发送`)
  } catch (e) {
    console.error(`[Webhook] ${event} 发送失败:`, e.message)
  }
}

// ── 事件触发函数 ──
export function onAuditComplete(result) {
  fire("auditComplete", {
    brand: result.brand,
    serpVisibility: result.serpVisibility,
    aiCitationRate: result.aiCitationRate,
    totalQueries: result.totalQueries,
    serpHits: result.serpHits,
    aiHits: result.aiHits,
  })
}

export function onScoreChange(brand, oldScore, newScore) {
  const diff = Math.abs(newScore - oldScore)
  if (diff < 10) return // 变化 < 10 分不触发
  fire("scoreChange", {
    brand,
    oldScore,
    newScore,
    diff,
    direction: newScore > oldScore ? "up" : "down",
  })
}

export function onCompetitorAlert(brand, competitor, query) {
  fire("competitorAlert", {
    brand,
    competitor,
    query,
    message: `竞品「${competitor}」在 Query「${query}」的 AI 回答中被首次引用`,
  })
}
