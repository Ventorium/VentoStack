---
order: 9
title: 通知公告
description: '通知公告提供租户隔离的草稿、发布、撤回与用户已读状态管理。'
---

## 数据与权限边界

通知存储在 `sys_notice`，已读记录存储在 `sys_user_notice`。所有查询和写入均由服务端从当前身份注入 `tenant_id`，客户端不能选择或覆盖租户。

管理端接口要求登录并校验 `system:notice` 对应权限；用户端只能读取当前租户内已发布的公告，并且只能修改自己的已读状态。写操作会进入统一操作日志。

字段采用数值枚举：

- `type`：`1` 通知，`2` 公告。
- `status`：`0` 草稿，`1` 已发布，`2` 已撤回。

仅草稿可以编辑；草稿与已撤回记录可以发布和删除；仅已发布记录可以撤回。服务层也会校验类型值，避免非 HTTP 调用写入非法数据。

## 管理端 API

```http
GET    /api/system/notices?page=1&pageSize=10&title=维护&type=2&status=0
POST   /api/system/notices
GET    /api/system/notices/:id
PUT    /api/system/notices/:id
DELETE /api/system/notices/:id
PUT    /api/system/notices/:id/publish  # 保留的兼容端点，直接调用返回 409
PUT    /api/system/notices/:id/revoke
POST   /api/system/notices/batch-publish # 保留的兼容端点，直接调用返回 409
POST   /api/system/notices/batch-revoke
POST   /api/system/notices/batch-delete
```

创建示例：

```json
{
  "title": "系统维护公告",
  "content": "系统将于周六凌晨进行维护。",
  "type": 2
}
```

创建请求仅接受 `title`、`content`、`type`。租户由服务端写入，创建后固定为草稿状态；发布人与发布时间由服务端在发布时写入，撤回时清空发布时间。

## 用户端 API

```http
GET  /api/system/notices/published?page=1&pageSize=10
PUT  /api/system/notices/:id/read
POST /api/system/notices/batch-read
```

未读数量暂无独立端点，通过 `/api/system/dashboard/stats` 的 `unreadNotices` 字段返回。

已读状态持久化在数据库中，不依赖 Redis。批量已读请求最多接受 100 个公告 ID；不存在、未发布或属于其他租户的公告不会被当作可读公告处理。

## 审批发布闭环

通知上架必须提交绑定 `notice` 业务类型的工作流。流程全部通过后，工作流完成事件携带业务 ID、租户和最终审批人，由平台装配层验证业务类型与租户，再调用通知服务的幂等发布入口。重复完成事件不会重复修改已发布公告。

直接发布和批量发布端点为兼容旧客户端而保留，但固定返回 `409`；管理页面也不提供批量发布入口，从服务端关闭绕过审批的路径。
