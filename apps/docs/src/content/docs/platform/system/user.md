---
order: 3
title: 用户管理
description: '用户管理模块提供用户的增删改查、密码管理、状态管理、关联关系管理及批量导入导出能力。'
---

## 概述

用户管理是系统管理模块的核心，提供完整的用户生命周期管理能力。所有操作自动记录审计日志，并遵循多租户隔离原则。

## CRUD 操作

### 创建用户

```typescript
POST /api/system/user
{
  "username": "zhangsan",
  "nickname": "张三",
  "email": "zhangsan@example.com",
  "phone": "13800138000",
  "password": "Pass@1234",
  "deptId": "dept-001",
  "postIds": ["post-001", "post-002"],
  "roleIds": ["role-001"],
  "status": 0,            // 0=正常, 1=停用
  "remark": "备注信息"
}
```

### 查询用户

```typescript
GET /api/system/user?page=1&pageSize=10&username=zhang&status=0&deptId=dept-001

// 响应
{
  "total": 100,
  "rows": [
    {
      "id": "user-001",
      "username": "zhangsan",
      "nickname": "张三",
      "email": "zhang***@example.com",   // 脱敏
      "phone": "138****8000",              // 脱敏
      "status": 0,
      "deptName": "技术部",
      "roles": [{ "id": "role-001", "name": "管理员" }],
      "posts": [{ "id": "post-001", "name": "开发工程师" }],
      "createdAt": "2024-01-01T00:00:00Z",
      "lastLoginAt": "2024-06-01T12:00:00Z"
    }
  ]
}
```

### 更新用户

```typescript
PUT /api/system/user/{id}
{
  "nickname": "张三丰",
  "email": "zhangsan@example.com",
  "phone": "13800138001",
  "deptId": "dept-002",
  "postIds": ["post-001"],
  "roleIds": ["role-001", "role-002"],
  "status": 0,
  "remark": "更新备注"
}
```

### 删除用户

```typescript
DELETE /api/system/user/{id}

// 软删除：设置 deleted_at 字段
// 如果用户有活跃会话，自动执行强制下线
// 记录审计日志
```

## 密码管理

### 管理员重置密码

```typescript
PUT /api/system/user/{id}/password/reset

// 响应
{
  "tempPassword": "Tmp@abc123",   // 临时密码
  "mustChange": true               // 首次登录必须修改
}
```

临时密码通过安全渠道（邮件/短信）发送给用户，不在接口响应中返回。

### 用户修改密码

```typescript
PUT /api/system/user/password
{
  "oldPassword": "Old@1234",
  "newPassword": "New@5678"
}
```

密码修改后自动撤销所有已有 Refresh Token，用户需要重新登录。

## 状态管理

用户状态控制用户的登录和访问能力：

| 状态值 | 含义 | 影响 |
|--------|------|------|
| `0` | 正常 | 正常登录和使用 |
| `1` | 停用 | 无法登录，已有 Token 立即失效 |

```typescript
PUT /api/system/user/{id}/status
{
  "status": 1    // 停用用户
}

// 停用时自动执行：
// 1. 撤销所有 Refresh Token
// 2. AccessToken 加入黑名单
// 3. 记录审计日志
```

## 关联关系

### 用户-角色关联

一个用户可以拥有多个角色，角色决定用户的菜单权限和数据权限：

```typescript
// 用户管理中同步更新角色关联
PUT /api/system/user/{id}
{
  "roleIds": ["role-admin", "role-editor"]
}

// 内部执行：
// 1. 删除旧的 sys_user_role 关联记录
// 2. 批量插入新的关联记录
// 3. 清除该用户的权限缓存
```

### 用户-岗位关联

一个用户可以同时担任多个岗位：

```typescript
// 岗位关联随用户更新同步处理
{
  "postIds": ["post-dev", "post-lead"]
}
```

### 用户-部门关联

每个用户归属于一个部门，部门决定数据权限范围：

```typescript
{
  "deptId": "dept-tech"    // 只能归属一个部门
}
```

## 导入导出

### 导出用户

```typescript
GET /api/system/user/export?deptId=dept-001&format=xlsx

// 返回文件流
// Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// Content-Disposition: attachment; filename=users_20240601.xlsx
```

导出字段受当前用户的数据权限约束，不会导出超出权限范围的用户数据。

### 导入用户

```typescript
POST /api/system/user/import
Content-Type: multipart/form-data

// 上传 Excel 文件（限制 5MB 以内）
// 支持的字段：username, nickname, email, phone, deptName, roleNames, postNames, status
```

导入流程：
1. 文件格式校验（扩展名、MIME、大小）
2. 数据行逐行校验（Schema + 业务规则）
3. 返回导入结果（成功数、失败数、失败明细）

```typescript
// 导入结果
{
  "total": 100,
  "success": 95,
  "failed": 5,
  "errors": [
    { "row": 12, "username": "duplicate", "reason": "用户名已存在" },
    { "row": 23, "email": "invalid", "reason": "邮箱格式不正确" },
  ]
}
```
