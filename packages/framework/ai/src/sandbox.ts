/**
 * @ventostack/ai — 权限沙箱（向后兼容别名）
 *
 * 此文件保留旧导出名作 re-export 别名，实际实现已迁移到 tool-policy.ts
 * @deprecated 请使用 createToolPolicy / ToolPolicy
 */
export { createToolPolicy as createSandbox } from "./tool-policy";
export type { SandboxPermissions, Sandbox } from "./tool-policy";
