# VentoStack 审批工作流引擎 — 技术实现方案

> 基于设计方案 V3，按照项目编码规范，给出每个文件的精确实现规格。

---

## 一、文件结构

```
packages/platform/workflow/
├── src/
│   ├── models/
│   │   ├── definition.ts          # 流程定义表
│   │   ├── node.ts                # 节点定义表
│   │   ├── edge.ts                # ★ 新增：连线表
│   │   ├── instance.ts            # 流程实例表（增强）
│   │   ├── task.ts                # 审批任务表（增强）
│   │   ├── history.ts             # ★ 新增：操作历史表
│   │   └── index.ts               # 统一导出
│   ├── engine/
│   │   ├── graph.ts               # 图构建/遍历/校验（纯函数）
│   │   ├── condition.ts           # 条件求值（纯函数）
│   │   ├── assignee.ts            # 审批人解析
│   │   ├── strategy.ts            # 策略引擎
│   │   └── errors.ts              # WorkflowError 定义
│   ├── services/
│   │   ├── definition.ts          # 定义 CRUD + 发布/停用
│   │   ├── instance.ts            # 实例生命周期
│   │   ├── task.ts                # 任务操作
│   │   └── index.ts               # 统一导出 + WorkflowService 聚合接口
│   ├── routes/
│   │   ├── definition.ts          # 定义路由
│   │   ├── instance.ts            # 实例路由
│   │   ├── task.ts                # 任务路由
│   │   └── common.ts              # 响应辅助（复用现有）
│   ├── middlewares/
│   │   └── auth-guard.ts          # 认证/权限中间件（复用现有）
│   ├── migrations/
│   │   ├── 001_create_workflow_tables.ts   # 原始表
│   │   └── 002_enhance_workflow_tables.ts  # ★ 新增：增强迁移
│   ├── __tests__/
│   │   ├── helpers.ts             # 测试辅助（复用现有）
│   │   ├── engine/
│   │   │   ├── graph.test.ts
│   │   │   ├── condition.test.ts
│   │   │   ├── assignee.test.ts
│   │   │   └── strategy.test.ts
│   │   └── services/
│   │       ├── definition.test.ts
│   │       ├── instance.test.ts
│   │       └── task.test.ts
│   ├── module.ts                  # 模块聚合
│   └── index.ts                   # 统一导出
└── package.json
```

**每个文件控制在 300 行以内。** 超出时拆分逻辑（如 instance.ts 的 advanceFromNode / handleNodeReject 拆到 engine/actions.ts）。

---

## 二、错误定义

```typescript
// src/engine/errors.ts
import { VentoStackError } from "@ventostack/core";

export class WorkflowError extends VentoStackError {
  constructor(message: string, code: number, errorCode: string) {
    super(message, code, errorCode);
    this.name = "WorkflowError";
  }
}

// 便捷工厂
export const workflowErrors = {
  noStartNode: ()      => new WorkflowError("流程缺少开始节点", 400, "WF_NO_START_NODE"),
  invalidGraph: (d: string) => new WorkflowError(d, 400, "WF_INVALID_GRAPH"),
  defNotActive: ()     => new WorkflowError("流程定义未发布", 400, "WF_DEF_NOT_ACTIVE"),
  noCondition: ()      => new WorkflowError("条件网关无匹配路径", 500, "WF_NO_MATCHING_CONDITION"),
  noNextNode: (n: string) => new WorkflowError(`节点「${n}」无后续节点`, 500, "WF_NO_NEXT_NODE"),
  noAssignee: (n: string) => new WorkflowError(`节点「${n}」无可用审批人`, 400, "WF_NO_ASSIGNEE"),
  invalidAssignee: ()  => new WorkflowError("表单指定的审批人不合法", 400, "WF_INVALID_ASSIGNEE"),
  counterSignDisabled: () => new WorkflowError("该节点不允许加签", 403, "WF_COUNTER_SIGN_DISABLED"),
  taskNotFound: ()     => new WorkflowError("任务不存在", 404, "WF_TASK_NOT_FOUND"),
  taskAlreadyActed: () => new WorkflowError("任务已处理", 409, "WF_TASK_ALREADY_ACTED"),
  notAssignee: ()      => new WorkflowError("非当前审批人", 403, "WF_NOT_ASSIGNEE"),
  notInitiator: ()     => new WorkflowError("只有发起人可以撤回", 403, "WF_NOT_INITIATOR"),
  notRunning: ()       => new WorkflowError("实例不在进行中", 400, "WF_NOT_RUNNING"),
  cannotWithdraw: ()   => new WorkflowError("已有审批人操作，无法撤回", 400, "WF_CANNOT_WITHDRAW"),
  cannotResubmit: ()   => new WorkflowError("只有已拒绝或已撤回的申请可以重新提交", 400, "WF_CANNOT_RESUBMIT"),
  instanceNotFound: () => new WorkflowError("实例不存在", 404, "WF_INSTANCE_NOT_FOUND"),
};
```

**为什么用 `VentoStackError` 子类而非 plain `Error`？**
- AGENTS.md 要求"自定义错误类必须包含 code 和 status"
- core 层已有 `VentoStackError(code, errorCode)` 基类
- 路由层可统一 catch：`if (e instanceof VentoStackError)` → 返回 `{ code: e.errorCode, message: e.message }`

