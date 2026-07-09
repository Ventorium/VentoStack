/**
 * @ventostack/workflow — 工作流引擎
 *
 * 流程定义、节点配置、实例流转、审批任务。
 */

// Models
export { WorkflowDefModel } from "./models/definition";
export { WorkflowNodeModel } from "./models/node";
export { WorkflowEdgeModel } from "./models/edge";
export { WorkflowInstanceModel } from "./models/instance";
export { WorkflowTaskModel } from "./models/task";
export { WorkflowHistoryModel } from "./models/history";

// Engine
export { buildGraph, getNextNodes, validateGraph, hasCycle, evaluateCondition, resolveField } from "./engine/graph";
export type { GraphNodeData, GraphEdgeData, GraphNode, GraphEdge, WorkflowGraph, EngineContext, ConditionItem, ConditionNodeConfig } from "./engine/graph";
export { getActiveTasks, isNodeCompleted } from "./engine/strategy";
export type { ApprovalStrategy, TaskInfo, StrategyResult } from "./engine/strategy";
export { createAssigneeResolver } from "./engine/assignee";
export type { AssigneeConfig, ApproveNodeConfig, AssigneeResolver } from "./engine/assignee";
export { WorkflowError, workflowErrors } from "./engine/errors";

// Services
export { createWorkflowService } from "./services";
export type {
  WorkflowService,
  WorkflowServiceDeps,
  CreateDefParams,
  UpdateDefParams,
  ListDefParams,
  StartInstanceParams,
  InstanceDetail,
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowHistory,
  WorkflowTask,
  PaginatedResult,
  PageParams,
  TaskListParams,
} from "./services";
export { DefStatus, InstanceStatus, TaskStatus } from "./services";

// Routes
export { createWorkflowRoutes } from "./routes/workflow";

// Module
export { createWorkflowModule } from "./module";
export type { WorkflowModule, WorkflowModuleDeps } from "./module";

// Migrations
export { createWorkflowTables } from "./migrations/001_create_workflow_tables";
export { enhanceWorkflowTables } from "./migrations/002_enhance_workflow_tables";
export { addBusinessType } from "./migrations/003_add_business_type";
export { addWorkflowHistoryTenant } from "./migrations/004_add_workflow_history_tenant";

// Engine Actions (advanced: flow control functions for custom integrations)
export { insertHistory, completeInstance, createTasksForNode, advanceFromNode, processNodeCompletion, handleNodeReject } from "./engine/actions";
export type { FlowActionDeps } from "./engine/actions";
