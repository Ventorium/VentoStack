---
name: admin-shared-components
description: Admin 前端共享组件与 Hooks 速查。涵盖 ActionColumn、DictSelect、useTable、useDict 的接口定义、使用方式与注意事项。当涉及表格操作列、字典下拉、分页表格、字典数据获取时调用。
---

# Admin 共享组件与 Hooks

## ActionColumn — 表格操作列

路径：`src/components/ActionColumn.tsx`

将多个操作按钮渲染为前 N 个内联 + 剩余收入 Dropdown 的统一操作列。

### 接口

```typescript
interface ActionItem {
  label: string
  onClick: () => void
  danger?: boolean       // 红色文字
  confirm?: string       // 显示 Popconfirm 确认
}

interface ActionColumnProps {
  items: ActionItem[]
  maxInline?: number     // 默认 2，超出部分进 "..." 下拉
}
```

### 用法

```tsx
{ title: '操作', key: 'action', width: 130, fixed: 'right' as const,
  render: (_: unknown, r: XxxItem) => (
    <ActionColumn items={[
      { label: '编辑', onClick: () => openEdit(r) },
      { label: '重置密码', onClick: () => handleResetPwd(r.id) },
      { label: '禁用', onClick: () => handleStatus(r.id, r.status) },
      { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除？' },
    ]} />
  ) }
```

### 规则

- 操作列必须 `fixed: 'right'`，宽度 130~160
- 删除操作放最后，带 `danger: true` + `confirm`
- 不要手写 `<Space><Button>...<Dropdown>` 替代此组件

---

## DictSelect — 字典下拉

路径：`src/components/DictSelect.tsx`

基于字典 API 的 Select 组件，传 `typeCode` 自动加载选项。

### 接口

```typescript
interface DictSelectProps extends Omit<SelectProps, 'options' | 'loading'> {
  typeCode: string       // 字典类型编码
  autoload?: boolean     // 默认 true
}
```

### 用法

```tsx
// 搜索栏
<Form.Item name="status">
  <DictSelect typeCode="sys_status" placeholder="状态" allowClear style={{ width: 100 }} />
</Form.Item>

// 表单（设默认值）
<Form.Item name="status" label="状态" initialValue={1}>
  <DictSelect typeCode="sys_status" />
</Form.Item>
```

### 常用 typeCode

| typeCode | 含义 |
|----------|------|
| `sys_status` | 通用状态（正常/禁用） |
| `sys_notice_type` | 通知类型 |
| `sys_notice_status` | 通知状态 |
| `sys_menu_type` | 菜单类型 |
| `sys_config_type` | 配置类型 |
| `sys_gender` | 性别 |

### 缓存刷新

```tsx
import { invalidateDict } from '@/hooks/useDict'
invalidateDict('sys_status')   // 刷新单个
invalidateDict()               // 清空全部缓存
```

### 规则

- 任何字典/状态下拉都用 DictSelect，不要从 antd 导入 Select 硬编码 options

---

## useTable — 分页表格 Hook

路径：`@/hooks/useTable`

一站式分页表格状态管理：加载、分页、搜索、行选择。

### 签名

```typescript
function useTable<T, P extends PaginatedParams = PaginatedParams>(
  fetcher: (params: P) => Promise<any>,
  options?: { defaultPageSize?: number; defaultParams?: Partial<P> }
): UseTableReturn<T, P>
```

### Fetcher 定义

```typescript
const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/xxx', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<T> }>
```

API 必须返回 `{ list: T[], total, page, pageSize }` 格式（拦截器已拆包 envelope）。

### 返回值

| 属性 | 类型 | 用途 |
|------|------|------|
| `loading` | `boolean` | 传 `Table loading` |
| `data` | `T[]` | 传 `Table dataSource` |
| `total` | `number` | 分页 total |
| `page` | `number` | 当前页 |
| `pageSize` | `number` | 每页条数 |
| `refresh()` | `() => void` | 增删改后刷新 |
| `onSearch(p)` | `(p: Partial<P>) => void` | 搜索（自动回到第 1 页） |
| `onReset()` | `() => void` | 重置到默认 |
| `onPageChange` | `(page, pageSize) => void` | 传 `Table pagination.onChange` |
| `selectedRowKeys` | `React.Key[]` | 已选行 |
| `rowSelection` | `TableRowSelection<T>` | 传 `Table rowSelection` |
| `clearSelection()` | `() => void` | 清空选择 |
| `hasSelected` | `boolean` | 是否有选中 |

### 标准用法

```tsx
const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange,
        selectedRowKeys, rowSelection, clearSelection, hasSelected } = useTable<XxxItem>(fetcher)

// 搜索
const handleSearch = () => { onSearch(cleanParams(searchForm.getFieldsValue())) }
const handleReset = () => { searchForm.resetFields(); onReset() }

// 增删改后刷新
const handleOk = async () => { ...; refresh() }
const handleDelete = async () => { ...; refresh() }
```

### Table 绑定

```tsx
<Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
  pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
  scroll={{ x: 900 }} rowSelection={rowSelection} />
```

---

## useDict — 字典数据 Hook

路径：`src/hooks/useDict.ts`

按 typeCode 获取字典数据，模块级 Map + 5 分钟 TTL 缓存。

### 签名

```typescript
function useDict(typeCode: string): {
  options: DictItem[]   // { id, typeCode, label, value, sort, cssClass, status }
  loading: boolean
  refresh: () => void   // 强制重新加载
}
```

### 用法

```tsx
const { options, loading } = useDict('sys_status')
// options 可直接传给 <Select options={options.map(o => ({ label: o.label, value: o.value }))} />
```

一般直接用 `DictSelect` 组件即可，只有需要原始数据时才用 `useDict`。
