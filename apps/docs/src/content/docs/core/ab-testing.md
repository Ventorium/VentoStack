---
title: A/B 测试
description: 使用 createABTestManager 进行功能灰度发布和 A/B 测试
---

`createABTestManager` 提供了完整的 A/B 测试和灰度发布功能，支持按用户 ID 哈希分配、权重控制和粘性分配。

## 基本用法

```typescript
import { createABTestManager } from "@aeron/core";
import type { ABTest } from "@aeron/core";

const ab = createABTestManager();

// 定义 A/B 测试
ab.define({
  name: "checkout-button-color",
  enabled: true,
  variants: [
    { name: "control", weight: 50 },   // 50% 用户看旧版
    { name: "treatment", weight: 50 }, // 50% 用户看新版
  ],
  sticky: true, // 同一用户始终看到相同变体
});
```

## 分配变体

```typescript
// 根据用户 ID 分配（粘性，同用户总是相同结果）
const result = ab.assign("checkout-button-color", userId);

if (result?.variant === "treatment") {
  // 新版按钮
} else {
  // 旧版按钮
}

// 匿名用户（随机分配）
const anonResult = ab.assign("checkout-button-color");
```

## 带配置的变体

变体可以携带配置数据：

```typescript
ab.define({
  name: "pricing-experiment",
  enabled: true,
  variants: [
    {
      name: "original",
      weight: 33,
      config: { price: 99, cta: "立即购买" }
    },
    {
      name: "discount",
      weight: 33,
      config: { price: 79, cta: "限时优惠" }
    },
    {
      name: "bundle",
      weight: 34,
      config: { price: 149, cta: "超值套餐" }
    }
  ],
  sticky: true,
});

const result = ab.assign("pricing-experiment", userId);
if (result) {
  const { price, cta } = result.config as { price: number; cta: string };
  // 使用 price 和 cta 渲染页面
}
```

## 在路由中使用

```typescript
router.get("/checkout", async (ctx) => {
  const userId = ctx.state.user?.id;

  // 获取当前用户的变体
  const variant = ab.assign("checkout-flow", userId);

  return ctx.json({
    flow: variant?.variant ?? "default",
    config: variant?.config,
  });
});
```

## 动态启用/禁用

```typescript
// 暂停测试
ab.disable("checkout-button-color");

// 恢复测试
ab.enable("checkout-button-color");

// 查看所有测试
const allTests = ab.list();
```

## 判断用户是否在指定变体

```typescript
if (ab.isInVariant("new-feature", "enabled", userId)) {
  // 用户在 "enabled" 变体中，显示新功能
}
```

## ABTestManager 接口

```typescript
interface ABTestManager {
  define(test: ABTest): void;
  assign(testName: string, userId?: string): ABTestResult | null;
  isInVariant(testName: string, variantName: string, userId?: string): boolean;
  list(): ABTest[];
  enable(testName: string): void;
  disable(testName: string): void;
}

interface ABTest {
  name: string;
  enabled: boolean;
  variants: ABTestVariant[];
  sticky?: boolean;
}

interface ABTestVariant {
  name: string;
  weight: number;           // 权重（所有变体之和通常为 100）
  config?: Record<string, unknown>;
}

interface ABTestResult {
  testName: string;
  variant: string;
  config?: Record<string, unknown>;
}
```
