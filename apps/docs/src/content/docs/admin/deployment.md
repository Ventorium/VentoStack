---
order: 4
title: 部署指南
description: Admin 应用的生产环境部署指南。
---

## Docker 部署（推荐）

### 快速启动

```bash
# 1. 复制环境变量配置
cp .env.example .env
# 编辑 .env 填写实际值（JWT_SECRET、数据库密码等）

# 2. 一键启动
docker compose up -d

# 3. 访问
# 应用：http://localhost:9320
# 健康检查：http://localhost:9320/health/live
```

### 服务组成

| 服务 | 端口 | 说明 |
|------|------|------|
| admin | 9320 | VentoStack Admin 应用 |
| postgres | 5432 | PostgreSQL 16 数据库 |
| redis | 6379 | Redis 7 缓存 |

### Dockerfile 构建流程

```
1. 安装依赖（bun install --frozen-lockfile）
2. 构建前端（vite build → web/dist/）
3. 复制前端 dist 到后端 public/ 目录
4. 打包后端为单文件（bun build --minify）
5. 生产镜像（oven/bun:1.3-slim，非 root 用户）
```

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `NODE_ENV` | 否 | `production` | 运行环境 |
| `PORT` | 否 | `9320` | 服务端口 |
| `DATABASE_URL` | **是** | — | PostgreSQL 连接串 |
| `JWT_SECRET` | **是** | — | JWT 签名密钥（≥32 字符） |
| `REDIS_URL` | 否 | — | Redis 连接串（不设置则用内存缓存） |
| `ALLOWED_ORIGINS` | 否 | `http://localhost:9320` | CORS 允许来源（逗号分隔） |
| `STORAGE_DRIVER` | 否 | `local` | 存储驱动（`local` / `s3`） |
| `LOG_LEVEL` | 否 | `info` | 日志级别 |

### 健康检查

```bash
# 存活探针
curl http://localhost:9320/health/live

# 就绪探针（检查 DB/Redis 连接）
curl http://localhost:9320/health/ready

# Prometheus 指标
curl http://localhost:9320/metrics
```

## 手动部署

```bash
# 1. 构建前端
cd apps/admin/web
bun run build

# 2. 复制前端产物到后端
cp -r dist ../api/public

# 3. 启动后端
cd ../api
NODE_ENV=production bun run src/index.ts
```

## Kubernetes 部署

建议使用以下探针配置：

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 9320
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 9320
  initialDelaySeconds: 5
  periodSeconds: 10
```
