---
name: o2t-api-audit
description: 检查 admin/web 中 @doremijs/o2t 的 API 调用是否符合规范 — SSE 流式、REST client、useStreamChat 用法审计
---

# o2t API Audit — VentoStack Admin 前端 API 调用规范检查

## 库引用

admin/web 使用 `@doremijs/o2t` 作为 API 客户端，版本 `^0.2.0`。

## 入口与导出

| 导入路径 | 用途 |
|---|---|
| `@/api` (from `@doremijs/o2t/client`) | 类型安全 HTTP client (get/post/put/delete/patch) |
| `@doremijs/o2t/client/stream` | SSE 流处理 (processStream, iterateStream, accumulateStream) |
| `@doremijs/o2t/client/react` | React hooks (useStreamChat, useStream, useRequest) |

## REST API 规范

- **所有后端请求必须通过 `api/index.ts` 导出的 `client` 实例**，禁止直接使用 `fetch()`
- client 已内置：Bearer token 注入、401 自动刷新、响应信封拆包 (`{ code, message, data }` → `data`)、统一错误提示
- 路径参数用 `params: { id }`，禁止模板字符串拼接 URL
- 查询参数用 `query: { ... }`，请求体用 `body: { ... }`
- 响应格式: `const { error, data, response } = await client.get(...)`
- `error` 为 `true` 时表示请求失败（已在全局 errorHandler 中显示错误消息）
- 类型断言用具体类型代替 `as any`: `(await client.get(...)) as { data?: XxxItem }`

### 异常场景

- **Blob/文件下载**: 可通过 `client.get(path, opts)` 获取 Response 后取 blob
- **Token 刷新内部逻辑**: `api/index.ts` 内的 fetch `/api/auth/refresh` 是唯一允许的裸 fetch
- **公开配置**: `/api/system/configs/public` 也应通过 `client.get()` 调用（token 可选）

## SSE 流式 API

### processStream（最简单的回调方式）

```typescript
import { processStream } from '@doremijs/o2t/client/stream'

const result = await client.post('/api/stream', { body: params })
if (!result.error && result.response) {
  await processStream(result.response, {
    onData: (chunk) => console.log('Received:', chunk),
    onError: (error) => console.error('Stream error:', error),
    onComplete: () => console.log('Done'),
  })
}
```

### iterateStream（更灵活）

```typescript
import { iterateStream } from '@doremijs/o2t/client/stream'

if (!result.error && result.response) {
  for await (const event of iterateStream(result.response)) {
    if (event.data) processChunk(event.data)
  }
}
```

### accumulateStream（短流一次性收集）

```typescript
import { accumulateStream } from '@doremijs/o2t/client/stream'

const chunks = await accumulateStream(result.response)
```

### useStreamChat（React Chat Hook）

```typescript
import { useStreamChat } from '@doremijs/o2t/client/react'

const { messages, isLoading, isStreaming, send, abort } = useStreamChat({
  service: async (params, signal) => {
    return fetch('/api/chat', { method: 'POST', body: JSON.stringify(params), signal })
  },
  localTransform: (params) => ({ role: 'user', content: params.message }),
  streamTransform: ({ chunks }) => ({
    role: 'assistant',
    content: chunks.map(c => c?.content || '').join('')
  }),
  onComplete: (finalData) => { /* 流完成 */ },
  onError: (error) => { /* 流错误 */ },
})
```

### useStream（简单 Hook）

```typescript
const { start, abort, isLoading } = useStream()

start(async (signal) => {
  return client.post(...).then(r => r.response!)
}, {
  onData: (chunk) => { /* 处理每个数据块 */ },
  onComplete: () => { /* 完成 */ },
  onError: (error) => { /* 错误 */ },
})
```

## 检查清单

1. **搜索 `fetch(`**: 除 `api/index.ts` 的 token refresh 外，不应出现对其他 API 的裸 fetch 调用
2. **搜索 `sse-client.ts`**: 应使用 o2t 的 `processStream` 替代手写 SSE 解析
3. **搜索 `token-helper`**: 应删除，token 刷新由 api/index.ts 的 client 统一处理
4. **搜索 `as any`**: 用于 client 调用时，应用具体类型断言替代
5. **搜索 `EventSource`、`ReadableStream`**: 应替换为 o2t 的 SSE API
6. **搜索 `parseSSEStream`**: 应替换为 `processStream` / `iterateStream`
7. **搜索 `"data: "`**: 手写 SSE 行解析应替换为库方法
