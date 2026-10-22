/**
 * 连接器服务单元测试
 * 覆盖：目录查询、API Key 连接落库、解绑权限校验
 */
import { describe, expect, test } from "bun:test";
import { createConnectorService } from "../../services/connector";
import type { McpServerItem } from "../../services/mcp-server";
import { createMockCache, createMockDatabase } from "../helpers";

const TENANT = "default";
const USER = "user-1";

function catalogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    kind: "notion",
    name: "Notion",
    description: "desc",
    category: "knowledge",
    icon: null,
    auth_type: "api_key",
    auth_template: { fields: [{ key: "api_key", label: "API Key", secret: true }] },
    transport: "remote",
    mcp_url: "https://mcp.notion.com/mcp",
    built_in: true,
    sort_order: 1,
    enabled: true,
    ...overrides,
  };
}

function makeMcpService() {
  const created: Array<Record<string, unknown>> = [];
  const service = {
    async create(params: Record<string, unknown>): Promise<McpServerItem> {
      created.push(params);
      return { id: "mcp-1" } as unknown as McpServerItem;
    },
    async setEnabled(_id: string, _tenantId: string, _enabled: boolean): Promise<void> {},
    async refreshTools(): Promise<never[]> {
      return [];
    },
  };
  return { service: service as never, created };
}

function makeStateStore() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, _ttl: number) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

describe("connectorService", () => {
  test("listCatalog 合并当前请求者绑定状态", async () => {
    const { db } = createMockDatabase({
      "FROM ai_connector_catalog": [catalogRow()],
      "FROM ai_connector_binding b": [
        {
          id: "bind-1",
          connector_id: "conn-1",
          connector_kind: "notion",
          connector_name: "Notion",
          scope: "user",
          owner_id: USER,
          display_name: "我的 Notion",
          status: "connected",
          account_hint: "a***@x.com",
          mcp_server_id: "mcp-1",
          tenant_id: TENANT,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const { service } = makeMcpService();
    const svc = createConnectorService({
      db,
      mcpServerService: service,
      stateStore: makeStateStore(),
    });

    const list = await svc.listCatalog(USER, TENANT);
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("notion");
    expect(list[0]!.bindingStatus).toBe("connected");
  });

  test("connectWithCredentials 校验字段并创建托管 MCP", async () => {
    const { db, exec } = createMockDatabase({
      "FROM ai_connector_catalog": [catalogRow()],
      // finishConnect 查已有绑定 → 空；查已有 MCP → 空
      "FROM ai_connector_binding\n": [],
      "FROM ai_mcp_server WHERE connector_binding_id": [],
    });
    const { service, created } = makeMcpService();
    const svc = createConnectorService({
      db,
      mcpServerService: service,
      stateStore: makeStateStore(),
    });

    const result = await svc.connectWithCredentials("notion", USER, { api_key: "secret-key" }, TENANT);
    expect(result.status).toBe("connected");
    expect(created).toHaveLength(1);
    expect((created[0] as { url: string }).url).toBe("https://mcp.notion.com/mcp");

    // 应写入绑定 INSERT + MCP 托管 UPDATE
    const sqls = exec.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes("INSERT INTO ai_connector_binding"))).toBe(true);
    expect(sqls.some((s) => s.includes("UPDATE ai_mcp_server SET connector_binding_id"))).toBe(true);
  });

  test("connectWithCredentials 缺字段抛 400", async () => {
    const { db } = createMockDatabase({
      "FROM ai_connector_catalog": [catalogRow()],
    });
    const { service } = makeMcpService();
    const svc = createConnectorService({ db, mcpServerService: service, stateStore: makeStateStore() });

    expect(svc.connectWithCredentials("notion", USER, {}, TENANT)).rejects.toThrow();
  });

  test("disconnect 他人绑定抛 403", async () => {
    const { db } = createMockDatabase({
      "FROM ai_connector_binding b": [
        {
          id: "bind-1",
          connector_id: "conn-1",
          scope: "user",
          owner_id: "other-user",
          mcp_server_id: null,
          tenant_id: TENANT,
        },
      ],
    });
    const { service } = makeMcpService();
    const svc = createConnectorService({ db, mcpServerService: service, stateStore: makeStateStore() });

    expect(svc.disconnect("bind-1", USER, TENANT)).rejects.toThrow(/无权/);
  });

  test("resolveAuthHeaders revoked/expired 返回 null（fail-closed）", async () => {
    const { db } = createMockDatabase({
      "JOIN ai_connector_binding b": [
        { id: "bind-1", connector_id: "conn-1", status: "revoked", credentials: null },
      ],
    });
    const { service } = makeMcpService();
    const svc = createConnectorService({ db, mcpServerService: service, stateStore: makeStateStore() });

    expect(await svc.resolveAuthHeaders("mcp-1", TENANT)).toBeNull();
  });

  test("finishConnect 托管 MCP 创建失败：绑定落 error（含原因）并重抛", async () => {
    const { db, exec } = createMockDatabase({
      "FROM ai_connector_catalog": [catalogRow()],
      "FROM ai_connector_binding\n": [],
      "FROM ai_mcp_server WHERE connector_binding_id": [],
    });
    const { service } = makeMcpService();
    // 模拟托管 MCP 创建失败（如 host 白名单拒绝）
    service.create = async () => {
      throw new Error("host 不在白名单");
    };
    const svc = createConnectorService({
      db,
      mcpServerService: service,
      stateStore: makeStateStore(),
    });

    await expect(
      svc.connectWithCredentials("notion", USER, { api_key: "k" }, TENANT),
    ).rejects.toThrow("host 不在白名单");

    // 绑定必须被置为 error 并记录原因，避免「已连接但无托管 MCP」孤儿状态
    const statusUpdate = exec.calls.find((c) =>
      String(c[0]).includes("UPDATE ai_connector_binding SET status"),
    );
    expect(statusUpdate).toBeDefined();
    const params = statusUpdate![1] as unknown[];
    expect(params[0]).toBe("error");
    expect(String(params[1])).toContain("host 不在白名单");
  });
});
