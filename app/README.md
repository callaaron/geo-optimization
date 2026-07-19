# GEO 优化系统（FINELAB / 小可实验室）

GEO = Generative Engine Optimization（生成式引擎优化）。让网站/内容更易被 ChatGPT、Perplexity、豆包等 AI 引擎**理解、检索与引用**。面向 B 端企业内容营销与商单场景。

## 五大模块

| 模块 | 能力 | AI 增强 |
|------|------|---------|
| 分析评分器 | 通用 / B2B 双模式，8~9 维加权评分（规则引擎，可解释） | ✅ AI 深度诊断（专家级建议 + 目标问题） |
| llms.txt / 结构化数据 | 生成 llms.txt、JSON-LD、robots、meta | — |
| 内容改写引擎 | TL;DR / FAQ / 实体定义 / 结构重排 | ✅ 真实 LLM 改写（不编造数字，缺失处占位） |
| 竞品对标 | 多站点评分对比 + 改进重点 + 客户报告导出 | — |
| 监控看板 | 趋势追踪 + 引用登记 + 导出（HTML/CSV） | ✅ AI 认知覆盖度检测（真实问模型，测品牌是否被提及 + 竞品情报） |

## 架构

- **前端**：React 19 + Vite + TypeScript(strict) + Tailwind + shadcn/ui + recharts，纯前端可离线。
- **后端（AI 代理）**：`server/`，纯 Node 内置模块（无三方依赖）。封装火山方舟 Ark **Agent Plan** 调用，Key 只存后端 `.env`，**前端永不接触**。
- 前端通过 `/api/ai/*` 与后端通信；后端不可用时所有模块**自动回退规则引擎**，不崩。

## 快速开始

### 1. 配置 Key
复制 `.env.example` 为 `.env`，填入火山方舟 Agent Plan 专属 API Key：
```ini
ARK_PLAN_BASE_URL=https://ark.cn-beijing.volces.com/api/plan
ARK_LLM_MODEL=ark-code-latest
ARK_API_KEY=ark-xxxxxxxx-...   # 套餐页「配置专属 API Key」生成
PORT=8787
```
> 走 `/api/plan` 套餐路径抵扣 AFP 额度，而非按量计费。`.env` 已在 `.gitignore`，切勿提交。

### 2. 安装依赖
```bash
npm install --registry=https://registry.npmmirror.com
```

### 3. 运行

**生产模式（推荐，一条命令跑整套）**：
```bash
npm run start          # 构建前端 + 启动后端（同时托管前端）
# 打开 http://localhost:8787
```

**开发模式（前端 HMR + 后端热调）**：
```bash
npm run server         # 终端 1：启动 AI 后端 (8787)
npm run dev            # 终端 2：Vite 开发服 (5173，/api 自动代理到 8787)
```

**纯前端（不接 AI，仅规则引擎）**：
```bash
npm run build && npm run preview
```

## AI 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/ai/health` | GET | 探测后端与 Key 是否就绪 |
| `/api/ai/analyze` | POST | `{text,title?,url?,mode?}` → AI 深度诊断 |
| `/api/ai/rewrite` | POST | `{text,title?,mode?}` → LLM 改写结果 |
| `/api/ai/citation` | POST | `{query,brand?,domain?}` → AI 认知覆盖度检测 |

## 已知限制
- AI 认知覆盖度检测的是模型**无联网**下的固有认知/推荐倾向（反映品牌在训练语料中的存在感）；实时联网引用监测需后续接入带搜索的引擎能力。
- URL 抓取依赖公共 CORS 代理，被拦时改用「粘贴内容」。
- 结构化数据维度在纯文本模式恒为 0（需 HTML/URL 才能提取 JSON-LD/OG）。
