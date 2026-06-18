# Admin Web — 代码生成约束

## 类型规则

- **禁止手写 `XxxItem` 接口**。所有业务类型必须从 `OpenAPIComponents['schemas']` 导入或 alias。当前 `src/api/types.ts` 中的手写类型是临时方案，待后端补全 schema 后由 o2t 自动生成替代。
- `src/api/schema.ts` 由 o2t 自动生成，**不要手动编辑**。新增路由后运行 o2t 重新生成。

## API 调用

- 使用 `client` from `@/api`（`createFetchClient<OpenAPIs>`）
- URL 路段用 `params: { id }`，不用模板字符串拼接
- 查询参数用 `query`，请求体用 `body`
- 响应已被拦截器拆包为 `{ code, message, data }`，直接拿到 `data`

```typescript
// ✅ 正确
const { error, data } = await client.get('/api/system/users/:id', { params: { id } })
const { error, data } = await client.get('/api/system/users', { query: cleanParams(params) })
const { error, data } = await client.put('/api/system/users/:id', { params: { id }, body: values })
// 不需要处理error的情况，已经在全局处理了
if (!error) {
  // 后续业务，可展示提示
}

// ❌ 错误 — 不要拼接 URL
client.get(`/api/system/users/${id}`)
```

## 组件与 Hooks

- 状态列用 `<Tag color={r.status === 1 ? 'green' : 'red'}>`，不要引入新写法
- 操作列用 `ActionColumn` 组件，`fixed: 'right'`，不要手写 Space + Button
- 下拉选择用 `DictSelect` + `typeCode`，不要硬编码 options
- 分页表格用 `useTable<T>(fetcher)`，不要手写分页逻辑
- 字典数据用 `useDict(typeCode)`，不要直接调 dict API

## 样式

- 表格：`size="small"`、`rowKey="id"`、`scroll={{ x: N }}`
- Modal：`destroyOnHidden`（不是 `destroyOnClose`）
- 表单：`layout="vertical"`、`preserve={false}`
- 时间列：`width: 180`
- 操作列：`width: 130~160`、`fixed: 'right'`

## 禁止

- 不要引入 `Select` from antd 用于字典/状态下拉，用 `DictSelect`
- 不要在页面内手写分页 loading/data 状态，用 `useTable`
- 不要用 `any` 类型，用 `unknown` + 类型收窄
- 不要创建新的全局状态 store，除非有跨页面共享需求

## 样式约束

- **禁止使用 `style={}` 内联样式**。所有样式必须使用 UnoCSS 工具类（`className`）。
- 唯一例外：当值是动态的（运行时计算、主题 token、条件表达式）且无法用静态 class 表达时，才允许 `style={{}}`。
- 动态值示例：`token.colorPrimary`、`token.borderRadiusLG`、模板字符串 `repeat(${n}, 1fr)`、条件表达式 `selected ? "#000" : meta.color`。
- 禁止创建独立的 `.css` / `.scss` / `.less` 文件，所有样式通过 UnoCSS 工具类内联。
