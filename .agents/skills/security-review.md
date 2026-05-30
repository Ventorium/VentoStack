---
name: security-review
description: |
  安全审查清单。在新增或修改认证、授权、JWT、Session、API Key、Webhook、上传、缓存、
  队列、Worker、AI Tool、Docker、Kubernetes 相关能力时，或合并前、发布前做安全复查时使用。
---

# Security Review — AI Agent 审查清单

## 审查顺序

1. 先读 `AGENTS.md` / `CLAUDE.md`，再读改动文件与部署清单。
2. 画清楚信任边界：client → proxy → app → worker → db/redis/s3 → container → k8s → ci。
3. 依次检查以下维度。

## 请求入口

- [ ] 所有外部输入经 Schema 校验（Zod / Valibot）
- [ ] 拒绝未知字段，不静默忽略
- [ ] 字符串长度、数组大小、数字范围有上限
- [ ] 文件上传限制类型、大小、扫描恶意内容
- [ ] CORS 白名单精确匹配，禁止通配符
- [ ] CSRF Token 验证（Cookie HttpOnly + Secure + SameSite=Strict）
- [ ] SSRF 防护（禁止访问内网地址）
- [ ] 请求频率限制（IP / 用户 / 接口维度）
- [ ] 可信代理配置（不盲信 X-Forwarded-*）

## 身份体系

- [ ] JWT 算法白名单，禁止 `none` / `HS256` 用于非对称场景
- [ ] JWT `typ` 头部校验
- [ ] Token 吊销持久化（Memory + Redis）
- [ ] Cookie HttpOnly + Secure + SameSite=Strict
- [ ] API Key 哈希存储，不存明文
- [ ] HMAC 签名有时间戳 + nonce 防重放
- [ ] nonce 去重是原子操作

## 授权与租户

- [ ] 权限检查在 Handler 入口统一做，不在业务逻辑里分散判断
- [ ] 多租户场景强制注入 tenant_id，不依赖前端传递
- [ ] 行级过滤（RowFilter）根据角色动态生成 SQL WHERE
- [ ] cache key、对象存储路径、队列名包含租户 namespace

## 数据与泄露

- [ ] SQL 参数化查询，禁止字符串拼接
- [ ] ORM raw query 有审计日志
- [ ] 生产环境不返回堆栈、SQL 细节、内部拓扑、依赖版本
- [ ] 默认脱敏字段：password、token、secret、key、cookie、authorization、phone、email、idcard、银行卡号
- [ ] 默认不记录完整请求体；确需记录时按字段白名单采集
- [ ] /docs、/openapi.json、/metrics、/debug、/ready 按环境或权限控制暴露

## AI / Tool 安全

- [ ] 所有 Tool 输入做 Schema 校验，输出同样做结构校验
- [ ] 只允许显式注册的 Tool；禁止任意 shell、文件访问、SQL
- [ ] AI Worker 有超时、内存、CPU、文件系统、网络出站约束
- [ ] 敏感操作默认需要人工审批，不允许模型自批准
- [ ] 每次 Tool 调用有审计记录：发起者、参数摘要、结果摘要、耗时、审批链
- [ ] Prompt、Memory、RAG 文档视为不可信输入，避免 prompt injection 穿透执行面

## 运行时

- [ ] 非 root 运行
- [ ] 根文件系统只读
- [ ] allowPrivilegeEscalation=false
- [ ] drop ALL Linux capabilities，按需最小增补
- [ ] seccomp 使用 RuntimeDefault 或更严格策略
- [ ] 仅挂载必要的可写目录（如 /tmp）
- [ ] 显式配置 CPU / memory request 与 limit
- [ ] 默认最小 ServiceAccount 权限
- [ ] NetworkPolicy 限制东西向与南北向流量
- [ ] readiness / liveness / startup probe 分离
- [ ] 优雅关闭期间先摘流量再停服务

## 供应链

- [ ] bun.lock 提交到仓库并参与评审
- [ ] 第三方依赖 pin 版本，禁止无审查的宽松升级
- [ ] 新增依赖说明：为什么 Bun 内置不够、替代方案、安全边界
- [ ] 安装脚本、postinstall、动态下载二进制单独评估
- [ ] 构建链支持依赖漏洞扫描与产物溯源

## 输出格式

- Findings first，按 P0 / P1 / P2 排序
- 每条结论必须包含：风险、利用路径或失败模式、受影响文件、修复建议
- 之后列 Open Questions / Assumptions
- 最后补 Residual Risks 和 Missing Tests
