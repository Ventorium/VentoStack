# =============================================================
# VentoStack Admin — 生产环境多阶段构建
#
# 构建流程：
#   1. 安装依赖
#   2. 构建前端 (web) → dist/
#   3. 将前端 dist 复制到后端 public/ 目录
#   4. 打包后端为单文件可执行
#   5. 最小化生产镜像
#
# 使用方式：
#   docker build -t ventostack/admin .
#   docker run -p 9320:9320 --env-file .env ventostack/admin
# =============================================================

FROM oven/bun:1.3 AS base
WORKDIR /app

# ---- 安装依赖 ----
FROM base AS install
COPY package.json bun.lock ./
COPY apps/admin/api/package.json apps/admin/api/package.json
COPY apps/admin/web/package.json apps/admin/web/package.json
COPY packages/ packages/
RUN bun install --frozen-lockfile

# ---- 构建前端 ----
FROM install AS build-web
COPY apps/admin/web/ apps/admin/web/
WORKDIR /app/apps/admin/web
RUN bun run build

# ---- 构建后端（将前端 dist 嵌入 public 目录）----
FROM install AS build-api
# 复制前端产物到后端 public 目录，用于 SPA 静态文件服务
COPY --from=build-web /app/apps/admin/web/dist /app/apps/admin/api/public
COPY apps/admin/api/ apps/admin/api/
WORKDIR /app/apps/admin/api
# 打包为单文件（减少运行时依赖）
RUN bun build src/index.ts --outdir dist --target bun --minify

# ---- 生产镜像 ----
FROM oven/bun:1.3-slim AS release
WORKDIR /app

# 安全基线：非 root 用户
USER bun

# 只拷贝必要产物
COPY --from=install --chown=bun:bun /app/node_modules node_modules/
COPY --from=install --chown=bun:bun /app/package.json package.json
COPY --from=build-api --chown=bun:bun /app/apps/admin/api/dist dist/
COPY --from=build-api --chown=bun:bun /app/apps/admin/api/public public/

# 12-Factor 环境变量
ENV NODE_ENV=production
ENV PORT=9320
ENV HOST=0.0.0.0
ENV ADMIN_PORT=0

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:9320/health/live || exit 1

EXPOSE 9320

CMD ["bun", "run", "dist/index.js"]
