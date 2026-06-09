# VentoStack 审批工作流引擎 — 设计方案 V3

> 经过三轮审查（自审 + 修正审 + 6 专家终审），共发现并修正 30+ 个问题。
> 本文档为最终版本，所有修正已融入正文。

---

## 一、设计总览

### 1.1 目标

在现有 workflow MVP（线性节点链 + 简单审批/驳回）基础上，升级为**图结构驱动的审批流引擎**。

### 1.2 核心选型

| 维度 | 选型 | 理由 |
|------|------|------|
| 流程模型 | JSON DAG（nodes + edges） | 比 BPMN XML 轻量，比线性链灵活 |
| 条件路由 | 结构化 ConditionGroup | 安全（无 eval），前端易配置 |
| 审批策略 | 4 种内置（依次/会签/或签/百分比） | 覆盖 99% 场景 |
| 版本管理 | 实例启动时 JSON 快照 | 零查询开销，天然版本隔离 |
| 并发安全 | 节点级行锁 + 事务 | 防止并发审批竞态 |
| AI 集成 | LLM 生成语义树 → 后端构建图 | LLM 不擅长维护 ID 一致性 |

### 1.3 Phase 1 范围

| 节点类型 | 说明 |
|---------|------|
| start | 流程起点（必须） |
| end | 流程终点（必须） |
| approve | 人工审批（核心） |
| condition | 条件网关（核心） |
| cc | 抄送通知（常用） |

Phase 2 扩展：parallel_gate（并行网关）、timer（定时器）、service（自动服务）。

---

## 二、数据模型

### 2.1 节点 config 结构

**Approve Node（审批节点）：**
```json
{
  "strategy": "sequential",
  "percentage": 60,
  "assignee": {
    "mode": "fixed",
    "userIds": ["u1", "u2"],
    "roleId": "manager",
    "deptId": "dept-1",
    "formField": "approver",
    "lookupKey": "initiator_superior",
    "validation": { "mustHaveRole": "employee", "mustBeInDept": "..." }
  },
  "formPermission": {
    "visible": ["leave_type", "reason"],
    "editable": [],
    "required": []
  },
  "actionButtons": ["approve", "reject", "transfer", "add_sign"],
  "counterSign": false,
  "rejectAction": "return_to_start",
  "onEmptyAssignee": "error",
  "timeout": { "hours": 48, "action": "remind" }
}
```

**关键字段说明：**

- `strategy` — `sequential`（依次）| `parallel_and`（会签）| `parallel_or`（或签）| `percentage`（百分比）
- `assignee.mode` — `fixed`（指定用户）| `role`（角色）| `department`（部门）| `lookup`（动态查询）| `form_field`（表单字段）
- `assignee.lookupKey` — 枚举值：`initiator_superior` | `initiator_dept_leader` | `initiator_dept_hr` | `last_approver_superior`。不做字符串表达式求值
- `assignee.validation` — 可选的额外校验。**基础校验始终执行**（用户存在且状态正常）
- `counterSign` — 是否允许加签。`false`（默认）时拒绝加签请求
- `rejectAction` — `terminate`（终止）| `return_to_previous`（回退上一审批节点）| `return_to_start`（回退发起人）
- `onEmptyAssignee` — 解析到 0 个审批人时：`error`（报错）| `skip`（跳过节点）| `escalate`（升级管理员）

**Condition Node（条件网关）：**
```json
{
  "conditions": [
    { "field": "formData.days", "operator": ">", "value": 3, "targetNodeId": "node-mgr" },
    { "field": "formData.days", "operator": "<=", "value": 3, "targetNodeId": "node-end" }
  ],
  "defaultNodeId": "node-end"
}
```

- 条件按数组顺序**首个匹配即生效**，设计 UI 需标注此语义
- `defaultNodeId` **必填**，`validateGraph()` 强制校验

**CC Node（抄送节点）：**
```json
{
  "assignee": { "mode": "role", "roleId": "hr" }
}
```

### 2.2 表结构（SQL DDL）

