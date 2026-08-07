/**
 * @ventostack/ai — 工具权限策略
 *
 * 提供 AI 工具执行前的权限校验能力，包括工具白名单、网络访问控制、文件访问控制和超时限制。
 * 原名 createSandbox / Sandbox，已重命名为 createToolPolicy / ToolPolicy。
 * 旧名称通过 sandbox.ts 保留为 re-export 别名。
 */

import { resolve } from "node:path";

/** 工具策略权限配置 */
export interface SandboxPermissions {
  /** 允许执行的工具名称列表，为空表示拒绝所有（必须显式配置白名单） */
  allowedTools?: string[];
  /** 允许访问的主机列表；开启网络访问时必须显式提供 */
  allowedHosts?: string[];
  /** 最大执行时间（毫秒） */
  maxExecutionTime?: number;
  /** 最大内存限制（字节） */
  maxMemory?: number;
  /** 是否允许文件读取 */
  allowFileRead?: boolean;
  /** 是否允许文件写入 */
  allowFileWrite?: boolean;
  /** 是否允许网络访问 */
  allowNetworkAccess?: boolean;
  /** 允许读写的工作目录；开启文件访问时必须显式提供 */
  workingDirectory?: string;
}

/** 工具策略实例，用于校验工具执行、网络访问和文件访问权限 */
export interface Sandbox {
  canExecute(toolName: string): boolean;
  canAccessURL(url: string): boolean;
  canAccessPath(filePath: string, mode: "read" | "write"): boolean;
  wrapExecution<T>(toolName: string, fn: () => Promise<T>): Promise<T>;
  getPermissions(): SandboxPermissions;
}

/** 别名类型 */
export type ToolPolicy = Sandbox;

const DEFAULT_MAX_EXECUTION_TIME = 60_000;
const DEFAULT_MAX_MEMORY = 50 * 1024 * 1024;

/**
 * 创建工具策略实例
 * @param permissions - 权限配置
 * @returns ToolPolicy 实例
 */
export function createToolPolicy(permissions: SandboxPermissions): ToolPolicy {
  const effectivePermissions: SandboxPermissions = {
    allowFileRead: false,
    allowFileWrite: false,
    allowNetworkAccess: false,
    maxExecutionTime: DEFAULT_MAX_EXECUTION_TIME,
    maxMemory: DEFAULT_MAX_MEMORY,
    ...permissions,
  };

  function canExecute(toolName: string): boolean {
    if (!effectivePermissions.allowedTools || effectivePermissions.allowedTools.length === 0) {
      return false;
    }
    return effectivePermissions.allowedTools.includes(toolName);
  }

  function canAccessURL(url: string): boolean {
    if (!effectivePermissions.allowNetworkAccess) return false;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (!effectivePermissions.allowedHosts || effectivePermissions.allowedHosts.length === 0) return false;
    return effectivePermissions.allowedHosts.includes(parsed.hostname);
  }

  function canAccessPath(filePath: string, mode: "read" | "write"): boolean {
    if (mode === "read" && !effectivePermissions.allowFileRead) return false;
    if (mode === "write" && !effectivePermissions.allowFileWrite) return false;
    if (!effectivePermissions.workingDirectory) return false;
    const resolved = resolve(filePath);
    const workDir = resolve(effectivePermissions.workingDirectory);
    return resolved.startsWith(`${workDir}/`) || resolved === workDir;
  }

  async function wrapExecution<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    if (!canExecute(toolName)) {
      throw new Error(`Permission denied: tool "${toolName}" is not allowed`);
    }

    const timeout = effectivePermissions.maxExecutionTime ?? DEFAULT_MAX_EXECUTION_TIME;
    const maxMemory = effectivePermissions.maxMemory ?? DEFAULT_MAX_MEMORY;
    const memBefore = process.memoryUsage();
    const memBaseline = memBefore.heapUsed;

    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Sandbox execution timed out after ${timeout}ms`)), timeout),
      ),
    ]);

    const memAfter = process.memoryUsage();
    const memDelta = memAfter.heapUsed - memBaseline;
    if (memDelta > maxMemory) {
      console.warn(
        `[sandbox] tool "${toolName}" memory usage exceeded limit: ${(memDelta / 1024 / 1024).toFixed(1)}MB > ${(maxMemory / 1024 / 1024).toFixed(1)}MB`,
      );
    }

    return result;
  }

  function getPermissions(): SandboxPermissions {
    return { ...effectivePermissions };
  }

  return { canExecute, canAccessURL, canAccessPath, wrapExecution, getPermissions };
}
