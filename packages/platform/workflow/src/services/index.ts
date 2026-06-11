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
  updateDefinition(id: string, params: UpdateDefParams): Promise<void>;
  deleteDefinition(id: string): Promise<void>;
  getDefinition(id: string): Promise<WorkflowDefinition | null>;
  getDefinitionByBusinessType(businessType: string): Promise<WorkflowDefinition | null>;
  listDefinitions(params?: ListDefParams): Promise<PaginatedResult<WorkflowDefinition>>;
  publishDefinition(id: string): Promise<void>;
  disableDefinition(id: string): Promise<void>;
  cloneDefinition(id: string): Promise<{ id: string }>;
  saveGraph(defId: string, graph: { nodes: unknown[]; edges: unknown[] }): Promise<void>;
  getGraph(defId: string): Promise<{ nodes: unknown[]; edges: unknown[] }>;
  validateGraphData(defId: string): Promise<{ valid: boolean; errors: string[] }>;
  startInstance(params: StartInstanceParams): Promise<{ instanceId: string }>;
  getInstanceDetail(instanceId: string): Promise<InstanceDetail | null>;
  listMyInstances(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowInstance>>;
  listInstancesByBusiness(businessType: string, businessId: string | undefined, params?: PageParams): Promise<PaginatedResult<WorkflowInstance>>;
  withdrawInstance(instanceId: string, userId: string, comment?: string): Promise<void>;
  cancelInstance(instanceId: string, userId: string, comment?: string): Promise<void>;
  resubmitInstance(instanceId: string, userId: string, formData: Record<string, unknown>): Promise<{ instanceId: string }>;
  getInstanceHistory(instanceId: string): Promise<WorkflowHistory[]>;
  approveTask(taskId: string, userId: string, comment?: string): Promise<void>;
  rejectTask(taskId: string, userId: string, comment?: string): Promise<void>;
  transferTask(taskId: string, userId: string, targetUserId: string, comment?: string): Promise<void>;
  addSign(taskId: string, userId: string, targetUserIds: string[], comment?: string): Promise<void>;
  urgeTask(taskId: string, userId: string): Promise<void>;
  listMyTasks(userId: string, params?: TaskListParams): Promise<PaginatedResult<WorkflowTask>>;
  listMyDoneTasks(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowTask>>;
}

export interface WorkflowServiceDeps { db: Database; eventBus?: EventBus; }

export function createWorkflowService(deps: WorkflowServiceDeps): WorkflowService {
  const { db, eventBus } = deps;
  const assigneeResolver = createAssigneeResolver({ db });
  const defService = createDefinitionService({ db });
  const instService = createInstanceService({ db, eventBus, assigneeResolver });
  const taskService = createTaskService({ db, eventBus, assigneeResolver });

  return {
    createDefinition: (p) => defService.create(p),
    updateDefinition: (id, p) => defService.update(id, p),
    deleteDefinition: (id) => defService.delete(id),
    getDefinition: (id) => defService.getById(id),
    getDefinitionByBusinessType: (bt) => defService.getByBusinessType(bt),
    listDefinitions: (p) => defService.list(p),
    publishDefinition: (id) => defService.publish(id),
    disableDefinition: (id) => defService.disable(id),
    cloneDefinition: (id) => defService.clone(id),
    saveGraph: (defId, g) => defService.saveGraph(defId, g as { nodes: import("../engine/graph").GraphNodeData[]; edges: import("../engine/graph").GraphEdgeData[] }),
    getGraph: (defId) => defService.getGraph(defId),
    validateGraphData: (defId) => defService.validateGraphData(defId),
    startInstance: (p) => instService.start(p),
    getInstanceDetail: (id) => instService.getDetail(id),
    listMyInstances: (uid, p) => instService.listMy(uid, p),
    listInstancesByBusiness: (bt, bid, p) => instService.listByBusiness(bt, bid, p),
    withdrawInstance: (id, uid, c) => instService.withdraw(id, uid, c),
    cancelInstance: (id, uid, c) => instService.cancel(id, uid, c),
    resubmitInstance: (id, uid, fd) => instService.resubmit(id, uid, fd),
    getInstanceHistory: (id) => instService.getHistory(id),
    approveTask: (id, uid, c) => taskService.approve(id, uid, c),
    rejectTask: (id, uid, c) => taskService.reject(id, uid, c),
    transferTask: (id, uid, tid, c) => taskService.transfer(id, uid, tid, c),
    addSign: (id, uid, tids, c) => taskService.addSign(id, uid, tids, c),
    urgeTask: (id, uid) => taskService.urge(id, uid),
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
