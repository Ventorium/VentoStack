---
title: 工作流概述
description: '工作流模块提供流程定义管理、节点编排、流程实例运行、任务审批等能力，支持多级审批流和业务关联。'
---

## 概述

`@ventostack/workflow` 是 VentoStack 平台层的工作流引擎模块，支持定义审批流程、启动流程实例、推进审批节点、处理审批任务等。可用于请假审批、报销审批、订单审核等各类业务流程场景。

## 快速开始

### 创建工作流模块

```typescript
import { createWorkflowModule } from '@ventostack/workflow';

const workflowModule = createWorkflowModule({
  db,
  jwt,
  jwtSecret,
  rbac,
});

// 注册路由
app.use(workflowModule.router);

// 初始化
await workflowModule.init();
```

### 模块依赖

```typescript
interface WorkflowModuleDeps {
  db: Database;          // 数据库实例
  jwt: JWTManager;       // JWT 管理器
  jwtSecret: string;     // JWT 密钥
  rbac?: RBAC;           // 权限控制（可选）
}
```

## API 路由

所有路由需要认证，基于 RBAC 权限控制。

### 流程定义

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/workflow/definitions` | `workflow:definition:create` | 创建流程定义 |
| GET | `/api/workflow/definitions` | `workflow:definition:list` | 查询流程定义列表 |
| GET | `/api/workflow/definitions/:id` | `workflow:definition:query` | 查询流程定义详情 |
| PUT | `/api/workflow/definitions/:id` | `workflow:definition:update` | 更新流程定义 |
| DELETE | `/api/workflow/definitions/:id` | `workflow:definition:delete` | 删除流程定义 |

### 节点管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| PUT | `/api/workflow/definitions/:id/nodes` | `workflow:definition:update` | 设置流程节点 |
| GET | `/api/workflow/definitions/:id/nodes` | `workflow:definition:query` | 获取流程节点列表 |

### 流程实例

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/workflow/instances` | `workflow:instance:create` | 启动流程实例 |
| GET | `/api/workflow/instances/:id` | `workflow:instance:query` | 查询流程实例详情 |

### 任务操作

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/workflow/tasks` | `workflow:task:list` | 查询我的待办任务 |
| PUT | `/api/workflow/tasks/:id/approve` | `workflow:task:approve` | 审批通过 |
| PUT | `/api/workflow/tasks/:id/reject` | `workflow:task:reject` | 驳回任务 |

### 创建流程定义

```typescript
POST /api/workflow/definitions
{
  "name": "请假审批",
  "code": "leave_approval",
  "description": "员工请假审批流程"
}

// 响应
{ "id": "uuid" }
```

### 设置流程节点

```typescript
PUT /api/workflow/definitions/:id/nodes
{
  "nodes": [
    { "name": "部门经理审批", "type": "approve", "assigneeType": "user", "assigneeId": "user-001", "sort": 1 },
    { "name": "HR 审批", "type": "approve", "assigneeType": "user", "assigneeId": "user-002", "sort": 2 },
    { "name": "审批完成通知", "type": "notify", "sort": 3 }
  ]
}
```

节点类型：
- `start` — 开始节点（自动创建）
- `end` — 结束节点（自动创建）
- `approve` — 审批节点
- `notify` — 通知节点
- `condition` — 条件分支节点

### 启动流程实例

```typescript
POST /api/workflow/instances
{
  "definitionId": "workflow-uuid",
  "businessType": "leave",           // 可选，关联业务类型
  "businessId": "leave-001",         // 可选，关联业务 ID
  "variables": { "days": 3 }         // 可选，流程变量
}

// 响应
{ "instanceId": "uuid" }
// 注意：发起人 ID 从当前登录用户自动获取
```

### 查询我的任务

```typescript
GET /api/workflow/tasks?page=1&pageSize=10&status=0

// status: 0=待处理, 1=已通过, 2=已驳回
```

### 审批与驳回

```typescript
// 审批通过
PUT /api/workflow/tasks/:id/approve
{ "comment": "同意" }

// 驳回
PUT /api/workflow/tasks/:id/reject
{ "comment": "材料不全，请补充" }
```

## 服务接口

通过 `workflowModule.services.workflow` 访问服务：

```typescript
const svc = workflowModule.services.workflow;

// 创建流程定义
const { id } = await svc.createDefinition({
  name: '报销审批',
  code: 'expense_approval',
  description: '员工报销审批流程',
});

// 更新流程定义
await svc.updateDefinition(id, { name: '报销审批 v2', status: 1 });

// 设置节点
await svc.setNodes(id, [
  { name: '直属领导审批', type: 'approve', assigneeType: 'user', assigneeId: 'leader-001', sort: 1 },
  { name: '财务审批', type: 'approve', assigneeType: 'user', assigneeId: 'finance-001', sort: 2 },
]);

// 查询节点
const nodes = await svc.getNodes(id);

// 启动流程实例
const { instanceId } = await svc.startInstance({
  definitionId: id,
  initiatorId: 'user-001',
  businessType: 'expense',
  businessId: 'expense-001',
});

// 查询实例详情（含节点和任务）
const detail = await svc.getInstanceDetail(instanceId);

// 查询待办任务
const tasks = await svc.getMyTasks('user-001', { status: 0, page: 1, pageSize: 10 });

// 审批通过
await svc.approveTask(tasks.items[0].id, 'user-001', '同意');

// 驳回
await svc.rejectTask(tasks.items[0].id, 'user-001', '需修改');
```

## 数据模型

### sys_workflow_definition（流程定义）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 |
| name | varchar(128) | 流程名称 |
| code | varchar(64) | 流程编码 |
| version | int | 版本号，默认 1 |
| description | text | 描述（可空） |
| status | int | 状态：0=草稿, 1=启用, 2=停用 |
| created_at / updated_at | timestamp | 自动时间戳 |

### sys_workflow_node（流程节点）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 |
| definition_id | varchar(36) | 关联流程定义 ID |
| name | varchar(128) | 节点名称 |
| type | varchar(32) | 节点类型：start / end / approve / notify / condition |
| assignee_type | varchar(32) | 审批人类型（可空） |
| assignee_id | varchar(36) | 审批人 ID（可空） |
| sort | int | 排序号 |
| config | json | 节点配置（可空） |
| created_at / updated_at | timestamp | 自动时间戳 |

### sys_workflow_instance（流程实例）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 |
| definition_id | varchar(36) | 关联流程定义 ID |
| business_type | varchar(64) | 业务类型（可空） |
| business_id | varchar(36) | 业务 ID（可空） |
| initiator_id | varchar(36) | 发起人 ID |
| current_node_id | varchar(36) | 当前节点 ID（可空） |
| status | int | 状态：0=运行中, 1=已完成, 2=已驳回, 3=已取消 |
| variables | json | 流程变量（可空） |
| created_at / updated_at | timestamp | 自动时间戳 |

### sys_workflow_task（审批任务）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 |
| instance_id | varchar(36) | 关联实例 ID |
| node_id | varchar(36) | 关联节点 ID |
| assignee_id | varchar(36) | 审批人 ID |
| action | varchar(32) | 操作类型：approve / reject（可空） |
| comment | text | 审批意见（可空） |
| status | int | 状态：0=待处理, 1=已通过, 2=已驳回 |
| acted_at | timestamp | 操作时间（可空） |
| created_at / updated_at | timestamp | 自动时间戳 |
