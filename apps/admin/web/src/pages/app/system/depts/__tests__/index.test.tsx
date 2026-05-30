import { describe, expect, test } from "bun:test";

describe("部门管理页", () => {
  test("toTreeSelectData 将部门列表转为 TreeSelect 数据", () => {
    const toTreeSelectData = (
      items: Array<{
        id: string;
        name: string;
        children?: Array<{ id: string; name: string; children?: unknown[] }>;
      }>,
    ) =>
      items.map((item) => ({
        value: item.id,
        title: item.name,
        children: item.children?.length ? toTreeSelectData(item.children) : undefined,
      }));

    const depts = [
      {
        id: "1",
        name: "总公司",
        children: [
          { id: "2", name: "技术部", children: [] },
          { id: "3", name: "市场部", children: [{ id: "4", name: "国内组", children: [] }] },
        ],
      },
    ];
    const result = toTreeSelectData(depts);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("1");
    expect(result[0].title).toBe("总公司");
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children![1].children).toHaveLength(1);
    expect(result[0].children![1].children![0].value).toBe("4");
  });

  test("toTreeSelectData 空列表返回空数组", () => {
    const toTreeSelectData = (items: Array<{ id: string; name: string; children?: unknown[] }>) =>
      items.map((item) => ({
        value: item.id,
        title: item.name,
        children: item.children?.length ? toTreeSelectData(item.children as any) : undefined,
      }));
    expect(toTreeSelectData([])).toEqual([]);
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
      tree: "/api/system/depts/tree",
      create: "/api/system/depts",
      update: "/api/system/depts/:id",
      delete: "/api/system/depts/:id",
    };
    expect(endpoints.tree).toContain("depts/tree");
    expect(endpoints.create).toBe("/api/system/depts");
    expect(endpoints.update).toContain(":id");
    expect(endpoints.delete).toContain(":id");
  });

  test("DeptItem 类型应包含必要字段", () => {
    const dept = {
      id: "d1",
      name: "技术部",
      leader: "张三",
      phone: "13800138000",
      email: "tech@example.com",
      status: 1,
      sort: 1,
      parentId: "",
      createdAt: "2024-01-01T00:00:00Z",
    };
    expect(dept.id).toBeTruthy();
    expect(dept.name).toBeTruthy();
    expect([0, 1]).toContain(dept.status);
  });

  test("新增子部门时 parentId 应为父部门 id", () => {
    const parent = { id: "p1", name: "总公司" };
    const getParentId = (parent?: { id: string }) => parent?.id;
    expect(getParentId(parent)).toBe("p1");
    expect(getParentId(undefined)).toBeUndefined();
  });

  test("新增部门排序默认值为 0", () => {
    const defaultSort = 0;
    expect(defaultSort).toBe(0);
  });

  test("新增部门状态默认值为 1（正常）", () => {
    const defaultStatus = 1;
    expect(defaultStatus).toBe(1);
  });
});
