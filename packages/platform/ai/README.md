# @ventostack/ai

AI 集成：LLM 接入、RAG、Tool Registry、权限沙箱。

## 模块定位

AI 能力层，依赖 core、auth、observability。提供 AI 工具注册、审批流集成和沙箱隔离执行。

## 安全特性

### 沙箱安全默认

`createSandbox(permissions)` 的所有权限默认关闭：

| 权限 | 默认值 | 说明 |
|------|--------|------|
| `allowedTools` | `[]` | 空白名单 = 拒绝所有工具 |
| `allowFileRead` | `false` | 禁止文件读取 |
| `allowFileWrite` | `false` | 禁止文件写入 |
| `allowNetworkAccess` | `false` | 禁止网络访问 |
| `maxExecutionTime` | `60_000` (60s) | 超时自动终止 |
| `maxMemory` | `50MB` | 内存增量超限告警 |

```typescript
const sandbox = createSandbox({
  allowedTools: ["read_database"],  // 必须显式列出
  allowedHosts: ["api.example.com"], // 开启网络时必须提供
  workingDirectory: "/workspace",   // 开启文件访问时必须提供
});
```

### 工具白名单强制

- `allowedTools` 为空或 undefined 时，`canExecute()` 返回 `false`
- 必须显式配置白名单才能执行任何工具
- 未注册的工具名称自动拒绝

### 网络访问控制

- `allowNetworkAccess` 默认 false
- 开启时必须提供 `allowedHosts` 列表，空列表等同于禁止
- 仅允许 http/https 协议

### 文件路径限制

- 开启文件访问时必须提供 `workingDirectory`
- 使用 `resolve()` + 前缀校验防止路径遍历
- 仅允许 `workingDirectory` 及其子目录内的路径

### 超时与内存监控

- `wrapExecution()` 使用 `Promise.race` 实现超时控制
- 执行前后对比 `process.memoryUsage()`，增量超限时输出警告
- Worker 级别的 `resourceLimits` 强制隔离需在 Tool Registry 集成

## 编码约束

- 所有 Tool 输入必须做 Schema 校验
- 敏感操作必须经过审批流，禁止 AI 自批准
- 每次 Tool 调用必须有审计记录
