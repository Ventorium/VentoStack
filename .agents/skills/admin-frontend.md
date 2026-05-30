---
name: admin-frontend
description: |
  开发或修改 apps/admin/web 管理后台前端时必须遵循的规范。
  涵盖 API 调用、类型使用、CRUD 页面模板、Hooks、组件、路由、测试。
---

# Admin Frontend — AI Agent 编码规范

## 核心原则

1. **类型安全**: 所有业务类型从 `@/api/types` 导入，禁止手写 `XxxItem` 接口。
2. **API 调用统一**: 使用 `client` 对象，禁止模板字符串拼接 URL。
3. **权限标识统一**: 与后端保持一致 `system:xxx:action`。
4. **响应处理统一**: 使用 `ok` / `okPage` / `fail` 结构。
5. **状态管理**: 使用 Zustand，禁止直接修改状态。

## API 调用

```typescript
// ✅ 正确
import { client } from "@/api";

const { error, data } = await client.get("/api/system/users/:id", { params: { id } });
const { error, data } = await client.get("/api/system/users", { query: cleanParams(params) });

// ❌ 禁止: 模板字符串拼接 URL
const { data } = await client.get(`/api/system/users/${id}`);
```

## 类型使用

```typescript
// ✅ 正确
import type { UserItem, UserListResponse } from "@/api/types";

// ❌ 禁止: 手写接口
interface UserItem { id: string; name: string; }
```

## CRUD 页面模板

```typescript
// pages/app/system/xxx/index.tsx
import { useTable } from "@/hooks/useTable";
import { ActionColumn } from "@/components/ActionColumn";
import { DictSelect } from "@/components/DictSelect";
import { client } from "@/api";

export default function XxxPage() {
  const { tableProps, refresh, params, setParams } = useTable({
    api: (p) => client.get("/api/system/xxx", { query: cleanParams(p) }),
  });

  return (
    <div>
      {/* 搜索表单 */}
      {/* 表格 */}
      {/* 新增/编辑 Drawer */}
    </div>
  );
}
```

## Hooks

| Hook | 用途 |
|------|------|
| `useTable` | 表格分页、搜索、刷新 |
| `useDict` | 字典数据获取 |
| `useTheme` | 主题切换 |
| `usePublicConfig` | 公开配置获取 |
| `useUrlQuery` | URL 查询参数同步 |

## 组件

| 组件 | 用途 |
|------|------|
| `ActionColumn` | 表格操作列（编辑/删除） |
| `DictSelect` | 字典下拉选择 |
| `DictRadio` | 字典单选 |
| `GlobalMessage` | 全局消息提示 |
| `GlobalHistory` | 全局历史记录 |

## 路由

- 页面文件: `pages/app/xxx/index.tsx`
- 路由配置: 自动基于文件系统
- 权限控制: 在菜单配置中绑定 `permission` 字段

## 测试

```typescript
// pages/app/system/xxx/__tests__/index.test.tsx
import { describe, test, expect } from "bun:test";

describe("Xxx管理页", () => {
  test("API 端点路径正确", () => {
    expect("/api/system/xxx").toBe("/api/system/xxx");
  });
});
```

## 禁止事项

- ❌ 手写业务类型接口
- ❌ 模板字符串拼接 URL
- ❌ 直接调用 `fetch` 而不是 `client`
- ❌ 在组件中直接修改 Zustand 状态
- ❌ 使用 `any` 类型（特殊情况需注释说明）
