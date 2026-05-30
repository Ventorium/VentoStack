---
order: 3
title: 开发指南
description: Admin 模块的开发规范与流程。
---

## 新增后端实体

完整流程参考 `.claude/skills/admin-backend-entity/SKILL.md`。

### 标准步骤

1. **Migration** — `packages/platform/system/src/migrations/NNN_create_sys_xxx.ts`
2. **Model** — `packages/platform/system/src/models/xxx.ts`
3. **Service** — `packages/platform/system/src/services/xxx.ts`
4. **Routes** — 在 `module.ts` 中注册路由
5. **注册 Migration** — `apps/admin/api/src/database/migrations.ts`
6. **注册 Seed**（可选）— `apps/admin/api/src/database/seeds.ts`

### 命名约定

| 场景 | 规范 | 示例 |
|------|------|------|
| 数据库表名 | `sys_` 前缀 + snake_case | `sys_product` |
| 数据库列名 | snake_case | `created_at`, `user_id` |
| TypeScript 字段 | camelCase | `createdAt`, `userId` |
| 工厂函数 | `create` 前缀 | `createProductService` |
| 路由路径 | `/api/system/{资源}` | `/api/system/products` |
| 权限标识 | `{模块}:{资源}:{操作}` | `system:product:create` |
| 文件名 | kebab-case | `product-service.ts` |

## 新增前端页面

完整流程参考 `.claude/skills/admin-crud-page/SKILL.md`。

### 标准模式

```
搜索栏 → 分页表格 → 新增/编辑弹窗
```

核心组件组合：

- `useTable` — 分页数据获取与状态管理
- `ActionColumn` — 表格操作列（编辑/删除/自定义）
- `DictSelect` / `DictRadio` — 字典数据下拉/单选
- `client` — 类型安全 API 客户端

### 样式约定

- 表格：`size="small"` / `rowKey="id"` / `scroll={{ x: N }}`
- Modal：`destroyOnHidden`（不是 `destroyOnClose`）
- 表单：`layout="vertical"` / `preserve={false}`
- 操作列：`width: 130~160` / `fixed: 'right'`

## 新增平台模块

如需在 Admin 中集成新的平台模块：

1. 在 `packages/platform/` 下创建模块（参考 platform 文档）
2. 在 `packages/platform/boot/src/create-platform.ts` 中注册
3. 在 `apps/admin/api/src/app.ts` 的 `modules` 配置中启用
4. 在前端创建对应的管理页面
5. 在 `apps/docs/src/content/docs/platform/` 添加文档

## 测试规范

```bash
# 运行所有测试
bun test

# 运行指定模块测试
bun test packages/platform/system

# 运行前端测试
bun test apps/admin/web
```

- 使用 `bun:test`，不用 Jest/Vitest
- 测试文件放在 `__tests__/` 目录，命名 `xxx.test.ts`
- 使用 `createMockDatabase()` mock 数据库
- 安全关键路径必须有失败用例覆盖
