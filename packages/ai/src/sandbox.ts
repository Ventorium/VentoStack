// Sandbox - 权限沙箱
import { resolve } from "node:path";

export interface SandboxPermissions {
  allowedTools?: string[];
  allowedHosts?: string[];
  maxExecutionTime?: number;
  maxMemory?: number;
  allowFileRead?: boolean;
  allowFileWrite?: boolean;
  allowNetworkAccess?: boolean;
  workingDirectory?: string;
}

export interface Sandbox {
  canExecute(toolName: string): boolean;
  canAccessURL(url: string): boolean;
  canAccessPath(filePath: string, mode: "read" | "write"): boolean;
  wrapExecution<T>(toolName: string, fn: () => Promise<T>): Promise<T>;
  getPermissions(): SandboxPermissions;
}

const DEFAULT_MAX_EXECUTION_TIME = 60_000;
const DEFAULT_MAX_MEMORY = 50 * 1024 * 1024; // 50MB

export function createSandbox(permissions: SandboxPermissions): Sandbox {
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
      return true;
    }
    return effectivePermissions.allowedTools.includes(toolName);
  }

  function canAccessURL(url: string): boolean {
    if (!effectivePermissions.allowNetworkAccess) {
      return false;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    // Only allow http/https schemes
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!effectivePermissions.allowedHosts || effectivePermissions.allowedHosts.length === 0) {
      return true;
    }
    return effectivePermissions.allowedHosts.includes(parsed.hostname);
  }

  function canAccessPath(filePath: string, mode: "read" | "write"): boolean {
    if (mode === "read" && !effectivePermissions.allowFileRead) {
      return false;
    }
    if (mode === "write" && !effectivePermissions.allowFileWrite) {
      return false;
    }
    if (!effectivePermissions.workingDirectory) {
      return true;
    }
    const resolved = resolve(filePath);
    const workDir = resolve(effectivePermissions.workingDirectory);
    return resolved.startsWith(workDir + "/") || resolved === workDir;
  }

  async function wrapExecution<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    if (!canExecute(toolName)) {
      throw new Error(`Permission denied: tool "${toolName}" is not allowed`);
    }

    const timeout = effectivePermissions.maxExecutionTime ?? DEFAULT_MAX_EXECUTION_TIME;

    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Sandbox execution timed out after ${timeout}ms`)), timeout),
      ),
    ]);
  }

  function getPermissions(): SandboxPermissions {
    return { ...effectivePermissions };
  }

  return {
    canExecute,
    canAccessURL,
    canAccessPath,
    wrapExecution,
    getPermissions,
  };
}
