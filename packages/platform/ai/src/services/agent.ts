/**
 * Agent CRUD 服务 — 基于 ai_agent 表的完整实现
 */

import type { Database } from "@ventostack/database";

export interface CreateAgentParams {
  name: string;
  description?: string;
  type?: string;
  model: string;
  systemPrompt: string;
  tools?: unknown[];
  knowledgeBaseIds?: string[];
  memoryConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  maxIterations?: number;
  maxTokensPerTurn?: number;
  isPublic?: boolean;
  tenantId: string;
  createdBy: string;
}

export interface UpdateAgentParams {
  name?: string;
  description?: string;
  type?: string;
  model?: string;
  systemPrompt?: string;
  tools?: unknown[];
  knowledgeBaseIds?: string[];
  memoryConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  maxIterations?: number;
  maxTokensPerTurn?: number;
  isPublic?: boolean;
  status?: string;
}

export interface AgentItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  model: string;
  systemPrompt: string;
  status: string;
  isPublic: boolean;
  tenantId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentListParams {
  tenantId: string;
  userId: string;
  isAdmin: boolean;
  page?: number;
  pageSize?: number;
}

export function createAgentService(deps: { db: Database }) {
  const { db } = deps;

  async function create(params: CreateAgentParams): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_agent (id, name, description, type, system_prompt, model, tools, knowledge_base_ids, memory_config, config, max_iterations, max_tokens_per_turn, is_public, tenant_id, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'draft')`,
      [
        id,
        params.name,
        params.description ?? null,
        params.type ?? "chatbot",
        params.systemPrompt,
        params.model,
        params.tools ? JSON.stringify(params.tools) : null,
        params.knowledgeBaseIds ? JSON.stringify(params.knowledgeBaseIds) : null,
        params.memoryConfig ? JSON.stringify(params.memoryConfig) : null,
        params.config ? JSON.stringify(params.config) : null,
        params.maxIterations ?? 10,
        params.maxTokensPerTurn ?? 4096,
        params.isPublic ?? false,
        params.tenantId,
        params.createdBy,
      ],
    );
    return { id };
  }

  async function update(id: string, params: UpdateAgentParams): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) { sets.push(`name = $${idx++}`); values.push(params.name); }
    if (params.description !== undefined) { sets.push(`description = $${idx++}`); values.push(params.description); }
    if (params.type !== undefined) { sets.push(`type = $${idx++}`); values.push(params.type); }
    if (params.model !== undefined) { sets.push(`model = $${idx++}`); values.push(params.model); }
    if (params.systemPrompt !== undefined) { sets.push(`system_prompt = $${idx++}`); values.push(params.systemPrompt); }
    if (params.tools !== undefined) { sets.push(`tools = $${idx++}`); values.push(JSON.stringify(params.tools)); }
    if (params.knowledgeBaseIds !== undefined) { sets.push(`knowledge_base_ids = $${idx++}`); values.push(JSON.stringify(params.knowledgeBaseIds)); }
    if (params.memoryConfig !== undefined) { sets.push(`memory_config = $${idx++}`); values.push(JSON.stringify(params.memoryConfig)); }
    if (params.config !== undefined) { sets.push(`config = $${idx++}`); values.push(JSON.stringify(params.config)); }
    if (params.maxIterations !== undefined) { sets.push(`max_iterations = $${idx++}`); values.push(params.maxIterations); }
    if (params.maxTokensPerTurn !== undefined) { sets.push(`max_tokens_per_turn = $${idx++}`); values.push(params.maxTokensPerTurn); }
    if (params.isPublic !== undefined) { sets.push(`is_public = $${idx++}`); values.push(params.isPublic); }
    if (params.status !== undefined) { sets.push(`status = $${idx++}`); values.push(params.status); }

    if (sets.length === 0) return;

    sets.push(`updated_at = NOW()`);
    values.push(id);

    await db.raw(
      `UPDATE ai_agent SET ${sets.join(", ")} WHERE id = $${idx}`,
      values,
    );
  }

  async function getById(id: string, tenantId: string): Promise<AgentItem | null> {
    const rows = await db.raw(
      `SELECT id, name, description, type, model, system_prompt as "systemPrompt",
              status, is_public as "isPublic", tenant_id as "tenantId",
              created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_agent WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      type: r.type as string,
      model: r.model as string,
      systemPrompt: r.systemPrompt as string,
      status: r.status as string,
      isPublic: r.isPublic as boolean,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    };
  }

  async function list(params: AgentListParams): Promise<{ list: AgentItem[]; total: number }> {
    const { tenantId, userId, isAdmin, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;

    const whereClause = isAdmin
      ? `WHERE tenant_id = $1`
      : `WHERE tenant_id = $1 AND (created_by = $2 OR is_public = true)`;
    const queryParams = isAdmin ? [tenantId] : [tenantId, userId];

    const countRows = await db.raw(
      `SELECT COUNT(*) as cnt FROM ai_agent ${whereClause}`,
      queryParams,
    );
    const total = Number((countRows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const limitIdx = queryParams.length + 1;
    const offsetIdx = queryParams.length + 2;
    const rows = await db.raw(
      `SELECT id, name, description, type, model, system_prompt as "systemPrompt",
              status, is_public as "isPublic", tenant_id as "tenantId",
              created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_agent ${whereClause}
       ORDER BY updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...queryParams, pageSize, offset],
    );

    const list = (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      type: r.type as string,
      model: r.model as string,
      systemPrompt: r.systemPrompt as string,
      status: r.status as string,
      isPublic: r.isPublic as boolean,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));

    return { list, total };
  }

  async function deleteAgent(id: string, tenantId: string): Promise<void> {
    await db.raw(`DELETE FROM ai_agent WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  }

  async function publish(id: string, tenantId: string): Promise<void> {
    await db.raw(
      `UPDATE ai_agent SET status = 'active', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
  }

  return { create, update, getById, list, delete: deleteAgent, publish };
}
