import { describe, test, expect } from "bun:test";
import { createSandbox } from "../sandbox";

describe("Sandbox", () => {
  test("canExecute 白名单通过", () => {
    const sandbox = createSandbox({ allowedTools: ["read", "search"] });
    expect(sandbox.canExecute("read")).toBe(true);
    expect(sandbox.canExecute("search")).toBe(true);
  });

  test("canExecute 白名单拒绝", () => {
    const sandbox = createSandbox({ allowedTools: ["read"] });
    expect(sandbox.canExecute("write")).toBe(false);
  });

  test("canExecute 空白名单（全允许）", () => {
    const sandbox = createSandbox({});
    expect(sandbox.canExecute("anything")).toBe(true);
  });

  test("canAccessURL 通过", () => {
    const sandbox = createSandbox({
      allowNetworkAccess: true,
      allowedHosts: ["api.example.com"],
    });
    expect(sandbox.canAccessURL("https://api.example.com/v1/data")).toBe(true);
  });

  test("canAccessURL 拒绝", () => {
    const sandbox = createSandbox({
      allowNetworkAccess: true,
      allowedHosts: ["api.example.com"],
    });
    expect(sandbox.canAccessURL("https://evil.com/steal")).toBe(false);
  });

  test("canAccessURL 网络关闭", () => {
    const sandbox = createSandbox({ allowNetworkAccess: false });
    expect(sandbox.canAccessURL("https://api.example.com/v1")).toBe(false);
  });

  test("canAccessPath 读取通过", () => {
    const sandbox = createSandbox({
      allowFileRead: true,
      workingDirectory: "/app/data",
    });
    expect(sandbox.canAccessPath("/app/data/file.txt", "read")).toBe(true);
    expect(sandbox.canAccessPath("/app/data/sub/file.txt", "read")).toBe(true);
  });

  test("canAccessPath 写入拒绝", () => {
    const sandbox = createSandbox({
      allowFileRead: true,
      allowFileWrite: false,
      workingDirectory: "/app/data",
    });
    expect(sandbox.canAccessPath("/app/data/file.txt", "write")).toBe(false);
  });

  test("canAccessPath 路径穿越阻止", () => {
    const sandbox = createSandbox({
      allowFileRead: true,
      workingDirectory: "/app/data",
    });
    expect(sandbox.canAccessPath("/app/data/../etc/passwd", "read")).toBe(false);
    expect(sandbox.canAccessPath("/etc/passwd", "read")).toBe(false);
  });

  test("wrapExecution 权限拒绝", async () => {
    const sandbox = createSandbox({ allowedTools: ["read"] });
    await expect(
      sandbox.wrapExecution("write", async () => "result"),
    ).rejects.toThrow("Permission denied");
  });

  test("wrapExecution 超时", async () => {
    const sandbox = createSandbox({ maxExecutionTime: 50 });
    await expect(
      sandbox.wrapExecution("anything", () => new Promise((r) => setTimeout(r, 200))),
    ).rejects.toThrow("timed out");
  });

  test("getPermissions 返回副本", () => {
    const sandbox = createSandbox({ allowFileRead: true });
    const perms = sandbox.getPermissions();
    expect(perms.allowFileRead).toBe(true);
    expect(perms.allowFileWrite).toBe(false);
  });

  test("canAccessURL 无效 URL 返回 false", () => {
    const sandbox = createSandbox({ allowNetworkAccess: true });
    expect(sandbox.canAccessURL("not-a-url")).toBe(false);
  });
});
