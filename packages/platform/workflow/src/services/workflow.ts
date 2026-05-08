/**
 * @ventostack/workflow - 工作流服务
 */

import type { Database } from "@ventostack/database";
import { WorkflowDefModel, WorkflowNodeModel, WorkflowInstanceModel, WorkflowTaskModel } from "../models";

/** 定义状态 */
export const DefStatus = {
  DRAFT: 0,
  ACTIVE: 1,
  DISABLED: 2,
} as const;

/** 实例状态 */
export const InstanceStatus = {
  RUNNING: 0,
  COMPLETED: 1,
  REJECTED: 2,
  CANCELLED: 3,
} as const;

/** 任务状态 */
export const TaskStatus = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
} as const;

/** 节点类型 */
export const NodeType = {
  START: "start",
  END: "end",
  APPROVE: "approve",
  NOTIFY: "notify",
  CONDITION: "condition",
} as const;

/** 工作流定义 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  code: string;
  version: number;
  description: string | null;
  status: number;
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string;
  definitionId: string;
  name: string;
  type: string;
  assigneeType: string | null;
  assigneeId: string | null;
  sort: number;
  config: Record<string, unknown> | null;
}

/** 工作流实例 */
export interface WorkflowInstance {
  id: string;
  definitionId: string;
  businessType: string | null;
  businessId: string | null;
  initiatorId: string;
  currentNodeId: string | null;
  status: number;
  variables: Record<string, unknown> | null;
  createdAt: string;
}

/** 工作流任务 */
export interface WorkflowTask {
  id: string;
  instanceId: string;
  nodeId: string;
  assigneeId: string;
  action: string | null;
  comment: string | null;
  status: number;
  actedAt: string | null;
  createdAt: string;
}

/** 实例详情 */
export interface WorkflowInstanceDetail {
  instance: WorkflowInstance;
  nodes: WorkflowNode[];
  tasks: WorkflowTask[];
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 工作流服务接口 */
export interface WorkflowService {
  // Definition CRUD
  createDefinition(params: { name: string; code: string; description?: string }): Promise<{ id: string }>;
  updateDefinition(id: string, params: Partial<{ name: string; description: string; status: number }>): Promise<void>;
  deleteDefinition(id: string): Promise<void>;
  getDefinition(id: string): Promise<WorkflowDefinition | null>;
  listDefinitions(params?: { status?: number; page?: number; pageSize?: number }): Promise<PaginatedResult<WorkflowDefinition>>;

  // Node management
  setNodes(definitionId: string, nodes: Array<{ name: string; type: string; assigneeType?: string; assigneeId?: string; sort?: number; config?: Record<string, unknown> }>): Promise<void>;
  getNodes(definitionId: string): Promise<WorkflowNode[]>;

  // Instance operations
  startInstance(params: {
    definitionId: string;
    initiatorId: string;
    businessType?: string;
    businessId?: string;
    variables?: Record<string, unknown>;
  }): Promise<{ instanceId: string }>;

  approveTask(taskId: string, userId: string, comment?: string): Promise<void>;
  rejectTask(taskId: string, userId: string, comment?: string): Promise<void>;

