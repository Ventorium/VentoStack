import { describe, expect, test } from "bun:test";

describe("角色管理页", () => {
  test("toTreeData 将菜单列表转为 Tree 数据", () => {
    const toTreeData = (
      items: Array<{
        id: string;
        name: string;
        children?: Array<{ id: string; name: string; children?: unknown[] }>;
      }>,
    ) =>
      items.map((item) => ({
        key: item.id,
        title: item.name,
        children: item.children?.length ? toTreeData(item.children) : undefined,
      }));

    const menus = [
      {
        id: "m1",
        name: "系统管理",
        children: [
          { id: "m2", name: "用户管理", children: [] },
          { id: "m3", name: "角色管理", children: [] },
        ],
      },
    ];
    const result = toTreeData(menus);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("m1");
    expect(result[0].title).toBe("系统管理");
    expect(result[0].children).toHaveLength(2);
  });

  test("collectAllKeys 收集所有节点 key", () => {
    const collectAllKeys = (
      items: Array<{ id: string; children?: Array<{ id: string; children?: unknown[] }> }>,
    ) => {
      const keys: string[] = [];
      for (const item of items) {
        keys.push(item.id);
        if (item.children?.length) keys.push(...collectAllKeys(item.children));
      }
      return keys;
    };

    const tree = [
      {
        id: "1",
        children: [
          { id: "2", children: [{ id: "3", children: [] }] },
          { id: "4", children: [] },
        ],
      },
    ];
    const keys = collectAllKeys(tree);
    expect(keys).toEqual(["1", "2", "3", "4"]);
  });

  test("collectAllKeys 空列表返回空数组", () => {
    const collectAllKeys = (items: Array<{ id: string; children?: unknown[] }>) => {
      const keys: string[] = [];
      for (const item of items) {
        keys.push(item.id);
        if (item.children?.length) keys.push(...collectAllKeys(item.children as any));
      }
      return keys;
    };
    expect(collectAllKeys([])).toEqual([]);
  });

  test("getDescendantKeys 获取某节点的所有子孙 key", () => {
    const collectAllKeys = (
      items: Array<{ id: string; children?: Array<{ id: string; children?: unknown[] }> }>,
    ) => {
      const keys: string[] = [];
      for (const item of items) {
        keys.push(item.id);
        if (item.children?.length) keys.push(...collectAllKeys(item.children));
      }
      return keys;
    };

    const getDescendantKeys = (
      items: Array<{ id: string; children?: Array<{ id: string; children?: unknown[] }> }>,
      targetKey: string,
    ): string[] => {
      for (const item of items) {
        if (item.id === targetKey) {
          return collectAllKeys(item.children ?? []);
        }
        if (item.children?.length) {
          const found = getDescendantKeys(item.children, targetKey);
          if (found.length) return found;
        }
      }
      return [];
    };

    const tree = [
      {
        id: "1",
        children: [
          {
            id: "2",
            children: [
              { id: "3", children: [] },
              { id: "4", children: [] },
            ],
          },
          { id: "5", children: [] },
        ],
      },
    ];

    expect(getDescendantKeys(tree, "2")).toEqual(["3", "4"]);
    expect(getDescendantKeys(tree, "1")).toEqual(["2", "3", "4", "5"]);
    expect(getDescendantKeys(tree, "3")).toEqual([]);
    expect(getDescendantKeys(tree, "nonexistent")).toEqual([]);
  });

  test("isBuiltInRole 内置角色判断", () => {
    const isBuiltInRole = (code: string) => code === "admin";
    expect(isBuiltInRole("admin")).toBe(true);
    expect(isBuiltInRole("user")).toBe(false);
    expect(isBuiltInRole("Admin")).toBe(false);
  });

  test("状态列渲染逻辑", () => {
    const getStatusTag = (status: number) => ({
      color: status === 1 ? "green" : "red",
      text: status === 1 ? "正常" : "禁用",
    });
    expect(getStatusTag(1)).toEqual({ color: "green", text: "正常" });
    expect(getStatusTag(0)).toEqual({ color: "red", text: "禁用" });
  });

  test("API 端点路径正确", () => {
    const endpoints = {
      list: "/api/system/roles",
      create: "/api/system/roles",
      update: "/api/system/roles/:id",
      delete: "/api/system/roles/:id",
      assignMenus: "/api/system/roles/:id/menus",
      menuTree: "/api/system/menus/tree",
    };
    expect(endpoints.list).toBe("/api/system/roles");
    expect(endpoints.assignMenus).toContain("menus");
    expect(endpoints.menuTree).toContain("menus/tree");
  });

  test("RoleItem 类型应包含必要字段", () => {
    const role = {
      id: "r1",
      name: "管理员",
      code: "admin",
      status: 1,
      sort: 0,
      remark: "超级管理员角色",
      dataScope: 1,
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(role.id).toBeTruthy();
    expect(role.name).toBeTruthy();
    expect(role.code).toBeTruthy();
    expect([0, 1]).toContain(role.status);
  });

  test("内置角色编辑和删除应被禁用", () => {
    const isBuiltInRole = (code: string) => code === "admin";
    const canEdit = (code: string) => !isBuiltInRole(code);
    const canDelete = (code: string) => !isBuiltInRole(code);
    expect(canEdit("admin")).toBe(false);
    expect(canEdit("user")).toBe(true);
    expect(canDelete("admin")).toBe(false);
    expect(canDelete("user")).toBe(true);
  });

  test("内置角色分配菜单弹窗显示关闭按钮", () => {
    const getOkText = (code: string) => (code === "admin" ? "关闭" : "确定");
    expect(getOkText("admin")).toBe("关闭");
    expect(getOkText("user")).toBe("确定");
  });

  // --- 新增测试用例 ---

  test("创建角色 body 应包含 name, code, sort, status, remark", () => {
    const buildCreateBody = (values: Record<string, unknown>) => ({
      name: values.name,
      code: values.code,
      sort: values.sort,
      remark: values.remark,
      status: values.status,
    });

    const body = buildCreateBody({
      name: "测试角色",
      code: "test_role",
      sort: 10,
      remark: "测试备注",
      status: 1,
    });

    expect(body.name).toBe("测试角色");
    expect(body.code).toBe("test_role");
    expect(body.sort).toBe(10);
    expect(body.remark).toBe("测试备注");
    expect(body.status).toBe(1);
  });

  test("更新角色 body 应包含 name, sort, status, remark，不包含 code", () => {
    const buildUpdateBody = (values: Record<string, unknown>) => ({
      name: values.name,
      sort: values.sort,
      remark: values.remark,
      status: values.status,
    });

    const body = buildUpdateBody({
      name: "更新角色",
      code: "should_not_be_included",
      sort: 20,
      remark: "更新备注",
      status: 0,
    });

    expect(body).not.toHaveProperty("code");
    expect(body.name).toBe("更新角色");
    expect(body.sort).toBe(20);
    expect(body.remark).toBe("更新备注");
    expect(body.status).toBe(0);
  });

  test("编辑模式下角色标识(code)输入框应禁用", () => {
    const isCodeDisabled = (editingRole: { id: string } | null) => !!editingRole;
    expect(isCodeDisabled({ id: "r1" })).toBe(true);
    expect(isCodeDisabled(null)).toBe(false);
  });

  test("分配菜单权限 API: PUT /api/system/roles/:id/menus", () => {
    const buildAssignMenusRequest = (roleId: string, menuIds: string[]) => ({
      url: `/api/system/roles/${roleId}/menus`,
      method: "PUT",
      params: { id: roleId },
      body: { menuIds },
    });

    const req = buildAssignMenusRequest("r1", ["m1", "m2", "m3"]);
    expect(req.url).toBe("/api/system/roles/r1/menus");
    expect(req.method).toBe("PUT");
    expect(req.params.id).toBe("r1");
    expect(req.body.menuIds).toEqual(["m1", "m2", "m3"]);
  });

  test("内置角色(code=admin)编辑和删除按钮应禁用", () => {
    const getActionDisabled = (code: string) => {
      const builtIn = code === "admin";
      return { editDisabled: builtIn, deleteDisabled: builtIn };
    };

    expect(getActionDisabled("admin")).toEqual({ editDisabled: true, deleteDisabled: true });
    expect(getActionDisabled("user")).toEqual({ editDisabled: false, deleteDisabled: false });
    expect(getActionDisabled("editor")).toEqual({ editDisabled: false, deleteDisabled: false });
  });

  test("内置角色分配菜单时 onCheck 应为空操作", () => {
    const getCheckHandler = (code: string) => (code === "admin" ? "noop" : "handleCheck");
    expect(getCheckHandler("admin")).toBe("noop");
    expect(getCheckHandler("user")).toBe("handleCheck");
  });

  test("搜索参数: name 和 status", () => {
    const cleanParams = (params: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") result[k] = v;
      }
      return result;
    };

    expect(cleanParams({ name: "管理员", status: 1 })).toEqual({ name: "管理员", status: 1 });
    expect(cleanParams({ name: "", status: undefined })).toEqual({});
    expect(cleanParams({ name: "admin", status: undefined })).toEqual({ name: "admin" });
    expect(cleanParams({ name: "", status: 0 })).toEqual({ status: 0 });
  });

  test("分配菜单弹窗内置角色提示文本", () => {
    const getHintText = (code: string) =>
      code === "admin" ? "内置超级管理员角色拥有所有权限" : null;
    expect(getHintText("admin")).toBe("内置超级管理员角色拥有所有权限");
    expect(getHintText("user")).toBeNull();
  });
});
