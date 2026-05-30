---
name: platform-test-coverage
description: |
  Platform 模块测试覆盖补充指南。针对测试覆盖不足的模块（gen/i18n/monitor/notification/scheduler/workflow），
  提供测试模板和补充策略。
---

# Platform Test Coverage — 测试补充指南

## 当前测试分布

| 模块 | 测试文件数 | 状态 |
|------|-----------|------|
| auth | 14 | ✅ 充足 |
| system | 18 | ✅ 充足 |
| ai | 8 | ✅ 充足 |
| integration | 7 | ✅ 充足 |
| boot | 1 | ⚠️ 基础 |
| **gen** | **1** | **⚠️ 需补充** |
| **i18n** | **1** | **⚠️ 需补充** |
| **monitor** | **1** | **⚠️ 需补充** |
| **notification** | **1** | **⚠️ 需补充** |
| **scheduler** | **1** | **⚠️ 需补充** |
| **workflow** | **1** | **⚠️ 需补充** |

## 测试补充策略

### 1. 补充 Service 边界测试

每个模块至少补充以下测试场景：

```typescript
// __tests__/xxx-service.test.ts 模板
import { describe, expect, test, beforeEach } from "bun:test";
import { createMockDatabase, createMockExecutor } from "./helpers";
import { createXxxService } from "../services/xxx";

describe("XxxService", () => {
  let service: ReturnType<typeof createXxxService>;
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];

  beforeEach(() => {
    const mockExec = createMockExecutor();
    calls = mockExec.calls;
    results = mockExec.results;
    const { db } = createMockDatabase(mockExec);
    service = createXxxService({ db });
  });

  describe("list", () => {
    test("分页查询", async () => {
      results.set("SELECT COUNT", [{ count: 100 }]);
      results.set("SELECT * FROM sys_xxx", [{ id: "1", name: "Test" }]);

      const result = await service.list({ page: 1, pageSize: 10 });

      expect(result.total).toBe(100);
      expect(result.items).toHaveLength(1);
    });

    test("关键词搜索", async () => {
      results.set("SELECT COUNT", [{ count: 0 }]);
      results.set("SELECT * FROM sys_xxx", []);

      const result = await service.list({ page: 1, pageSize: 10, keyword: "test" });

      expect(result.items).toHaveLength(0);
      expect(calls.some(c => c.text.includes("LIKE"))).toBe(true);
    });

    test("空结果返回空数组", async () => {
      results.set("SELECT COUNT", [{ count: 0 }]);
      results.set("SELECT * FROM sys_xxx", []);

      const result = await service.list({ page: 1, pageSize: 10 });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("getById", () => {
    test("存在时返回数据", async () => {
      results.set("SELECT * FROM sys_xxx WHERE id", [{ id: "1", name: "Test" }]);

      const item = await service.getById("1");

      expect(item).toBeTruthy();
      expect(item?.name).toBe("Test");
    });

    test("不存在时返回 null", async () => {
      results.set("SELECT * FROM sys_xxx WHERE id", []);

      const item = await service.getById("nonexistent");

      expect(item).toBeNull();
    });
  });

  describe("create", () => {
    test("创建成功返回 ID", async () => {
      const id = await service.create({ name: "New" });

      expect(id).toBeTruthy();
      expect(calls.some(c => c.text.includes("INSERT"))).toBe(true);
    });

    test("参数校验失败抛错", async () => {
      // 如果 service 有参数校验
      await expect(service.create({ name: "" })).rejects.toThrow();
    });
  });

  describe("update", () => {
    test("更新成功", async () => {
      await service.update("1", { name: "Updated" });

      expect(calls.some(c => c.text.includes("UPDATE"))).toBe(true);
    });

    test("无字段时跳过", async () => {
      await service.update("1", {});

      expect(calls.length).toBe(0);
    });
  });

  describe("delete", () => {
    test("软删除", async () => {
      await service.delete("1");

      expect(calls.some(c => c.text.includes("UPDATE") && c.text.includes("deleted_at"))).toBe(true);
    });
  });
});
```

