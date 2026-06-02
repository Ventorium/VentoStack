# 角色权限增强设计文档

## 当前权限模型

```
用户 → 角色(sys_role) → 菜单(sys_role_menu) → 权限标识(menu.permission)
                                    ↓
                              数据范围(data_scope)
```

- **菜单权限**: 控制页面访问和按钮显示
- **数据权限**: 全部/本部门/本部门及下级/仅本人
- **RBAC**: 内存权限检查 `resource:action`

## 增强后的权限模型

```
用户 → 角色(sys_role) → 菜单权限(sys_role_menu)
                  ↓
            API 白名单(sys_role_api_allow)
                  ↓
            API 黑名单(sys_role_api_deny)
                  ↓
            字段权限(sys_role_field_perm)
                  ↓
            时间窗口(sys_role_time_window)
                  ↓
            IP 范围限制(sys_role_ip_range)
                  ↓
            数据范围(data_scope)
```

## 新增权限维度

### 1. API 白名单（role_api_allow）

角色额外允许访问的 API 接口列表。与菜单权限互补：
- 菜单权限控制前端页面和按钮
- API 白名单控制直接 API 访问（如第三方集成、开放接口）

```typescript
interface RoleApiAllow {
  id: string;
  role_id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "*";
  path: string; // 支持通配符 /api/system/users/*
  description?: string;
}
```

### 2. API 黑名单（role_api_deny）

角色明确禁止访问的 API 接口。优先级高于白名单：

```typescript
interface RoleApiDeny {
  id: string;
  role_id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "*";
  path: string;
  description?: string;
}
```

**权限检查顺序**: 黑名单 → 菜单权限 → API 白名单 → 默认拒绝

### 3. 字段级权限（role_field_perm）

控制角色对特定资源的字段访问：

```typescript
interface RoleFieldPermission {
  id: string;
  role_id: string;
  resource: string; // 如 "user", "order"
  field: string;    // 如 "salary", "phone"
  access: "read" | "write" | "none";
}
```

应用场景：
- 普通管理员看不到用户薪资字段
- 客服只能查看用户手机号，不能修改

### 4. 时间窗口限制（role_time_window）

控制角色只能在特定时间段访问：

```typescript
interface RoleTimeWindow {
  id: string;
  role_id: string;
  day_of_week: number; // 0-6, 7=每天
  start_time: string;  // "09:00"
  end_time: string;    // "18:00"
  timezone: string;    // "Asia/Shanghai"
}
```

应用场景：
- 运维角色只能在工作时间操作
- 审计角色只能在凌晨访问敏感数据

### 5. IP 范围限制（role_ip_range）

控制角色只能从特定 IP 段访问：

```typescript
interface RoleIpRange {
  id: string;
  role_id: string;
  cidr: string;       // "10.0.0.0/8"
  type: "allow" | "deny";
  description?: string;
}
```

应用场景：
- 财务角色只能从公司内网访问
- 超级管理员只能从特定堡垒机 IP 访问

## 权限检查流程

```
请求 → 认证 → 时间窗口检查 → IP 范围检查 → 黑名单检查 → 菜单权限/API白名单检查 → 字段过滤 → 响应
```

## 数据库表设计

```sql
-- API 白名单
CREATE TABLE sys_role_api_allow (
  id VARCHAR(36) PRIMARY KEY,
  role_id VARCHAR(36) NOT NULL REFERENCES sys_role(id),
  method VARCHAR(10) NOT NULL DEFAULT '*',
  path VARCHAR(256) NOT NULL,
  description VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API 黑名单
CREATE TABLE sys_role_api_deny (
  id VARCHAR(36) PRIMARY KEY,
  role_id VARCHAR(36) NOT NULL REFERENCES sys_role(id),
  method VARCHAR(10) NOT NULL DEFAULT '*',
  path VARCHAR(256) NOT NULL,
  description VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 字段权限
CREATE TABLE sys_role_field_perm (
  id VARCHAR(36) PRIMARY KEY,
  role_id VARCHAR(36) NOT NULL REFERENCES sys_role(id),
  resource VARCHAR(64) NOT NULL,
  field VARCHAR(64) NOT NULL,
  access VARCHAR(10) NOT NULL DEFAULT 'none', -- read/write/none
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 时间窗口
CREATE TABLE sys_role_time_window (
  id VARCHAR(36) PRIMARY KEY,
  role_id VARCHAR(36) NOT NULL REFERENCES sys_role(id),
  day_of_week INT NOT NULL DEFAULT 7,
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IP 范围
CREATE TABLE sys_role_ip_range (
  id VARCHAR(36) PRIMARY KEY,
  role_id VARCHAR(36) NOT NULL REFERENCES sys_role(id),
  cidr VARCHAR(64) NOT NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'allow', -- allow/deny
  description VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 实现优先级

| 优先级 | 功能 | 工作量 | 影响范围 |
|--------|------|--------|----------|
| P0 | API 白名单 + 黑名单 | 2天 | 核心权限体系 |
| P1 | 字段级权限 | 3天 | 数据安全 |
| P2 | 时间窗口 | 1天 | 运维安全 |
| P2 | IP 范围 | 1天 | 网络安全 |
