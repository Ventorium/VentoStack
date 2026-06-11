/**
 * @ventostack/workflow — 流程定义服务
 *
 * 流程定义的 CRUD、发布/停用、克隆、图数据读写、校验。
 */

import type { Database } from "@ventostack/database";
import { WorkflowDefModel, WorkflowNodeModel, WorkflowEdgeModel } from "../models";
import { buildGraph, validateGraph } from "../engine/graph";
import type { GraphNodeData, GraphEdgeData } from "../engine/graph";
import { workflowErrors } from "../engine/errors";
import { cascadeDeleteDefinition, cloneDefinition } from "./definition-helpers";

import { DefStatus } from "./constants";
export { DefStatus };

export interface WorkflowDefinition {
  id: string; name: string; code: string; version: number;
  description: string | null; category: string | null; businessType: string | null;
  status: number; createdBy: string | null; tenantId: string | null; createdAt: string;
}

export interface CreateDefParams {
  name: string; code: string; description?: string; category?: string;
  businessType?: string; formConfig?: Record<string, unknown>; settings?: Record<string, unknown>;
  createdBy?: string; tenantId?: string;
}

export interface UpdateDefParams {
  name?: string; description?: string; category?: string; businessType?: string;
  formConfig?: Record<string, unknown>; settings?: Record<string, unknown>;
}

export interface ListDefParams { status?: number; category?: string; businessType?: string; page?: number; pageSize?: number }
export interface PaginatedResult<T> { items: T[]; total: number; page: number; pageSize: number }

export interface DefinitionService {
  create(params: CreateDefParams): Promise<{ id: string }>;
  update(id: string, params: UpdateDefParams): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<WorkflowDefinition | null>;
  getByBusinessType(businessType: string): Promise<WorkflowDefinition | null>;
  list(params?: ListDefParams): Promise<PaginatedResult<WorkflowDefinition>>;
  publish(id: string): Promise<void>;
  disable(id: string): Promise<void>;
  clone(id: string): Promise<{ id: string }>;
  saveGraph(defId: string, graph: { nodes: GraphNodeData[]; edges: GraphEdgeData[] }): Promise<void>;
  getGraph(defId: string): Promise<{ nodes: GraphNodeData[]; edges: GraphEdgeData[] }>;
  validateGraphData(defId: string): Promise<{ valid: boolean; errors: string[] }>;
}

