---
title: Feature Toggle
description: 特性开关管理器，支持运行时动态启用或禁用功能
---

`createFeatureToggle` 提供了轻量级特性开关管理，支持条件函数判断和批量操作。

## 基本用法

```typescript
import { createFeatureToggle } from "@ventostack/core";

const features = createFeatureToggle([
  { name: "dark-mode", enabled: true, description: "暗色模式" },
  { name: "beta-api", enabled: false },
]);

// 判断是否启用
if (features.isEnabled("dark-mode")) {
  // 启用暗色模式
}
```

## 条件开关

通过 `condition` 函数实现基于上下文的动态判断：

```typescript
features.register({
  name: "new-dashboard",
  enabled: true,
  condition(ctx) {
    // 仅对内部用户启用
    return ctx.email?.toString().endsWith("@company.com") ?? false;
  },
});

features.isEnabled("new-dashboard", { email: "alice@company.com" }); // true
features.isEnabled("new-dashboard", { email: "bob@gmail.com" });     // false
```

## 运行时控制

```typescript
features.enable("beta-api");
features.disable("beta-api");
features.toggle("beta-api");

// 批量设置
features.setAll({
  "dark-mode": true,
  "beta-api": false,
});

// 列出所有开关
features.list();
// [{ name: "dark-mode", enabled: true, ... }, ...]
```

## 配置选项

### FeatureFlag

| 属性 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 开关名称（必填） |
| `enabled` | `boolean` | 是否启用（必填） |
| `condition` | `(ctx) => boolean` | 条件判断函数，仅在 `enabled: true` 时生效 |
| `description` | `string` | 描述信息 |

### FeatureToggle 接口

| 方法 | 说明 |
|------|------|
| `register(flag)` | 注册开关 |
| `isEnabled(name, context?)` | 判断开关是否启用 |
| `enable(name)` | 启用指定开关 |
| `disable(name)` | 禁用指定开关 |
| `toggle(name)` | 切换状态 |
| `list()` | 获取所有开关列表 |
| `setAll(flags)` | 批量设置状态 |
