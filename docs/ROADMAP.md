# GEO 优化系统 — 版本迭代计划

> 基于 Princeton GEO 论文（Aggarwal et al., 2023）、auto-geo（Shadow Research, MIT）、gego（AI2HU, GPL-3.0）研究制定
> 评审日期：2026-07-23 | 当前基线：v0.9-alpha

---

## 当前基线：v0.9-alpha

| 模块 | 已具备 |
|------|--------|
| 架构 | React 19 + Vite + Tailwind + shadcn/ui + Recharts，Node.js 后端，JSON 文件持久化，launchd 24h 运行 |
| UI | 左侧 7 Tab（看板/监测/审计/优化/部署/竞品/报告）+ 子Tab，暗/亮/系统三态主题，侧边栏可折叠 |
| 监测 | 品牌/域名/竞品/Query 配置，360搜索 + AI RAG 审计，4级认知检测（direct/indirect/triggerable/none） |
| 审计 | AI引用率/搜索可见度 KPI，逐条Query明细，实体密度分析，竞品提及矩阵 |
| 看板 | KPI卡片×6，引文层级饼图，评分趋势按品牌分色，品牌对比柱图，Query认知明细表（可搜索） |
| 优化 | 七块SOP模板生成器（TL;DR→Intro→Sections→Guides→Takeaways→FAQ→Disclosure），AI改写，多格式输出，Princeton 9策略评分器+四根支柱 |
| 部署 | llms.txt / Schema JSON-LD / robots.txt 生成器 |
| 竞品 | 多维度竞品对标分析（GEO评分+引用率+SERP对比） |
| 报告 | 定时调度器（手动/每日/每周），HTML诊断报告导出，CSV数据导出 |
| 团队 | 多用户配置管理（管理员/编辑/只读三级角色，JSON持久化） |
| 引擎 | 火山方舟(Ark)主 + DeepSeek备用，360搜索引擎，引擎状态检测面板 |
| 视觉 | 16px基准字号，中文字体优化，Playwright自动截图验证 |

---

## Phase 1: v1.0 — 稳定发布版

**周期**：1-2周 | **核心目标**：打磨到可演示、可交付水平

### 主要功能
- [ ] 全量功能回归测试（每Tab每子Tab每按钮）
- [ ] 空状态/加载态/错误态 三态完整覆盖
- [ ] 移动端响应式（侧边栏→底部Tab）
- [ ] 全局快捷键（Cmd+1~7切Tab）
- [ ] 浏览器标题随Tab切换
- [ ] 数据持久化验证（重启不掉）
- [ ] **8项 Doctor 诊断**（提至此Phase）：TL;DR检测、H2格式、Schema存在、实体密度、答案胶囊、FAQ结构、来源声明、图片节奏 —— 对标 auto-geo doctor 命令

### 关键里程碑
- 通过 20+ 条手工测试用例
- 27寸/笔记本/平板 三屏截图一致
- 0 TypeScript 编译错误 + 0 ESLint warning

### 风险与应对
- MonitorDashboard 697行难以维护 → 拆分为 ConfigPanel / AuditRunner / ResultView
- JSON 并发写入 → **v1.0 直接引入 SQLite（better-sqlite3），避免后期迁移重构**

---

## Phase 2: v1.5 — 专业审计版

**周期**：2-3周 | **核心目标**：对标 auto-geo doctor+check 闭环

### 主要功能
- [ ] **多AI引擎支持**：Perplexity API / OpenAI API / Claude API（需配置Key）
- [ ] **品牌别名归一化**（提至此Phase）：自动匹配变体到规范品牌名
- [ ] **Cron定时审计**：node-cron 后端调度，每小时/天/周/自定义表达式
- [ ] **飞书通知**：审计完成 → Webhook推送结果摘要
- [ ] Rate Limiting + 用量告警
- [ ] 数据备份/恢复机制（SQLite dump）

### 关键里程碑
- Doctor诊断对已知页面 > 70分
- 定时任务准时执行（误差 < 60s）
- 飞书通知成功送达

