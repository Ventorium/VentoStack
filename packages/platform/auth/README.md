# @ventostack/auth

JWT、Session、API Key、RBAC/ABAC、TOTP、OAuth、Token 刷新与吊销、行级数据过滤。

## 模块定位

认证授权能力层，依赖 core、database、cache。安全原则：默认 deny、算法白名单、密钥最小长度、恒定时间比较、Access/Refresh 分离。

## 安全特性

### JWT 算法白名单

仅允许 HS256 / HS384 / HS512 三种 HMAC 算法。验证时检查 header.alg 是否在白名单内，拒绝 `none` 和任何非白名单算法。签名和验签都使用 Web Crypto API。

```typescript
const jwt = createJWT({ secret: "your-secret", algorithm: "HS256" });
// 传入非白名单算法会抛出 Error
```

### Session 管理

- 优先使用 `createRedisSessionStore`（生产环境推荐）
- `createMemorySessionStore` 仅用于开发和测试
- Session 支持 TTL 过期检查与键前缀隔离

### Row Filter 参数化查询

`createRowFilter()` 生成的 WHERE 条件全部使用 `ParameterizedClause`（`$1, $2, ...` 占位符），避免 SQL 注入：

```typescript
const filter = createRowFilter();
filter.addRule({ resource: "orders", field: "tenant_id", operator: "eq", valueFrom: "tenant", value: "id" });
const { sql, params } = filter.buildWhereClause("orders", { tenantId: "t-001" });
// sql: "WHERE tenant_id = $1", params: ["t-001"]
```

- 字段名通过 `SAFE_IDENTIFIER_PATTERN` 白名单校验
- 缺失过滤值时返回 `WHERE 1 = 0`（安全默认）
- `formatSqlLiteral` 已标记 `@deprecated`，新代码必须使用参数化

### Token 刷新与吊销

- Access Token 与 Refresh Token 分离，使用不同的 jti 和 iss
- `revoke(jti)` 吊销指定 Token，`isRevoked(jti)` 检查吊销状态
- 支持 `createMemoryRevocationStore` 和 `createRedisRevocationStore`

### 其他安全约束

- API Key 哈希存储，恒定时间比较防时序攻击
- RBAC 默认 deny，必须显式授权
- ABAC 默认 deny，deny 优先于 allow
- 密钥最小长度校验
