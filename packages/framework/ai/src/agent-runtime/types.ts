export type SandboxStatus =
  | 'CREATING'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'FAILED'
  | 'DESTROYED'
  | 'unavailable';

export interface RuntimeResources {
  cpuCount: number;
  memoryMb: number;
  diskMb: number;
  maxProcesses: number;
}

export interface RuntimeSandbox {
  sandboxId: string;
  state: SandboxStatus;
  sessionId?: string;
  resources?: RuntimeResources;
  createdAtMs?: number;
  lastActiveAtMs?: number;
  expiresAtMs?: number;
  failureReason?: string;
}

export interface RuntimeHostInfo {
  version?: string;
  protocolVersion?: string | number;
  host?: {
    cpuCount?: number;
    memoryMb?: number;
    diskMb?: number;
  };
  sandboxCount?: number;
  runningCount?: number;
  features?: string[];
}

export interface CreateRuntimeSandboxRequest {
  sessionId: string;
  resources?: Partial<RuntimeResources>;
  timeoutSeconds?: number;
  idleAction?: 'pause' | 'destroy';
  /** 是否允许 guest 出网；默认 true */
  networkEnabled?: boolean;
}

export interface RuntimeCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs?: number;
  commandId?: string;
}

export interface RuntimeCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  stdin?: Uint8Array;
}

export interface RuntimeFileEntry {
  path: string;
  kind: string;
  size: number;
  modifiedAtMs: number;
}

export interface AgentRuntimeClient {
  createSandbox(request: CreateRuntimeSandboxRequest): Promise<RuntimeSandbox>;
  listSandboxes(): Promise<RuntimeSandbox[]>;
  getSandbox(sandboxId: string): Promise<RuntimeSandbox>;
  destroySandbox(sandboxId: string): Promise<void>;
  startSandbox(sandboxId: string): Promise<RuntimeSandbox>;
  pauseSandbox(sandboxId: string): Promise<RuntimeSandbox>;
  resumeSandbox(sandboxId: string): Promise<RuntimeSandbox>;
  stopSandbox(sandboxId: string): Promise<RuntimeSandbox>;
  runCommand(
    sandboxId: string,
    command: string[],
    options?: RuntimeCommandOptions | string,
  ): Promise<RuntimeCommandResult>;
  killCommand(sandboxId: string, commandId: string): Promise<void>;
  readFile(sandboxId: string, path: string): Promise<Uint8Array>;
  writeFile(sandboxId: string, path: string, content: Uint8Array): Promise<void>;
  removeFile(sandboxId: string, path: string, recursive?: boolean): Promise<void>;
  listDir(sandboxId: string, path: string): Promise<RuntimeFileEntry[]>;
  health(): Promise<void>;
  info(): Promise<RuntimeHostInfo>;
}
