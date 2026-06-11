/**
 * 对话服务 — 管理用户与 Agent 的对话
 * 所有查询强制 user_id + tenant_id 过滤
 */
import type { Database } from "@ventostack/database";

export interface ConversationItem {
  id: string;
  agentId: string;
  userId: string;
  title: string | null;
  status: string;
  messageCount: number;
  agentConfigSnapshot: Record<string, unknown> | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationServiceDeps {
  db: Database;
}

export function createConversationService(deps: ConversationServiceDeps) {
  const { db } = deps;

  async function create(params: {
    agentId: string;
    userId: string;
    tenantId: string;
    agentConfig?: Record<string, unknown>;
    title?: string;
  }): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_conversation (id, agent_id, user_id, title, status, agent_config_snapshot, tenant_id)
       VALUES ($1, $2, $3, $4, 'active', $5, $6)`,
      [
        id,
        params.agentId,
        params.userId,
        params.title ?? null,
        params.agentConfig ? JSON.stringify(params.agentConfig) : null,
        params.tenantId,
      ],
    );
    return { id };
  }

  async function getById(id: string, userId: string): Promise<ConversationItem | null> {
    const rows = await db.raw(
      `SELECT id, agent_id as "agentId", user_id as "userId", title, status,
              message_count as "messageCount", agent_config_snapshot as "agentConfigSnapshot",
              tenant_id as "tenantId", created_at as "createdAt", updated_at as "updatedAt"
       FROM ai_conversation WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string,
      agentId: r.agentId as string,
      userId: r.userId as string,
      title: (r.title as string) ?? null,
      status: r.status as string,
      messageCount: Number(r.messageCount ?? 0),
      agentConfigSnapshot: r.agentConfigSnapshot as Record<string, unknown> | null,
      tenantId: r.tenantId as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    };
  }

  async function list(params: {
    userId: string;
    agentId?: string;
    tenantId: string;
  }): Promise<ConversationItem[]> {
    const { userId, agentId, tenantId } = params;

    let sql = `SELECT id, agent_id as "agentId", user_id as "userId", title, status,
               message_count as "messageCount", agent_config_snapshot as "agentConfigSnapshot",
               tenant_id as "tenantId", created_at as "createdAt", updated_at as "updatedAt"
         FROM ai_conversation WHERE user_id = $1 AND tenant_id = $2`;
    const values: unknown[] = [userId, tenantId];

    if (agentId) {
      sql += ` AND agent_id = $3`;
      values.push(agentId);
    }

    sql += ` ORDER BY updated_at DESC LIMIT 50`;

    const rows = await db.raw(sql, values);
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      agentId: r.agentId as string,
      userId: r.userId as string,
      title: (r.title as string) ?? null,
      status: r.status as string,
      messageCount: Number(r.messageCount ?? 0),
      agentConfigSnapshot: r.agentConfigSnapshot as Record<string, unknown> | null,
      tenantId: r.tenantId as string,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));
  }

  async function deleteConv(id: string, userId: string): Promise<void> {
    await db.raw(
      `DELETE FROM ai_conversation WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
  }

  async function incrementMessageCount(id: string): Promise<void> {
    await db.raw(
      `UPDATE ai_conversation SET message_count = message_count + 1, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  return {
    create,
    getById,
    list,
    delete: deleteConv,
    incrementMessageCount,
  };
}
