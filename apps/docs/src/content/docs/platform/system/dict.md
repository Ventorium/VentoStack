---
order: 7
title: 数据字典
description: '数据字典模块提供字典类型与字典数据的管理、缓存策略及前端下拉选项 API。'
---

## 概述

数据字典用于管理系统中的各类枚举值和选项数据，如用户状态、性别、审核状态等。通过统一的字典管理接口，前端可以动态获取下拉选项，避免硬编码。

## 数据模型

数据字典由两部分组成：

- **字典类型 (sys_dict_type)** — 定义字典的分类
- **字典数据 (sys_dict_data)** — 定义字典的具体选项

```
sys_dict_type
├── sys_user_sex        (用户性别)
│   ├── 0 = 男
│   ├── 1 = 女
│   └── 2 = 未知
├── sys_normal_disable  (系统状态)
│   ├── 0 = 正常
│   └── 1 = 停用
└── sys_notice_type     (通知类型)
    ├── 1 = 通知
    └── 2 = 公告
```

## 字典类型管理

### 创建字典类型

```typescript
POST /api/system/dict/type
{
  "name": "sys_user_sex",
  "label": "用户性别",
  "status": 0,
  "remark": "用户性别列表"
}
```

### 查询字典类型

```typescript
GET /api/system/dict/type?page=1&pageSize=10&name=sys_

// 响应
{
  "total": 15,
  "rows": [
    {
      "id": "dt-001",
      "name": "sys_user_sex",
      "label": "用户性别",
      "status": 0,
      "dataCount": 3,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 更新与删除

```typescript
// 更新
PUT /api/system/dict/type/{id}
{
  "label": "用户性别选项",
  "remark": "更新说明"
}

// 删除（同时删除关联的字典数据并清除缓存）
DELETE /api/system/dict/type/{id}
```

## 字典数据管理

### 创建字典数据

```typescript
POST /api/system/dict/data
{
  "typeName": "sys_user_sex",
  "label": "男",
  "value": "0",
  "sort": 1,
  "cssClass": "",           // 前端样式标识
  "listClass": "primary",   // 列表标签样式
  "isDefault": true,        // 是否为默认值
  "status": 0,
  "remark": "男性"
}
```

### 查询字典数据

```typescript
// 按字典类型查询
GET /api/system/dict/data?typeName=sys_user_sex

// 响应
[
  {
    "id": "dd-001",
    "typeName": "sys_user_sex",
    "label": "男",
    "value": "0",
    "sort": 1,
    "cssClass": "",
    "listClass": "primary",
    "isDefault": true,
    "status": 0
  },
  {
    "id": "dd-002",
    "typeName": "sys_user_sex",
    "label": "女",
    "value": "1",
    "sort": 2,
    "cssClass": "",
    "listClass": "danger",
    "isDefault": false,
    "status": 0
  }
]
```

## 缓存策略

字典数据访问频繁但变更稀少，采用 Redis 缓存策略提升性能。

### 缓存结构

```
Key: dict:{typeName}
Value: JSON 数组（字典数据列表）
TTL: 无过期时间，变更时主动失效
```

### 缓存逻辑

```typescript
async function getDictData(typeName: string): Promise<DictData[]> {
  // 1. 查询缓存
  const cached = await cache.get(`dict:${typeName}`);
  if (cached) return JSON.parse(cached);

  // 2. 查询数据库
  const data = await db.query`
    SELECT * FROM sys_dict_data
    WHERE type_name = ${typeName} AND status = 0
    ORDER BY sort ASC
  `;

  // 3. 写入缓存（无 TTL，变更时失效）
  await cache.set(`dict:${typeName}`, JSON.stringify(data));

  return data;
}

// 缓存失效
async function invalidateDictCache(typeName: string) {
  await cache.del(`dict:${typeName}`);
}
```

缓存失效触发条件：
- 新增、修改、删除字典数据
- 字典类型状态变更
- 字典数据状态变更

## 前端下拉 API

为前端提供统一的字典查询接口，用于下拉框、标签等组件的数据源。

### 按类型查询

```typescript
GET /api/system/dict/data/options?typeNames=sys_user_sex,sys_normal_disable

// 响应
{
  "sys_user_sex": [
    { "label": "男", "value": "0", "listClass": "primary" },
    { "label": "女", "value": "1", "listClass": "danger" },
    { "label": "未知", "value": "2", "listClass": "info" }
  ],
  "sys_normal_disable": [
    { "label": "正常", "value": "0", "listClass": "primary" },
    { "label": "停用", "value": "1", "listClass": "danger" }
  ]
}
```

此接口支持批量查询，减少前端请求数。响应数据直接来自缓存，性能开销极小。