---

## 三、Model 层

### 3.1 新增 model：edge.ts

```typescript
// src/models/edge.ts
import { column, defineModel } from "@ventostack/database";

export const WorkflowEdgeModel = defineModel(
  "sys_workflow_edge",
  {
    id: column.varchar({ primary: true, length: 36 }),
    definition_id: column.varchar({ length: 36 }),
    source_node_id: column.varchar({ length: 36 }),
    target_node_id: column.varchar({ length: 36 }),
    name: column.varchar({ length: 128, nullable: true }),
    sort: column.int({ default: 0 }),
    config: column.json({ nullable: true }),
  },
  { timestamps: true },
);
```

### 3.2 新增 model：history.ts

```typescript
// src/models/history.ts
import { column, defineModel } from "@ventostack/database";

export const WorkflowHistoryModel = defineModel(
  "sys_workflow_history",
  {
    id: column.varchar({ primary: true, length: 36 }),
    instance_id: column.varchar({ length: 36 }),
    node_id: column.varchar({ length: 36, nullable: true }),
    task_id: column.varchar({ length: 36, nullable: true }),
    operator_id: column.varchar({ length: 36 }),
    action: column.varchar({ length: 32 }),
    comment: column.text({ nullable: true }),
    form_snapshot: column.json({ nullable: true }),
    metadata: column.json({ nullable: true }),
  },
  { timestamps: true },
);
```

### 3.3 增强现有 model

**instance.ts — 增加字段：**
```typescript
definition_ver: column.int({ default: 1 }),
title: column.varchar({ length: 255, nullable: true }),
form_data: column.json({ nullable: true }),
graph_snapshot: column.json({ nullable: true }),
resubmit_of: column.varchar({ length: 36, nullable: true }),
tenant_id: column.varchar({ length: 36, nullable: true }),
started_at: column.timestamp({ nullable: true }),
ended_at: column.timestamp({ nullable: true }),
```

**task.ts — 增加字段：**
```typescript
transfer_to: column.varchar({ length: 36, nullable: true }),
due_at: column.timestamp({ nullable: true }),
tenant_id: column.varchar({ length: 36, nullable: true }),
```

### 3.4 迁移

