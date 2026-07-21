/**
 * server/upload.mjs — 多格式文件上传与文本提取
 *
 * 支持：PDF、Word (.docx)、PowerPoint (.pptx)
 * 纯文本输出 → 供 AI 提取结构化信息使用
 * 依赖：pdf-parse, mammoth, adm-zip (已在 app/package.json)
 */

import { readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { randomBytes } from "node:crypto"

// ── 极简 multipart 解析（不引入 busboy/formidable 等大依赖） ──
/**
 * 解析 multipart/form-data body
 * 返回 [{ fieldName, fileName?, contentType?, data: Buffer }]
 */
function parseMultipart(body, boundary) {
  const parts = []
  const b = Buffer.from(boundary)
  const buf = Buffer.from(body)

  // 找每个 boundary 分隔符的位置
  let start = 0
  while (start < buf.length) {
    const idx = buf.indexOf(b, start)
    if (idx === -1) break
    // 跳过 boundary 行
    let pos = idx + b.length + 2 // +2 跳过 \r\n
    if (pos >= buf.length) break

    // 找到下一个 boundary 或结束
    const next = buf.indexOf(b, pos)
    const end = next === -1 ? buf.length : next - 2 // 去除末尾 \r\n

    if (end <= pos) {
      start = pos
      continue
    }

    const section = buf.slice(pos, end)

    // 解析 headers
    const headerEnd = section.indexOf(0x0d)  // \r
    if (headerEnd === -1) {
      start = pos
      continue
    }

    const headerText = section.slice(0, headerEnd).toString("utf-8")

    // 跳过空的 header
    if (!headerText.trim()) {
      start = pos
      if (next === -1) break
      start = next
      continue
    }

    const nameMatch = headerText.match(/name="([^"]+)"/)
    const filenameMatch = headerText.match(/filename="([^"]+)"/)
    const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i)

    if (!nameMatch) {
      start = pos
      if (next === -1) break
      start = next
      continue
    }

    // 数据从 header 后开始：header + \r\n\r\n
    let dataStart = headerEnd
    // 跳过 \r\n\r\n (header 已经到 \r, 再找下一个 \r\n\r\n)
    while (dataStart + 3 < section.length &&
           !(section[dataStart] === 0x0d && section[dataStart + 1] === 0x0a && section[dataStart + 2] === 0x0d && section[dataStart + 3] === 0x0a)) {
      dataStart++
    }
    dataStart += 4 // 跳过 \r\n\r\n

    const data = section.slice(dataStart)

    parts.push({
      fieldName: nameMatch[1],
      fileName: filenameMatch ? filenameMatch[1] : undefined,
      contentType: contentTypeMatch ? contentTypeMatch[1].trim() : undefined,
      data,
    })

    if (next === -1) break
    start = next
  }

  return parts
}

/**
 * 读取 multipart body（从 IncomingMessage stream）
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<{fields: Object, files: Array}>}
 */
export function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || ""
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)
    if (!boundaryMatch) return reject(new Error("不是有效的 multipart 请求"))

    const boundary = "--" + (boundaryMatch[1] || boundaryMatch[2])
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks)
        const parts = parseMultipart(body, boundary)
        const fields = {}
        const files = []
        for (const p of parts) {
          if (p.fileName) {
            files.push(p)
          } else {
            fields[p.fieldName] = p.data.toString("utf-8")
          }
        }
        resolve({ fields, files, boundary })
      } catch (e) {
        reject(e)
      }
    })
    req.on("error", reject)
  })
}

// ── 文本提取器 ──

/**
 * 从 PDF 提取纯文本
 */
async function extractPDF(filePath) {
  try {
    const pdfParse = (await import("pdf-parse")).default
    const data = readFileSync(filePath)
    const parsed = await pdfParse(data)
    return String(parsed.text || "").trim()
  } catch (e) {
    throw new Error(`PDF 解析失败: ${e.message}`)
  }
}

/**
 * 从 Word (.docx) 提取纯文本
 */
async function extractDocx(filePath) {
  try {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ path: filePath })
    return String(result.value || "").trim()
  } catch (e) {
    throw new Error(`Word 解析失败: ${e.message}`)
  }
}

/**
 * 从 PowerPoint (.pptx) 提取纯文本
 * PPTX 本质是 ZIP 包含 XML slide 文件
 */
async function extractPptx(filePath) {
  try {
    const AdmZip = (await import("adm-zip")).default
    const zip = new AdmZip(filePath)
    const entries = zip.getEntries()
    const slides = []

    // 按 slide 编号排序提取
    const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/i
    const slideEntries = entries
      .filter((e) => slideRegex.test(e.entryName))
      .sort((a, b) => {
        const na = Number(a.entryName.match(slideRegex)[1])
        const nb = Number(b.entryName.match(slideRegex)[1])
        return na - nb
      })

    for (const entry of slideEntries) {
      const xml = entry.getData().toString("utf-8")
      // 提取 <a:t> 标签内的文本
      const texts = []
      const re = /<a:t[^>]*>([^<]*)<\/a:t>/g
      let m
      while ((m = re.exec(xml)) !== null) {
        const t = m[1].trim()
        if (t) texts.push(t)
      }
      if (texts.length > 0) {
        slides.push(texts.join("\n"))
      }
    }

    const result = slides.join("\n\n")
    if (!result.trim()) throw new Error("PPT 中未提取到文本内容")
    return result.trim()
  } catch (e) {
    throw new Error(`PPT 解析失败: ${e.message}`)
  }
}

// ── 文件类型检测 ──
function getFileType(fileName, contentType) {
  const lower = (fileName || "").toLowerCase()
  if (lower.endsWith(".pdf") || contentType === "application/pdf") return "pdf"
  if (lower.endsWith(".docx") || contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx"
  if (lower.endsWith(".pptx") || contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx"
  if (lower.endsWith(".txt") || contentType === "text/plain") return "txt"
  return "unknown"
}

/**
 * 主入口：从上传文件提取文本
 * @param {{fileName:string, data:Buffer, contentType?:string}} file
 * @returns {Promise<{text: string, fileType: string, originalName: string}>}
 */
export async function extractFileText({ fileName, data, contentType = "" }) {
  const fileType = getFileType(fileName, contentType)
  if (fileType === "unknown") {
    throw new Error(`不支持的文件类型: ${fileName}。支持 PDF、Word(.docx)、PowerPoint(.pptx)、TXT`)
  }

  // 写入临时文件（pdf-parse/mammoth/adm-zip 都需要文件路径）
  const tmpDir = join(tmpdir(), "geo-upload")
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const tmpPath = join(tmpDir, `${randomBytes(8).toString("hex")}-${fileName}`)
  try {
    const { writeFileSync } = await import("node:fs")
    writeFileSync(tmpPath, data)

    let text = ""
    switch (fileType) {
      case "pdf":
        text = await extractPDF(tmpPath)
        break
      case "docx":
        text = await extractDocx(tmpPath)
        break
      case "pptx":
        text = await extractPptx(tmpPath)
        break
      case "txt":
        text = data.toString("utf-8").trim()
        break
    }

    return {
      text: text.substring(0, 12000), // 截断到 12000 字符
      fileType,
      originalName: fileName,
    }
  } finally {
    // 清理临时文件
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
  }
}