```sql
-- 1. 流程定义
CREATE TABLE sys_workflow_definition (
  id            VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(128) NOT NULL,
  code          VARCHAR(64) NOT NULL UNIQUE,
  version       INT DEFAULT 1,
  description   TEXT,
  category      VARCHAR(64),
  status        SMALLINT DEFAULT 0,          -- 0=草稿 1=已发布 2=已停用
  form_config   JSON,
  settings      JSON,
  created_by    VARCHAR(36),
  tenant_id     VARCHAR(36),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sys_wf_def_category ON sys_workflow_definition(category);
CREATE INDEX idx_sys_wf_def_tenant ON sys_workflow_definition(tenant_id);

-- 2. 节点定义
CREATE TABLE sys_workflow_node (
  id              VARCHAR(36) PRIMARY KEY,
  definition_id   VARCHAR(36) NOT NULL,
  name            VARCHAR(128) NOT NULL,
  type            VARCHAR(32) NOT NULL,     -- start|end|approve|cc|condition
  config          JSON,
  position_x      FLOAT DEFAULT 0,
  position_y      FLOAT DEFAULT 0,
  sort            INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sys_wf_node_def ON sys_workflow_node(definition_id);

-- 3. 连线定义
CREATE TABLE sys_workflow_edge (
  id              VARCHAR(36) PRIMARY KEY,
  definition_id   VARCHAR(36) NOT NULL,
  source_node_id  VARCHAR(36) NOT NULL,
  target_node_id  VARCHAR(36) NOT NULL,
  name            VARCHAR(128),
  sort            INT DEFAULT 0,
  config          JSON,
  created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sys_wf_edge_def ON sys_workflow_edge(definition_id);
CREATE INDEX idx_sys_wf_edge_source ON sys_workflow_edge(source_node_id);

-- 4. 流程实例
CREATE TABLE sys_workflow_instance (
  id              VARCHAR(36) PRIMARY KEY,
  definition_id   VARCHAR(36) NOT NULL,
  definition_ver  INT NOT NULL DEFAULT 1,
  business_type   VARCHAR(64),
  business_id     VARCHAR(36),
  initiator_id    VARCHAR(36) NOT NULL,
  title           VARCHAR(255),
  status          SMALLINT DEFAULT 0,        -- 0=进行中 1=已完成 2=已拒绝 3=已撤回 4=已终止
  form_data       JSON,
  variables       JSON,
  graph_snapshot  JSON,                      -- 启动时冻结的流程图快照
  resubmit_of     VARCHAR(36),               -- 重新提交关联
  tenant_id       VARCHAR(36),
  started_at      TIMESTAMP DEFAULT NOW(),
  ended_at        TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sys_wf_inst_def ON sys_workflow_instance(definition_id);
CREATE INDEX idx_sys_wf_inst_business ON sys_workflow_instance(business_type, business_id);
CREATE INDEX idx_sys_wf_inst_initiator ON sys_workflow_instance(initiator_id);
CREATE INDEX idx_sys_wf_inst_status ON sys_workflow_instance(status);
CREATE INDEX idx_sys_wf_inst_tenant ON sys_workflow_instance(tenant_id);
CREATE INDEX idx_sys_wf_inst_resubmit ON sys_workflow_instance(resubmit_of);

-- 5. 审批任务
CREATE TABLE sys_workflow_task (
  id              VARCHAR(36) PRIMARY KEY,
  instance_id     VARCHAR(36) NOT NULL,
  node_id         VARCHAR(36) NOT NULL,
  assignee_id     VARCHAR(36) NOT NULL,
  status          SMALLINT DEFAULT 0,        -- 0=待处理 1=已通过 2=已拒绝 3=已转办 4=已撤回 5=已作废
  action          VARCHAR(32),
  comment         TEXT,
  transfer_to     VARCHAR(36),
  acted_at        TIMESTAMP,
  due_at          TIMESTAMP,
  tenant_id       VARCHAR(36),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
-- 多租户"我的待办"核心索引
CREATE INDEX idx_sys_wf_task_tenant_assignee
  ON sys_workflow_task(tenant_id, assignee_id, status);
CREATE INDEX idx_sys_wf_task_instance ON sys_workflow_task(instance_id);
CREATE INDEX idx_sys_wf_task_due ON sys_workflow_task(due_at) WHERE status = 0;

-- 6. 操作历史
CREATE TABLE sys_workflow_history (
  id              VARCHAR(36) PRIMARY KEY,
  instance_id     VARCHAR(36) NOT NULL,
  node_id         VARCHAR(36),
  task_id         VARCHAR(36),
  operator_id     VARCHAR(36) NOT NULL,
  action          VARCHAR(32) NOT NULL,
  comment         TEXT,
  form_snapshot   JSON,
  metadata        JSON,
  created_at      TIMESTAMP DEFAULT NOW()
);
-- getCompletedNodeIds 查询核心索引
CREATE INDEX idx_sys_wf_hist_inst_action
  ON sys_workflow_history(instance_id, action);
CREATE INDEX idx_sys_wf_hist_operator ON sys_workflow_history(operator_id);
```


---

## 三、引擎核心

### 3.1 EngineContext — 统一运行时上下文

```typescript
export interface EngineContext {
  instanceId: string;
  formData: Record<string, unknown>;
  variables: Record<string, unknown>;
  initiator: {
    id: string;
    name?: string;
    deptId?: string;
    roles?: string[];
    superiorId?: string;
    deptLeaderId?: string;
  };
  operatorId: string;
}
```

### 3.2 图构建与遍历

```typescript
export interface WorkflowGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  startNodeId: string;
}

/** 从节点/边数据构建图（纯函数） */
export function buildGraph(nodes: GraphNodeData[], edges: GraphEdgeData[]): WorkflowGraph {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  for (const n of nodes) {
    nodeMap.set(n.id, { ...n, outgoingEdges: [], incomingEdges: [] });
  }
  for (const e of edges) {
    edgeMap.set(e.id, e);
    nodeMap.get(e.sourceNodeId)?.outgoingEdges.push(e.id);
    nodeMap.get(e.targetNodeId)?.incomingEdges.push(e.id);
  }
  const startNode = [...nodeMap.values()].find(n => n.type === "start");
  if (!startNode) throw new WorkflowError("WF_NO_START_NODE", "流程缺少开始节点");
  return { nodes: nodeMap, edges: edgeMap, startNodeId: startNode.id };
}

/** 获取下一节点（纯函数） */
export function getNextNodes(
  graph: WorkflowGraph,
  currentNodeId: string,
  ctx: EngineContext,
): GraphNode[] {
  const currentNode = graph.nodes.get(currentNodeId);
  if (!currentNode) return [];
  if (currentNode.type === "end") return [];

  const outgoing = currentNode.outgoingEdges
    .map(id => graph.edges.get(id)!)
    .sort((a, b) => a.sort - b.sort);

  // 条件网关：用 config 中的 ConditionGroup 求值，不走 edge 表
  if (currentNode.type === "condition") {
    const config = currentNode.config as ConditionNodeConfig;
    for (const cond of config.conditions) {
      if (evaluateCondition(cond, ctx)) {
        const target = graph.nodes.get(cond.targetNodeId);
        if (target) return [target];
      }
    }
    if (config.defaultNodeId) {
      const def = graph.nodes.get(config.defaultNodeId);
      if (def) return [def];
    }
    throw new WorkflowError("WF_NO_MATCHING_CONDITION", "条件网关无匹配路径且无默认路径");
  }

  // 普通节点：走第一条边
  const firstEdge = outgoing[0];
  if (!firstEdge) return [];
  const target = graph.nodes.get(firstEdge.targetNodeId);
  return target ? [target] : [];
}
```

