/**
 * 代码沙盒类型定义
 */

export interface CodeSandboxConfig {
  /** 沙盒类型：process（Bun 原生隔离）或 docker */
  type: "process" | "docker";
  /** 执行超时（毫秒），默认 30000 */
  timeout: number;
  /** 内存限制（Docker: "256m"） */
  memoryLimit?: string;
  /** 是否允许网络访问，默认 false */
  networkAccess: boolean;
  /** 输出大小上限（字节），默认 1MB */
  maxOutputSize: number;
  /** 工作目录 */
  workingDirectory?: string;
}

export interface CodeExecution {
  id: string;
  status: "completed" | "timeout" | "error";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
}

export interface CodeSandbox {
  /** 执行代码并返回结果 */
  execute(code: string): Promise<CodeExecution>;
  /** 销毁沙盒，清理资源 */
  destroy(): Promise<void>;
}

export const DEFAULT_SANDBOX_CONFIG: CodeSandboxConfig = {
  type: "process",
  timeout: 30_000,
  networkAccess: false,
  maxOutputSize: 1024 * 1024, // 1MB
};
