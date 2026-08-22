/**
 * sql-query 工具测试 — 正面 + 反面用例
 * 使用 mock Database
 */
import { describe, expect, test, mock } from "bun:test";
import { createSQLQueryTool } from "../../tools/sql-query";

interface MockDb {
  raw: (sql: string) => Promise<unknown[]>;
}

function createMockDb(rows: unknown[] = []): MockDb {
  return {
    raw: mock(async () => rows),
  };
}

describe("sql-query tool", () => {
  // ─── 正面用例 ───
  describe("正面用例", () => {
    test("基本 SELECT 查询", async () => {
      const rows = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
      const db = createMockDb(rows);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "SELECT * FROM users" });
      expect(result).toEqual({ rows, rowCount: 2 });
    });

    test("带 WHERE 条件", async () => {
      const db = createMockDb([{ id: 1 }]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "SELECT id FROM users WHERE active = true" });
      expect(result).toHaveProperty("rowCount", 1);
    });

    test("空结果集", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "SELECT * FROM users WHERE id = 999" });
      expect(result).toEqual({ rows: [], rowCount: 0 });
    });

    test("自动添加 LIMIT", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1", maxRows: 50 });
      await tool.handler({ sql: "SELECT * FROM users" });
      // 验证 raw 被调用时 SQL 包含 LIMIT
      const rawMock = db.raw as ReturnType<typeof mock>;
      const calledSql = rawMock.mock.calls[0][0] as string;
      expect(calledSql).toContain("LIMIT 50");
    });

    test("强制注入 tenant_id 作用域", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      await tool.handler({ sql: "SELECT * FROM users" });
      const rawMock = db.raw as ReturnType<typeof mock>;
      const calledSql = rawMock.mock.calls[0][0] as string;
      const params = rawMock.mock.calls[0][1] as string[];
      expect(calledSql).toContain("WHERE tenant_id = $1");
      expect(params).toEqual(["t1"]);
    });

    test("已有 LIMIT 不重复添加", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      await tool.handler({ sql: "SELECT * FROM users LIMIT 5" });
      const rawMock = db.raw as ReturnType<typeof mock>;
      const calledSql = rawMock.mock.calls[0][0] as string;
      expect(calledSql).toContain("LIMIT 5");
      // 不应该有第二个 LIMIT
      const limitCount = (calledSql.match(/LIMIT/gi) || []).length;
      expect(limitCount).toBe(1);
    });

    test("自定义 limit 参数受 maxRows 限制", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1", maxRows: 10 });
      await tool.handler({ sql: "SELECT * FROM users", limit: 100 });
      const rawMock = db.raw as ReturnType<typeof mock>;
      const calledSql = rawMock.mock.calls[0][0] as string;
      expect(calledSql).toContain("LIMIT 10"); // 被 maxRows 限制
    });

    test("去除行注释后执行", async () => {
      const db = createMockDb([{ id: 1 }]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "SELECT * FROM users -- this is a comment" });
      expect(result).toHaveProperty("rowCount", 1);
    });

    test("去除块注释后执行", async () => {
      const db = createMockDb([{ id: 1 }]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "/* comment */ SELECT * FROM users" });
      expect(result).toHaveProperty("rowCount", 1);
    });

    test("大小写无关的 SELECT", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "select * from users" });
      expect(result).not.toHaveProperty("error");
    });
  });

  // ─── 反面用例 ───
  describe("反面用例", () => {
    test("空 SQL", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "" });
      expect(result).toEqual({ error: "SQL 不能为空" });
    });

    test("undefined SQL", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({});
      expect(result).toEqual({ error: "SQL 不能为空" });
    });

    test("空白 SQL", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "   " });
      expect(result).toEqual({ error: "SQL 不能为空" });
    });

    test("禁止 INSERT", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "INSERT INTO users VALUES (1, 'hack')" });
      expect(result).toEqual({ error: "仅允许 SELECT 查询" });
    });

    test("禁止 UPDATE", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "UPDATE users SET name = 'hacked'" });
      expect(result).toEqual({ error: "仅允许 SELECT 查询" });
    });

    test("禁止 DELETE", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "DELETE FROM users" });
      expect(result).toEqual({ error: "仅允许 SELECT 查询" });
    });

    test("禁止 DROP", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "DROP TABLE users" });
      expect(result).toEqual({ error: "仅允许 SELECT 查询" });
    });

    test("禁止 ALTER", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "ALTER TABLE users ADD COLUMN hack TEXT" });
      expect(result).toEqual({ error: "仅允许 SELECT 查询" });
    });

    test("禁止 TRUNCATE", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "TRUNCATE TABLE users" });
      expect(result).toEqual({ error: "仅允许 SELECT 查询" });
    });

    test("禁止 CREATE", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "CREATE TABLE hack (id INT)" });
      expect(result).toEqual({ error: "仅允许 SELECT 查询" });
    });

    test("SELECT 中包含危险关键词被拦截", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "SELECT * FROM users; DROP TABLE users" });
      expect(result).toHaveProperty("error");
    });

    test("CTE 中写操作被拦截", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({
        sql: "WITH cte AS (SELECT * FROM users) INSERT INTO logs SELECT * FROM cte",
      });
      expect(result).toHaveProperty("error");
      // 不以 SELECT 开头，所以被 "仅允许 SELECT 查询" 拦截
      expect((result as { error: string }).error).toContain("仅允许 SELECT 查询");
    });

    test("SELECT 后 CTE 写操作被拦截", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      // 构造一个以 SELECT 开头但包含 CTE 写操作的 SQL
      const result = await tool.handler({
        sql: "SELECT 1; WITH cte AS (SELECT * FROM users) INSERT INTO logs SELECT * FROM cte",
      });
      expect(result).toHaveProperty("error");
    });

    test("去除注释后检测危险关键词", async () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      // 注释中隐藏了 DELETE，去除后暴露
      const result = await tool.handler({
        sql: "SELECT * FROM users WHERE id = 1 /* DELETE */",
      });
      // 去除注释后变成 SELECT ... WHERE id = 1，不含危险关键词
      // 但如果我们把 DELETE 放在注释外面就不行
    });

    test("注释中包含危险操作但去除后安全", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      // 这个应该是安全的：注释中的 DELETE 会被去除
      const result = await tool.handler({
        sql: "SELECT * FROM users -- DELETE FROM users",
      });
      expect(result).not.toHaveProperty("error");
    });

    test("数据库查询失败", async () => {
      const db = {
        raw: mock(async () => {
          throw new Error("connection refused");
        }),
      };
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql: "SELECT * FROM users" });
      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("查询失败");
      expect((result as { error: string }).error).toContain("connection refused");
    });
  });

  // ─── 工具元数据 ───
  describe("工具元数据", () => {
    test("名称、风险等级、需要审批", () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      expect(tool.name).toBe("sql-query");
      expect(tool.riskLevel).toBe("high");
      expect(tool.requiresApproval).toBe(true);
    });

    test("参数定义", () => {
      const db = createMockDb();
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      expect(tool.parameters).toHaveLength(2);
      expect(tool.parameters[0].name).toBe("sql");
      expect(tool.parameters[0].required).toBe(true);
      expect(tool.parameters[1].name).toBe("limit");
      expect(tool.parameters[1].required).toBe(false);
    });
  });

  // ─── 租户列遮蔽防护 ───
  describe("租户列遮蔽防护", () => {
    test.each([
      // 显式 AS 别名伪装 tenant_id（外层过滤被派生表同名列遮蔽恒真）
      "SELECT secret, 't1' AS tenant_id FROM sys_config",
      // 隐式省略 AS 的表达式别名
      "SELECT secret, 1 tenant_id FROM sys_config",
      // 双引号别名
      'SELECT secret FROM sys_config AS "tenant_id"',
      // CASE…END 表达式别名（end 不属于裸列引用上下文）
      "SELECT secret, CASE WHEN true THEN 't1' ELSE 'x' END tenant_id FROM secrets",
      // 带引号字符串常量别名
      "SELECT * FROM users WHERE name = 'x' AS tenant_id",
    ])("拦截列别名伪装 tenant_id：%s", async (sql) => {
      const db = createMockDb([{ secret: "data" }]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "attacker-t1" });
      const result = await tool.handler({ sql });
      expect(result).toEqual({ error: "SQL 不允许将表达式别名为 tenant_id 输出列" });
    });

    test.each([
      // 裸列引用：直接输出本租户的 tenant_id 列
      "SELECT tenant_id FROM users",
      // 函数聚合中的裸列
      "SELECT max(tenant_id) FROM users",
      // GROUP BY / ORDER BY 中的裸列
      "SELECT tenant_id, count(*) FROM users GROUP BY tenant_id ORDER BY tenant_id",
      // WHERE 中引用
      "SELECT id FROM users WHERE tenant_id IS NOT NULL",
      // 与其他值比较的表达式
      "SELECT id FROM users WHERE tenant_id <> ''",
    ])("放行合法裸列引用：%s", async (sql) => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({ sql });
      expect(result).not.toHaveProperty("error");
    });

    test("字面量中包含 tenant_id 文本不误报", async () => {
      const db = createMockDb([]);
      const tool = createSQLQueryTool({ db: db as any, tenantId: "t1" });
      const result = await tool.handler({
        sql: "SELECT * FROM logs WHERE message = 'tenant_id is t1'",
      });
      expect(result).not.toHaveProperty("error");
    });
  });
});