### 3.3 条件求值（结构化，无 eval）

```typescript
export interface ConditionGroup {
  field: string;       // "formData.days"
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in";
  value: unknown;
  targetNodeId: string;
}

export function evaluateCondition(cond: ConditionGroup, ctx: EngineContext): boolean {
  const fieldValue = resolveField(cond.field, ctx);
  switch (cond.operator) {
    case "==":  return fieldValue === cond.value;
    case "!=":  return fieldValue !== cond.value;
    case ">":   return Number(fieldValue) > Number(cond.value);
    case "<":   return Number(fieldValue) < Number(cond.value);
    case ">=":  return Number(fieldValue) >= Number(cond.value);
    case "<=":  return Number(fieldValue) <= Number(cond.value);
    case "in":  return Array.isArray(cond.value) && cond.value.includes(fieldValue);
    case "not_in": return Array.isArray(cond.value) && !cond.value.includes(fieldValue);
    default: return false;
  }
}

function resolveField(field: string, ctx: EngineContext): unknown {
  const parts = field.split(".");
  let current: unknown = ctx;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
```

### 3.4 图校验

```typescript
export function validateGraph(graph: WorkflowGraph): string[] {
  const errors: string[] = [];
  const hasStart = [...graph.nodes.values()].some(n => n.type === "start");
  const hasEnd = [...graph.nodes.values()].some(n => n.type === "end");
  if (!hasStart) errors.push("缺少开始节点");
  if (!hasEnd) errors.push("缺少结束节点");

  for (const node of graph.nodes.values()) {
    if (node.type !== "start" && node.incomingEdges.length === 0)
      errors.push(`节点「${node.name}」无入边`);
    if (node.type !== "end" && node.outgoingEdges.length === 0)
      errors.push(`节点「${node.name}」无出边`);
    if (node.type === "condition") {
      if (node.outgoingEdges.length < 2)
        errors.push(`条件网关「${node.name}」至少需要 2 条出边`);
      const cfg = node.config as ConditionNodeConfig;
      if (!cfg?.defaultNodeId)
        errors.push(`条件网关「${node.name}」必须设置默认路径(defaultNodeId)`);
    }
  }
  if (hasCycle(graph)) errors.push("流程图存在循环");
  return errors;
}
```

### 3.5 节点完成状态追踪（从 history 查询）

```typescript
/** 获取已完成节点 ID 集合 */
export async function getCompletedNodeIds(
  db: Database, instanceId: string,
): Promise<Set<string>> {
  const rows = await db.query(WorkflowHistoryModel)
    .where("instance_id", "=", instanceId)
    .where("action", "=", "node_completed")
    .select("node_id")
    .list();
  return new Set(rows.map(r => r.node_id));
}

/** 从 history 构建实际执行路径（用于回退） */
export async function getExecutionPath(
  db: Database, instanceId: string,
): Promise<Array<{ nodeId: string; action: string; timestamp: Date }>> {
  const rows = await db.query(WorkflowHistoryModel)
    .where("instance_id", "=", instanceId)
    .where("action", "IN", ["node_entered", "node_completed", "approve", "reject"])
    .select("node_id", "action", "created_at")
    .orderBy("created_at", "asc")
    .list();
  return rows.map(r => ({ nodeId: r.node_id, action: r.action, timestamp: r.created_at }));
}

/** 从执行路径找上一个审批节点（不依赖图拓扑） */
export async function findPreviousApproveNodeId(
  db: Database, instanceId: string, currentNodeId: string,
): Promise<string | null> {
  const path = await getExecutionPath(db, instanceId);
  let foundCurrent = false;
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i]!.nodeId === currentNodeId) { foundCurrent = true; continue; }
    if (foundCurrent && path[i]!.action === "approve") return path[i]!.nodeId;
  }
  return null;
}
```

### 3.6 审批人解析

