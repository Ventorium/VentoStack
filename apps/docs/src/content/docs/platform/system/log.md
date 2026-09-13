---
order: 10
title: 日志管理
description: '登录日志与操作日志的采集范围、租户隔离、查询接口和可信代理配置。'
---

## 概述

系统包含登录日志 `sys_login_log` 和操作日志 `sys_operation_log`。两类日志均按 `tenant_id` 隔离，查询、清理和持久化都使用服务端身份中的租户，不接受客户端传入租户。

## 登录日志

密码、MFA、Passkey 登录以及刷新令牌的最终成功或失败都会写入登录日志；刷新令牌不再进入操作日志。进入 MFA 中间步骤本身不记作登录成功。Passkey 在挑战过期、凭据不存在、签名验证失败以及账号状态校验失败时统一记录失败，其中验证前无法可靠识别主体的记录使用 `unknown` 用户名。

```http
GET    /api/system/login-logs?page=1&pageSize=10&username=admin&status=1
DELETE /api/system/login-logs
```

`status` 为 `0`（失败）或 `1`（成功）。清理操作要求日志删除权限，并会被操作日志记录。

## 操作日志

平台聚合路由统一记录 `POST`、`PUT`、`PATCH`、`DELETE` 等写请求，因此 system、workflow、scheduler、notification、OSS、i18n、代码生成和 AI 链路配置等已启用平台模块都在覆盖范围内。系统模块的局部挂载使用请求级标记去重，不会产生两条相同日志。

```http
GET /api/system/operation-logs?page=1&pageSize=10&username=admin&module=用户管理&result=1
```

`result` 为 `0`（失败）或 `1`（成功）。操作名称优先使用中文映射；未来新增但未配置映射的端点会回退为“模块名 + 操作”，不会直接展示 method + URL。请求参数仅在存在解析后的请求体时记录，并递归脱敏密码、令牌、密钥、Cookie、邮箱和手机号等字段。

## IP 与位置

只有直接连接地址命中 `trustedProxies` 配置时，系统才信任 `X-Forwarded-For` 或 `X-Real-IP`，防止客户端伪造来源地址。未配置可信代理时使用服务端注入的直接连接 IP。

当前位置字段只做安全、确定性的地址分类：本机、内网或未知，不提供省市级 GeoIP。若需要地理位置，应接入可审计且可更新的 GeoIP 数据源，并明确失败降级、隐私和数据保留策略。

## 可用性说明

操作日志采用异步写入，日志存储暂时不可用时不会阻断业务请求。部署时应同时监控日志写入失败；对于要求“审计不可丢”的高合规场景，应进一步采用事务发件箱或可靠队列，而不是把业务成功与远端日志存储直接绑定。