### 风险与应对
- 多引擎API费用 → 每日调用上限 + 费用预估面板
- Mac Mini单点故障 → 每日自动备份 + 一键恢复

---

## Phase 3: v2.0 — 企业协作版

**周期**：3-4周 | **核心目标**：团队协作，对标 gego 多用户

### 主要功能
- [ ] **JWT 登录认证**：管理员/编辑/只读 三级权限
- [ ] **GEO策略模板库**（补充）：预设9策略模板，一键应用
- [ ] 项目数据隔离（每用户只看被分配的项目）
- [ ] 审计任务分配（admin分配→编辑执行→共享结果）
- [ ] 评论与批注（在审计结果上添加团队评论）
- [ ] 操作日志（谁/何时/做了什么，保留90天）
- [ ] **搜索引擎排名验证闭环**：自动爬取360/百度 SERP，对比优化前后变化

### 关键里程碑
- JWT token 24h + refresh 7天
- 权限校验 100% API端点
- 排名变化对比准确率 > 95%

### 风险与应对
- SQLite 并发瓶颈 → 读写分离 + WAL模式

---

## Phase 4: v2.5 — 智能优化版

**周期**：3-4周 | **核心目标**：AI 驱动"检测差距→自动修复差距"闭环

### 主要功能
- [ ] **自动优化生成**：检测到引用差距 → 按七块SOP自动生成优化页面，9策略评分 > 70才发布
- [ ] **A/B测试框架**：生成两版→分别检测→推荐较优
- [ ] **GEO-Bench基准**：基于Princeton 10,000查询基准，评估内容竞争力
- [ ] **智能Query扩展**：AI推荐新的高价值监测Query
- [ ] **Princeton 9策略→4支柱映射框架**：体系化评分
- [ ] 内容健康度评分（9策略综合+引用率 = 0-100）

### 关键里程碑
- 自动生成通过9策略评分 > 70分
- A/B测试可同时管理5组对比

### 风险与应对
- AI生成质量不稳定 → 生成内容标记为"待审核"，人工确认后发布

---

## Phase 5: v3.0 — 平台化版本

**周期**：4-6周 | **核心目标**：从单机工具到可集成平台

### 主要功能
- [ ] **RESTful API v2**：标准化接口 + Swagger文档
- [ ] **CLI入口**：命令行工具，支持 CI/CD 集成
- [ ] **Webhook事件**：审计完成/评分变化/竞品异动→推外部
- [ ] **Docker部署**：`docker compose up` 一键启动
- [ ] 多数据源：MySQL/PostgreSQL可选
- [ ] Node.js + Python SDK
- [ ] 轻量Hook扩展点（替代重型插件系统）
- [ ] CI/CD模板：GitHub Action / GitLab CI，PR自动评论GEO评分

### 关键里程碑
- Docker镜像 < 200MB
- API文档 OpenAPI 3.0 自动生成
- GitHub Action 在PR中自动评论

---

## 时间线总览

```
v0.9 ──→ v1.0 ──→ v1.5 ──→ v2.0 ──→ v2.5 ──→ v3.0
 当前    稳定     专业     企业     智能     平台
        1-2周    2-3周    3-4周    3-4周    4-6周

合计：约 3-4 个月从 MVP → 成熟平台
```

## 技术债清理计划

| 版本 | 清理项 |
|------|--------|
| v1.0 | JSON→SQLite 迁移，MonitorDashboard 拆分为 3 子组件 |
| v1.5 | 统一 API 响应格式，新增 Rate Limiting 中间件 |
| v2.0 | 引入 ESLint 严格模式，全量 TypeScript strict mode |
| v3.0 | 代码分割（dynamic import），监控（日志+告警） |

## 评审记录

- 2026-07-23：Agent Team 评审。建议 SQLite 提前至 v1.0、Doctor 诊断提前至 v1.0、品牌别名提前至 v1.5、补充模板库/排名验证/CLI。已采纳并更新计划。