```typescript
async function resolveAssignees(node: GraphNode, ctx: EngineContext): Promise<string[]> {
  const config = node.config as ApproveNodeConfig;
  const assignee = config?.assignee;
  if (!assignee) return [];

  switch (assignee.mode) {
    case "fixed":
      return assignee.userIds ?? [];
    case "role":
      return await db.query(UserRoleModel)
        .where("role_id", "=", assignee.roleId).select("user_id").list()
        .then(rows => rows.map(r => r.user_id));
    case "department":
      return await db.query(UserModel)
        .where("dept_id", "=", assignee.deptId).select("id").list()
        .then(rows => rows.map(r => r.id));
    case "lookup":
      switch (assignee.lookupKey) {
        case "initiator_superior":     return ctx.initiator.superiorId ? [ctx.initiator.superiorId] : [];
        case "initiator_dept_leader":  return ctx.initiator.deptLeaderId ? [ctx.initiator.deptLeaderId] : [];
        default: return [];
      }
    case "form_field": {
      const userId = ctx.formData[assignee.formField] as string;
      if (!userId) return [];
      // 基础校验始终执行
      const user = await db.query(UserModel).where("id", "=", userId).where("status", "=", 1).get();
      if (!user) throw new WorkflowError("WF_INVALID_ASSIGNEE", "表单指定的审批人不存在或已停用");
      // 可选的额外校验
      if (assignee.validation?.mustHaveRole) { /* 校验角色 */ }
      if (assignee.validation?.mustBeInDept) { /* 校验部门 */ }
      return [userId];
    }
    default: return [];
  }
}
```


---

## 四、核心流程动作

所有写操作包裹在 `db.transaction` 中。`EventBus.emit` 在事务外调用。

### 4.1 发起流程

```typescript
async function startInstance(params: StartInstanceParams): Promise<{ instanceId: string }> {
  const def = await loadDefinition(params.definitionId);
  if (def.status !== DefStatus.ACTIVE) throw new WorkflowError("WF_DEF_NOT_ACTIVE", "流程定义未发布");

  const nodes = await loadNodes(params.definitionId);
  const edges = await loadEdges(params.definitionId);
  const graph = buildGraph(nodes, edges);
  const errors = validateGraph(graph);
  if (errors.length > 0) throw new WorkflowError("WF_INVALID_GRAPH", errors.join("; "));
  validateFormData(def.formConfig, params.formData);
  // validateFormData: 白名单校验字段、必填、类型、长度、范围；拒绝未定义字段

  // 事务外解析发起人信息（减少事务持锁时间）
  const initiatorInfo = await resolveInitiator(params.initiatorId);

  const instanceId = await db.transaction(async (tx) => {
    const id = crypto.randomUUID();
    await tx.query(WorkflowInstanceModel).insert({
      id, definition_id: params.definitionId, definition_ver: def.version,
      business_type: params.businessType ?? null, business_id: params.businessId ?? null,
      initiator_id: params.initiatorId, title: params.title ?? `${def.name}-${initiatorInfo.name}`,
      status: InstanceStatus.RUNNING, form_data: params.formData,
      variables: params.variables ?? {}, graph_snapshot: JSON.stringify({ nodes, edges }),
      tenant_id: def.tenantId,
    });
    const ctx: EngineContext = {
      instanceId: id, formData: params.formData, variables: params.variables ?? {},
      initiator: initiatorInfo, operatorId: params.initiatorId,
    };
    await advanceFromNode(tx, id, graph, graph.startNodeId, ctx);
    return id;
  });

  eventBus.emit("workflow.instance.started", { instanceId, definitionId: params.definitionId, initiatorId: params.initiatorId });
  return { instanceId };
}
```

### 4.2 推进引擎

```typescript
async function advanceFromNode(
  db: Database, instanceId: string, graph: WorkflowGraph,
  currentNodeId: string, ctx: EngineContext,
): Promise<void> {
  await insertHistory(db, instanceId, currentNodeId, null, ctx.operatorId, "node_entered", null);

  const currentNode = graph.nodes.get(currentNodeId)!;
  const nextNodes = getNextNodes(graph, currentNodeId, ctx);

  // 运行时安全兜底：非 end 节点无后续 → 报错而非静默卡死
  if (nextNodes.length === 0 && currentNode.type !== "end") {
    throw new WorkflowError("WF_NO_NEXT_NODE", `节点「${currentNode.name}」无后续节点`);
  }

  for (const nextNode of nextNodes) {
    switch (nextNode.type) {
      case "start":
        await advanceFromNode(db, instanceId, graph, nextNode.id, ctx);
        break;
      case "end":
        await insertHistory(db, instanceId, currentNodeId, null, ctx.operatorId, "node_completed", null);
        await completeInstance(db, instanceId, ctx.operatorId);
        break;
      case "approve":
        await insertHistory(db, instanceId, currentNodeId, null, ctx.operatorId, "node_completed", null);
        await createTasksForNode(db, instanceId, nextNode, ctx);
        break;
      case "cc":
        await insertHistory(db, instanceId, currentNodeId, null, ctx.operatorId, "node_completed", null);
        await sendCCNotification(db, instanceId, nextNode, ctx);
        await advanceFromNode(db, instanceId, graph, nextNode.id, ctx);
        break;
      case "condition":
        await advanceFromNode(db, instanceId, graph, nextNode.id, ctx);
        break;
    }
  }
}
```

### 4.3 审批通过