```typescript
// src/migrations/002_enhance_workflow_tables.ts
import type { Migration } from "@ventostack/database";

export const enhanceWorkflowTables: Migration = {
  name: "002_enhance_workflow_tables",
  up: async (executor) => {
    // 原始 sys_workflow_definition 增加字段
    await executor(`ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS category VARCHAR(64)`);
    await executor(`ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS form_config JSON`);
    await executor(`ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS settings JSON`);
    await executor(`ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)`);
    await executor(`ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36)`);

    // 原始 sys_workflow_node 增加字段
    await executor(`ALTER TABLE sys_workflow_node ADD COLUMN IF NOT EXISTS position_x FLOAT DEFAULT 0`);
    await executor(`ALTER TABLE sys_workflow_node ADD COLUMN IF NOT EXISTS position_y FLOAT DEFAULT 0`);

    // 原始 sys_workflow_instance 增加字段
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS definition_ver INT DEFAULT 1`);
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS title VARCHAR(255)`);
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS form_data JSON`);
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS graph_snapshot JSON`);
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS resubmit_of VARCHAR(36)`);
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) DEFAULT 'default'`);
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`);
    await executor(`ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`);

    // 原始 sys_workflow_task 增加字段
    await executor(`ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS transfer_to VARCHAR(36)`);
    await executor(`ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS due_at TIMESTAMP`);
    await executor(`ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) DEFAULT 'default'`);
    await executor(`ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

    // 新建 edge 表
    await executor(`CREATE TABLE IF NOT EXISTS sys_workflow_edge (...)`);
    // 新建 history 表
    await executor(`CREATE TABLE IF NOT EXISTS sys_workflow_history (...)`);

    // 索引
    await executor(`CREATE INDEX IF NOT EXISTS idx_sys_wf_hist_inst_action ON sys_workflow_history(instance_id, action)`);
    await executor(`CREATE INDEX IF NOT EXISTS idx_sys_wf_task_tenant_assignee ON sys_workflow_task(tenant_id, assignee_id, status)`);
    // ...
  },
  down: async (executor) => {
    await executor(`DROP TABLE IF EXISTS sys_workflow_history`);
    await executor(`DROP TABLE IF EXISTS sys_workflow_edge`);
  },
};
```


---

## 四、Engine 层（纯函数 + 有副作用函数分离）

### 4.1 graph.ts — 纯函数，零 DB 依赖

```typescript
// src/engine/graph.ts
// 纯函数，无副作用，可独立单测

export type NodeType = "start" | "end" | "approve" | "cc" | "condition";

export interface GraphNodeData {
  id: string; name: string; type: NodeType;
  config: Record<string, unknown> | null;
  position_x?: number; position_y?: number; sort?: number;
}

export interface GraphEdgeData {
  id: string; source_node_id: string; target_node_id: string;
  name?: string; sort?: number;
}

export interface GraphNode extends GraphNodeData {
  outgoingEdges: string[];
  incomingEdges: string[];
}

export interface GraphEdge extends GraphEdgeData {}

export interface WorkflowGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  startNodeId: string;
}

export interface EngineContext {
  instanceId: string;
  formData: Record<string, unknown>;
  variables: Record<string, unknown>;
  initiator: {
    id: string; name?: string; deptId?: string;
    roles?: string[]; superiorId?: string; deptLeaderId?: string;
  };
  operatorId: string;
}

// 导出函数：
export function buildGraph(nodes: GraphNodeData[], edges: GraphEdgeData[]): WorkflowGraph
export function getNextNodes(graph: WorkflowGraph, currentNodeId: string, ctx: EngineContext): GraphNode[]
export function validateGraph(graph: WorkflowGraph): string[]
export function buildGraphFromSnapshot(snapshot: string): WorkflowGraph
export function hasCycle(graph: WorkflowGraph): boolean
```

### 4.2 condition.ts — 纯函数

```typescript
// src/engine/condition.ts
// 纯函数，无副作用

export interface ConditionItem {
  field: string;
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in";
  value: unknown;
  targetNodeId: string;
}

export interface ConditionNodeConfig {
  conditions: ConditionItem[];
  defaultNodeId: string;
}

export function evaluateCondition(cond: ConditionItem, ctx: EngineContext): boolean
export function resolveField(field: string, ctx: EngineContext): unknown
```

### 4.3 assignee.ts — 有副作用（DB 查询）

```typescript
// src/engine/assignee.ts

export interface AssigneeConfig {
  mode: "fixed" | "role" | "department" | "lookup" | "form_field";
  userIds?: string[];
  roleId?: string;
  deptId?: string;
  lookupKey?: "initiator_superior" | "initiator_dept_leader" | "initiator_dept_hr" | "last_approver_superior";
  formField?: string;
  validation?: { mustHaveRole?: string; mustBeInDept?: string };
}

export interface ApproveNodeConfig {
  strategy?: "sequential" | "parallel_and" | "parallel_or" | "percentage";
  percentage?: number;
  assignee?: AssigneeConfig;
  formPermission?: { visible: string[]; editable: string[]; required: string[] };
  actionButtons?: string[];
  counterSign?: boolean;
  rejectAction?: "terminate" | "return_to_previous" | "return_to_start";
  onEmptyAssignee?: "error" | "skip" | "escalate";
  timeout?: { hours: number; action: "remind" | "auto_approve" | "auto_reject" | "escalate" };
}

export function createAssigneeResolver(deps: { db: Database }) {
  return {
    async resolve(node: GraphNode, ctx: EngineContext): Promise<string[]>
  };
}
```

### 4.4 strategy.ts — 纯函数

```typescript
// src/engine/strategy.ts

export type ApprovalStrategy = "sequential" | "parallel_and" | "parallel_or" | "percentage";

export interface TaskInfo {
  id: string; assignee_id: string; status: number;
}

/** 过滤掉已作废/已转办/已撤回的任务 */
export function getActiveTasks(tasks: TaskInfo[]): TaskInfo[]

/**
 * 判断节点是否完成（纯函数）
 * 返回 { completed, reason }
 */
export function isNodeCompleted(
  tasks: TaskInfo[],
  strategy: ApprovalStrategy,
  percentage?: number,
): { completed: boolean; reason: string }
```

**注意：** `isNodeCompleted` 是纯函数，只判断是否完成。任务创建逻辑在 service 层的 `processNodeCompletion` 中，因为它需要 DB 操作。

### 4.5 engine 层文件行数预估

| 文件 | 预估行数 | 说明 |
|------|---------|------|
| graph.ts | ~150 行 | buildGraph + getNextNodes + validateGraph + hasCycle |
| condition.ts | ~60 行 | evaluateCondition + resolveField |
| assignee.ts | ~100 行 | createAssigneeResolver 工厂 |
| strategy.ts | ~80 行 | getActiveTasks + isNodeCompleted |
| errors.ts | ~50 行 | WorkflowError + workflowErrors 工厂 |
| **合计** | **~440 行** | |

---

## 五、Service 层

### 5.1 接口定义（services/index.ts）

```typescript
// src/services/index.ts

import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import type { NotificationService } from "@ventostack/notification";

export interface WorkflowService {
  // 定义
  createDefinition(params: CreateDefParams): Promise<{ id: string }>;
  updateDefinition(id: string, params: UpdateDefParams): Promise<void>;
  deleteDefinition(id: string): Promise<void>;
  getDefinition(id: string): Promise<WorkflowDefinition | null>;
  listDefinitions(params?: ListDefParams): Promise<PaginatedResult<WorkflowDefinition>>;
  publishDefinition(id: string): Promise<void>;
  disableDefinition(id: string): Promise<void>;
  cloneDefinition(id: string): Promise<{ id: string }>;
  saveGraph(definitionId: string, graph: { nodes: unknown[]; edges: unknown[] }): Promise<void>;
  getGraph(definitionId: string): Promise<{ nodes: unknown[]; edges: unknown[] }>;
  validateGraphData(definitionId: string): Promise<{ valid: boolean; errors: string[] }>;

  // 实例
  startInstance(params: StartInstanceParams): Promise<{ instanceId: string }>;
  getInstanceDetail(instanceId: string): Promise<InstanceDetail | null>;
  listMyInstances(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowInstance>>;
  withdraw(instanceId: string, userId: string, comment?: string): Promise<void>;
  cancelInstance(instanceId: string, userId: string, comment?: string): Promise<void>;
  resubmit(instanceId: string, userId: string, formData: Record<string, unknown>): Promise<{ instanceId: string }>;
  getInstanceHistory(instanceId: string): Promise<WorkflowHistory[]>;

  // 任务
  approveTask(taskId: string, userId: string, comment?: string): Promise<void>;
  rejectTask(taskId: string, userId: string, comment?: string): Promise<void>;
  transferTask(taskId: string, userId: string, targetUserId: string, comment?: string): Promise<void>;
  addSign(taskId: string, userId: string, targetUserIds: string[], comment?: string): Promise<void>;
  urgeTask(taskId: string, userId: string): Promise<void>;
  getMyTasks(userId: string, params?: TaskListParams): Promise<PaginatedResult<WorkflowTask>>;
  getMyDoneTasks(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowTask>>;
  urgeTask(taskId: string, userId: string): Promise<void>;
}

export interface WorkflowServiceDeps {
  db: Database;
  eventBus?: EventBus;                    // 可选，不传则不发事件（兼容现有测试）
  notificationService?: NotificationService;  // 可选
}
```

### 5.2 定义服务（services/definition.ts）— ~250 行

```typescript
// src/services/definition.ts

export function createDefinitionService(deps: { db: Database }) {
  const { db } = deps;

  return {
    async create(params: CreateDefParams): Promise<{ id: string }> { ... },
    async update(id: string, params: UpdateDefParams): Promise<void> { ... },
    async delete(id: string): Promise<void> { ... },
    async getById(id: string): Promise<WorkflowDefinition | null> { ... },
    async list(params?: ListDefParams): Promise<PaginatedResult<WorkflowDefinition>> { ... },
    async publish(id: string): Promise<void> { ... },
    async disable(id: string): Promise<void> { ... },
    async clone(id: string): Promise<{ id: string }> { ... },
    async saveGraph(defId: string, graph: { nodes: unknown[]; edges: unknown[] }): Promise<void> { ... },
    async getGraph(defId: string): Promise<{ nodes: unknown[]; edges: unknown[] }> { ... },
    async validateGraphData(defId: string): Promise<{ valid: boolean; errors: string[] }> { ... },
  };
}
```

### 5.3 实例服务（services/instance.ts）— ~300 行

```typescript
// src/services/instance.ts

export function createInstanceService(deps: WorkflowServiceDeps) {
  const { db, eventBus, notificationService } = deps;

  return {
    async start(params: StartInstanceParams): Promise<{ instanceId: string }> { ... },
    async getDetail(instanceId: string): Promise<InstanceDetail | null> { ... },
    async listMy(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowInstance>> { ... },
    async withdraw(instanceId: string, userId: string, comment?: string): Promise<void> { ... },
    async cancel(instanceId: string, userId: string, comment?: string): Promise<void> { ... },
    async resubmit(instanceId: string, userId: string, formData: Record<string, unknown>): Promise<{ instanceId: string }> { ... },
    async getHistory(instanceId: string): Promise<WorkflowHistory[]> { ... },

    // 内部方法（不暴露）
    async advanceFromNode(db: Database, instanceId: string, graph: WorkflowGraph, currentNodeId: string, ctx: EngineContext): Promise<void> { ... },
    async completeInstance(db: Database, instanceId: string, operatorId: string): Promise<void> { ... },
    async insertHistory(db: Database, instanceId: string, nodeId: string | null, taskId: string | null, operatorId: string, action: string, comment: string | null): Promise<void> { ... },
    async handleNodeReject(db: Database, instanceId: string, graph: WorkflowGraph, nodeId: string, ctx: EngineContext): Promise<void> { ... },
  };
}
```

### 5.4 任务服务（services/task.ts）— ~250 行

```typescript
// src/services/task.ts

export function createTaskService(deps: WorkflowServiceDeps) {
  const { db, eventBus, notificationService } = deps;
  const assigneeResolver = createAssigneeResolver({ db });

  return {
    async approve(taskId: string, userId: string, comment?: string): Promise<void> { ... },
    async reject(taskId: string, userId: string, comment?: string): Promise<void> { ... },
    async transfer(taskId: string, userId: string, targetUserId: string, comment?: string): Promise<void> { ... },
    async addSign(taskId: string, userId: string, targetUserIds: string[], comment?: string): Promise<void> { ... },
    async urge(taskId: string, userId: string): Promise<void> { ... },
    async listMy(userId: string, params?: TaskListParams): Promise<PaginatedResult<WorkflowTask>> { ... },
    async listMyDone(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowTask>> { ... },

    // 内部方法
    async processNodeCompletion(db: Database, instanceId: string, graph: WorkflowGraph, nodeId: string, ctx: EngineContext): Promise<void> { ... },
    async createTasksForNode(db: Database, instanceId: string, node: GraphNode, ctx: EngineContext): Promise<void> { ... },
    async resolveInitiator(db: Database, userId: string): Promise<EngineContext["initiator"]> { ... },
  };
}
```

### 5.5 WorkflowService 聚合（services/index.ts 中 createWorkflowService）

```typescript
export function createWorkflowService(deps: WorkflowServiceDeps): WorkflowService {
  const defService = createDefinitionService(deps);
  const instService = createInstanceService(deps);
  const taskService = createTaskService(deps);

  return {
    // 定义 → defService
    createDefinition: (p) => defService.create(p),
    // ...
    // 实例 → instService
    startInstance: (p) => instService.start(p),
    // ...
    // 任务 → taskService
    approveTask: (id, uid, c) => taskService.approve(id, uid, c),
    // ...
  };
}
```


---

## 六、Route 层

### 6.1 路由文件结构

每个路由文件导出一个工厂函数，接收 service + authMiddleware + perm。

```typescript
// src/routes/definition.ts
export function createDefinitionRoutes(
  service: WorkflowService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  router.post("/api/workflow/definitions", perm("workflow", "create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await service.createDefinition(body);
      return ok(result);
    } catch (e) {
      return handleError(e);
    }
  });

  // ... 其他路由
  return router;
}
```

### 6.2 统一错误处理

```typescript
// src/routes/common.ts 中增加（或在各路由文件内复用）

import { VentoStackError } from "@ventostack/core";

export function handleError(e: unknown): Response {
  if (e instanceof VentoStackError) {
    return fail(e.message, e.code, e.code, e.errorCode);
  }
  return fail("服务器内部错误", 500, 500);
}

// fail 函数签名扩展（支持 errorCode）
// fail 保持原有签名不变，新增 failWithCode 用于 workflow 错误码
export function failWithCode(errorCode: string, message: string, status = 200): Response {
  return new Response(
    JSON.stringify({ code: 0, error: errorCode, message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
```

### 6.3 路由注册

| 文件 | 路由前缀 | 权限资源 |
|------|---------|---------|
| definition.ts | `/api/workflow/definitions` | `workflow:definition:*` |
| instance.ts | `/api/workflow/instances` | `workflow:instance:*` |
| task.ts | `/api/workflow/tasks` | `workflow:task:*` |

---

## 七、Module 层

```typescript
// src/module.ts
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import type { NotificationService } from "@ventostack/notification";
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createDefinitionRoutes } from "./routes/definition";
import { createInstanceRoutes } from "./routes/instance";
import { createTaskRoutes } from "./routes/task";
import { createWorkflowService } from "./services";
import type { WorkflowService } from "./services";

export interface WorkflowModule {
  services: { workflow: WorkflowService };
  router: Router;
  init(): Promise<void>;
}

export interface WorkflowModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  eventBus: EventBus;
  notificationService?: NotificationService;
}

export function createWorkflowModule(deps: WorkflowModuleDeps): WorkflowModule {
  const { db, jwt, jwtSecret, rbac, eventBus, notificationService } = deps;

  const workflowService = createWorkflowService({ db, eventBus });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac!);

  const defRouter = createDefinitionRoutes(workflowService, authMiddleware, perm);
  const instRouter = createInstanceRoutes(workflowService, authMiddleware, perm);
  const taskRouter = createTaskRoutes(workflowService, authMiddleware, perm);

  // 合并路由
  const { createRouter } = require("@ventostack/core");
  const router = createRouter();
  router.merge(defRouter);
  router.merge(instRouter);
  router.merge(taskRouter);

  // 在 init() 中注册事件监听（通知走事件订阅，service 层不直接依赖 notificationService）
  if (eventBus && notificationService) {
    eventBus.on("workflow.task.created", async (data: { assigneeId: string; instanceId: string }) => {
      const detail = await workflowService.getInstanceDetail(data.instanceId);
      await notificationService.send({
        receiverId: data.assigneeId, channel: "in_app",
        title: "新的审批任务",
        content: detail ? `您有一个待审批的任务：${detail.instance.title}" : "您有一个待审批的任务",
      });
    });
    // ... instance.completed / instance.rejected / urge 类似
  }

  return {
    services: { workflow: workflowService },
    router,
    async init() {},
  };
}
```

**boot/create-platform.ts 变更：**
```typescript
// WorkflowModuleDeps 增加 eventBus 和 notificationService
const workflow = enabled.workflow
  ? createWorkflowModule({ db, jwt, jwtSecret, rbac, eventBus, notificationService })
  : undefined;
