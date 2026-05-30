/**
 * Test 代码模板
 */

import type { GenColumnInfo, GenTableInfo } from "../services/gen";

export function renderTest(table: GenTableInfo, columns: GenColumnInfo[]): string {
  const className = table.className;
  const varName = className.charAt(0).toLowerCase() + className.slice(1);

  return `import { describe, expect, test } from "bun:test";
import { create${className}Service } from "../services/${toKebab(className)}";
import { createMockExecutor } from "./helpers";

function setup() {
  const { executor, calls, results } = createMockExecutor();
  const service = create${className}Service({ executor });
  return { service, executor, calls, results };
}

describe("${className} Service", () => {
  test("create 返回 ID", async () => {
    const s = setup();
    const result = await s.service.create({${columns
      .filter((c) => !c.isPrimary && c.isInsert)
      .slice(0, 2)
      .map((c) => `\n      ${c.fieldName}: ${mockValue(c.typescriptType)},`)
      .join("")}
    });
    expect(result.id).toBeTruthy();
    expect(s.calls.some(c => c.text.includes("INSERT"))).toBe(true);
  });

  test("delete 执行删除", async () => {
    const s = setup();
    await s.service.delete("test-id");
    expect(s.calls.some(c => c.text.includes("DELETE"))).toBe(true);
  });

  test("list 返回分页结果", async () => {
    const s = setup();
    s.results.set("COUNT", [{ total: 0 }]);
    const result = await s.service.list({ page: 1, pageSize: 10 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
`;
}

function toKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function mockValue(tsType: string): string {
  const map: Record<string, string> = {
    string: '"test"',
    number: "1",
    boolean: "true",
  };
  return map[tsType] ?? '"test"';
}
