---
title: Circuit Breaker
description: 熔断器模式，防止级联故障在分布式系统中扩散
---

`createCircuitBreaker` 实现了经典的三态熔断器模式：关闭（正常）→ 打开（熔断）→ 半开（试探）。

## 基本用法

```typescript
import { createCircuitBreaker } from "@ventostack/core";

const breaker = createCircuitBreaker({
  failureThreshold: 5,    // 连续失败 5 次后熔断
  resetTimeout: 30000,    // 熔断 30 秒后进入半开状态
  halfOpenMax: 1,         // 半开状态最多尝试 1 次
});

// 执行受保护的异步操作
try {
  const data = await breaker.execute(() => fetch("https://api.example.com/data"));
} catch (err) {
  if (err.name === "CircuitOpenError") {
    console.log("熔断中，快速失败");
  }
}
```

## 状态监听

```typescript
const breaker = createCircuitBreaker({
  onStateChange(from, to) {
    console.log(`熔断器状态变更: ${from} → ${to}`);
  },
});
```

## 查看状态与统计

```typescript
breaker.getState();  // "closed" | "open" | "half-open"

breaker.getStats();
// { state: "closed", failures: 2, successes: 10, lastFailure: 1715000000000 }

breaker.reset();  // 手动重置为关闭状态
```

## 三态流转逻辑

| 当前状态 | 触发条件 | 转入状态 |
|---------|---------|---------|
| `closed` | 连续失败 ≥ `failureThreshold` | `open` |
| `open` | 经过 `resetTimeout` 毫秒 | `half-open` |
| `half-open` | 执行成功 | `closed` |
| `half-open` | 执行失败 或 尝试次数 ≥ `halfOpenMax` | `open` |

## 配置选项

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `failureThreshold` | `number` | `5` | 触发熔断的连续失败次数 |
| `resetTimeout` | `number` | `30000` | 熔断后等待多久进入半开状态（毫秒） |
| `halfOpenMax` | `number` | `1` | 半开状态最大试探次数 |
| `onStateChange` | `(from, to) => void` | — | 状态变更回调 |

## CircuitBreaker 接口

| 方法 | 说明 |
|------|------|
| `execute(fn)` | 执行受保护的异步函数 |
| `getState()` | 获取当前状态 |
| `getStats()` | 获取统计信息（state/failures/successes/lastFailure） |
| `reset()` | 手动重置熔断器 |