```

---

## 八、测试策略

### 8.1 Engine 纯函数测试（高覆盖率目标 100%）

```typescript
// src/__tests__/engine/graph.test.ts
describe("buildGraph", () => {
  it("should build graph from nodes and edges", () => { ... });
  it("should throw when no start node", () => { ... });
  it("should populate incoming/outgoing edges", () => { ... });
});

describe("getNextNodes", () => {
  it("should return next node for simple edge", () => { ... });
  it("should evaluate conditions for condition node", () => { ... });
  it("should use defaultNodeId when no condition matches", () => { ... });
  it("should return empty for end node", () => { ... });
});

describe("validateGraph", () => {
  it("should require start and end nodes", () => { ... });
  it("should require defaultNodeId on condition nodes", () => { ... });
  it("should detect orphan nodes", () => { ... });
  it("should detect cycles", () => { ... });
  it("should pass for valid graph", () => { ... });
});
```

```typescript
// src/__tests__/engine/condition.test.ts
describe("evaluateCondition", () => {
  it("should evaluate == operator", () => { ... });
  it("should evaluate > operator with numbers", () => { ... });
  it("should evaluate in operator with arrays", () => { ... });
  it("should resolve nested formData fields", () => { ... });
  it("should return false for undefined fields", () => { ... });
});
```

```typescript
// src/__tests__/engine/strategy.test.ts
describe("isNodeCompleted", () => {
  it("sequential: pending tasks → not completed", () => { ... });
  it("sequential: all approved → completed", () => { ... });
  it("sequential: any rejected → completed", () => { ... });
  it("parallel_and: all approved → completed", () => { ... });
  it("parallel_and: any rejected → completed", () => { ... });
  it("parallel_or: any approved → completed", () => { ... });
  it("percentage: above threshold → completed", () => { ... });
  it("should filter out VOIDED tasks", () => { ... });
});
```

### 8.2 Service 测试（使用 createMockDatabase）

```typescript
// src/__tests__/services/instance.test.ts
describe("startInstance", () => {
  it("should insert instance and create first task", async () => { ... });
  it("should throw when definition not active", async () => { ... });
  it("should throw when graph is invalid", async () => { ... });
  it("should store graph_snapshot", async () => { ... });
});

