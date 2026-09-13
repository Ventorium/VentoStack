---
order: 8
title: 系统参数
description: '系统参数提供按租户隔离、可在线修改并实时生效的运行时配置。'
---

## 概述

系统参数存储在 `sys_config`，所有读写均由服务端注入 `tenant_id`，客户端不能指定租户。参数读取使用租户命名空间缓存，更新后会立即失效对应缓存，无需重启服务。

管理接口为 `/api/system/configs`，仅数据库实时确认的管理员可访问。公开页面只通过 `/api/system/configs/public` 获取经过白名单筛选和类型转换的非敏感配置，不能读取初始密码等敏感值。

## 系统预设参数

| Key | 默认值 | 实际消费者与行为 |
|---|---:|---|
| `sys_dept_enabled` | `true` | 控制用户管理页是否显示部门树 |
| `sys_user_init_password` | `123456` | 创建用户未指定密码、批量重置密码时使用；管理列表仅返回掩码 |
| `sys_password_min_length` | `6` | 创建用户、注册、重置密码及前端表单共同校验 |
| `sys_password_complexity` | `low` | 创建用户、注册、重置密码及前端表单共同校验；仅允许 `low/medium/high` |
| `sys_password_expire_days` | `30` | 密码登录时检查过期；`-1` 表示永不过期，缺失或非法值回退 30 天 |
| `sys_login_max_attempts` | `5` | 控制用户名与 IP 组合的连续登录失败上限 |
| `sys_login_lock_minutes` | `15` | 控制登录失败计数的锁定时长 |
| `sys_site_name` | `VentoStack` | 登录页、侧边栏、首页和浏览器标题 |
| `sys_mfa_enabled` | `false` | 控制 MFA 登录流程及个人中心 MFA 界面 |
| `sys_mfa_force` | `false` | 登录后标记未配置 MFA 的用户并提示设置；仅在 MFA 总开关开启时生效 |
| `sys_passkey_enabled` | `true` | 控制 Passkey 登录和新凭据注册；关闭后仍允许查看、删除已有凭据 |
| `sys_register_enabled` | `false` | 控制注册 API 和登录页注册入口；缺失或非法值按关闭处理 |
| `ai_trace_enabled` | `true` | 控制 AI recorder 是否写入新的链路记录，修改后即时生效 |

这些记录属于系统预设参数：`key` 和元数据固定，只允许修改参数值及排序，不允许删除。后端返回 `isSystem: true`，页面据此隐藏删除操作；删除限制同时在服务层强制执行，不能通过直接调用 API 绕过。

## 值类型与校验

参数值在数据库中统一以字符串存储。管理页根据 `type` 提供对应控件：字符串/JSON 使用文本框、数字使用数字输入框、布尔使用开关。系统预设参数在服务端还有独立值域校验：

- 布尔开关仅接受 `true` 或 `false`。
- 密码最小长度为 6～128。
- 密码过期天数为 `-1` 或 1～3650。
- 最大登录失败次数为 1～100。
- 锁定时长为 1～1440 分钟。
- 密码复杂度仅接受 `low`、`medium`、`high`。

## API

```http
GET /api/system/configs?page=1&pageSize=10
PUT /api/system/configs/:id
DELETE /api/system/configs/:id
GET /api/system/configs/public
```

更新示例：

```json
{
  "value": "false"
}
```

敏感参数在列表和按 key 查询接口中返回 `******`。编辑时原样回传该占位符表示保持原值，真实密文不会通过管理 API 返回。

## AI 链路追踪开关

AI 链路追踪页的 `/api/ai/trace/config` 与系统参数页操作的是同一个租户下的 `ai_trace_enabled`。该专用接口要求 `ai:trace:config` 权限；系统参数页则要求管理员权限。开关不存在时 recorder 按“开启”处理以保证默认可审计，种子会为新租户创建该预设记录。