### 2. 补充路由测试

```typescript
// __tests__/xxx-routes.test.ts 模板
import { describe, expect, test } from "bun:test";
import { createTestApp } from "@ventostack/testing";
import { createXxxModule } from "../module";

describe("Xxx Routes", () => {
  test("GET /api/system/xxx 返回列表", async () => {
    const module = createXxxModule({ db: mockDb });
    const app = createTestApp();
    app.use(module.router);

    const res = await app.fetch(new Request("http://localhost/api/system/xxx?page=1&pageSize=10"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data).toHaveProperty("list");
    expect(json.data).toHaveProperty("total");
  });

  test("POST /api/system/xxx 创建", async () => {
    const module = createXxxModule({ db: mockDb });
    const app = createTestApp();
    app.use(module.router);

    const res = await app.fetch(
      new Request("http://localhost/api/system/xxx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      }),
    );
    expect(res.status).toBe(201);
  });

  test("GET /api/system/xxx/:id 不存在返回 404", async () => {
    const module = createXxxModule({ db: mockDb });
    const app = createTestApp();
    app.use(module.router);

    const res = await app.fetch(new Request("http://localhost/api/system/xxx/nonexistent"));
    expect(res.status).toBe(404);
  });
});
```

### 3. 补充中间件测试

```typescript
// __tests__/middleware.test.ts 模板
import { describe, expect, test } from "bun:test";
import { createPermMiddleware } from "../middlewares/auth-guard";
import { createRBAC } from "@ventostack/auth";

describe("createPermMiddleware", () => {
  test("无用户返回 401", async () => {
    const rbac = createRBAC();
    const perm = createPermMiddleware(rbac)("system:xxx:list");

    const ctx = { user: undefined } as any;
    const next = async () => new Response("ok");

    const res = await perm(ctx, next);
    expect(res.status).toBe(401);
  });

  test("admin 角色跳过检查", async () => {
    const rbac = createRBAC();
    const perm = createPermMiddleware(rbac)("system:xxx:list");

    const ctx = { user: { roles: ["admin"] } } as any;
    const next = async () => new Response("ok");

    const res = await perm(ctx, next);
    expect(res.status).toBe(200);
  });
});
```

## 各模块具体补充建议

### gen（代码生成）

- [ ] `previewCode` 生成代码预览测试
- [ ] `generateCode` 生成文件测试
- [ ] `downloadCode` 下载 ZIP 测试
- [ ] 模板渲染边界测试（空表、无列）

### i18n（国际化）

- [ ] `translate` 翻译查找回退测试
- [ ] `batchTranslate` 批量翻译测试
- [ ] `importMessages` / `exportMessages` 导入导出测试
- [ ] 默认语言回退测试

### monitor（监控）

- [ ] `getOnlineUsers` 在线用户测试
- [ ] `getLoginLogs` 登录日志测试
- [ ] `getOperationLogs` 操作日志测试
- [ ] 健康检查失败场景测试

### notification（通知）

- [ ] `sendBatch` 批量发送测试
- [ ] 模板渲染变量替换测试
- [ ] 通道失败回退测试
- [ ] 消息状态查询测试

### scheduler（定时任务）

- [ ] `pause` / `resume` 暂停恢复测试
- [ ] `executeNow` 立即执行测试
- [ ] `getLogs` 执行日志测试
- [ ] Cron 表达式校验测试

### workflow（工作流）

- [ ] `startInstance` 启动实例测试
- [ ] `completeTask` 完成任务测试
- [ ] `getInstanceStatus` 状态查询测试
- [ ] 流程定义验证测试（循环检测）

## 验收标准

- [ ] 每个模块至少 3 个测试文件（service + routes + middleware）
- [ ] 所有新增测试通过 `bun test`
- [ ] 边界条件覆盖（空结果、不存在 ID、无效参数）
- [ ] 权限中间件有失败用例