  // Query
  getMyTasks(userId: string, params?: { status?: number; page?: number; pageSize?: number }): Promise<PaginatedResult<WorkflowTask>>;
  getInstanceDetail(instanceId: string): Promise<WorkflowInstanceDetail | null>;
}

export interface WorkflowServiceDeps {
  db: Database;
}

export function createWorkflowService(deps: WorkflowServiceDeps): WorkflowService {
  const { db } = deps;

  async function getNodesByDefinition(definitionId: string): Promise<WorkflowNode[]> {
    const rows = await db.query(WorkflowNodeModel)
      .where("definition_id", "=", definitionId)
      .select("id", "definition_id", "name", "type", "assignee_type", "assignee_id", "sort", "config")
      .orderBy("sort", "asc")
      .list();

    return rows.map((row) => ({
      id: row.id,
      definitionId: row.definition_id,
      name: row.name,
      type: row.type,
      assigneeType: row.assignee_type ?? null,
      assigneeId: row.assignee_id ?? null,
      sort: row.sort,
      config: (row.config as Record<string, unknown>) ?? null,
    }));
  }

  async function advanceInstance(instanceId: string, currentNodeId: string) {
    // Get instance
    const instance = await db.query(WorkflowInstanceModel)
      .where("id", "=", instanceId)
      .select("id", "definition_id", "status")
      .get();
    if (!instance) return;

    // Get all nodes for this definition
    const nodes = await getNodesByDefinition(instance.definition_id);

    // Find current node index
    const currentIdx = nodes.findIndex(n => n.id === currentNodeId);
    if (currentIdx === -1) return;

    const nextNode = nodes[currentIdx + 1];

    if (!nextNode || nextNode.type === NodeType.END) {
      // Workflow completed
      await db.query(WorkflowInstanceModel).where("id", "=", instanceId).update({
        status: InstanceStatus.COMPLETED,
        current_node_id: nextNode?.id ?? null,
      });
      return;
    }

    // Update current node
    await db.query(WorkflowInstanceModel).where("id", "=", instanceId).update({
      current_node_id: nextNode.id,
    });

    // Create task for next approve node
    if (nextNode.type === NodeType.APPROVE) {
      await db.query(WorkflowTaskModel).insert({
        id: crypto.randomUUID(),
        instance_id: instanceId,
        node_id: nextNode.id,
        assignee_id: nextNode.assigneeId ?? "",
        status: TaskStatus.PENDING,
      });
    }

    // For notify nodes, just advance again
    if (nextNode.type === NodeType.NOTIFY) {
      await advanceInstance(instanceId, nextNode.id);
    }
  }

  return {
    async createDefinition(params) {
      const id = crypto.randomUUID();
      await db.query(WorkflowDefModel).insert({
        id,
        name: params.name,
        code: params.code,
        version: 1,
        description: params.description ?? null,
        status: DefStatus.ACTIVE,
      });
      return { id };
    },

    async updateDefinition(id, params) {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.description !== undefined) updates.description = params.description;
      if (params.status !== undefined) updates.status = params.status;

      if (Object.keys(updates).length === 0) return;
      await db.query(WorkflowDefModel).where("id", "=", id).update(updates);
    },

    async deleteDefinition(id) {
      // Cascade delete: tasks → instances → nodes → definition
      const instances = await db.query(WorkflowInstanceModel)
        .where("definition_id", "=", id)
        .select("id")
        .list();
      if (instances.length > 0) {
        const instanceIds = instances.map(i => i.id);
        await db.query(WorkflowTaskModel).where("instance_id", "IN", instanceIds).hardDelete();
        await db.query(WorkflowInstanceModel).where("definition_id", "=", id).hardDelete();
      }
      await db.query(WorkflowNodeModel).where("definition_id", "=", id).hardDelete();
      await db.query(WorkflowDefModel).where("id", "=", id).hardDelete();
    },

    async getDefinition(id) {
      const row = await db.query(WorkflowDefModel)
        .where("id", "=", id)
        .select("id", "name", "code", "version", "description", "status")
        .get();
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        version: row.version,
        description: row.description ?? null,
        status: row.status,
      };
    },