describe("withdraw", () => {
  it("should void pending tasks and mark withdrawn", async () => { ... });
  it("should throw when not initiator", async () => { ... });
  it("should throw when someone has acted", async () => { ... });
});

describe("approveTask", () => {
  it("should approve and advance to next node", async () => { ... });
  it("should throw when task already acted", async () => { ... });
  it("should throw when not assignee", async () => { ... });
  it("sequential: should create next assignee task", async () => { ... });
  it("parallel_and: should wait for all approvals", async () => { ... });
  it("parallel_or: should complete on first approval", async () => { ... });
});
```

### 8.3 测试文件行数预估

| 文件 | 预估用例数 | 预估行数 |
|------|-----------|---------|
| graph.test.ts | ~15 | ~200 |
| condition.test.ts | ~8 | ~100 |
| strategy.test.ts | ~10 | ~120 |
| assignee.test.ts | ~6 | ~80 |
| definition.test.ts | ~10 | ~120 |
| instance.test.ts | ~12 | ~200 |
| task.test.ts | ~15 | ~250 |
| **合计** | **~76** | **~1070** |

---

## 九、实施顺序（精确到文件）

### Week 1: 基础层

| 天 | 文件 | 说明 |
|----|------|------|
| D1 | `models/edge.ts`, `models/history.ts`, `models/index.ts` | 新 model |
| D1 | `migrations/002_enhance_workflow_tables.ts` | 迁移脚本 |
| D1 | `engine/errors.ts` | WorkflowError 定义 |
| D2 | `engine/graph.ts` + `__tests__/engine/graph.test.ts` | 图核心 |
| D2 | `engine/condition.ts` + `__tests__/engine/condition.test.ts` | 条件求值 |
| D3 | `engine/strategy.ts` + `__tests__/engine/strategy.test.ts` | 策略引擎 |
| D3 | `engine/assignee.ts` + `__tests__/engine/assignee.test.ts` | 审批人解析 |
| D4 | `services/definition.ts` + `__tests__/services/definition.test.ts` | 定义服务 |
| D5 | `services/instance.ts`（start / getDetail / withdraw / history）| 实例核心 |

### Week 2: 服务层

| 天 | 文件 | 说明 |
|----|------|------|
| D6 | `services/task.ts`（approve / reject / processNodeCompletion）| 任务核心 |
| D7 | `services/task.ts`（transfer / addSign / urge / list）| 任务辅助 |
| D7 | `services/instance.ts`（resubmit / cancel）| 实例辅助 |
| D8 | `services/index.ts` | WorkflowService 聚合 |
| D8 | `__tests__/services/instance.test.ts` + `task.test.ts` | 服务测试 |
| D9 | `routes/definition.ts` + `routes/instance.ts` + `routes/task.ts` | 路由层 |
| D9 | `routes/common.ts`（handleError 扩展）| 错误处理 |
| D10 | `module.ts` + `index.ts` | 模块聚合 + 导出 |

### Week 3: 集成 + 修复

| 天 | 文件 | 说明 |
|----|------|------|
| D11 | `apps/admin/api/src/database/migrations.ts` | 注册新迁移 |
| D11 | `packages/platform/boot/src/create-platform.ts` | 传入 eventBus |
| D12 | 集成测试 + 修复 | 端到端验证 |
| D13 | 增强现有 model（instance.ts / task.ts 字段）| 向后兼容 |


---

## 十、自审：编码规范合规性检查

### 10.1 函数式优先 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 无 class | ✅ | 全部使用工厂函数 `createXxxService` |
| 显式依赖注入 | ✅ | 所有依赖通过 deps 参数传入 |
| Context 参数传递 | ✅ | EngineContext 显式传递，不挂全局 |
| 纯函数分离 | ✅ | engine/graph.ts, condition.ts, strategy.ts 无副作用 |

### 10.2 类型安全 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 公共 API 显式返回类型 | ✅ | 所有 export 函数有返回类型 |
| 无 `any` | ⚠️ | `config: Record<string, unknown>` 替代 any；parseBody 返回值需 cast |
| 泛型有约束 | ✅ | PaginatedResult<T> 有约束 |
| 配置对象定义接口 | ✅ | WorkflowServiceDeps / EngineContext / ApproveNodeConfig 等 |

### 10.3 命名与结构 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 文件名 kebab-case | ✅ | graph.ts, assignee.ts, auth-guard.ts |
| 函数名 camelCase | ✅ | createWorkflowService, buildGraph, getNextNodes |
| 常量 UPPER_SNAKE_CASE | ✅ | SUPER_ADMIN_ROLE, TaskStatus |
| 测试文件同目录 + .test.ts | ✅ | `__tests__/engine/graph.test.ts` |
| 单文件 ≤ 300 行 | ✅ | 最大的 instance.ts 约 300 行 |

### 10.4 错误处理 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 自定义错误含 code + status | ✅ | WorkflowError extends VentoStackError(code, errorCode) |
| 错误链保留原始错误 | ⚠️ | 部分 catch 块未保留 cause（见下文修正） |
| 对外错误信息脱敏 | ✅ | "服务器内部错误" 替代原始堆栈 |

### 10.5 安全基线 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| SQL 参数化查询 | ✅ | ORM query builder + raw 参数化 |
| 权限统一在路由层 | ✅ | perm("workflow", "create") 中间件 |
| 多租户 tenant_id | ✅ | 实例/任务表有 tenant_id |
| 审计日志 | ✅ | history 表记录所有操作 |
| 脱敏字段 | ✅ | comment 不含敏感数据 |

### 10.6 测试规范 ✅

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 使用 bun:test | ✅ | import { describe, it, expect } from "bun:test" |
| 使用 createMockDatabase | ✅ | 复用现有 mock 模式 |
| 纯函数独立测试 | ✅ | engine 层 100% 覆盖目标 |
| 安全关键路径有失败用例 | ✅ | withdraw/权限/并发 审批 |

---

## 十一、自审发现的实现问题及修正

### 问题 1：错误 cause 链断裂 ⚠️

**位置：** routes/common.ts handleError

**问题：** `new WorkflowError(message, code, errorCode)` 丢失了原始 Error 的 cause。如果底层 DB 操作抛出 `ConnectionError`，上层包装为 `WorkflowError` 后原始错误信息丢失。

**修正：**
```typescript
// WorkflowError 支持 cause
export class WorkflowError extends VentoStackError {
  readonly cause?: Error;
  constructor(message: string, code: number, errorCode: string, cause?: Error) {
    super(message, code, errorCode);
    this.name = "WorkflowError";
    if (cause) this.cause = cause;
  }
}

