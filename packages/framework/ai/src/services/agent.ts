/**
 * Agent CRUD 服务 — 基于 ai_agent 表的完整实现
 */

import type { Database } from "@ventostack/database";

export interface CreateAgentParams {
  name: string;
  description?: string;
  model: string;
  systemPrompt: string;
  tools?: unknown[];
  knowledgeBaseIds?: string[];
  skillIds?: string[];
  mcpServerIds?: string[];
  modelOverrides?: Record<string, string>;
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
  model?: string;
  systemPrompt?: string;
  tools?: unknown[];
  knowledgeBaseIds?: string[];
  skillIds?: string[];
  mcpServerIds?: string[];
  modelOverrides?: Record<string, string>;
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
  model: string;
  systemPrompt: string;
  tools: unknown;
  knowledgeBaseIds: unknown;
  skillIds: unknown;
  mcpServerIds: unknown;
  memoryConfig: Record<string, unknown> | null;
  config: Record<string, unknown> | null;
  maxIterations: number | null;
  maxTokensPerTurn: number | null;
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
  /** 按状态过滤（如 published / draft）。缺省返回所有状态。 */
  status?: string;
  /** 按名称或描述模糊搜索 */
  search?: string;
}

/** 依赖引用校验：由装配层注入，用于校验 model / 知识库 / Skill / MCP 引用是否存在且归属当前租户 */
export interface AgentRefsValidator {
  (params: {
    model?: string;
    knowledgeBaseIds?: string[];
    skillIds?: string[];
    mcpServerIds?: string[];
  }, tenantId: string): Promise<void>;
}

