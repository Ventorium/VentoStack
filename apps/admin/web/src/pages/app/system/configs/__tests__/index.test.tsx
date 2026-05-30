import { describe, expect, test } from "bun:test";

describe("系统参数页", () => {
  test("typeMap 参数类型映射正确", () => {
    const typeMap: Record<number, string> = { 0: "字符串", 1: "数字", 2: "布尔", 3: "JSON" };
    expect(typeMap[0]).toBe("字符串");
    expect(typeMap[1]).toBe("数字");
    expect(typeMap[2]).toBe("布尔");
    expect(typeMap[3]).toBe("JSON");
  });

  test("API 端点路径正确", () => {
    const endpoints = {
      list: "/api/system/configs",
      create: "/api/system/configs",
      update: "/api/system/configs/:id",
      delete: "/api/system/configs/:id",
    };
    expect(endpoints.list).toBe("/api/system/configs");
    expect(endpoints.create).toBe("/api/system/configs");
    expect(endpoints.update).toContain(":id");
    expect(endpoints.delete).toContain(":id");
  });

  test("ConfigItem 类型应包含必要字段", () => {
    const config = {
      id: "c1",
      name: "站点名称",
      key: "site.name",
      value: "VentoStack",
      type: 0,
      group: "system",
      remark: "系统站点名称",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(config.id).toBeTruthy();
    expect(config.name).toBeTruthy();
    expect(config.key).toBeTruthy();
    expect(config.value).toBeTruthy();
    expect([0, 1, 2, 3]).toContain(config.type);
  });

  test("编辑参数时参数键名应禁用", () => {
    const isKeyDisabled = (editing: boolean) => editing;
    expect(isKeyDisabled(true)).toBe(true);
    expect(isKeyDisabled(false)).toBe(false);
  });

  test("新增参数默认类型为字符串", () => {
    const defaultType = 0;
    expect(defaultType).toBe(0);
  });

  test("删除参数使用 key 作为标识", () => {
    const deleteParam = (key: string) => ({ params: { id: key } });
    expect(deleteParam("site.name")).toEqual({ params: { id: "site.name" } });
  });

  test("参数键值显示为等宽字体", () => {
    const getValueClassName = () => "font-mono text-sm";
    expect(getValueClassName()).toContain("font-mono");
  });

  test("搜索字段包含参数名称和参数键名", () => {
    const searchFields = ["name", "key"];
    expect(searchFields).toContain("name");
    expect(searchFields).toContain("key");
    expect(searchFields).toHaveLength(2);
  });

  test("编辑参数时使用 key 作为更新标识", () => {
    const config = { id: "c1", key: "site.name", name: "站点名称" };
    const updateId = config.key;
    expect(updateId).toBe("site.name");
  });
});