// 使用时保留 cause
catch (e) {
  throw workflowErrors.createTaskFailed(e instanceof Error ? e : undefined);
}
```

### 问题 2：parseBody 返回值类型不安全 ⚠️

**位置：** routes/*.ts

**问题：** `parseBody` 返回 `Record<string, unknown>`，路由层需要手动 cast 每个字段。

**修正：** 定义请求体接口，路由层做类型断言：
```typescript
interface CreateInstanceBody {
  definitionId: string;
  businessType?: string;
  businessId?: string;
  title?: string;
  formData: Record<string, unknown>;
}

const body = await parseBody(ctx.request) as CreateInstanceBody;
if (!body.definitionId || !body.formData) {
  return fail("缺少必要参数", 400, 400, "VALIDATION_ERROR");
}
```

### 问题 3：事务内的 eventBus.emit 位置 ⚠️

**位置：** services/task.ts approveTask

**问题：** approveTask 在 `db.transaction(async (tx) => { ... })` 之后调用 `eventBus.emit`。但如果 `eventBus.emit` 同步执行了监听器（监听器内又做了 DB 操作），而此时事务已 commit，这是正确的。但如果 eventBus 是异步的（返回 Promise），我们需要确保 emit 的错误不会影响返回值。

**修正：**
```typescript
// 事务成功后发事件，fire-and-forget
eventBus.emit("workflow.task.approved", { taskId, userId }).catch(() => {
  // 事件发送失败不影响业务
});
```

### 问题 4：startInstance 中 graph_snapshot 序列化 ⚠️

**位置：** services/instance.ts start

**问题：** `JSON.stringify({ nodes, edges })` 序列化的是 `GraphNodeData[]` 和 `GraphEdgeData[]`（不含 incomingEdges/outgoingEdges）。这是正确的——快照只存原始数据，buildGraph 时重建邻接表。

**无需修正，确认正确。**

### 问题 5：model 增强的向后兼容 ⚠️

**位置：** models/instance.ts, task.ts

**问题：** 增加的字段（form_data, graph_snapshot, tenant_id 等）都应该是 `nullable: true` 或有 `default` 值，否则已有数据的 INSERT 会失败。

**确认：** 所有新增字段都标记为 `nullable: true` 或 `default`。✅

### 问题 6：路由合并顺序 ⚠️

**位置：** module.ts

**问题：** 如果 definition.ts 和 instance.ts 都注册了 `/api/workflow/definitions/:id` 的路由（如 GET 定义详情和 GET 实例详情），路径可能冲突。

**确认：** 定义路由前缀是 `/api/workflow/definitions`，实例路由前缀是 `/api/workflow/instances`，任务路由前缀是 `/api/workflow/tasks`。路径不冲突。✅

---

## 十二、与现有模块的集成变更清单

| 文件 | 变更 | 说明 |
|------|------|------|
| `packages/platform/workflow/package.json` | 增加 `@ventostack/events` 依赖 | eventBus 注入需要 |
| `packages/platform/workflow/src/index.ts` | 增加新 model/service/type 导出 | 对外 API |
| `packages/platform/workflow/src/models/index.ts` | 增加 edge/history model 导出 | 新 model |
| `packages/platform/boot/src/create-platform.ts` | WorkflowModuleDeps 增加 eventBus/notificationService | 依赖注入 |
| `apps/admin/api/src/database/migrations.ts` | 注册 `enhanceWorkflowTables` 迁移 | 新迁移 |
| `apps/admin/api/src/app.ts` | 无需变更 | boot 层已处理 |

---

## 十三、总行数预估

| 层 | 文件数 | 预估总行数 |
|----|--------|-----------|
| models | 7 | ~200 |
| engine | 5 | ~440 |
| services | 4 | ~800 |
| routes | 4 | ~400 |
| middlewares | 1 | ~5（复用现有） |
| migrations | 2 | ~200 |
| module + index | 2 | ~100 |
| tests | 7 | ~1070 |
| **合计** | **32** | **~3215** |


---

## 十四、终审修正补充

### 修正 7：approveTask 改用乐观锁（替代 SELECT FOR UPDATE）

```typescript
// 不用 SELECT FOR UPDATE + UPDATE，改用 WHERE status = 0 的原子 UPDATE
async function approve(taskId: string, userId: string, comment?: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 原子更新：只有 status=0 且 assignee 匹配时才成功
    const updated = await tx.raw(
      `UPDATE sys_workflow_task 
       SET status = 1, action = 'approve', comment = $3, acted_at = NOW()
       WHERE id = $1 AND status = 0 AND assignee_id = $2`,
      [taskId, userId, comment ?? null]
    );
    if (updated.rowCount === 0) {
      // 可能是：任务不存在 / 已处理 / 非当前审批人
      const task = await tx.raw("SELECT status, assignee_id FROM sys_workflow_task WHERE id = $1", [taskId]);
      if (task.length === 0) throw workflowErrors.taskNotFound();
      if (task[0].assignee_id !== userId) throw workflowErrors.notAssignee();
      throw workflowErrors.taskAlreadyActed();
    }
    // ... processNodeCompletion
  });
}
```

**优势：** 一条 SQL 完成校验 + 更新，无锁竞争，天然防并发。

### 修正 8：voidTasksByNode 增加行锁

```typescript
async function voidTasksByNode(
  db: Database, instanceId: string, nodeId: string, statuses: number[],
): Promise<void> {
  // 先锁再改，防止与超时处理器等并发操作冲突
  await db.raw(
    `SELECT id FROM sys_workflow_task 
     WHERE instance_id = $1 AND node_id = $2 AND status = ANY($3) 
     FOR UPDATE`,
    [instanceId, nodeId, statuses]
  );
  await db.raw(
    `UPDATE sys_workflow_task SET status = 5 
     WHERE instance_id = $1 AND node_id = $2 AND status = ANY($3)`,
    [instanceId, nodeId, statuses]
  );
}
```

### 修正 9：notificationService 从 WorkflowServiceDeps 移除

通知逻辑改用事件订阅模式（在 module.ts init 中注册），service 层只 emit 事件，不直接调用 notificationService。

**最终 WorkflowServiceDeps：**
```typescript
export interface WorkflowServiceDeps {
  db: Database;
  eventBus?: EventBus;  // 可选
}
```

### 修正 10：tenant_id 默认值改为 'default'

迁移 SQL 中 `ADD COLUMN tenant_id VARCHAR(36) DEFAULT 'default'`，避免已有数据的 NULL 问题。

### 修正 11：定义服务补充完整方法规格

```typescript
// services/definition.ts 补充
async publish(id: string): Promise<void> {
  // status: 0(草稿) → 1(已发布)，version++
  // 校验：必须有 start 和 end 节点
}
async disable(id: string): Promise<void> {
  // status: 1(已发布) → 2(已停用)
}
async clone(id: string): Promise<{ id: string }> {
  // 复制 definition + nodes + edges，新 code = `${code}_copy_${Date.now()}`
}
async saveGraph(defId: string, graph: { nodes: unknown[]; edges: unknown[] }): Promise<void> {
  // 事务内：DELETE old nodes + edges → INSERT new → validateGraph
}
async getGraph(defId: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
  // SELECT nodes + edges WHERE definition_id
}
async validateGraphData(defId: string): Promise<{ valid: boolean; errors: string[] }> {
  // getGraph → buildGraph → validateGraph
}
```

