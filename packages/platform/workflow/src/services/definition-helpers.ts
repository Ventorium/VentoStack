/**
 * @ventostack/workflow — 定义服务辅助函数
 *
 * cloneDef 和 deleteDef 的实现，从 definition.ts 中提取以控制文件行数。
 */

import type { Database } from "@ventostack/database";
import {
  WorkflowDefModel, WorkflowNodeModel, WorkflowEdgeModel,
  WorkflowInstanceModel, WorkflowTaskModel,
} from "../models";
import { workflowErrors } from "../engine/errors";
import { DefStatus } from "./definition";

/** 级联删除流程定义及其所有关联数据 */
export async function cascadeDeleteDefinition(db: Database, id: string): Promise<void> {
  const def = await db.query(WorkflowDefModel).where("id", "=", id).select("id", "status").get();
  if (!def) throw workflowErrors.defNotFound();
  if (def.status !== DefStatus.DRAFT) throw workflowErrors.invalidGraph("只有草稿状态的定义可以删除");

  const instances = await db.query(WorkflowInstanceModel).where("definition_id", "=", id).select("id").list();
  for (const inst of instances) {
    await db.query(WorkflowTaskModel).where("instance_id", "=", inst.id).hardDelete();
  }
  await db.query(WorkflowInstanceModel).where("definition_id", "=", id).hardDelete();
  await db.query(WorkflowEdgeModel).where("definition_id", "=", id).hardDelete();
  await db.query(WorkflowNodeModel).where("definition_id", "=", id).hardDelete();
  await db.query(WorkflowDefModel).where("id", "=", id).hardDelete();
}

/** 克隆流程定义（含节点和边） */
export async function cloneDefinition(db: Database, id: string): Promise<{ id: string }> {
  const def = await db.query(WorkflowDefModel).where("id", "=", id)
    .select("id", "name", "code", "version", "description", "category", "form_config", "settings", "created_by", "tenant_id")
    .get();
  if (!def) throw workflowErrors.defNotFound();

  const newId = crypto.randomUUID();
  await db.query(WorkflowDefModel).insert({
    id: newId, name: `${def.name} (副本)`, code: `${def.code}_copy_${Date.now()}`,
    version: 1, description: def.description, category: def.category, status: DefStatus.DRAFT,
    form_config: def.form_config, settings: def.settings, created_by: def.created_by, tenant_id: def.tenant_id,
  });

  const nodes = await db.query(WorkflowNodeModel).where("definition_id", "=", id)
    .select("id", "name", "type", "config", "position_x", "position_y", "sort").list();
  const nodeIdMap = new Map<string, string>();
  for (const node of nodes) {
    const newNid = crypto.randomUUID();
    nodeIdMap.set(node.id, newNid);
    await db.query(WorkflowNodeModel).insert({
      id: newNid, definition_id: newId, name: node.name, type: node.type,
      config: node.config, position_x: node.position_x, position_y: node.position_y, sort: node.sort,
    });
  }

  const edges = await db.query(WorkflowEdgeModel).where("definition_id", "=", id)
    .select("id", "source_node_id", "target_node_id", "name", "sort", "config").list();
  for (const edge of edges) {
    const newSrc = nodeIdMap.get(edge.source_node_id);
    const newTgt = nodeIdMap.get(edge.target_node_id);
    if (newSrc && newTgt) {
      await db.query(WorkflowEdgeModel).insert({
        id: crypto.randomUUID(), definition_id: newId, source_node_id: newSrc,
        target_node_id: newTgt, name: edge.name, sort: edge.sort, config: edge.config,
      });
    }
  }

  return { id: newId };
}