export function createDefinitionService(deps: { db: Database }): DefinitionService {
  const { db } = deps;

  async function create(params: CreateDefParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.query(WorkflowDefModel).insert({
      id, name: params.name, code: params.code, version: 1,
      description: params.description ?? null, category: params.category ?? null,
      business_type: params.businessType ?? null,
      status: DefStatus.DRAFT, created_by: params.createdBy ?? null, tenant_id: params.tenantId ?? null,
    });
    return { id };
  }

  async function update(id: string, params: UpdateDefParams): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.category !== undefined) updates.category = params.category;
    if (params.businessType !== undefined) updates.business_type = params.businessType;
    if (params.formConfig !== undefined) updates.form_config = params.formConfig;
    if (params.settings !== undefined) updates.settings = params.settings;
    if (Object.keys(updates).length === 0) return;
    await db.query(WorkflowDefModel).where("id", "=", id).update(updates);
  }

  async function deleteDef(id: string): Promise<void> {
    await cascadeDeleteDefinition(db, id);
  }

  async function getById(id: string): Promise<WorkflowDefinition | null> {
    const row = await db.query(WorkflowDefModel).where("id", "=", id)
      .select("id", "name", "code", "version", "description", "category", "business_type", "status", "created_by", "tenant_id", "created_at")
      .get();
    return row ? mapDefinition(row) : null;
  }

  async function getByBusinessType(businessType: string): Promise<WorkflowDefinition | null> {
    const row = await db.query(WorkflowDefModel)
      .where("business_type", "=", businessType)
      .where("status", "=", DefStatus.ACTIVE)
      .select("id", "name", "code", "version", "description", "category", "business_type", "status", "created_by", "tenant_id", "created_at")
      .orderBy("version", "desc")
      .get();
    return row ? mapDefinition(row) : null;
  }

  async function list(params?: ListDefParams): Promise<PaginatedResult<WorkflowDefinition>> {
    const { status, category, businessType, page = 1, pageSize = 10 } = params ?? {};
    let q = db.query(WorkflowDefModel);
    if (status !== undefined) q = q.where("status", "=", status);
    if (category) q = q.where("category", "=", category);
    if (businessType) q = q.where("business_type", "=", businessType);
    const total = await q.count();
    const rows = await q
      .select("id", "name", "code", "version", "description", "category", "business_type", "status", "created_by", "tenant_id", "created_at")
      .orderBy("created_at", "desc").limit(pageSize).offset((page - 1) * pageSize).list();
    return { items: rows.map(mapDefinition), total, page, pageSize };
  }

  async function publish(id: string): Promise<void> {
    const def = await db.query(WorkflowDefModel).where("id", "=", id)
      .select("id", "status", "version").get();
    if (!def) throw workflowErrors.defNotFound();
    if (def.status === DefStatus.ACTIVE) return;
    const { valid, errors } = await validateGraphData(id);
    if (!valid) throw workflowErrors.invalidGraph(errors.join("; "));
    await db.query(WorkflowDefModel).where("id", "=", id)
      .update({ status: DefStatus.ACTIVE, version: def.version + 1 });
  }

  async function disable(id: string): Promise<void> {
    const def = await db.query(WorkflowDefModel).where("id", "=", id).select("id", "status").get();
    if (!def) throw workflowErrors.defNotFound();
    if (def.status !== DefStatus.ACTIVE) throw workflowErrors.invalidGraph("只有已发布的定义可以停用");
    await db.query(WorkflowDefModel).where("id", "=", id).update({ status: DefStatus.DISABLED });
  }

  async function cloneDef(id: string): Promise<{ id: string }> {
    return cloneDefinition(db, id);
  }

  async function saveGraph(defId: string, graph: { nodes: GraphNodeData[]; edges: GraphEdgeData[] }): Promise<void> {
    await db.raw(`DELETE FROM sys_workflow_edge WHERE definition_id = $1`, [defId]);
    await db.raw(`DELETE FROM sys_workflow_node WHERE definition_id = $1`, [defId]);
    for (const node of graph.nodes) {
      await db.raw(
        `INSERT INTO sys_workflow_node (id, definition_id, name, type, config, position_x, position_y, sort, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [node.id, defId, node.name, node.type, node.config ? JSON.stringify(node.config) : null, node.position_x ?? 0, node.position_y ?? 0, node.sort ?? 0],
      );
    }
    for (const edge of graph.edges) {
      await db.raw(
        `INSERT INTO sys_workflow_edge (id, definition_id, source_node_id, target_node_id, name, sort, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [edge.id, defId, edge.source_node_id, edge.target_node_id, edge.name ?? null, edge.sort ?? 0],
      );
    }
  }

  async function getGraph(defId: string): Promise<{ nodes: GraphNodeData[]; edges: GraphEdgeData[] }> {
    const nodes = await db.query(WorkflowNodeModel).where("definition_id", "=", defId)
      .select("id", "name", "type", "config", "position_x", "position_y", "sort").orderBy("sort", "asc").list();
    const edges = await db.query(WorkflowEdgeModel).where("definition_id", "=", defId)
      .select("id", "source_node_id", "target_node_id", "name", "sort").orderBy("sort", "asc").list();
    return {
      nodes: nodes.map((n: Record<string, unknown>) => ({
        id: n.id as string, name: n.name as string, type: n.type as GraphNodeData["type"],
        config: n.config as Record<string, unknown> | null,
        position_x: n.position_x as number, position_y: n.position_y as number, sort: n.sort as number,
      })),
      edges: edges.map((e: Record<string, unknown>) => ({
        id: e.id as string, source_node_id: e.source_node_id as string,
        target_node_id: e.target_node_id as string, name: e.name as string, sort: e.sort as number,
      })),
    };
  }

  async function validateGraphData(defId: string): Promise<{ valid: boolean; errors: string[] }> {
    const { nodes, edges } = await getGraph(defId);
    if (nodes.length === 0) return { valid: false, errors: ["流程无节点"] };
    try {
      const graph = buildGraph(nodes, edges);
      const errors = validateGraph(graph);
      return { valid: errors.length === 0, errors };
    } catch (e) {
      return { valid: false, errors: [e instanceof Error ? e.message : "图构建失败"] };
    }
  }

  return { create, update, delete: deleteDef, getById, getByBusinessType, list, publish, disable, clone: cloneDef, saveGraph, getGraph, validateGraphData };
}

function mapDefinition(row: Record<string, unknown>): WorkflowDefinition {
  return {
    id: row.id as string, name: row.name as string, code: row.code as string,
    version: row.version as number, description: (row.description as string) ?? null,
    category: (row.category as string) ?? null, businessType: (row.business_type as string) ?? null,
    status: row.status as number,
    createdBy: (row.created_by as string) ?? null, tenantId: (row.tenant_id as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
