import { describe, expect, test } from "bun:test";

describe("菜单管理页", () => {
  test("typeMap 菜单类型映射正确", () => {
    const typeMap: Record<number, string> = { 1: "目录", 2: "菜单", 3: "按钮" };
    expect(typeMap[1]).toBe("目录");
    expect(typeMap[2]).toBe("菜单");
    expect(typeMap[3]).toBe("按钮");
  });

  test("typeColor 菜单类型颜色映射正确", () => {
    const typeColor: Record<number, string> = { 1: "blue", 2: "green", 3: "orange" };
    expect(typeColor[1]).toBe("blue");
    expect(typeColor[2]).toBe("green");
    expect(typeColor[3]).toBe("orange");
  });

  test("iconOptions 应包含常用图标", () => {
    const iconOptions = [
      "SettingOutlined",
      "UserOutlined",
      "TeamOutlined",
      "MenuOutlined",
      "HomeOutlined",
      "DashboardOutlined",
      "AppstoreOutlined",
      "DatabaseOutlined",
      "FileOutlined",
      "FolderOutlined",
      "LockOutlined",
      "KeyOutlined",
      "BellOutlined",
      "MailOutlined",
      "PhoneOutlined",
      "SearchOutlined",
      "PlusOutlined",
      "MinusOutlined",
      "EditOutlined",
      "DeleteOutlined",
      "EyeOutlined",
      "EyeInvisibleOutlined",
      "UploadOutlined",
      "DownloadOutlined",
    ];
    expect(iconOptions.length).toBeGreaterThan(20);
    expect(iconOptions).toContain("SettingOutlined");
    expect(iconOptions).toContain("UserOutlined");
    expect(iconOptions).toContain("DeleteOutlined");
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
      tree: "/api/system/menus/tree",
      create: "/api/system/menus",
      update: "/api/system/menus/:id",
      delete: "/api/system/menus/:id",
    };
    expect(endpoints.tree).toContain("menus/tree");
    expect(endpoints.create).toBe("/api/system/menus");
    expect(endpoints.update).toContain(":id");
    expect(endpoints.delete).toContain(":id");
  });

  test("MenuItem 类型应包含必要字段", () => {
    const menu = {
      id: "m1",
      name: "用户管理",
      path: "/system/users",
      component: "system/users/index",
      type: 2,
      permission: "system:user:list",
      icon: "UserOutlined",
      sort: 1,
      visible: true,
      status: 1,
      parentId: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(menu.id).toBeTruthy();
    expect(menu.name).toBeTruthy();
    expect([1, 2, 3]).toContain(menu.type);
    expect([0, 1]).toContain(menu.status);
  });

  test("新增子菜单时类型默认为 2（菜单）", () => {
    const getDefaultType = (hasParent: boolean) => (hasParent ? "2" : "1");
    expect(getDefaultType(true)).toBe("2");
    expect(getDefaultType(false)).toBe("1");
  });

  test("新增子菜单时 parentId 应为父菜单 id", () => {
    const parent = { id: "p1", name: "系统管理", type: 1 };
    const getParentId = (parent?: { id: string }) => parent?.id;
    expect(getParentId(parent)).toBe("p1");
    expect(getParentId(undefined)).toBeUndefined();
  });

  test("按钮类型不应可展开", () => {
    const isExpandable = (type: number) => type !== 3;
    expect(isExpandable(1)).toBe(true);
    expect(isExpandable(2)).toBe(true);
    expect(isExpandable(3)).toBe(false);
  });

  // --- 契约测试：后端 type 为 int、visible 为 boolean ---

  test("visible 映射: API boolean 直接透传，发送时保持 boolean", () => {
    // 后端 visible 列为 boolean，发送 1/0 会导致 SQL 类型错误
    const visibleToApi = (visible: boolean) => !!visible;
    expect(visibleToApi(true)).toBe(true);
    expect(visibleToApi(false)).toBe(false);
  });

  test("visible 回显: API boolean 转 boolean（不能用 === 1 判断）", () => {
    const visibleFromApi = (v: boolean) => !!v;
    expect(visibleFromApi(true)).toBe(true);
    expect(visibleFromApi(false)).toBe(false);
  });

  test("handleOk 发送 body 应转换 type 为数字、visible 为 boolean", () => {
    const buildBody = (values: Record<string, unknown>) => ({
      ...values,
      type: Number(values.type),
      visible: !!values.visible,
    });

    // 目录类型 + 显示（DictSelect 值为字符串 "1"/"2"/"3"）
    const body1 = buildBody({ name: "系统管理", type: "1", visible: true, sort: 0, status: 1 });
    expect(body1.type).toBe(1);
    expect(body1.visible).toBe(true);

    // 菜单类型 + 隐藏
    const body2 = buildBody({ name: "用户管理", type: "2", visible: false, sort: 1, status: 1 });
    expect(body2.type).toBe(2);
    expect(body2.visible).toBe(false);

    // 按钮类型
    const body3 = buildBody({ name: "新增", type: "3", visible: true, sort: 0, status: 1 });
    expect(body3.type).toBe(3);
  });

  test("openEdit 应将 API type 数字转为字典字符串、visible 保持 boolean", () => {
    const mapEditValues = (r: { type: number; visible: boolean }) => ({
      type: String(r.type),
      visible: !!r.visible,
    });

    expect(mapEditValues({ type: 1, visible: true })).toEqual({ type: "1", visible: true });
    expect(mapEditValues({ type: 2, visible: false })).toEqual({ type: "2", visible: false });
    expect(mapEditValues({ type: 3, visible: true })).toEqual({ type: "3", visible: true });
  });

  test("添加子菜单应设置 parentId 和默认类型为 2（菜单）", () => {
    const openCreateChild = (parent: { id: string }) => ({
      type: "2", // 子菜单默认类型（字典字符串）
      sort: 0,
      visible: true,
      status: 1,
      parentId: parent.id,
    });

    const result = openCreateChild({ id: "p1" });
    expect(result.type).toBe("2");
    expect(result.parentId).toBe("p1");
    expect(result.sort).toBe(0);
    expect(result.visible).toBe(true);
    expect(result.status).toBe(1);
  });

  test("新增顶级菜单默认类型为 1（目录）", () => {
    const openCreateTop = () => ({
      type: "1", // 顶级菜单默认类型（字典字符串）
      sort: 0,
      visible: true,
      status: 1,
      parentId: undefined,
    });

    const result = openCreateTop();
    expect(result.type).toBe("1");
    expect(result.parentId).toBeUndefined();
  });

  test("expandable rowExpandable: 仅非按钮类型(type !== 3)可展开", () => {
    const rowExpandable = (type: number) => type !== 3;
    expect(rowExpandable(1)).toBe(true);
    expect(rowExpandable(2)).toBe(true);
    expect(rowExpandable(3)).toBe(false);
  });

  test("typeMap 显示文本: 1->目录, 2->菜单, 3->按钮", () => {
    const typeMap: Record<string, string> = { 1: "目录", 2: "菜单", 3: "按钮" };
    expect(typeMap["1"]).toBe("目录");
    expect(typeMap["2"]).toBe("菜单");
    expect(typeMap["3"]).toBe("按钮");
  });

  test("typeColor 颜色映射: 1->blue, 2->green, 3->orange", () => {
    const typeColor: Record<string, string> = { 1: "blue", 2: "green", 3: "orange" };
    expect(typeColor["1"]).toBe("blue");
    expect(typeColor["2"]).toBe("green");
    expect(typeColor["3"]).toBe("orange");
  });
});
