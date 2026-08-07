/**
 * 知识库 scope 管理服务
 * 支持 global（全局）、personal（个人）、department（部门）三种作用域
 * 所有查询强制 tenant_id + scope 过滤
 */
import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";

export type KBScope = "global" | "personal" | "department";

export interface ScopedKBItem {
  id: string;
  name: string;
  description: string | null;
  basePath: string;
  scope: KBScope;
  ownerId: string | null;
  tenantId: string;
  createdBy: string;
  status: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScopedKBDeps {
  db: Database;
  eventBus?: EventBus;
}

export function createScopedKBService(deps: ScopedKBDeps) {
  const { db, eventBus } = deps;

  function mapKB(r: Record<string, unknown>): ScopedKBItem {
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      basePath: r.base_path as string,
      scope: (r.scope as KBScope) ?? "global",
      ownerId: (r.owner_id as string) ?? null,
      tenantId: r.tenant_id as string,
      createdBy: r.created_by as string,
      status: r.status as string,
      documentCount: Number(r.document_count ?? 0),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ""),
    };
  }

  async function list(params: {
    tenantId: string;
    scope?: KBScope;
    ownerId?: string;
    userId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: ScopedKBItem[]; total: number }> {
    const { tenantId, scope, ownerId, userId, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;
    const conditions: string[] = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (scope) {
      conditions.push(`scope = $${idx++}`);
      values.push(scope);
    }

    if (scope === "personal" && ownerId) {
      conditions.push(`owner_id = $${idx++}`);
      values.push(ownerId);
    } else if (scope === "personal" && userId) {
      // 个人知识库只能看自己的
      conditions.push(`owner_id = $${idx++}`);
      values.push(userId);
    }

    if (scope === "department" && ownerId) {
      conditions.push(`owner_id = $${idx++}`);
      values.push(ownerId);
    }

    const where = conditions.join(" AND ");

    const countRows = await db.raw(`SELECT COUNT(*) as cnt FROM ai_knowledge_base WHERE ${where}`, values) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.cnt ?? 0);

    const rows = await db.raw(
      `SELECT * FROM ai_knowledge_base WHERE ${where} ORDER BY updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    ) as Array<Record<string, unknown>>;

    return { list: rows.map(mapKB), total };
  }

  async function create(params: {
    name: string;
    description?: string;
    basePath: string;
    scope: KBScope;
    ownerId?: string;
    tenantId: string;
    userId: string;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_knowledge_base (id, name, description, base_path, scope, owner_id, tenant_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, params.name, params.description ?? null, params.basePath, params.scope, params.ownerId ?? null, params.tenantId, params.userId],
    );
    await eventBus?.emit("ai.kb.created", { id, scope: params.scope, tenantId: params.tenantId });
    return { id };
  }

  async function updateScope(id: string, scope: KBScope, ownerId: string | null, tenantId: string): Promise<void> {
    await db.raw(
      `UPDATE ai_knowledge_base SET scope = $1, owner_id = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
      [scope, ownerId, id, tenantId],
    );
  }

  async function getById(id: string, tenantId: string): Promise<ScopedKBItem | null> {
    const rows = await db.raw(`SELECT * FROM ai_knowledge_base WHERE id = $1 AND tenant_id = $2`, [id, tenantId]) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapKB(rows[0]) : null;
  }

  // 部门知识库：获取有知识库的部门列表
  async function listDepartments(tenantId: string): Promise<Array<{ departmentId: string; count: number }>> {
    const rows = await db.raw(
      `SELECT owner_id as "departmentId", COUNT(*) as cnt
       FROM ai_knowledge_base
       WHERE tenant_id = $1 AND scope = 'department'
       GROUP BY owner_id ORDER BY cnt DESC`,
      [tenantId],
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ departmentId: r.departmentId as string, count: Number(r.cnt) }));
  }

  return { list, create, updateScope, getById, listDepartments };
}