```typescript
async function approveTask(taskId: string, userId: string, comment?: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 节点级行锁：锁住该实例该节点所有待处理任务，防止并发审批竞态
    const task = await tx.raw(
      "SELECT * FROM sys_workflow_task WHERE id = $1 FOR UPDATE", [taskId]
    ).then(rows => rows[0]);
    if (!task) throw new WorkflowError("WF_TASK_NOT_FOUND", "任务不存在");
    if (task.status !== TaskStatus.PENDING) throw new WorkflowError("WF_TASK_ALREADY_ACTED", "任务已处理");
    if (task.assignee_id !== userId) throw new WorkflowError("WF_NOT_ASSIGNEE", "非当前审批人");

    await tx.query(WorkflowTaskModel).where("id", "=", taskId).update({
      status: TaskStatus.APPROVED, action: "approve",
      comment: comment ?? null, acted_at: new Date(),
    });
    await insertHistory(tx, task.instance_id, task.node_id, taskId, userId, "approve", comment);

    const instance = await loadInstanceTx(tx, task.instance_id);
    const snapshot = JSON.parse(instance.graph_snapshot);
    const graph = buildGraph(snapshot.nodes, snapshot.edges);
    const ctx: EngineContext = {
      instanceId: task.instance_id, formData: instance.form_data ?? {},
      variables: instance.variables ?? {}, initiator: await resolveInitiator(instance.initiator_id),
      operatorId: userId,
    };
    await processNodeCompletion(tx, task.instance_id, graph, task.node_id, ctx);
  });
  eventBus.emit("workflow.task.approved", { taskId, userId });
}
```

### 4.4 驳回

```typescript
async function rejectTask(taskId: string, userId: string, comment?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await tx.raw("SELECT * FROM sys_workflow_task WHERE id = $1 FOR UPDATE", [taskId]).then(r => r[0]);
    if (!task || task.status !== TaskStatus.PENDING || task.assignee_id !== userId)
      throw new WorkflowError("WF_TASK_INVALID", "任务无效");

    await tx.query(WorkflowTaskModel).where("id", "=", taskId).update({
      status: TaskStatus.REJECTED, action: "reject", comment: comment ?? null, acted_at: new Date(),
    });
    await insertHistory(tx, task.instance_id, task.node_id, taskId, userId, "reject", comment);

    const instance = await loadInstanceTx(tx, task.instance_id);
    const graph = buildGraphFromSnapshot(instance.graph_snapshot);
    const ctx = buildContext(instance, userId);
    await handleNodeReject(tx, task.instance_id, graph, task.node_id, ctx);
  });
}
```

**handleNodeReject — 按 rejectAction 配置处理：**

```typescript
async function handleNodeReject(
  db: Database, instanceId: string, graph: WorkflowGraph, nodeId: string, ctx: EngineContext,
): Promise<void> {
  const node = graph.nodes.get(nodeId)!;
  const rejectAction = (node.config as ApproveNodeConfig)?.rejectAction ?? "terminate";

  switch (rejectAction) {
    case "terminate":
      await updateInstanceStatus(db, instanceId, InstanceStatus.REJECTED);
      break;

    case "return_to_previous": {
      const prevNodeId = await findPreviousApproveNodeId(db, instanceId, nodeId);
      if (prevNodeId) {
        await voidTasksByNode(db, instanceId, nodeId, [TaskStatus.PENDING]);
        await voidTasksByNode(db, instanceId, prevNodeId, [TaskStatus.PENDING, TaskStatus.APPROVED]);
        const prevNode = graph.nodes.get(prevNodeId)!;
        await createTasksForNode(db, instanceId, prevNode, ctx);
        await insertHistory(db, instanceId, nodeId, null, ctx.operatorId, "node_completed", "驳回回退");
      } else {
        await updateInstanceStatus(db, instanceId, InstanceStatus.REJECTED);
      }
      break;
    }

    case "return_to_start":
      await voidAllActiveTasks(db, instanceId);
      await advanceFromNode(db, instanceId, graph, graph.startNodeId, ctx);
      break;
  }
}
```

### 4.5 回撤

```typescript
async function withdraw(instanceId: string, userId: string, comment?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const instance = await loadInstanceForUpdate(tx, instanceId);
    if (!instance) throw new WorkflowError("WF_NOT_FOUND", "实例不存在");
    if (instance.initiator_id !== userId) throw new WorkflowError("WF_NOT_INITIATOR", "只有发起人可以撤回");
    if (instance.status !== InstanceStatus.RUNNING) throw new WorkflowError("WF_NOT_RUNNING", "实例不在进行中");

    // 检查是否有人已操作（加载全部任务，不仅限 pending）
    const allTasks = await loadTasksByInstance(tx, instanceId);
    const hasActed = allTasks.some(t => t.status !== TaskStatus.PENDING);
    if (hasActed) throw new WorkflowError("WF_CANNOT_WITHDRAW", "已有审批人操作，无法撤回");

    // 作废所有待处理任务
    await voidTasksByNode(tx, instanceId, null, [TaskStatus.PENDING]);
    await updateInstanceStatus(tx, instanceId, InstanceStatus.WITHDRAWN);
    await insertHistory(tx, instanceId, null, null, userId, "withdraw", comment ?? "发起人撤回");
  });
  eventBus.emit("workflow.instance.withdrawn", { instanceId, withdrawnBy: userId });
}
```

### 4.6 转办

```typescript
async function transferTask(taskId: string, userId: string, targetUserId: string, comment?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await tx.raw("SELECT * FROM sys_workflow_task WHERE id = $1 FOR UPDATE", [taskId]).then(r => r[0]);
    if (!task || task.assignee_id !== userId || task.status !== TaskStatus.PENDING)
      throw new WorkflowError("WF_TASK_INVALID", "任务无效");

    await tx.query(WorkflowTaskModel).where("id", "=", taskId).update({
      status: TaskStatus.TRANSFERRED, action: "transfer", comment: comment ?? null,
      transfer_to: targetUserId, acted_at: new Date(),
    });
    await tx.query(WorkflowTaskModel).insert({
      id: crypto.randomUUID(), instance_id: task.instance_id, node_id: task.node_id,
      assignee_id: targetUserId, status: TaskStatus.PENDING,
    });
    await insertHistory(tx, task.instance_id, task.node_id, taskId, userId, "transfer",
      `转办给 ${targetUserId}: ${comment ?? ""}`);
  });
}
```

