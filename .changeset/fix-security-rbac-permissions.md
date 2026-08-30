---
"@ventostack/ai": patch
"@ventostack/cache": patch
"@ventostack/cli": patch
"@ventostack/core": patch
"@ventostack/database": patch
"@ventostack/events": patch
"@ventostack/observability": patch
"@ventostack/testing": patch
"@ventostack/vite-bridge": patch
"@ventostack/webhook": patch
"@ventostack/boot": patch
"@ventostack/gen": patch
"@ventostack/i18n": patch
"@ventostack/monitor": patch
"@ventostack/oss": patch
"@ventostack/system": patch
"@ventostack/workflow": patch
---

fix: 安全加固与 RBAC 权限语义统一

安全修复：
- rate-limit 限流键优先取直接连接 IP，修复全局单桶可被 DoS 打挂
- 认证 Cookie Secure 支持 COOKIE_SECURE 环境变量（生产默认 true）
- OSS 上传增加扩展名/MIME 白名单与 magic bytes 校验，静态服务扩展名白名单
- Webhook 入站增加时间戳窗口 + nonce 去重（防重放）
- 日志脱敏改为包含匹配（覆盖 newPassword/oldPassword 变体）
- handleError 不再泄露内部错误，新增 safeErrorMessage
- 新增 TRUSTED_PROXIES 可信代理配置

功能修复：
- RBAC 权限调用统一为 perm("module:entity", "action")，种子权限同步
- 用户角色分配 roleIds 落库（assignUserRoles）
- workflow sequential 多审批人依次流转修复
- 通知消息删除端点；分布式锁改为原子 SET NX EX
- 批量操作数组上限、全局超时中间件（跳过 SSE）、CSV 公式注入防护
