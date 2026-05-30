---
order: 5
title: 前端开发指南
description: Admin 前端的组件、Hooks 与开发规范。
---

## API 调用

### 类型安全客户端

```typescript
import { client } from '@/api';

// GET 请求
const { error, data } = await client.get('/api/system/users', {
  query: { page: 1, pageSize: 10 },
});

// GET 带路径参数
const { error, data } = await client.get('/api/system/users/:id', {
  params: { id: 'xxx' },
});

// POST 创建
const { error } = await client.post('/api/system/users', {
  body: { username: 'test', nickname: '测试' },
});

// PUT 更新
const { error } = await client.put('/api/system/users/:id', {
  params: { id: 'xxx' },
  body: { nickname: '新名称' },
});

// DELETE 删除
const { error } = await client.delete('/api/system/users/:id', {
  params: { id: 'xxx' },
});
```

**注意**：禁止使用模板字符串拼接 URL，必须使用 `params` 传递路径参数。

## 共享 Hooks

### useTable — 分页表格

```typescript
import { useTable } from '@/hooks/useTable';

const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
  useTable<UserItem>((params) => client.get('/api/system/users', { query: params }));
```

### useDict — 字典数据

```typescript
import { useDict } from '@/hooks/useDict';

const { options, loading } = useDict('sys_normal_status');
```

## 共享组件

### ActionColumn — 操作列

```typescript
import ActionColumn from '@/components/ActionColumn';

<ActionColumn
  items={[
    { label: '编辑', onClick: () => openEdit(record) },
    { label: '删除', onClick: () => handleDelete(record.id), danger: true, confirm: '确认删除？' },
  ]}
/>
```

### DictSelect — 字典下拉

```typescript
import DictSelect from '@/components/DictSelect';

<DictSelect dictCode="sys_normal_status" placeholder="请选择状态" />
```

### DictRadio — 字典单选

```typescript
import DictRadio from '@/components/DictRadio';

<DictRadio dictCode="sys_normal_status" />
```

## CRUD 页面模板

完整的 CRUD 页面创建模板参考 `.claude/skills/admin-crud-page/SKILL.md`。

标准结构：
1. 搜索栏（`Form` + `Row` + `Col`）
2. 数据表格（`Table` + `useTable`）
3. 操作列（`ActionColumn`）
4. 新增/编辑弹窗（`Modal` + `Form`）

## 状态管理

使用 Zustand 管理全局状态：

| Store | 文件 | 职责 |
|-------|------|------|
| `useAuth` | `store/useAuth.ts` | 登录/登出/用户信息/MFA |
| `useMenu` | `store/useMenu.ts` | 菜单树/路由生成 |
| `token` | `store/token.ts` | Token 存取（localStorage） |
| `config` | `store/config.ts` | 全局配置 |

## 路由

使用 `vite-plugin-pages` 文件系统路由：

```
src/pages/
├── index.tsx          → /
├── auth.tsx           → /auth (AuthLayout)
├── auth/login.tsx     → /auth/login
├── app.tsx            → /app (UserLayout)
├── app/index.tsx      → /app (Dashboard)
├── app/system/users/  → /app/system/users
└── [...all].tsx       → 404
```
