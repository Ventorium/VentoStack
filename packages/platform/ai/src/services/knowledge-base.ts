/**
 * 知识库 CRUD 服务 — 基于数据库 + 文件系统
 * 所有查询强制 tenant_id 过滤
 */
import type { Database } from "@ventostack/database";
import type { Cache } from "@ventostack/cache";
import type { EventBus } from "@ventostack/events";

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string | null;
  basePath: string;
  tenantId: string;
  createdBy: string;
  status: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  knowledgeBaseId: string;
  title: string;
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  links: string[] | null;
  tenantId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseCrudDeps {
  db: Database;
  cache?: Cache;
  eventBus?: EventBus;
}

export function createKnowledgeBaseCrudService(deps: KnowledgeBaseCrudDeps) {
  const { db, cache, eventBus } = deps;

  async function create(params: {
    name: string;
    description?: string;
    basePath: string;
    tenantId: string;
    userId: string;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_knowledge_base (id, name, description, base_path, tenant_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, params.name, params.description ?? null, params.basePath, params.tenantId, params.userId],
    );
    await eventBus?.emit("ai.kb.created", { id, tenantId: params.tenantId });
    return { id };
  }

  async function getById(id: string, tenantId: string): Promise<KnowledgeBaseItem | null> {
    const rows = await db.raw(
      `SELECT id, name, description, base_path as "basePath", tenant_id as "tenantId",
              created_by as "createdBy", status, document_count as "documentCount",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_knowledge_base WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      basePath: r.basePath as string,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      status: r.status as string,
      documentCount: Number(r.documentCount ?? 0),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    };
  }

  async function list(params: {
    tenantId: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: KnowledgeBaseItem[]; total: number }> {
    const { tenantId, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;

    const countRows = await db.raw(
      `SELECT COUNT(*) as cnt FROM ai_knowledge_base WHERE tenant_id = $1`,
      [tenantId],
    );
    const total = Number((countRows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await db.raw(
      `SELECT id, name, description, base_path as "basePath", tenant_id as "tenantId",
              created_by as "createdBy", status, document_count as "documentCount",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_knowledge_base WHERE tenant_id = $1
       ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
      [tenantId, pageSize, offset],
    );

    const list = (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      basePath: r.basePath as string,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      status: r.status as string,
      documentCount: Number(r.documentCount ?? 0),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));

    return { list, total };
  }

  async function deleteKB(id: string, tenantId: string): Promise<void> {
    await db.raw(
      `DELETE FROM ai_knowledge_base WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    await cache?.del(`ai:kb:${id}:*`).catch(() => {});
    await eventBus?.emit("ai.kb.deleted", { id, tenantId });
  }

  // ---- 文档管理 ----

  async function createDocument(params: {
    kbId: string;
    title: string;
    path: string;
    content: string;
    frontmatter?: Record<string, unknown>;
    links?: string[];
    tenantId: string;
    userId: string;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_document (id, knowledge_base_id, title, path, content, frontmatter, links, tenant_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, params.kbId, params.title, params.path, params.content,
        params.frontmatter ? JSON.stringify(params.frontmatter) : null,
        params.links ? JSON.stringify(params.links) : null,
        params.tenantId, params.userId,
      ],
    );
    // 更新文档计数
    await db.raw(
      `UPDATE ai_knowledge_base SET document_count = document_count + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [params.kbId, params.tenantId],
    );
    return { id };
  }

  async function getDocument(docId: string, tenantId: string): Promise<DocumentItem | null> {
    const rows = await db.raw(
      `SELECT id, knowledge_base_id as "knowledgeBaseId", title, path, content,
              frontmatter, links, tenant_id as "tenantId", created_by as "createdBy",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_document WHERE id = $1 AND tenant_id = $2`,
      [docId, tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      knowledgeBaseId: r.knowledgeBaseId as string,
      title: r.title as string,
      path: r.path as string,
      content: r.content as string,
      frontmatter: r.frontmatter as Record<string, unknown> | null,
      links: r.links as string[] | null,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    };
  }

  async function updateDocument(
    docId: string,
    params: { content?: string; title?: string },
    tenantId: string,
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.content !== undefined) { sets.push(`content = $${idx++}`); values.push(params.content); }
    if (params.title !== undefined) { sets.push(`title = $${idx++}`); values.push(params.title); }
    if (sets.length === 0) return;

    sets.push(`updated_at = NOW()`);
    values.push(docId, tenantId);

    await db.raw(
      `UPDATE ai_document SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
      values,
    );
  }

  async function deleteDocument(docId: string, tenantId: string): Promise<void> {
    const doc = await getDocument(docId, tenantId);
    if (!doc) return;

    await db.raw(`DELETE FROM ai_document WHERE id = $1 AND tenant_id = $2`, [docId, tenantId]);
    await db.raw(
      `UPDATE ai_knowledge_base SET document_count = GREATEST(document_count - 1, 0), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [doc.knowledgeBaseId, tenantId],
    );
  }

  async function listDocuments(
    kbId: string,
    params: { tenantId: string; page?: number; pageSize?: number },
  ): Promise<{ list: DocumentItem[]; total: number }> {
    const { tenantId, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;

    const countRows = await db.raw(
      `SELECT COUNT(*) as cnt FROM ai_document WHERE knowledge_base_id = $1 AND tenant_id = $2`,
      [kbId, tenantId],
    );
    const total = Number((countRows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await db.raw(
      `SELECT id, knowledge_base_id as "knowledgeBaseId", title, path, content,
              frontmatter, links, tenant_id as "tenantId", created_by as "createdBy",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_document WHERE knowledge_base_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,
      [kbId, tenantId, pageSize, offset],
    );

    const list = (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      knowledgeBaseId: r.knowledgeBaseId as string,
      title: r.title as string,
      path: r.path as string,
      content: r.content as string,
      frontmatter: r.frontmatter as Record<string, unknown> | null,
      links: r.links as string[] | null,
      tenantId: r.tenantId as string,
      createdBy: r.createdBy as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));

    return { list, total };
  }

  // ---- 知识库搜索（PostgreSQL 全文搜索） ----

  async function searchFiles(
    kbId: string,
    query: string,
    tenantId: string,
    limit: number = 10,
  ): Promise<Array<{ path: string; title: string; excerpt: string; score: number }>> {
    const rows = await db.raw(
      `SELECT path, title,
              ts_headline('simple', content, plainto_tsquery('simple', $1)) as excerpt,
              ts_rank(to_tsvector('simple', title || ' ' || content), plainto_tsquery('simple', $1)) as score
       FROM ai_document
       WHERE knowledge_base_id = $2 AND tenant_id = $3
         AND to_tsvector('simple', title || ' ' || content) @@ plainto_tsquery('simple', $1)
       ORDER BY score DESC LIMIT $4`,
      [query, kbId, tenantId, limit],
    );

    return (rows as Array<Record<string, unknown>>).map((r) => ({
      path: r.path as string,
      title: r.title as string,
      excerpt: r.excerpt as string,
      score: Number(r.score ?? 0),
    }));
  }

  return {
    create,
    getById,
    list,
    delete: deleteKB,
    createDocument,
    getDocument,
    updateDocument,
    deleteDocument,
    listDocuments,
    searchFiles,
  };
}
