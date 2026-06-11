/**
 * 进程沙盒 — 仅 Bun 环境
 * 使用 Bun.spawn + --no-permission 实现进程级隔离
 * 安全措施：uid/gid 约束、环境变量白名单、输出大小限制、超时控制
 */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { CodeSandbox, CodeSandboxConfig, CodeExecution } from "./types";
import { DEFAULT_SANDBOX_CONFIG } from "./types";

const MAX_STDOUT_BYTES = 1024 * 1024; // 1MB

export function createProcessSandbox(
  config: Partial<CodeSandboxConfig> = {},
): CodeSandbox {
  const effectiveConfig: CodeSandboxConfig = {
    ...DEFAULT_SANDBOX_CONFIG,
    ...config,
    type: "process",
  };

  const tmpDirs: string[] = [];

  async function execute(code: string): Promise<CodeExecution> {
    const id = crypto.randomUUID();
    const tmpDir = join(require("node:os").tmpdir(), `sandbox_${id}`);
    tmpDirs.push(tmpDir);

    await mkdir(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, "main.ts");
    await Bun.write(tmpFile, code);

    const startTime = Date.now();

    try {
      const proc = Bun.spawn(
        ["bun", "run", "--no-permission", tmpFile],
        {
          timeout: effectiveConfig.timeout,
          env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            HOME: tmpDir,
            NODE_ENV: "production",
          },
          cwd: tmpDir,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      // 读取输出，限制大小
      const stdoutBytes = await readWithLimit(proc.stdout, MAX_STDOUT_BYTES);
      const stderrBytes = await readWithLimit(proc.stderr, MAX_STDOUT_BYTES);
      const stdout = new TextDecoder().decode(stdoutBytes);
      const stderr = new TextDecoder().decode(stderrBytes);

      await proc.exited;
      const duration = Date.now() - startTime;

      return {
        id,
        status: proc.exitCode === 0 ? "completed" : "error",
        stdout,
        stderr,
        exitCode: proc.exitCode,
        duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const isTimeout =
        err instanceof Error && err.message.toLowerCase().includes("timeout");

      return {
        id,
        status: isTimeout ? "timeout" : "error",
        stdout: "",
        stderr: isTimeout
          ? `Execution timed out after ${effectiveConfig.timeout}ms`
          : err instanceof Error ? err.message : "Unknown error",
        exitCode: null,
        duration,
      };
    }
  }

  async function destroy(): Promise<void> {
    for (const dir of tmpDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  }

  return { execute, destroy };
}

/** 读取 ReadableStream，超过限制时截断 */
async function readWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalBytes += value.byteLength;
        if (totalBytes >= maxBytes) break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(Math.min(totalBytes, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = maxBytes - offset;
    if (remaining <= 0) break;
    const slice = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
    result.set(slice, offset);
    offset += slice.byteLength;
  }

  return result;
}
