# GEO 优化系统 Docker 镜像
# 多阶段构建：Stage 1 编译前端 → Stage 2 运行时
# 目标：< 200MB，生产可用

# ── Stage 1: 前端构建 ──
FROM node:22-alpine AS builder
WORKDIR /build

# 安装前端依赖
COPY app/package.json app/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install

# 复制前端源码并构建
COPY app/ ./
RUN npm run build

# ── Stage 2: 运行时 ──
FROM node:22-alpine
LABEL org.opencontainers.image.title="GEO 优化系统"
LABEL org.opencontainers.image.description="AI 搜索引擎可见性管理平台"
LABEL org.opencontainers.image.version="3.0.0"

RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# 只安装生产依赖（含 better-sqlite3 原生模块）
COPY app/package.json app/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev
RUN npm rebuild better-sqlite3

# 复制后端代码
COPY app/server/ ./server/

# 复制前端构建产物
COPY --from=builder /build/dist/ ./dist/

# 创建数据目录（挂载点）
RUN mkdir -p /app/data

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/api/ai/health',r=>{process.exit(r.statusCode===200?0:1)})"

EXPOSE 8787

ENV PORT=8787
ENV NODE_ENV=production

CMD ["node", "server/index.mjs"]
