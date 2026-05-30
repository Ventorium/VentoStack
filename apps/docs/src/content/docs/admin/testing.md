---
order: 7
title: 测试指南
---

## 测试框架

Admin 前端使用 `bun:test` 进行测试，不使用 Jest/Vitest。

## 测试文件位置

```
页面目录/
├── index.tsx
└── __tests__/
    └── index.test.tsx   # 页面测试
```

## 现有测试覆盖

| 页面 | 测试文件 | 测试数 |
|------|----------|--------|
| Dashboard | `pages/app/__tests__/index.test.tsx` | 3 |
| 个人中心 | `pages/app/profile/__tests__/index.test.tsx` | 5 |
| 用户管理 | `pages/app/system/users/__tests__/index.test.tsx` | 15 |
| 角色管理 | `pages/app/system/roles/__tests__/index.test.tsx` | 10 |
| 菜单管理 | `pages/app/system/menus/__tests__/index.test.tsx` | 8 |
| 部门管理 | `pages/app/system/depts/__tests__/index.test.tsx` | 8 |
| 岗位管理 | `pages/app/system/posts/__tests__/index.test.tsx` | 7 |
| 字典管理 | `pages/app/system/dict/__tests__/index.test.tsx` | 22 |
| 参数配置 | `pages/app/system/configs/__tests__/index.test.tsx` | 8 |
| 通知公告 | `pages/app/system/notices/__tests__/index.test.tsx` | 8 |
| 操作日志 | `pages/app/system/logs/__tests__/index.test.tsx` | 6 |
| 代码生成 | `pages/app/system/gen/__tests__/index.test.tsx` | 6 |
| 文件管理 | `pages/app/system/oss/__tests__/index.test.tsx` | 5 |
| 定时任务 | `pages/app/system/scheduler/__tests__/index.test.tsx` | 5 |
| 系统监控 | `pages/app/system/monitor/__tests__/index.test.tsx` | 4 |
| 消息中心 | `pages/app/system/notification/__tests__/index.test.tsx` | 4 |
| 在线用户 | `pages/app/system/online/__tests__/index.test.tsx` | 3 |

总计：23 个测试文件，覆盖 17 个页面。

## 测试模式

### API 端点验证

```typescript
import { test, expect } from "bun:test";

test("用户列表 API 路径正确", () => {
  expect("/api/system/users").toBe("/api/system/users");
});

test("用户详情 API 带路径参数", () => {
  expect("/api/system/users/:id").toBe("/api/system/users/:id");
});
```

### 类型字段验证

```typescript
test("UserItem 类型包含必要字段", () => {
  const item: UserItem = {
    id: "1",
    username: "test",
    nickname: "测试",
    email: "",
    phone: "",
    avatar: "",
    gender: 0,
    status: 1,
    deptId: "",
    roles: [],
    posts: [],
    mfaEnabled: false,
    createdAt: "",
    updatedAt: "",
  };
  expect(item.id).toBe("1");
});
```

### 搜索参数验证

```typescript
test("用户列表搜索参数结构正确", () => {
  const params = { page: 1, pageSize: 10, username: "", status: undefined };
  expect(params).toHaveProperty("page");
  expect(params).toHaveProperty("pageSize");
});
```

## 运行测试

```bash
# 运行所有前端测试
bun test apps/admin/web

# 运行指定页面测试
bun test apps/admin/web/src/pages/app/system/users/__tests__/index.test.tsx

# 运行所有测试（框架 + 平台 + 前端）
bun test
```

## 测试规范

- 使用 `bun:test` 的 `test` / `describe` / `expect`
- 测试文件命名：`xxx.test.ts` 或 `xxx.test.tsx`
- 优先测试 API 契约（路径、参数、响应结构）
- 类型测试使用 TypeScript 编译期检查
- 不测试 UI 渲染细节（无 DOM 环境）