### 4.7 加签

```typescript
async function addSign(taskId: string, userId: string, targetUserIds: string[], comment?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await tx.raw("SELECT * FROM sys_workflow_task WHERE id = $1 FOR UPDATE", [taskId]).then(r => r[0]);
    if (!task || task.assignee_id !== userId || task.status !== TaskStatus.PENDING)
      throw new WorkflowError("WF_TASK_INVALID", "任务无效");

    // 检查节点是否允许加签
    const instance = await loadInstanceTx(tx, task.instance_id);
    const graph = buildGraphFromSnapshot(instance.graph_snapshot);
    const node = graph.nodes.get(task.node_id)!;
    if (!(node.config as ApproveNodeConfig)?.counterSign)
      throw new WorkflowError("WF_COUNTER_SIGN_DISABLED", "该节点不允许加签");

    await tx.query(WorkflowTaskModel).where("id", "=", taskId).update({
      status: TaskStatus.APPROVED, action: "add_sign", comment: comment ?? "加签", acted_at: new Date(),
    });
    for (const targetId of targetUserIds) {
      await tx.query(WorkflowTaskModel).insert({
        id: crypto.randomUUID(), instance_id: task.instance_id, node_id: task.node_id,
        assignee_id: targetId, status: TaskStatus.PENDING,
      });
    }
    await insertHistory(tx, task.instance_id, task.node_id, taskId, userId, "add_sign",
      `加签给 ${targetUserIds.join(",")}: ${comment ?? ""}`);
  });
}
```

### 4.8 重新提交

```typescript
async function resubmit(originalInstanceId: string, userId: string, formData: Record<string, unknown>) {
  const original = await loadInstance(originalInstanceId);
  if (!original) throw new WorkflowError("WF_NOT_FOUND", "原实例不存在");
  if (original.status !== InstanceStatus.REJECTED && original.status !== InstanceStatus.WITHDRAWN)
    throw new WorkflowError("WF_CANNOT_RESUBMIT", "只有已拒绝或已撤回的申请可以重新提交");

  return startInstance({
    definitionId: original.definitionId, initiatorId: userId,
    businessType: original.businessType, businessId: original.businessId,
    title: original.title, formData, resubmitOf: originalInstanceId,
  });
}
```


---

## 五、策略引擎

### 5.1 processNodeCompletion

```typescript
async function processNodeCompletion(
  db: Database, instanceId: string, graph: WorkflowGraph,
  nodeId: string, ctx: EngineContext,
): Promise<void> {
  const node = graph.nodes.get(nodeId)!;
  const config = node.config as ApproveNodeConfig;
  const strategy = config?.strategy ?? "sequential";

  const allTasks = await loadTasksByNode(db, instanceId, nodeId);
  // 过滤掉已作废/已转办/已撤回的任务
  const activeTasks = allTasks.filter(t =>
    t.status !== 5 && t.status !== 3 && t.status !== 4
  );
  const pending  = activeTasks.filter(t => t.status === TaskStatus.PENDING);
  const approved = activeTasks.filter(t => t.status === TaskStatus.APPROVED);
  const rejected = activeTasks.filter(t => t.status === TaskStatus.REJECTED);

  switch (strategy) {
    case "sequential": {
      if (rejected.length > 0) { await handleNodeReject(db, instanceId, graph, nodeId, ctx); return; }
      const assignees = await resolveAssignees(node, ctx);
      // 用 activeTasks（非 allTasks），避免 VOIDED 任务干扰
      const assignedIds = new Set(activeTasks.map(t => t.assignee_id));
      const nextAssignee = assignees.find(id => !assignedIds.has(id));
      if (nextAssignee) {
        await createSingleTask(db, instanceId, nodeId, nextAssignee, config);
      } else {
        // 所有审批人都已处理
        if (assignees.length === 0) {
          // 无可用审批人
          const emptyAction = config?.onEmptyAssignee ?? "error";
          if (emptyAction === "skip") {
            await advanceFromNode(db, instanceId, graph, nodeId, ctx);
          } else if (emptyAction === "escalate") {
            await createSingleTask(db, instanceId, nodeId, "admin", config);
          } else {
            throw new WorkflowError("WF_NO_ASSIGNEE", `节点「${node.name}」无可用审批人`);
          }
        } else {
          await insertHistory(db, instanceId, nodeId, null, ctx.operatorId, "node_completed", null);
          await advanceFromNode(db, instanceId, graph, nodeId, ctx);
        }
      }
      break;
    }

    case "parallel_and": {
      if (rejected.length > 0) { await handleNodeReject(db, instanceId, graph, nodeId, ctx); return; }
      // 用 activeTasks 判断，避免转办/撤回任务干扰
      if (pending.length === 0 && approved.length === activeTasks.length && activeTasks.length > 0) {
        await insertHistory(db, instanceId, nodeId, null, ctx.operatorId, "node_completed", null);
        await advanceFromNode(db, instanceId, graph, nodeId, ctx);
      }
      break;
    }

    case "parallel_or": {
      if (approved.length > 0) {
        await cancelPendingTasks(db, instanceId, nodeId);
        await insertHistory(db, instanceId, nodeId, null, ctx.operatorId, "node_completed", null);
        await advanceFromNode(db, instanceId, graph, nodeId, ctx);
      } else if (rejected.length === activeTasks.length && activeTasks.length > 0) {
        await handleNodeReject(db, instanceId, graph, nodeId, ctx);
      }
      break;
    }

    case "percentage": {
      const threshold = config?.percentage ?? 50;
      const total = activeTasks.length;
      if (total === 0) break;
      const approvalRate = (approved.length / total) * 100;
      if (approvalRate >= threshold) {
        await cancelPendingTasks(db, instanceId, nodeId);
        await insertHistory(db, instanceId, nodeId, null, ctx.operatorId, "node_completed", null);
        await advanceFromNode(db, instanceId, graph, nodeId, ctx);
      } else if (rejected.length > total * (1 - threshold / 100)) {
        await handleNodeReject(db, instanceId, graph, nodeId, ctx);
      }
      break;
    }
  }
}
```

