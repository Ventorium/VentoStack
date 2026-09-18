import type { Database } from '@ventostack/database';

export interface OAuthAuthLogInput {
  tenantId?: string;
  userId?: string;
  applicationId?: string;
  clientId?: string;
  applicationName?: string;
  identifier?: string;
  eventType: string;
  success: boolean;
  failureCode?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean>;
}

export function createOAuthAuthLogService(deps: { db: Database; tenantId: string }) {
  /**
   * 补齐 Application 快照：日志需要保留 clientId、应用名称与标识符，
   * 以便 Application 删除（tombstone）后日志仍可读。查询不限定 status/enabled，
   * 因为已禁用或已删除的 Application 同样需要留下快照。
   * 查找失败不阻断日志写入。
   */
  async function withApplicationSnapshot(
    input: OAuthAuthLogInput,
  ): Promise<OAuthAuthLogInput> {
    if (input.applicationName && input.identifier) return input;
    const column = input.applicationId ? 'id' : input.clientId ? 'client_id' : null;
    if (!column) return input;
    const value = column === 'id' ? input.applicationId! : input.clientId!;
    try {
      const rows = (await deps.db.raw(
        `SELECT id,name,identifier FROM oauth_application WHERE ${column}=$1 LIMIT 1`,
        [value],
      )) as Array<{ id: string; name: string; identifier: string }>;
      const row = rows[0];
      if (!row) return input;
      return {
        ...input,
        applicationId: input.applicationId ?? row.id,
        applicationName: input.applicationName ?? row.name,
        identifier: input.identifier ?? row.identifier,
      };
    } catch {
      return input;
    }
  }

  return {
    async append(input: OAuthAuthLogInput): Promise<void> {
      const entry = await withApplicationSnapshot(input);
      await deps.db.raw(
        `INSERT INTO oauth_auth_log
         (id,tenant_id,user_id,application_id,client_id_snapshot,application_name_snapshot,
          identifier_snapshot,event_type,success,failure_code,ip,user_agent,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          crypto.randomUUID(),
          entry.tenantId ?? deps.tenantId,
          entry.userId ?? null,
          entry.applicationId ?? null,
          entry.clientId ?? null,
          entry.applicationName ?? null,
          entry.identifier ?? null,
          entry.eventType,
          entry.success,
          entry.failureCode ?? null,
          entry.ip ?? null,
          entry.userAgent?.slice(0, 512) ?? null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
        ],
      );
    },
    async list(params: {
      page: number;
      pageSize: number;
      eventType?: string;
      success?: boolean;
      clientId?: string;
      userId?: string;
      startAt?: Date;
      endAt?: Date;
    }) {
      const values: unknown[] = [deps.tenantId];
      const filters = ['tenant_id=$1'];
      if (params.eventType) {
        values.push(params.eventType);
        filters.push(`event_type=$${values.length}`);
      }
      if (params.success !== undefined) {
        values.push(params.success);
        filters.push(`success=$${values.length}`);
      }
      if (params.clientId) {
        values.push(params.clientId);
        filters.push(`client_id_snapshot=$${values.length}`);
      }
      if (params.userId) {
        values.push(params.userId);
        filters.push(`user_id=$${values.length}`);
      }
      if (params.startAt) {
        values.push(params.startAt);
        filters.push(`created_at>=$${values.length}`);
      }
      if (params.endAt) {
        values.push(params.endAt);
        filters.push(`created_at<=$${values.length}`);
      }
      const countRows = (await deps.db.raw(
        `SELECT COUNT(*) count FROM oauth_auth_log WHERE ${filters.join(' AND ')}`,
        values,
      )) as Array<{ count: number | string }>;
      values.push(params.pageSize, (params.page - 1) * params.pageSize);
      const items = await deps.db.raw(
        `SELECT id,user_id,application_id,client_id_snapshot,application_name_snapshot,
                identifier_snapshot,event_type,success,failure_code,ip,user_agent,metadata,created_at
         FROM oauth_auth_log WHERE ${filters.join(' AND ')} ORDER BY created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        items,
        total: Number(countRows[0]?.count ?? 0),
        page: params.page,
        pageSize: params.pageSize,
      };
    },
  };
}

export type OAuthAuthLogService = ReturnType<typeof createOAuthAuthLogService>;
