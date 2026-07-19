/**
 * server/search.mjs — 零依赖网页搜索模块
 *
 * 用 360 搜索(so.com)做主引擎（中文 B2B 结果最精准），
 * Bing 做备用。提取标题 + URL + 摘要。
 *
 * 纯 Node https + zlib，不引入任何三方依赖。
 */

import https from "node:https";
import zlib from "node:zlib";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "zh-CN,zh;q=0.9",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Encoding": "gzip, deflate",
};

/**
 * 底层 HTTP GET（支持 gzip/deflate 解压 + 重定向跟随）
 */
function httpGet(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    const req = https.get(url, { headers: HEADERS }, (res) => {
      // 跟随重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        return resolve(httpGet(next, redirects + 1));
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        const enc = res.headers["content-encoding"];
        try {
          if (enc === "gzip") buf = zlib.gunzipSync(buf);
          else if (enc === "deflate") buf = zlib.inflateSync(buf);
        } catch {
          /* 解压失败就用原始 buffer */
        }
        resolve({ status: res.statusCode, body: buf.toString("utf8"), headers: res.headers });
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/**
 * 从 HTML 中清洗出纯文本
 */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 360 搜索（so.com）— 主引擎
 * 中文 B2B 结果最精准，返回标题 + URL + 摘要
 */
function search360(query, count = 10) {
  const url = `https://www.so.com/s?q=${encodeURIComponent(query)}&ie=utf-8`;
  return httpGet(url).then(({ status, body }) => {
    if (status !== 200) return [];
    const results = [];

    // 策略 1：按 h3 > a 提取标题+链接
    const titleRe = /<h3[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const titles = [];
    let m;
    while ((m = titleRe.exec(body)) !== null) {
      const href = m[1];
      const title = stripHtml(m[2]);
      if (title.length > 4 && href !== "javascript:;" && !title.includes("360浏览器")) {
        titles.push({ href, title });
      }
    }

    // 策略 2：提取摘要（包含行业关键词的 <p> 文本）
    const snipRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
    const snippets = [];
    while ((m = snipRe.exec(body)) !== null) {
      const s = stripHtml(m[1]);
      if (s.length > 15 && s.length < 300) {
        snippets.push(s);
      }
    }

    // 合并：标题与摘要按顺序配对
    for (let i = 0; i < Math.min(titles.length, count); i++) {
      results.push({
        title: titles[i].title.substring(0, 120),
        url: titles[i].href.startsWith("http")
          ? titles[i].href.substring(0, 200)
          : `https://www.so.com${titles[i].href}`.substring(0, 200),
        snippet: (snippets[i] || "").substring(0, 200),
        engine: "360",
      });
    }

    return results;
  });
}

/**
 * Bing 搜索 — 备用引擎
 */
function searchBing(query, count = 10) {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${count}&ensearch=0&mkt=zh-CN`;
  return httpGet(url).then(({ status, body }) => {
    if (status !== 200) return [];
    const results = [];
    // 提取所有非 Bing 内部链接
    const re = /<a[^>]*href="(https?:\/\/(?!www\.bing|cn\.bing|go\.microsoft|aka\.ms|www\.microsoft|login\.live|account\.microsoft|r\.bing)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    const seen = new Set();
    while ((m = re.exec(body)) !== null) {
      const u = m[1];
      const title = stripHtml(m[2]);
      if (title.length > 5 && title.length < 200 && !seen.has(u)) {
        seen.add(u);
        results.push({
          title: title.substring(0, 120),
          url: u.substring(0, 200),
          snippet: "", // Bing 的 snippet 需要更复杂的块级解析，先留空
          engine: "bing",
        });
      }
    }
    return results.slice(0, count);
  });
}

/**
 * 网页搜索（主接口）
 * 先试 360，失败或结果太少则 fallback 到 Bing
 */
export async function webSearch(query, opts = {}) {
  const count = opts.count || 10;
  const engines = opts.engine === "bing" ? ["bing"] : opts.engine === "360" ? ["360"] : ["360", "bing"];

  for (const engine of engines) {
    try {
      const fn = engine === "360" ? search360 : searchBing;
      const results = await fn(query, count);
      if (results.length >= 3) return { engine, results };
    } catch {
      // 引擎失败，试下一个
    }
  }

  // 所有引擎都失败了，返回空
  return { engine: "none", results: [] };
}

/**
 * 抓取页面正文文本（用于深度内容分析）
 * 返回纯文本，截断到 maxChars
 */
export async function fetchPageText(url, maxChars = 3000) {
  try {
    const { status, body } = await httpGet(url);
    if (status !== 200) return "";
    const text = stripHtml(body);
    return text.substring(0, maxChars);
  } catch {
    return "";
  }
}

/**
 * 将搜索结果格式化为 LLM 可读的上下文文本
 */
export function formatSearchContext(results) {
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.snippet || "(无摘要)"}`)
    .join("\n\n");
}
