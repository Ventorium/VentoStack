/**
 * @ventostack/workflow — 服务聚合
 */

import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import { createDefinitionService } from "./definition";
import { createInstanceService } from "./instance";
import { createTaskService } from "./task";
import { createAssigneeResolver } from "../engine/assignee";
import type { DefinitionService, CreateDefParams, UpdateDefParams, ListDefParams } from "./definition";
import type { WorkflowDefinition } from "./definition";
import type { InstanceService, StartInstanceParams, InstanceDetail, PageParams } from "./instance";
import type { WorkflowInstance, WorkflowHistory } from "./instance";
import type { TaskService, TaskListParams } from "./task";
import type { WorkflowTask, PaginatedResult } from "./types";

export interface WorkflowService {
  createDefinition(params: CreateDefParams): Promise<{ id: string }>;
  updateDefinition(id: string, params: UpdateDefParams, tenantId?: string): Promise<void>;
  deleteDefinition(id: string, tenantId?: string): Promise<void>;
  getDefinition(id: string, tenantId?: string): Promise<WorkflowDefinition | null>;
  getDefinitionByBusinessType(businessType: string, tenantId?: string): Promise<WorkflowDefinition | null>;
  listDefinitions(params?: ListDefParams): Promise<PaginatedResult<WorkflowDefinition>>;
  publishDefinition(id: string, tenantId?: string): Promise<void>;
  disableDefinition(id: string, tenantId?: string): Promise<void>;
  cloneDefinition(id: string, tenantId?: string): Promise<{ id: string }>;
  saveGraph(defId: string, graph: { nodes: unknown[]; edges: unknown[] }, tenantId?: string): Promise<void>;
  getGraph(defId: string, tenantId?: string): Promise<{ nodes: unknown[]; edges: unknown[] }>;
  validateGraphData(defId: string, tenantId?: string): Promise<{ valid: boolean; errors: string[] }>;
  startInstance(params: StartInstanceParams): Promise<{ instanceId: string }>;
  getInstanceDetail(instanceId: string, tenantId?: string): Promise<InstanceDetail | null>;
  listMyInstances(userId: string, params?: PageParams & { tenantId?: string }): Promise<PaginatedResult<WorkflowInstance>>;
  listInstancesByBusiness(businessType: string, businessId: string | undefined, params?: PageParams & { tenantId?: string }): Promise<PaginatedResult<WorkflowInstance>>;
  withdrawInstance(instanceId: string, userId: string, comment?: string, tenantId?: string): Promise<void>;
  cancelInstance(instanceId: string, userId: string, comment?: string, tenantId?: string): Promise<void>;
  resubmitInstance(instanceId: string, userId: string, formData: Record<string, unknown>, tenantId?: string): Promise<{ instanceId: string }>;
  getInstanceHistory(instanceId: string, tenantId?: string): Promise<WorkflowHistory[]>;
  approveTask(taskId: string, userId: string, comment?: string, tenantId?: string): Promise<void>;
  rejectTask(taskId: string, userId: string, comment?: string, tenantId?: string): Promise<void>;
  transferTask(taskId: string, userId: string, targetUserId: string, comment?: string, tenantId?: string): Promise<void>;
  addSign(taskId: string, userId: string, targetUserIds: string[], comment?: string, tenantId?: string): Promise<void>;
  urgeTask(taskId: string, userId: string, tenantId?: string): Promise<void>;
  listMyTasks(userId: string, params?: TaskListParams): Promise<PaginatedResult<WorkflowTask>>;
  listMyDoneTasks(userId: string, params?: PageParams & { tenantId?: string }): Promise<PaginatedResult<WorkflowTask>>;
}

export interface WorkflowServiceDeps { db: Database; eventBus?: EventBus; }

export function createWorkflowService(deps: WorkflowServiceDeps): WorkflowService {
  const { db, eventBus } = deps;
  const assigneeResolver = createAssigneeResolver({ db });
  const defService = createDefinitionService({ db });
  const instanceDeps: Parameters<typeof createInstanceService>[0] = { db, assigneeResolver };
  const taskDeps: Parameters<typeof createTaskService>[0] = { db, assigneeResolver };
  if (eventBus) {
    instanceDeps.eventBus = eventBus;
    taskDeps.eventBus = eventBus;
  }
  const instService = createInstanceService(instanceDeps);
  const taskService = createTaskService(taskDeps);

  return {
    createDefinition: (p) => defService.create(p),
    updateDefinition: (id, p, tenantId) => defService.update(id, p, tenantId),
    deleteDefinition: (id, tenantId) => defService.delete(id, tenantId),
    getDefinition: (id, tenantId) => defService.getById(id, tenantId),
    getDefinitionByBusinessType: (bt, tenantId) => defService.getByBusinessType(bt, tenantId),
    listDefinitions: (p) => defService.list(p),
    publishDefinition: (id, tenantId) => defService.publish(id, tenantId),
    disableDefinition: (id, tenantId) => defService.disable(id, tenantId),
    cloneDefinition: (id, tenantId) => defService.clone(id, tenantId),
    saveGraph: (defId, g, tenantId) => defService.saveGraph(defId, g as { nodes: import("../engine/graph").GraphNodeData[]; edges: import("../engine/graph").GraphEdgeData[] }, tenantId),
    getGraph: (defId, tenantId) => defService.getGraph(defId, tenantId),
    validateGraphData: (defId, tenantId) => defService.validateGraphData(defId, tenantId),
    startInstance: (p) => instService.start(p),
    getInstanceDetail: (id, tenantId) => instService.getDetail(id, tenantId),
    listMyInstances: (uid, p) => instService.listMy(uid, p),
    listInstancesByBusiness: (bt, bid, p) => instService.listByBusiness(bt, bid, p),
    withdrawInstance: (id, uid, c, tenantId) => instService.withdraw(id, uid, c, tenantId),
    cancelInstance: (id, uid, c, tenantId) => instService.cancel(id, uid, c, tenantId),
    resubmitInstance: (id, uid, fd, tenantId) => instService.resubmit(id, uid, fd, tenantId),
    getInstanceHistory: (id, tenantId) => instService.getHistory(id, tenantId),
    approveTask: (id, uid, c, tenantId) => taskService.approve(id, uid, c, tenantId),
    rejectTask: (id, uid, c, tenantId) => taskService.reject(id, uid, c, tenantId),
    transferTask: (id, uid, tid, c, tenantId) => taskService.transfer(id, uid, tid, c, tenantId),
    addSign: (id, uid, tids, c, tenantId) => taskService.addSign(id, uid, tids, c, tenantId),
    urgeTask: (id, uid, tenantId) => taskService.urge(id, uid, tenantId),
    listMyTasks: (uid, p) => taskService.listMy(uid, p),
    listMyDoneTasks: (uid, p) => taskService.listMyDone(uid, p),
  };
}

export type { CreateDefParams, UpdateDefParams, ListDefParams, WorkflowDefinition } from "./definition";
export type { StartInstanceParams, InstanceDetail, WorkflowInstance, WorkflowHistory, PageParams } from "./instance";
export type { WorkflowTask, PaginatedResult } from "./types";
export type { TaskListParams } from "./task";
export { DefStatus } from "./definition";
export { InstanceStatus, TaskStatus } from "./instance";
