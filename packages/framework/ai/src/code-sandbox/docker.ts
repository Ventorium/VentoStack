/**
 * Docker 沙盒 — v1.0 阶段实现
 * 使用 Docker 容器实现更强的隔离
 * 安全措施：只读根文件系统、无网络、内存限制、超时控制
 */
import type { CodeSandbox, CodeSandboxConfig, CodeExecution } from "./types";
import { DEFAULT_SANDBOX_CONFIG } from "./types";

export interface DockerSandboxConfig extends CodeSandboxConfig {
  /** Docker 镜像，默认 oven/bun:latest */
  image?: string;
}

export function createDockerSandbox(
  config: Partial<DockerSandboxConfig> = {},
): CodeSandbox {
  const effectiveConfig: DockerSandboxConfig = {
    ...DEFAULT_SANDBOX_CONFIG,
    type: "docker",
    image: "oven/bun:latest",
    ...config,
  };

  async function execute(code: string): Promise<CodeExecution> {
    const id = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // 构建 docker run 参数
      const args: string[] = [
        "docker", "run", "--rm",
        "--read-only",
        "--network", effectiveConfig.networkAccess ? "bridge" : "none",
        "--memory", effectiveConfig.memoryLimit ?? "256m",
        "--cpus", "1",
        "--pids-limit", "64",
        "--security-opt", "no-new-privileges",
        "-e", `PATH=${process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"}`,
        effectiveConfig.image ?? "oven/bun:latest",
        "bun", "eval", code,
      ];

      const proc = Bun.spawn(args, {
        timeout: effectiveConfig.timeout,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await readStream(proc.stdout, effectiveConfig.maxOutputSize);
      const stderr = await readStream(proc.stderr, effectiveConfig.maxOutputSize);
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
      const isTimeout = err instanceof Error && err.message.toLowerCase().includes("timeout");

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
    // Docker 容器使用 --rm 标志，自动清理
  }

  return { execute, destroy };
}

async function readStream(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= maxBytes) break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = maxBytes - offset;
    if (remaining <= 0) break;
    const slice = chunk.byteLength > remaining ? chunk.slice(0, remaining) : chunk;
    combined.set(slice, offset);
    offset += slice.byteLength;
  }

  return new TextDecoder().decode(combined);
}