    async listDefinitions(params) {
      const { status, page = 1, pageSize = 10 } = params ?? {};

      let query = db.query(WorkflowDefModel);
      if (status !== undefined) query = query.where("status", "=", status);

      const total = await query.count();

      const rows = await query
        .select("id", "name", "code", "version", "description", "status")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        version: row.version,
        description: row.description ?? null,
        status: row.status,
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async setNodes(definitionId, nodes) {
      // Delete existing nodes
      await db.query(WorkflowNodeModel).where("definition_id", "=", definitionId).hardDelete();

      // Insert new nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        await db.query(WorkflowNodeModel).insert({
          id: crypto.randomUUID(),
          definition_id: definitionId,
          name: node.name,
          type: node.type,
          assignee_type: node.assigneeType ?? null,
          assignee_id: node.assigneeId ?? null,
          sort: node.sort ?? i,
          config: node.config ? JSON.stringify(node.config) : null,
        });
      }
    },

    async getNodes(definitionId) {
      return getNodesByDefinition(definitionId);
    },

    async startInstance(params) {
      const instanceId = crypto.randomUUID();

      // Get nodes to find start node
      const nodes = await getNodesByDefinition(params.definitionId);
      if (nodes.length === 0) throw new Error("未定义节点");

      const startNode = nodes.find(n => n.type === NodeType.START);
      if (!startNode) throw new Error("未找到开始节点");

      // Find next node after start
      const startIdx = nodes.indexOf(startNode);
      const nextNode = nodes[startIdx + 1];

      await db.query(WorkflowInstanceModel).insert({
        id: instanceId,
        definition_id: params.definitionId,
        business_type: params.businessType ?? null,
        business_id: params.businessId ?? null,
        initiator_id: params.initiatorId,
        current_node_id: nextNode?.id ?? null,
        status: InstanceStatus.RUNNING,
        variables: params.variables ? JSON.stringify(params.variables) : null,
      });

      // Create first task if there's an approve node
      if (nextNode && nextNode.type === NodeType.APPROVE) {
        await db.query(WorkflowTaskModel).insert({
          id: crypto.randomUUID(),
          instance_id: instanceId,
          node_id: nextNode.id,
          assignee_id: nextNode.assigneeId ?? "",
          status: TaskStatus.PENDING,
        });
      }

      return { instanceId };
    },

    async approveTask(taskId, userId, comment) {
      const task = await db.query(WorkflowTaskModel)
        .where("id", "=", taskId)
        .select("id", "instance_id", "node_id", "status")
        .get();
      if (!task) throw new Error("任务不存在");

      if (task.status !== TaskStatus.PENDING) {
        throw new Error("任务已处理");
      }

      await db.query(WorkflowTaskModel).where("id", "=", taskId).update({
        status: TaskStatus.APPROVED,
        action: "approve",
        comment: comment ?? null,
        acted_at: new Date(),
      });

      // Move to next node
      await advanceInstance(task.instance_id, task.node_id);
    },

    async rejectTask(taskId, userId, comment) {
      const task = await db.query(WorkflowTaskModel)
        .where("id", "=", taskId)
        .select("id", "instance_id", "status")
        .get();
      if (!task) throw new Error("任务不存在");

      if (task.status !== TaskStatus.PENDING) {
        throw new Error("任务已处理");
      }

      await db.query(WorkflowTaskModel).where("id", "=", taskId).update({
        status: TaskStatus.REJECTED,
        action: "reject",
        comment: comment ?? null,
        acted_at: new Date(),
      });

      // Mark instance as rejected
      await db.query(WorkflowInstanceModel).where("id", "=", task.instance_id).update({
        status: InstanceStatus.REJECTED,
      });
    },

    async getMyTasks(userId, params) {
      const { status, page = 1, pageSize = 10 } = params ?? {};

      let query = db.query(WorkflowTaskModel).where("assignee_id", "=", userId);
      if (status !== undefined) query = query.where("status", "=", status);

      const total = await query.count();

      const rows = await query
        .select("id", "instance_id", "node_id", "assignee_id", "action", "comment", "status", "acted_at", "created_at")
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .list();

      const items = rows.map((row) => ({
        id: row.id,
        instanceId: row.instance_id,
        nodeId: row.node_id,
        assigneeId: row.assignee_id,
        action: row.action ?? null,
        comment: row.comment ?? null,
        status: row.status,
        actedAt: row.acted_at ? row.acted_at.toISOString() : null,
        createdAt: row.created_at.toISOString(),
      }));

      return { items, total, page, pageSize, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 };
    },

    async getInstanceDetail(instanceId) {
      const inst = await db.query(WorkflowInstanceModel)
        .where("id", "=", instanceId)
        .select("id", "definition_id", "business_type", "business_id", "initiator_id", "current_node_id", "status", "variables", "created_at")
        .get();
      if (!inst) return null;

      const instance: WorkflowInstance = {
        id: inst.id,
        definitionId: inst.definition_id,
        businessType: inst.business_type ?? null,
        businessId: inst.business_id ?? null,
        initiatorId: inst.initiator_id,
        currentNodeId: inst.current_node_id ?? null,
        status: inst.status,
        variables: (inst.variables as Record<string, unknown>) ?? null,
        createdAt: inst.created_at.toISOString(),
      };

      const nodes = await getNodesByDefinition(instance.definitionId);

      const taskRows = await db.query(WorkflowTaskModel)
        .where("instance_id", "=", instanceId)
        .select("id", "instance_id", "node_id", "assignee_id", "action", "comment", "status", "acted_at", "created_at")
        .orderBy("created_at", "asc")
        .list();

      const tasks = taskRows.map((row) => ({
        id: row.id,
        instanceId: row.instance_id,
        nodeId: row.node_id,
        assigneeId: row.assignee_id,
        action: row.action ?? null,
        comment: row.comment ?? null,
        status: row.status,
        actedAt: row.acted_at ? row.acted_at.toISOString() : null,
        createdAt: row.created_at.toISOString(),
      }));

      return { instance, nodes, tasks };
    },
  };
}
