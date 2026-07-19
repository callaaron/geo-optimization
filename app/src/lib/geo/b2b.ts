// B 端转化信号检测（纯文本启发式，无外部依赖、无后端）
// 用于 b2b 模式下评估页面是否具备「被企业客户检索 → 建立信任 → 转化留资」的关键信号。
// 返回类型 B2BSignalScore 的 detail 提供各信号原始计数（含 productSpecKw / proofKw / trustKw 等子项）便于排查。

export interface B2BSignalScore {
  productSpec: number // SKU/型号、规格参数表、技术参数（综合分）
  proof: number // 案例/白皮书/ROI/客户评价
  trust: number // 认证/资质/ISO/专利/合作伙伴
  buying: number // 价格/报价/预约演示/留资
  comparison: number // 对比/选型指南/差异
  score: number // 0-100 综合分
  detail: Record<string, number> // 各信号原始计数（便于排查）
}

// 中文关键词命中（includes，重叠分别计数）
const PRODUCT_SPEC_CJK = [
  "规格", "参数", "型号", "技术参数", "配置", "规格参数", "产品规格",
  "尺寸", "重量", "容量", "功率", "电压", "材质", "颜色", "接口", "协议",
  "兼容", "量程", "精度", "带宽", "频率", "续航", "转速", "扭矩", "规格表",
]
const PROOF_CJK = [
  "案例", "客户案例", "白皮书", "投资回报", "客户评价", "客户反馈", "客户说",
  "标杆客户", "成功案例", "落地案例", "实践", "ROI",
]
const TRUST_CJK = [
  "认证", "资质", "合规", "专利", "证书", "体系", "合作伙伴", "生态", "授权",
  "许可", "注册商标", "荣誉", "获奖", "标准", "资质认证", "认证体系",
]
const BUYING_CJK = [
  "价格", "报价", "方案", "预约", "演示", "联系销售", "试用", "询价", "选型",
  "留资", "采购", "购买", "下单", "咨询", "获取", "申请", "免费试用", "预约演示",
  "联系我们", "商务", "报价单", "合作", "在线下单",
]
const COMPARISON_CJK = [
  "对比", "选型指南", "区别", "优劣", "比较", "对比评测", "横向对比", "差异",
  "怎么选", "哪个好", "优势对比",
]

// 拉丁词（词边界 + 可选尾随数字，忽略大小写）
const PROOF_LATIN = ["roi", "testimonial"]
const TRUST_LATIN = ["iso", "ce"]
const BUYING_LATIN = ["trial", "demo", "rfq", "quote", "quotation"]
const COMPARISON_LATIN = ["vs", "pk"]

// 型号代码：如 ABC-200 / X100 / M200Pro / 200X
const MODEL_RE = /\b[A-Za-z]{1,4}\d{2,}[A-Za-z0-9]*\b|\b\d{2,}[A-Za-z]{1,4}\b/g
// 数字 + 单位 / 技术参数
const NUM_UNIT_RE =
  /(\d[\d.,]*\s?(?:mm|cm|kg|g|w|v|ah|mah|℃|°c|°|db|hz|gb|tb|mb|寸|平米|平方米|升|倍|%|万元|亿元|万|亿|小时|分钟|天|年|个月|匹|兆|千|纳米|微米|焦耳|瓦|伏|安|rpm|mpa|kn))/i

const CAP = 3 // 单信号命中达到 3 次即视为「饱满」

function countCJK(text: string, words: string[]): number {
  let n = 0
  for (const w of words) {
    if (text.includes(w)) n++
  }
  return n
}

function countLatin(text: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const re = new RegExp("\\b(" + tokens.join("|") + ")\\d*\\b", "gi")
  return (text.match(re) || []).length
}

function norm(hits: number): number {
  return Math.min(hits / CAP, 1) * 100
}

export function detectB2BSignals(text: string): B2BSignalScore {
  const t = text || ""
  const productSpecKw = countCJK(t, PRODUCT_SPEC_CJK)
  const modelCodes = (t.match(MODEL_RE) || []).length
  const numUnits = (t.match(NUM_UNIT_RE) || []).length
  const proofKw = countCJK(t, PROOF_CJK) + countLatin(t, PROOF_LATIN)
  const trustKw = countCJK(t, TRUST_CJK) + countLatin(t, TRUST_LATIN)
  const buyingKw = countCJK(t, BUYING_CJK) + countLatin(t, BUYING_LATIN)
  const comparisonKw = countCJK(t, COMPARISON_CJK) + countLatin(t, COMPARISON_LATIN)

  const productSpec = productSpecKw + modelCodes + numUnits
  const proof = proofKw
  const trust = trustKw
  const buying = buyingKw
  const comparison = comparisonKw

  const score = Math.round(
    (norm(productSpec) + norm(proof) + norm(trust) + norm(buying) + norm(comparison)) / 5,
  )

  return {
    productSpec,
    proof,
    trust,
    buying,
    comparison,
    score,
    detail: { productSpecKw, modelCodes, numUnits, proofKw, trustKw, buyingKw, comparisonKw },
  }
}

// 兼容性别名（保留任务描述中的命名）
export type B2BSignals = B2BSignalScore
