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
# 健康检查：http://localhost:9322/health/live
```

### 服务组成

| 服务 | 端口 | 说明 |
|------|------|------|
| admin | 9320 | VentoStack Admin 应用（业务端口） |
| admin（管理端点） | 9322 | 健康检查、指标、OpenAPI 文档等管理端点 |
| postgres | 5432 | PostgreSQL 16 数据库 |
| redis | 6379 | Redis 7 缓存 |

> **说明**：健康检查、指标（`/metrics`）、OpenAPI 文档（`/docs`）默认在管理端口（9322）暴露，与业务端口（9320）分离，便于独立访问控制和网络隔离。

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
| `ADMIN_PORT` | 否 | `9322` | 管理端点端口（`/health`、`/metrics`、`/docs`）；设为 `0` 则禁用独立端口，回退到主端口 |
| `ADMIN_HOST` | 否 | `127.0.0.1` | 管理端口绑定地址，默认仅本地访问 |
| `TENANT_ENABLED` | 否 | `false` | 是否启用多租户隔离（开启后自动注入 tenant_id 过滤和缓存键命名空间） |

### 健康检查

```bash
# 存活探针（通过管理端口）
curl http://localhost:9322/health/live

# 就绪探针（检查 DB/Redis 连接）
curl http://localhost:9322/health/ready

# Prometheus 指标
curl http://localhost:9322/metrics
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

建议使用以下探针配置（通过管理端口 `ADMIN_PORT`，默认 9322）：

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 9322
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 9322
  initialDelaySeconds: 5
  periodSeconds: 10
```

> **注意**：探针应指向 `ADMIN_PORT`（默认 9322）而非业务端口（9320），以确保管理端点与业务流量隔离。如将 `ADMIN_PORT` 设为 `0`（回退模式），则需改用业务端口 `PORT`。

## 反向代理部署

部署在 Nginx、Cloudflare 等反向代理之后时，需配置 `trustedProxies` 参数以正确获取客户端 IP。框架默认不信任任何 `X-Forwarded-*` 头，仅信任显式配置的代理 IP/CIDR。

```typescript
// app.ts 中配置受信代理
createPlatform({
  // ... 其他配置
  trustedProxies: [
    "10.0.0.0/8",      // 内网 CIDR
    "172.16.0.0/12",   // Docker 网络
    "192.168.0.0/16",  // K8s Pod 网络
  ],
});
```

### Nginx 示例

```nginx
server {
    listen 443 ssl http2;
    server_name admin.example.com;

    ssl_certificate     /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # 业务流量
    location / {
        proxy_pass http://127.0.0.1:9320;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 管理端点（仅内网访问）
    location /health/ {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://127.0.0.1:9322;
    }

    location /metrics {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://127.0.0.1:9322;
    }
}
```

> **注意**：管理端口（9322）默认绑定 `127.0.0.1`，不对外暴露。如需通过 Nginx 转发管理端点，应严格限制访问来源（如仅允许内网或监控系统 IP）。

### 安全加固

生产环境安全检查清单：

- [ ] `ADMIN_PORT` 设置为非零值（默认 9322），管理端点不暴露在业务端口
- [ ] `ADMIN_HOST` 设置为 `127.0.0.1`（默认），仅本地访问管理端点
- [ ] `JWT_SECRET` 至少 32 字节随机字符串
- [ ] 如使用反向代理，配置 `trustedProxies` IP/CIDR 列表
- [ ] `DATABASE_URL` 使用 SSL 连接（`sslmode=require`）
- [ ] `REDIS_URL` 设置密码认证
- [ ] `NODE_ENV=production`（生产环境不返回堆栈信息、不暴露 OpenAPI 文档）
- [ ] Cookie 配置 `HttpOnly` + `Secure` + `SameSite=Strict`
- [ ] 启用 CORS 白名单（`ALLOWED_ORIGINS` 精确匹配，不使用通配符）
