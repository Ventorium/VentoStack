/**
 * @ventostack/ai-context — 按 Agent 的采集开关
 *
 * 上下文构成（系统提示、工具 schema、逐条消息预览）属**调试信息**：
 * 只有管理员能看，也只有管理员能决定要不要采。原全局 `sys_config.ai_context_enabled`
 * 已由 `ai_agent.context_collection_enabled` 取代——开关跟着 Agent 走，
 * 排查某个 Agent 时单独打开，其余 Agent 不落任何数据。
 *
 * 缺省关闭：列默认 FALSE，未显式开启的 Agent 不产生任何上下文记录。
 */

export interface AgentToggleReader {
  /** 读取指定 Agent 的采集开关；Agent 不存在或查询失败时按 false（不采集）处理 */
  isCollecting(tenantId: string, agentId: string): Promise<boolean>;
}

export interface ContextToggleService {
  /** 该 Agent 是否开启上下文采集 */
  isEnabledForAgent(tenantId: string, agentId: string): Promise<boolean>;
}

export function createContextToggleService(deps: {
  db: { raw: (sql: string, params?: unknown[]) => Promise<unknown> };
}): ContextToggleService {
  const { db } = deps;

  async function isEnabledForAgent(tenantId: string, agentId: string): Promise<boolean> {
    // fail-closed：读取失败宁可漏采，不可把未授权的内容落库
    // 空白串与模块内其它租户校验保持一致，同样按缺失处理
    if (!tenantId || tenantId.trim() === "" || !agentId || agentId.trim() === "") return false;
    try {
      const rows = (await db.raw(
        `SELECT context_collection_enabled FROM ai_agent WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, agentId],
      )) as Array<{ context_collection_enabled?: boolean }>;
      return rows?.[0]?.context_collection_enabled === true;
    } catch {
      return false;
    }
  }

  return { isEnabledForAgent };
}
