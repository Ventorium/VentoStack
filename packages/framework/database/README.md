# @ventostack/database

链式查询构建器、迁移、事务、连接池管理。

## 模块定位

数据与基础设施层，只依赖 core。提供类型安全的 SQL 查询构建器，零运行时反射。

## 核心能力

- Model 与 Column 的类型化定义
- 参数化链式查询构建器
- 迁移、Seed 和事务管理
- 关系定义、Join 与预加载 SQL
- 连接池、驱动适配和读写分离
- Schema 读取、差异比较和迁移 SQL 生成

## 安全特性

### 租户隔离

`withTenant(tenantId)` 方法自动注入 `tenant_id = $N` WHERE 条件：

```typescript
db.query(UserModel).withTenant("tenant-001").select("*").list();
// 生成 SQL: SELECT * FROM users WHERE tenant_id = $1
```

- `tenantId` 必须为非空字符串，空值抛出 `TypeError`
- `tenant_id` 字段名通过 `assertValidIdentifier` 白名单校验
- 多租户场景必须强制调用 `withTenant`，不能依赖前端传递 `tenant_id`

### 标识符白名单校验

所有字段名（WHERE、ORDER BY、GROUP BY、聚合函数、INSERT 字段）必须匹配 `/^[a-zA-Z_][a-zA-Z0-9_]*$/`，不匹配则抛出 `TypeError`。防止 SQL 注入通过字段名穿透。

### 聚合函数字段名校验

`sum()`、`avg()`、`min()`、`max()` 等聚合操作的字段名同样经过 `assertValidIdentifier` 校验，不接受用户直接输入。

### 参数化查询强制

所有值通过 `$1, $2, ...` 占位符传递，禁止字符串拼接。查询构建器内部自动处理 `IS NULL`、`IN (...)` 等特殊语法的参数化。

### 标签模板查询

基于 Bun.sql 的标签模板查询也是参数化路径，不经过字符串拼接。

## 编码约束

- 禁止 SQL 字符串拼接，必须使用查询构建器或标签模板
- 动态字段名必须经过校验或来自代码内硬编码白名单
- 软删除使用 `deleted_at` 字段，`hardDelete()` 必须显式调用
- `LIMIT` 上限由 `maxLimit` 控制，默认 10000