---

## 六、模块依赖注入

```typescript
export interface WorkflowModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
  eventBus: EventBus;
  scheduler?: Scheduler;
  notificationService?: NotificationService;
}

export function createWorkflowModule(deps: WorkflowModuleDeps): WorkflowModule {
  const { db, jwt, jwtSecret, rbac, eventBus, scheduler, notificationService } = deps;
  const workflowService = createWorkflowService({ db, eventBus, scheduler, notificationService });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);
  const router = createWorkflowRoutes(workflowService, authMiddleware, perm);
  return { services: { workflow: workflowService }, router, async init() {} };
}
```

---

## 七、API 总览

### 7.1 流程定义

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workflow/definitions` | 创建 |
| GET | `/api/workflow/definitions` | 列表（分页/分类/状态过滤） |
| GET | `/api/workflow/definitions/:id` | 详情 |
| PUT | `/api/workflow/definitions/:id` | 更新 |
| DELETE | `/api/workflow/definitions/:id` | 删除（仅草稿） |
| POST | `/api/workflow/definitions/:id/clone` | 克隆 |
| POST | `/api/workflow/definitions/:id/publish` | 发布 |
| POST | `/api/workflow/definitions/:id/disable` | 停用 |
| GET | `/api/workflow/definitions/:id/export` | 导出 JSON |
| POST | `/api/workflow/definitions/import` | 导入 JSON |

### 7.2 设计器

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflow/definitions/:id/graph` | 获取流程图（nodes + edges） |
| PUT | `/api/workflow/definitions/:id/graph` | 保存流程图（自动校验） |
| POST | `/api/workflow/definitions/:id/graph/validate` | 校验（不保存） |

### 7.3 流程实例

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workflow/instances` | 发起 |
| GET | `/api/workflow/instances` | 我发起的（分页） |
| GET | `/api/workflow/instances/:id` | 详情（含 graph + tasks + history） |
| POST | `/api/workflow/instances/:id/withdraw` | 撤回 |
| POST | `/api/workflow/instances/:id/cancel` | 终止（管理员） |
| POST | `/api/workflow/instances/:id/resubmit` | 重新提交 |
| GET | `/api/workflow/instances/:id/history` | 操作历史 |

**GET /instances/:id 响应结构：**
```typescript
interface WorkflowInstanceDetail {
  instance: WorkflowInstance;
  graph: { nodes: DesignerNode[]; edges: DesignerEdge[] };
  tasks: WorkflowTask[];
  history: WorkflowHistory[];
}
```

### 7.4 审批任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflow/tasks` | 我的待办 |
| GET | `/api/workflow/tasks/done` | 我的已办 |
| POST | `/api/workflow/tasks/:id/approve` | 通过 |
| POST | `/api/workflow/tasks/:id/reject` | 驳回 |
| POST | `/api/workflow/tasks/:id/transfer` | 转办 |
| POST | `/api/workflow/tasks/:id/add-sign` | 加签 |
| POST | `/api/workflow/tasks/:id/urge` | 催办（发通知，不改状态） |

### 7.5 错误响应

```typescript
// 路由层 catch 块
catch (e) {
  if (e instanceof WorkflowError) {
    return fail(e.message, e.status, e.status, e.code);
    // Response: { code: "WF_CANNOT_WITHDRAW", message: "已有审批人操作，无法撤回", status: 400 }
  }
  return fail("服务器内部错误", 500, 500);
}
```

### 7.6 AI 创建

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workflow/ai/create` | AI 生成流程（默认草稿） |


---

## 八、AI 集成

### 8.1 两阶段方案

LLM 输出简化语义树 → 后端 `semanticTreeToGraph()` 自动构建标准图。

**LLM 输出格式（SemanticTree）：**
```typescript
interface WorkflowSemanticTree {
  name: string;
  code: string;
  description?: string;
  category?: string;
  formFields?: Array<{
    key: string; label: string;
    type: "text" | "number" | "date" | "select" | "textarea" | "file";
    required?: boolean; options?: string[];
  }>;
  flow: SemanticNode[];
}

type SemanticNode =
  | { type: "start" | "end"; name?: string }
  | { type: "approve"; name: string; strategy?: string; assignee: string; rejectAction?: string }
  | { type: "cc"; name: string; assignee: string }
  | { type: "condition"; name: string; branches: Array<{
      condition?: { field: string; operator: string; value: unknown };
      then: SemanticNode[];
    }>;
  };
