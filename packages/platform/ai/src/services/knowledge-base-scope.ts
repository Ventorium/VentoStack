/**
 * 知识库 scope 服务
 * 管理 global / personal / department 级别的知识库隔离
 */
import type { Database } from "@ventostack/database";

export type KnowledgeBaseScope = "global" | "personal" | "department";

export interface ScopedKBItem {
  id: string;
  name: string;
  description: string | null;
  basePath: string;
  scope: KnowledgeBaseScope;
  ownerId: string | null;
  tenantId: string;
  createdBy: string;
  status: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScopedKnowledgeBaseService {
  /** 按 scope 列表查询 */
  listByScope(params: {
    scope: KnowledgeBaseScope;
    tenantId: string;
    ownerId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: ScopedKBItem[]; total: number }>;

  /** 创建时指定 scope */
  createWithScope(params: {
    name: string;
    description?: string;
    basePath: string;
    scope: KnowledgeBaseScope;
    ownerId?: string;
    tenantId: string;
    userId: string;
  }): Promise<{ id: string }>;

  /** 检查用户是否有指定 scope 的访问权限 */
  hasScopeAccess(
    scope: KnowledgeBaseScope,
    userId: string,
    roles: string[],
    kbOwnerId?: string,
  ): boolean;
}

export function createScopedKnowledgeBaseService(deps: { db: Database }): ScopedKnowledgeBaseService {
  const { db } = deps;

  async function listByScope(params: {
    scope: KnowledgeBaseScope;
    tenantId: string;
    ownerId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: ScopedKBItem[]; total: number }> {
    const { scope, tenantId, ownerId, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;

    let whereSql = `WHERE scope = $1 AND tenant_id = $2`;
    const queryParams: unknown[] = [scope, tenantId];

    if (scope === "personal" && ownerId) {
      whereSql += ` AND owner_id = $3`;
      queryParams.push(ownerId);
    } else if (scope === "department" && ownerId) {
      whereSql += ` AND owner_id = $3`;
      queryParams.push(ownerId);
    }

    const countRows = await db.raw(
      `SELECT COUNT(*) as cnt FROM ai_knowledge_base ${whereSql}`,
      queryParams,
    );
    const total = Number((countRows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const limitIdx = queryParams.length + 1;
    const offsetIdx = queryParams.length + 2;
    const rows = await db.raw(
      `SELECT id, name, description, base_path as "basePath", scope, owner_id as "ownerId",
              tenant_id as "tenantId", created_by as "createdBy", status,
              document_count as "documentCount",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_knowledge_base ${whereSql}
       ORDER BY updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...queryParams, pageSize, offset],
    );

    const list = (rows as Array<Record<string, unknown>>).map(mapRow);
    return { list, total };
  }

  async function createWithScope(params: {
    name: string;
    description?: string;
    basePath: string;
    scope: KnowledgeBaseScope;
    ownerId?: string;
    tenantId: string;
    userId: string;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_knowledge_base (id, name, description, base_path, scope, owner_id, tenant_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id, params.name, params.description ?? null, params.basePath,
        params.scope, params.ownerId ?? null, params.tenantId, params.userId,
      ],
    );
    return { id };
  }

  function hasScopeAccess(
    scope: KnowledgeBaseScope,
    userId: string,
    roles: string[],
    kbOwnerId?: string,
  ): boolean {
    const isAdmin = roles.includes("admin");

    switch (scope) {
      case "global":
        // 全局知识库：所有有权限的用户都可查看
        return true;
      case "personal":
        // 个人知识库：只能访问自己的
        return isAdmin || kbOwnerId === userId;
      case "department":
        // 部门知识库：同部门或管理员
        return isAdmin || kbOwnerId === userId;
      default:
        return false;
    }
  }

  return { listByScope, createWithScope, hasScopeAccess };
}

function mapRow(r: Record<string, unknown>): ScopedKBItem {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    basePath: r.basePath as string,
    scope: (r.scope as KnowledgeBaseScope) ?? "global",
    ownerId: (r.ownerId as string) ?? null,
    tenantId: r.tenantId as string,
    createdBy: r.createdBy as string,
    status: r.status as string,
    documentCount: Number(r.documentCount ?? 0),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
  };
}
