# Aeron — 生产环境 Dockerfile 模板
# 多阶段构建，最小化镜像，非 root 运行

FROM oven/bun:1 AS base
WORKDIR /app

# ---- 安装依赖 ----
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- 构建 ----
FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- 发布 ----
FROM base AS release
# 安全基线：非 root 用户
USER bun

# 只拷贝生产依赖和构建产物
COPY --from=install /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/package.json package.json

# 环境变量驱动 (12-Factor)
ENV NODE_ENV=production
ENV PORT=3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
