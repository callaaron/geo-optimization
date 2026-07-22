// API 限流 + 用量统计（token bucket，纯内存，无外部依赖）
// 控制多引擎 API 费用，按用户角色分级
const buckets = new Map()       // key → { tokens, lastRefill, max, refillRate }
const dailyUsage = new Map()    // key → { date, calls, tokens }
const USAGE_WINDOW_MS = 86_400_000 // 24h

// 角色对应每日 AI 调用上限
const ROLE_LIMITS = {
  "管理员": 500,
  "编辑": 100,
  "只读": 30,
}

// Token bucket 配置
const IP_LIMIT = { max: 60, refillRate: 1 }       // IP: 60次/分钟
const AI_LIMIT = { max: 30, refillRate: 0.5 }     // AI调用: 30次/分钟

// ── Token Bucket ──
function getBucket(key, config) {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b) {
    b = { tokens: config.max, lastRefill: now, ...config }
    buckets.set(key, b)
  }
  // 按时间补充 token（每秒 refillRate 个）
  const elapsed = (now - b.lastRefill) / 1000
  b.tokens = Math.min(b.max, b.tokens + elapsed * b.refillRate)
  b.lastRefill = now
  return b
}

function consumeToken(key, config) {
  const b = getBucket(key, config)
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}

// ── 每日用量追踪 ──
function today() { return new Date().toISOString().slice(0, 10) }

function trackUsage(userId, tokens = 1) {
  const date = today()
  const key = `${userId}:${date}`
  let entry = dailyUsage.get(key)
  if (!entry) {
    entry = { date, calls: 0, tokens: 0 }
    dailyUsage.set(key, entry)
  }
  entry.calls += 1
  entry.tokens += tokens
}

// ── 限流中间件 ──
export function checkRateLimit(req) {
  const ip = req.socket.remoteAddress || "unknown"
  
  // IP 级别限流
  if (!consumeToken(`ip:${ip}`, IP_LIMIT)) {
    return { allowed: false, reason: "请求过于频繁，请稍后再试", retryAfter: 60 }
  }
  return { allowed: true }
}

export function checkAIRateLimit(user) {
  if (!user) return { allowed: false, reason: "未登录" }

  const uid = user.id
  const role = user.role || "编辑"
  const dailyCap = ROLE_LIMITS[role] || 50

  // Token bucket（平滑限流）
  if (!consumeToken(`ai:${uid}`, AI_LIMIT)) {
    return { allowed: false, reason: "AI 调用过于频繁，请稍后再试", retryAfter: 30 }
  }

  // 每日上限
  const date = today()
  const key = `${uid}:${date}`
  const entry = dailyUsage.get(key)
  const used = entry?.calls || 0
  if (used >= dailyCap) {
    return { allowed: false, reason: `今日 AI 调用已达上限（${dailyCap}次/天），请明天再试`, cap: dailyCap, used }
  }

  // 追踪用量
  trackUsage(uid)
  return { allowed: true, dailyCap, used: used + 1 }
}

// ── 用量查询 ──
export function getDailyUsage(userId) {
  const date = today()
  const key = `${userId}:${date}`
  const entry = dailyUsage.get(key)
  const role = "编辑" // default
  const cap = ROLE_LIMITS[role] || 50
  return {
    date,
    calls: entry?.calls || 0,
    tokens: entry?.tokens || 0,
    dailyCap: cap,
    remaining: Math.max(0, cap - (entry?.calls || 0)),
  }
}

export function getAllUsage() {
  const result = []
  for (const [key, entry] of dailyUsage) {
    if (entry.date === today()) {
      result.push({ userId: key.split(":")[0], ...entry })
    }
  }
  return result
}

// ── 清理过期 bucket（每 10 分钟）──
setInterval(() => {
  const now = Date.now()
  for (const [key, b] of buckets) {
    if (now - b.lastRefill > 300_000) buckets.delete(key) // 5分钟未使用则清理
  }
}, 600_000)