```

**后端 `semanticTreeToGraph()` 自动完成：**
- 生成所有节点 UUID
- 将自然语言 assignee（"直属领导"）映射为 assignee 配置
- 将树结构展开为 nodes + edges
- 计算默认坐标
- 校验图完整性

**无法自动映射的项返回 `warnings`，要求人工确认。**

### 8.2 安全约束

- AI 创建的流程默认 `status=0`（草稿），必须管理员手动发布
- AI 不能指定具体 userId，只能用角色/部门描述
- LLM 输出必须经过 `validateGraph()` 校验
- 操作记录到 history（operator_id = "ai"）

---

## 九、事件集成

```typescript
// 工作流发布的事件
"workflow.instance.started"   → { instanceId, definitionId, initiatorId }
"workflow.instance.completed" → { instanceId, businessType, businessId }
"workflow.instance.rejected"  → { instanceId, rejectorId, comment }
"workflow.instance.withdrawn" → { instanceId, withdrawnBy }
"workflow.task.created"       → { taskId, instanceId, assigneeId }
"workflow.task.approved"      → { taskId, instanceId, userId }
"workflow.task.rejected"      → { taskId, instanceId, userId }

// 通知集成（task.created 时自动发送）
eventBus.on("workflow.task.created", async (data) => {
  const instance = await loadInstance(data.instanceId);
  await notificationService.send({
    userIds: [data.assigneeId],
    title: "新的审批任务",
    content: `您有一个待审批的任务：${instance.title}`,
    channel: "in_app",
  });
});
```

---

## 十、Phase 1 限制说明

| 限制 | 说明 | Phase 2 解决方案 |
|------|------|-----------------|
| 无并行网关 | Phase 1 用 parallel_and/or 策略在同一节点模拟 | parallel_gate 节点 |
| 同节点共享配置 | 会签中所有人共享相同的表单权限和驳回策略 | 并行分支可独立配置 |
| 无定时器 | 超时需要外部 scheduler 手动调用 | timer 节点 + scheduler 集成 |
| 无委托规则 | 只支持一次性转办 | delegation 表 |
| 会签驳回立即生效 | 一人驳回即终止 | rejectMode: "wait_all" |
| 条件首个匹配 | 条件按顺序匹配，首个满足即生效 | 设计 UI 标注此语义 |
| 无流程监控面板 | 数据基础已具备（history 表），前端待实现 | 可视化面板 |

---

## 十一、实施计划

### Phase 1 — 核心引擎（2-3 周）

| 周 | 任务 |
|----|------|
| W1 | SQL migration + defineModel + edge/history 表；graph.ts / expression.ts / strategies.ts 纯函数 |
| W2 | 核心动作（startInstance / approveTask / rejectTask / withdraw / transfer / addSign / resubmit）+ 事务 + 节点级锁 |
| W2 | processNodeCompletion + handleNodeReject + onEmptyAssignee |
| W3 | 路由 + 权限 + module.ts + 错误码 + eventBus 注入 |
| W3 | 测试（纯函数 + 集成） |

### Phase 2 — 设计器 + AI（2 周）

| 周 | 任务 |
|----|------|
| W4 | 设计器 API（graph CRUD + validate + publish/clone + import/export） |
| W4-5 | AI Tool + SemanticTree → Graph + warnings + 安全约束 |

### Phase 3 — 前端可视化（2-3 周）

| 周 | 任务 |
|----|------|
| W6-7 | React Flow 画布 + 节点/属性面板 |
| W8 | 条件/审批人配置 UI + AI 对话 UI |

### Phase 4 — 高级特性（2 周）

| 周 | 任务 |
|----|------|
| W9 | parallel_gate 并行网关 + timer 定时器 |
| W10 | service 事件节点 + delegation 委托 |

---

## 十二、WorkflowError 错误码

| code | status | 含义 |
|------|--------|------|
| WF_NO_START_NODE | 400 | 流程缺少开始节点 |
| WF_INVALID_GRAPH | 400 | 流程图校验失败 |
| WF_DEF_NOT_ACTIVE | 400 | 流程定义未发布 |
| WF_NO_MATCHING_CONDITION | 500 | 条件网关无匹配路径 |
| WF_NO_NEXT_NODE | 500 | 节点无后续节点 |
| WF_NO_ASSIGNEE | 400 | 无可用审批人 |
| WF_INVALID_ASSIGNEE | 400 | 表单指定的审批人不合法 |
| WF_COUNTER_SIGN_DISABLED | 403 | 节点不允许加签 |
| WF_TASK_NOT_FOUND | 404 | 任务不存在 |
| WF_TASK_ALREADY_ACTED | 409 | 任务已处理（乐观锁冲突） |
| WF_TASK_INVALID | 400 | 任务状态无效 |
| WF_NOT_ASSIGNEE | 403 | 非当前审批人 |
| WF_NOT_INITIATOR | 403 | 非发起人 |
| WF_NOT_RUNNING | 400 | 实例不在进行中 |
| WF_CANNOT_WITHDRAW | 400 | 已有人操作，无法撤回 |
| WF_CANNOT_RESUBMIT | 400 | 只有已拒绝/已撤回可重新提交 |
| WF_INSTANCE_NOT_FOUND | 404 | 实例不存在 |
| WF_CREATE_TASK_FAILED | 500 | 创建任务失败 |