export function createAgentService(deps: { db: Database; validateRefs?: AgentRefsValidator }) {
  const { db } = deps;

  async function create(params: CreateAgentParams): Promise<{ id: string }> {
    await deps.validateRefs?.(params, params.tenantId);
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_agent (id, name, description, system_prompt, model, tools, knowledge_base_ids, skill_ids, mcp_server_ids, model_overrides, memory_config, config, max_iterations, max_tokens_per_turn, is_public, tenant_id, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'draft')`,
      [
        id,
        params.name,
        params.description ?? null,
        params.systemPrompt,
        params.model,
        params.tools ? JSON.stringify(params.tools) : null,
        params.knowledgeBaseIds ? JSON.stringify(params.knowledgeBaseIds) : null,
        params.skillIds ? JSON.stringify(params.skillIds) : null,
        params.mcpServerIds ? JSON.stringify(params.mcpServerIds) : null,
        params.modelOverrides ? JSON.stringify(params.modelOverrides) : null,
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

  async function update(
    id: string,
    params: UpdateAgentParams,
    tenantId?: string,
    opts?: { userId?: string; isAdmin?: boolean },
  ): Promise<void> {
    await deps.validateRefs?.(params, tenantId ?? '');
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) { sets.push(`name = $${idx++}`); values.push(params.name); }
    if (params.description !== undefined) { sets.push(`description = $${idx++}`); values.push(params.description); }
    if (params.model !== undefined) { sets.push(`model = $${idx++}`); values.push(params.model); }
    if (params.systemPrompt !== undefined) { sets.push(`system_prompt = $${idx++}`); values.push(params.systemPrompt); }
    if (params.tools !== undefined) { sets.push(`tools = $${idx++}`); values.push(JSON.stringify(params.tools)); }
    if (params.knowledgeBaseIds !== undefined) { sets.push(`knowledge_base_ids = $${idx++}`); values.push(JSON.stringify(params.knowledgeBaseIds)); }
    if (params.skillIds !== undefined) { sets.push(`skill_ids = $${idx++}`); values.push(JSON.stringify(params.skillIds)); }
    if (params.mcpServerIds !== undefined) { sets.push(`mcp_server_ids = $${idx++}`); values.push(JSON.stringify(params.mcpServerIds)); }
    if (params.modelOverrides !== undefined) { sets.push(`model_overrides = $${idx++}`); values.push(JSON.stringify(params.modelOverrides)); }
    if (params.memoryConfig !== undefined) { sets.push(`memory_config = $${idx++}`); values.push(JSON.stringify(params.memoryConfig)); }
    if (params.config !== undefined) { sets.push(`config = $${idx++}`); values.push(JSON.stringify(params.config)); }
    if (params.maxIterations !== undefined) { sets.push(`max_iterations = $${idx++}`); values.push(params.maxIterations); }
    if (params.maxTokensPerTurn !== undefined) { sets.push(`max_tokens_per_turn = $${idx++}`); values.push(params.maxTokensPerTurn); }
    if (params.isPublic !== undefined) { sets.push(`is_public = $${idx++}`); values.push(params.isPublic); }
    if (params.status !== undefined) { sets.push(`status = $${idx++}`); values.push(params.status); }

    if (sets.length === 0) return;

    sets.push(`updated_at = NOW()`);
    const whereClauses = [`id = $${idx}`];
    values.push(id);
    idx++;
    if (tenantId) {
      whereClauses.push(`tenant_id = $${idx}`);
      values.push(tenantId);
      idx++;
    }
    // 归属检查：非管理员只能修改自己创建的 Agent
    if (!opts?.isAdmin && opts?.userId) {
      whereClauses.push(`created_by = $${idx}`);
      values.push(opts.userId);
      idx++;
    }

    await db.raw(
      `UPDATE ai_agent SET ${sets.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
      values,
    );
  }

  async function getById(id: string, tenantId: string): Promise<AgentItem | null> {
    const rows = await db.raw(
      `SELECT id, name, description, model, system_prompt as "systemPrompt",
              tools, knowledge_base_ids as "knowledgeBaseIds",
              skill_ids as "skillIds", mcp_server_ids as "mcpServerIds",
              memory_config as "memoryConfig", config,
              max_iterations as "maxIterations", max_tokens_per_turn as "maxTokensPerTurn",
              status, is_public as "isPublic", tenant_id as "tenantId",
              created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_agent WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    const parseJSON = (v: unknown) => typeof v === "string" ? JSON.parse(v) : v;
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      model: r.model as string,
      systemPrompt: r.systemPrompt as string,
      tools: parseJSON(r.tools) ?? null,
      knowledgeBaseIds: parseJSON(r.knowledgeBaseIds) ?? null,
      skillIds: parseJSON(r.skillIds) ?? null,
      mcpServerIds: parseJSON(r.mcpServerIds) ?? null,
      memoryConfig: (parseJSON(r.memoryConfig) as Record<string, unknown> | null) ?? null,
      config: (parseJSON(r.config) as Record<string, unknown> | null) ?? null,
      maxIterations: r.maxIterations == null ? null : Number(r.maxIterations),
      maxTokensPerTurn: r.maxTokensPerTurn == null ? null : Number(r.maxTokensPerTurn),
      status: r.status as string,
      isPublic: r.isPublic as boolean,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    };
  }

  async function list(params: AgentListParams): Promise<{ list: AgentItem[]; total: number }> {
    const { tenantId, userId, isAdmin, page = 1, pageSize = 20, status, search } = params;
    const offset = (page - 1) * pageSize;

    // 动态构建 WHERE 子句及参数数组
    const conditions: string[] = [];
    const queryParams: unknown[] = [];

    if (isAdmin) {
      conditions.push(`tenant_id = $${queryParams.length + 1}`);
      queryParams.push(tenantId);
    } else {
      conditions.push(`tenant_id = $${queryParams.length + 1}`);
      queryParams.push(tenantId);
      conditions.push(`(created_by = $${queryParams.length + 1} OR is_public = true)`);
      queryParams.push(userId);
    }

    if (status) {
      conditions.push(`status = $${queryParams.length + 1}`);
      queryParams.push(status);
    }

    if (search) {
      conditions.push(`(name ILIKE $${queryParams.length + 1} OR description ILIKE $${queryParams.length + 1})`);
      queryParams.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await db.raw(
      `SELECT COUNT(*) as cnt FROM ai_agent ${whereClause}`,
      queryParams,
    );
    const total = Number((countRows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const limitIdx = queryParams.length + 1;
    const offsetIdx = queryParams.length + 2;
    const rows = await db.raw(
      `SELECT id, name, description, model, system_prompt as "systemPrompt",
              tools, knowledge_base_ids as "knowledgeBaseIds",
              skill_ids as "skillIds", mcp_server_ids as "mcpServerIds",
              memory_config as "memoryConfig", config,
              max_iterations as "maxIterations", max_tokens_per_turn as "maxTokensPerTurn",
              status, is_public as "isPublic", tenant_id as "tenantId",
              created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_agent ${whereClause}
       ORDER BY updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...queryParams, pageSize, offset],
    );

    const list = (rows as Array<Record<string, unknown>>).map((r) => {
      const pj = (v: unknown) => typeof v === "string" ? JSON.parse(v) : v;
      return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      model: r.model as string,
      systemPrompt: r.systemPrompt as string,
      tools: pj(r.tools) ?? null,
      knowledgeBaseIds: pj(r.knowledgeBaseIds) ?? null,
      skillIds: pj(r.skillIds) ?? null,
      mcpServerIds: pj(r.mcpServerIds) ?? null,
      memoryConfig: (pj(r.memoryConfig) as Record<string, unknown> | null) ?? null,
      config: (pj(r.config) as Record<string, unknown> | null) ?? null,
      maxIterations: r.maxIterations == null ? null : Number(r.maxIterations),
      maxTokensPerTurn: r.maxTokensPerTurn == null ? null : Number(r.maxTokensPerTurn),
      status: r.status as string,
      isPublic: r.isPublic as boolean,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }; });

    return { list, total };
  }

  async function deleteAgent(
    id: string,
    tenantId: string,
    opts?: { userId?: string; isAdmin?: boolean },
  ): Promise<void> {
    const whereClauses = [`id = $1`, `tenant_id = $2`];
    const values: unknown[] = [id, tenantId];
    // 归属检查：非管理员只能删除自己创建的 Agent
    if (!opts?.isAdmin && opts?.userId) {
      whereClauses.push(`created_by = $3`);
      values.push(opts.userId);
    }
    await db.raw(`DELETE FROM ai_agent WHERE ${whereClauses.join(" AND ")}`, values);
  }

  async function publish(
    id: string,
    tenantId: string,
    opts?: { userId?: string; isAdmin?: boolean },
  ): Promise<void> {
    const whereClauses = [`id = $1`, `tenant_id = $2`];
    const values: unknown[] = [id, tenantId];
    // 归属检查：非管理员只能发布自己创建的 Agent
    if (!opts?.isAdmin && opts?.userId) {
      whereClauses.push(`created_by = $3`);
      values.push(opts.userId);
    }
    await db.raw(
      `UPDATE ai_agent SET status = 'active', updated_at = NOW() WHERE ${whereClauses.join(" AND ")}`,
      values,
    );
  }

  return { create, update, getById, list, delete: deleteAgent, publish };
}
