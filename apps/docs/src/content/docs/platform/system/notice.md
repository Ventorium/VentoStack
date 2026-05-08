---
order: 9
title: 通知公告
description: '通知公告模块提供通知的发布、撤回、已读未读追踪及批量通知能力。'
---

## 概述

通知公告模块管理系统级别的通知和公告信息。管理员可创建、发布和撤回通知，普通用户可查看通知列表并标记已读状态。

## 数据模型

```
sys_notice
├── id              主键
├── title           标题
├── content         内容（支持富文本）
├── type            类型 (notice=通知, announcement=公告)
├── status          状态 (draft=草稿, published=已发布, revoked=已撤回)
├── priority        优先级 (low=低, normal=普通, high=高)
├── targetType      目标类型 (all=全员, dept=指定部门, user=指定用户)
├── targetIds       目标 ID 列表（JSON 数组）
├── publishedAt     发布时间
├── revokedAt       撤回时间
├── createBy        创建者
├── createdAt       创建时间
└── updatedAt       更新时间
```

## CRUD 操作

### 创建通知

```typescript
POST /api/system/notice
{
  "title": "系统维护通知",
  "content": "<p>系统将于本周六凌晨 2:00-6:00 进行维护升级...</p>",
  "type": "announcement",
  "priority": "high",
  "targetType": "all"
}
```

创建后默认为草稿状态。

### 查询通知列表

```typescript
// 管理端查询
GET /api/system/notice?page=1&pageSize=10&type=announcement&status=published

// 响应
{
  "total": 50,
  "rows": [
    {
      "id": "notice-001",
      "title": "系统维护通知",
      "type": "announcement",
      "status": "published",
      "priority": "high",
      "targetType": "all",
      "publishedAt": "2024-06-01T10:00:00Z",
      "createByName": "管理员",
      "readCount": 120,
      "totalCount": 200
    }
  ]
}
```

### 更新通知

```typescript
PUT /api/system/notice/{id}
{
  "title": "系统维护通知（更新）",
  "content": "<p>维护时间调整为周六 3:00-5:00...</p>"
}

// 只有草稿状态的通知可以编辑
```

### 删除通知

```typescript
DELETE /api/system/notice/{id}

// 只有草稿状态的通知可以删除
// 已发布的通知需要先撤回再删除
```

## 发布与撤回

### 发布通知

```typescript
PUT /api/system/notice/{id}/publish

// 效果：
// 1. 状态变更为 published
// 2. 记录 publishedAt 时间
// 3. 根据 targetType 创建目标用户的未读记录
// 4. 通过 EventBus 发送通知事件
```

### 撤回通知

```typescript
PUT /api/system/notice/{id}/revoke

// 效果：
// 1. 状态变更为 revoked
// 2. 记录 revokedAt 时间
// 3. 未读记录标记为已撤回
// 4. 通过 EventBus 发送撤回事件
```

## 已读未读追踪

### 用户端查询

```typescript
// 获取通知列表（含已读状态）
GET /api/system/notice/user?page=1&pageSize=10&type=announcement

// 响应
{
  "total": 30,
  "rows": [
    {
      "id": "notice-001",
      "title": "系统维护通知",
      "type": "announcement",
      "priority": "high",
      "publishedAt": "2024-06-01T10:00:00Z",
      "isRead": false,
      "readAt": null
    }
  ]
}
```

### 标记已读

```typescript
// 标记单条已读
PUT /api/system/notice/{id}/read

// 标记全部已读
PUT /api/system/notice/read-all
```

### 未读数量

```typescript
GET /api/system/notice/unread-count

// 响应
{
  "count": 5
}
```

已读未读状态存储在 Redis 中：

```
Key:   notice:read:{userId}:{noticeId}
Value: "1"
TTL:   无过期

Key:   notice:unread:{userId}
Value: 计数器
```
