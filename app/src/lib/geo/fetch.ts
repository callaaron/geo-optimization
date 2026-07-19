// URL 抓取：经 CORS 代理获取网页原始 HTML（客户端无后端时的方案）
export interface FetchResult {
  ok: boolean
  html?: string
  finalUrl?: string
  error?: string
}

const PROXIES: ((url: string) => string)[] = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
]

export async function fetchUrl(url: string): Promise<FetchResult> {
  let target = url.trim()
  if (!/^https?:\/\//i.test(target)) target = "https://" + target

  for (const make of PROXIES) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const resp = await fetch(make(target), {
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml,*/*" },
      })
      clearTimeout(timer)
      if (!resp.ok) continue
      const html = await resp.text()
      if (!html || html.length < 200) continue
      return { ok: true, html, finalUrl: target }
    } catch {
      clearTimeout(timer)
      // 尝试下一个代理
    }
  }
  return {
    ok: false,
    error:
      "无法通过公共 CORS 代理抓取该网址（可能被目标站拦截、需登录或网络受限）。可改用「粘贴内容」方式直接分析。",
  }
}

export function normalizeUrl(url: string): string {
  let t = url.trim()
  if (!/^https?:\/\//i.test(t)) t = "https://" + t
  return t
}
