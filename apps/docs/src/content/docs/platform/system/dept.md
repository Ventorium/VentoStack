---
order: 6
title: 部门与岗位
description: '部门与岗位管理模块提供组织架构树的 CRUD、岗位管理以及用户-部门-岗位的多对多关联管理。'
---

## 概述

部门与岗位管理是组织架构的基础模块。部门以树形结构组织，岗位作为职能标签与用户关联。用户归属于一个部门，可同时担任多个岗位。

## 部门管理

### 部门树结构

```
总部 (dept-root)
├── 技术部 (dept-tech)
│   ├── 前端组 (dept-tech-fe)
│   ├── 后端组 (dept-tech-be)
│   └── 测试组 (dept-tech-qa)
├── 产品部 (dept-product)
│   ├── 产品规划组 (dept-product-plan)
│   └── 用户研究组 (dept-product-ux)
└── 行政部 (dept-admin)
```

### 创建部门

```typescript
POST /api/system/dept
{
  "parentId": "dept-tech",       // 父部门 ID，根部门为 "0"
  "name": "后端组",
  "code": "TECH_BE",
  "leader": "user-001",          // 负责人
  "sort": 2,
  "status": 0,
  "remark": "后端开发团队"
}
```

### 查询部门树

```typescript
GET /api/system/dept?name=技术&status=0

// 返回完整部门树
[
  {
    "id": "dept-root",
    "name": "总部",
    "parentId": "0",
    "children": [
      {
        "id": "dept-tech",
        "name": "技术部",
        "parentId": "dept-root",
        "leaderName": "张三",
        "children": [
          {
            "id": "dept-tech-be",
            "name": "后端组",
            "parentId": "dept-tech"
          }
        ]
      }
    ]
  }
]
```

### 更新部门

```typescript
PUT /api/system/dept/{id}
{
  "name": "后端研发组",
  "leader": "user-002",
  "sort": 1
}
```

### 删除部门

```typescript
DELETE /api/system/dept/{id}

// 前置检查：
// 1. 是否存在子部门 → 存在则拒绝
// 2. 是否存在关联用户 → 存在则拒绝
```

### 获取子部门 ID 列表

用于数据权限过滤时获取当前部门及所有子部门 ID：

```typescript
GET /api/system/dept/{id}/descendants

// 响应
{
  "deptIds": ["dept-tech", "dept-tech-fe", "dept-tech-be", "dept-tech-qa"]
}
```

此接口内部使用递归查询实现，结果按层级排序。

## 岗位管理

### 创建岗位

```typescript
POST /api/system/post
{
  "code": "DEV_ENGINEER",
  "name": "开发工程师",
  "sort": 1,
  "status": 0,
  "remark": "开发岗位"
}
```

### 查询岗位列表

```typescript
GET /api/system/post?page=1&pageSize=10&name=开发&status=0

// 响应
{
  "total": 8,
  "rows": [
    {
      "id": "post-001",
      "code": "DEV_ENGINEER",
      "name": "开发工程师",
      "sort": 1,
      "status": 0,
      "userCount": 20
    }
  ]
}
```

### 更新岗位

```typescript
PUT /api/system/post/{id}
{
  "name": "高级开发工程师",
  "sort": 0
}
```

### 删除岗位

```typescript
DELETE /api/system/post/{id}

// 前置检查：
// 1. 是否存在关联用户 → 存在则拒绝
```

## 用户-部门-岗位关联

### 关联关系模型

```
sys_user
  ├── dept_id → sys_dept          (多对一：用户归属部门)
  └── sys_user_post               (多对多：用户-岗位关联)
        ├── user_id → sys_user
        └── post_id → sys_post
```

### 关联管理

用户与部门、岗位的关联通过用户管理接口统一维护：

```typescript
// 创建或更新用户时指定关联
POST /api/system/user
{
  "username": "lisi",
  "deptId": "dept-tech-be",         // 归属部门（必填，单个）
  "postIds": ["post-001", "post-002"], // 岗位（可选，多个）
  // ... 其他字段
}
```

内部处理逻辑：

```typescript
async function updateUserAssociations(
  userId: string,
  deptId: string,
  postIds: string[]
) {
  await db.transaction(async (tx) => {
    // 1. 更新部门归属
    await tx.query`UPDATE sys_user SET dept_id = ${deptId} WHERE id = ${userId}`;

    // 2. 删除旧的岗位关联
    await tx.query`DELETE FROM sys_user_post WHERE user_id = ${userId}`;

    // 3. 批量插入新的岗位关联
    if (postIds.length > 0) {
      const values = postIds.map(postId => `(${userId}, ${postId})`).join(', ');
      await tx.query`INSERT INTO sys_user_post (user_id, post_id) VALUES ${sql.raw(values)}`;
    }
  });
}
```
