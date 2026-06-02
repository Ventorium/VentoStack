/**
 * 本地文件存储适配器
 */

import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { StorageAdapter } from "./storage";

export interface LocalStorageOptions {
  basePath: string;
  baseUrl?: string;
}

export function createLocalStorage(options: LocalStorageOptions): StorageAdapter {
  const { basePath, baseUrl = "/files" } = options;
  const resolvedBase = resolve(basePath);

  function fullPath(key: string): string {
    // 先清理前导斜杠
    const cleaned = key.replace(/^\/+/, "");
    const resolved = resolve(resolvedBase, cleaned);
    // 安全校验：解析后的路径必须在 basePath 下
    if (!resolved.startsWith(resolvedBase + sep) && resolved !== resolvedBase) {
      throw new Error("Path traversal detected");
    }
    return resolved;
  }

  return {
    async write(key, data, _contentType) {
      const filePath = fullPath(key);
      await mkdir(dirname(filePath), { recursive: true });

      if (Buffer.isBuffer(data)) {
        await writeFile(filePath, data);
      } else {
        // ReadableStream → Buffer
        const chunks: Uint8Array[] = [];
        const reader = data.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        await writeFile(filePath, Buffer.concat(chunks));
      }
    },

    async read(key) {
      const filePath = fullPath(key);
      try {
        const file = Bun.file(filePath);
        if (!(await file.exists())) return null;
        return file.stream();
      } catch {
        return null;
      }
    },

    async delete(key) {
      const filePath = fullPath(key);
      try {
        await unlink(filePath);
      } catch {
        // ignore if not exists
      }
    },

    async exists(key) {
      const filePath = fullPath(key);
      try {
        const s = await stat(filePath);
        return s.isFile();
      } catch {
        return false;
      }
    },

    async getSignedUrl(key, _expiresIn) {
      // Local storage returns a static URL; signing is a no-op
      // 复用 fullPath 进行路径遍历校验，同时生成安全的相对路径
      const cleaned = key.replace(/^\/+/, "");
      const resolved = resolve(resolvedBase, cleaned);
      if (!resolved.startsWith(resolvedBase + sep) && resolved !== resolvedBase) {
        throw new Error("Path traversal detected");
      }
      // 生成相对于 basePath 的安全路径用于 URL
      const safeRelative = resolved.slice(resolvedBase.length).replace(/^\/+/, "");
      return `${baseUrl}/${safeRelative}`;
    },
  };
}
