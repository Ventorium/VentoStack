export type SandboxStatus =
  | 'CREATING'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'FAILED'
  | 'DESTROYED'
  | 'unavailable';

export interface RuntimeSandbox {
  sandboxId: string;
  state: SandboxStatus;
}

export interface AgentRuntimeClient {
  createSandbox(request: { sessionId: string }): Promise<RuntimeSandbox>;
  getSandbox(sandboxId: string): Promise<RuntimeSandbox>;
  destroySandbox(sandboxId: string): Promise<void>;
  runCommand(sandboxId: string, command: string[], cwd?: string): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>;
  readFile(sandboxId: string, path: string): Promise<Uint8Array>;
  writeFile(sandboxId: string, path: string, content: Uint8Array): Promise<void>;
}
